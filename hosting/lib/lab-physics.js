"use strict";
import { createHash } from "node:crypto";
import { definitions } from "./experiments.js";
import { wavePacket, prismRay } from "./wave-physics.js";
import { cylinderWake } from "./wake-physics.js";
const FRAME_COUNT = 240,
  DURATION_MS = 120000,
  COOLDOWN_MS = 3000;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const cache = new Map();
// Independent SHA-256 counter streams: public initial conditions do not reveal
// the random draws used for future Brownian motion, walks, or Monte Carlo points.
function randomStream(secret, context) {
  let block = [],
    counter = 0,
    index = 0;
  return () => {
    if (index >= block.length) {
      const bytes = createHash("sha256")
        .update(`${secret}:${context}:${counter++}`)
        .digest();
      block = Array.from(
        { length: 8 },
        (_, i) => bytes.readUInt32LE(i * 4) / 4294967296,
      );
      index = 0;
    }
    return block[index++];
  };
}
function rk4(state, t, h, derivative) {
  const a = derivative(state, t),
    b = derivative(
      state.map((v, i) => v + (h * a[i]) / 2),
      t + h / 2,
    ),
    c = derivative(
      state.map((v, i) => v + (h * b[i]) / 2),
      t + h / 2,
    ),
    d = derivative(
      state.map((v, i) => v + h * c[i]),
      t + h,
    );
  return state.map((v, i) => v + (h * (a[i] + 2 * b[i] + 2 * c[i] + d[i])) / 6);
}
function ode(initial, T, step, derivative, observe) {
  let state = initial.slice(),
    t = 0;
  const frames = [observe(state, 0)];
  const substeps = Math.ceil(T / FRAME_COUNT / step),
    h = T / FRAME_COUNT / substeps;
  for (let frame = 1; frame <= FRAME_COUNT; frame++) {
    for (let j = 0; j < substeps; j++) {
      state = rk4(state, t, h, derivative);
      t += h;
    }
    if (!state.every(Number.isFinite))
      throw new Error("The numerical model failed.");
    frames.push(observe(state, (frame * T) / FRAME_COUNT));
  }
  return frames;
}
const frame = (state, t, value, extra = {}) => ({
  t,
  state: state.slice(),
  value,
  ...extra,
});
function lorenz(s, p) {
  const [x, y, z] = s;
  return [p.sigma * (y - x), x * (p.rho - z) - y, x * y - p.beta * z];
}
function magnetic(s, p) {
  const [x, y, vx, vy] = s;
  let ax = -p.damping * vx - p.restoring * x,
    ay = -p.damping * vy - p.restoring * y;
  for (const [mx, my] of p.magnets) {
    const r2 = (mx - x) ** 2 + (my - y) ** 2 + p.height ** 2,
      f = p.strength / r2 ** 1.5;
    ax += (mx - x) * f;
    ay += (my - y) * f;
  }
  return [vx, vy, ax, ay];
}
function magneticEnergy(s, p) {
  return (
    0.5 * (s[2] ** 2 + s[3] ** 2) +
    0.5 * p.restoring * (s[0] ** 2 + s[1] ** 2) -
    p.magnets.reduce(
      (sum, [x, y]) =>
        sum +
        p.strength /
          Math.sqrt((x - s[0]) ** 2 + (y - s[1]) ** 2 + p.height ** 2),
      0,
    )
  );
}
function doublePendulum(s, p) {
  const [a, b, u, v] = s,
    { m1, m2, l1, l2, g } = p,
    delta = a - b;
  const aa = (m1 + m2) * l1 * l1,
    bb = m2 * l1 * l2 * Math.cos(delta),
    cc = m2 * l2 * l2;
  const f1 =
      -(m1 + m2) * g * l1 * Math.sin(a) -
      m2 * l1 * l2 * v * v * Math.sin(delta),
    f2 = -m2 * g * l2 * Math.sin(b) + m2 * l1 * l2 * u * u * Math.sin(delta),
    det = aa * cc - bb * bb;
  return [u, v, (cc * f1 - bb * f2) / det, (aa * f2 - bb * f1) / det];
}
function pendulumEnergy(s, p) {
  const [a, b, u, v] = s;
  return (
    0.5 * (p.m1 + p.m2) * p.l1 ** 2 * u * u +
    0.5 * p.m2 * p.l2 ** 2 * v * v +
    p.m2 * p.l1 * p.l2 * u * v * Math.cos(a - b) -
    (p.m1 + p.m2) * p.g * p.l1 * Math.cos(a) -
    p.m2 * p.g * p.l2 * Math.cos(b)
  );
}
function heatTemperature(x, y, t, p) {
  if (x === 0 || x === p.length || y === 0 || y === p.length) return p.boundary;
  if (t === 0) return p.initialTemperature;
  const f = (q) => {
    let value = 0;
    for (let n = 1; n <= 77; n += 2)
      value +=
        (4 / (n * Math.PI)) *
        Math.sin((n * Math.PI * q) / p.length) *
        Math.exp(-p.diffusivity * ((n * Math.PI) / p.length) ** 2 * t);
    return value;
  };
  return p.boundary + (p.initialTemperature - p.boundary) * f(x) * f(y);
}
function chargedState(t, p) {
  const w = p.chargeToMass * p.magneticField,
    ay = p.chargeToMass * p.electricField;
  if (Math.abs(w) < 1e-9)
    return [
      p.x0 + p.vx0 * t,
      p.y0 + p.vy0 * t + 0.5 * ay * t * t,
      p.vx0,
      p.vy0 + ay * t,
    ];
  const drift = ay / w,
    u = p.vx0 - drift,
    c = Math.cos(w * t),
    s = Math.sin(w * t);
  return [
    p.x0 + drift * t + (u * s) / w + (p.vy0 * (1 - c)) / w,
    p.y0 + (u * (c - 1)) / w + (p.vy0 * s) / w,
    drift + u * c + p.vy0 * s,
    -u * s + p.vy0 * c,
  ];
}
function collisionVelocities(p) {
  return [
    (p.m1 * p.u1 + p.m2 * p.u2 - p.m2 * p.restitution * (p.u1 - p.u2)) /
      (p.m1 + p.m2),
    (p.m1 * p.u1 + p.m2 * p.u2 + p.m1 * p.restitution * (p.u1 - p.u2)) /
      (p.m1 + p.m2),
  ];
}
function gravity(state, p) {
  const a = Array(6).fill(0);
  for (let i = 0; i < 3; i++)
    for (let j = i + 1; j < 3; j++) {
      const dx = state[j * 4] - state[i * 4],
        dy = state[j * 4 + 1] - state[i * 4 + 1],
        r = (dx * dx + dy * dy + p.softening ** 2) ** 1.5;
      for (let c = 0; c < 2; c++) {
        const f = (c ? dy : dx) / r;
        a[i * 2 + c] += p.masses[j] * f;
        a[j * 2 + c] -= p.masses[i] * f;
      }
    }
  return a;
}
function orbitEnergy(state, p) {
  let e = 0;
  for (let i = 0; i < 3; i++) {
    e += 0.5 * p.masses[i] * (state[4 * i + 2] ** 2 + state[4 * i + 3] ** 2);
    for (let j = i + 1; j < 3; j++)
      e -=
        (p.masses[i] * p.masses[j]) /
        Math.sqrt(
          (state[i * 4] - state[j * 4]) ** 2 +
            (state[i * 4 + 1] - state[j * 4 + 1]) ** 2 +
            p.softening ** 2,
        );
  }
  return e;
}
function centre(state, p) {
  const mass = p.masses.reduce((a, b) => a + b, 0);
  return [0, 1, 2, 3].map(
    (k) => p.masses.reduce((s, m, i) => s + m * state[i * 4 + k], 0) / mass,
  );
}
function orbitEscaped(s, p) {
  const c = centre(s, p);
  return p.masses.some((m, i) => {
    const others = [0, 1, 2].filter((j) => j !== i),
      mass = others.reduce((v, j) => v + p.masses[j], 0),
      o = [0, 1, 2, 3].map(
        (k) =>
          others.reduce((v, j) => v + p.masses[j] * s[j * 4 + k], 0) / mass,
      ),
      dx = s[i * 4] - o[0],
      dy = s[i * 4 + 1] - o[1],
      vx = s[i * 4 + 2] - o[2],
      vy = s[i * 4 + 3] - o[3],
      energy =
        0.5 * (vx * vx + vy * vy) -
        others.reduce(
          (v, j) =>
            v +
            p.masses[j] /
              Math.sqrt(
                (s[i * 4] - s[j * 4]) ** 2 +
                  (s[i * 4 + 1] - s[j * 4 + 1]) ** 2 +
                  p.softening ** 2,
              ),
          0,
        );
    return (
      Math.hypot(s[i * 4] - c[0], s[i * 4 + 1] - c[1]) > p.escapeRadius &&
      dx * vx + dy * vy > 0 &&
      energy > 0
    );
  });
}
const reflect = (x) => {
  const q = (((x + 1) % 4) + 4) % 4;
  return q <= 2 ? q - 1 : 3 - q;
};
function experiment(kind, secret, start) {
  const key = `${kind}:${secret}:${start}`;
  if (cache.has(key)) {
    const model = cache.get(key);
    cache.delete(key);
    cache.set(key, model);
    return model;
  }
  if (!definitions[kind]) throw new Error("Unknown experiment.");
  const r = randomStream(secret, `${kind}:${start}:conditions`),
    noise = randomStream(secret, `${kind}:${start}:noise`);
  let p, initial, frames, T, result, points;
  if (kind === "convection") {
    T = 30;
    p = {
      sigma: 10,
      rho: 25 + 8 * r(),
      beta: 8 / 3,
      physicalDuration: T,
      timeUnit: "dimensionless",
      integrator: "RK4",
      maxStep: 0.005,
    };
    initial = [(r() - 0.5) * 12, (r() - 0.5) * 12, 18 + 12 * r()];
    frames = ode(
      initial,
      T,
      0.005,
      (s) => lorenz(s, p),
      (s, t) => frame(s, t, s[0]),
    );
    result = frames.at(-1).value >= 0 ? 0 : 1;
  } else if (kind === "magnetic-pendulum") {
    T = 60;
    p = {
      magnets: [
        [0, 1],
        [-Math.sqrt(3) / 2, -0.5],
        [Math.sqrt(3) / 2, -0.5],
      ],
      height: 0.3,
      strength: 0.7,
      restoring: 0.6,
      damping: 0.11 + 0.04 * r(),
      physicalDuration: T,
      integrator: "RK4",
      maxStep: 0.005,
    };
    initial = [
      (r() - 0.5) * 3,
      (r() - 0.5) * 3,
      (r() - 0.5) * 0.2,
      (r() - 0.5) * 0.2,
    ];
    frames = ode(
      initial,
      T,
      0.005,
      (s) => magnetic(s, p),
      (s, t) => frame(s, t, Math.hypot(s[2], s[3])),
    );
    const s = frames.at(-1).state;
    result = p.magnets
      .map(([x, y], i) => ({ i, d: Math.hypot(s[0] - x, s[1] - y) }))
      .sort((a, b) => a.d - b.d || a.i - b.i)[0].i;
  } else if (kind === "double-pendulum") {
    T = 12;
    p = {
      m1: 1,
      m2: 0.7 + 0.6 * r(),
      l1: 1,
      l2: 0.8 + 0.4 * r(),
      g: 9.81,
      physicalDuration: T,
      integrator: "RK4",
      maxStep: 0.002,
    };
    initial = [
      0.5 + 2.6 * r(),
      (r() - 0.5) * 2 * Math.PI,
      (r() - 0.5) * 2,
      (r() - 0.5) * 2,
    ];
    frames = ode(
      initial,
      T,
      0.002,
      (s) => doublePendulum(s, p),
      (s, t) => frame(s, t, Math.abs(s[1] - initial[1]) / (2 * Math.PI)),
    );
    result = frames.at(-1).value >= 1 ? 0 : 1;
  } else if (kind === "heat") {
    T = 180;
    p = {
      length: 0.1,
      diffusivity: 1e-6 + r() * 7e-6,
      initialTemperature: 20,
      boundary: 70 + 20 * r(),
      physicalDuration: T,
      grid: 17,
      oddModes: 39,
    };
    initial = [20];
    frames = Array.from({ length: FRAME_COUNT + 1 }, (_, i) => {
      const t = (T * i) / FRAME_COUNT,
        field = Array.from({ length: p.grid * p.grid }, (_, j) =>
          heatTemperature(
            ((j % p.grid) * p.length) / (p.grid - 1),
            (Math.floor(j / p.grid) * p.length) / (p.grid - 1),
            t,
            p,
          ),
        ),
        value = heatTemperature(0.05, 0.05, t, p);
      return frame([value], t, value, { field });
    });
    result = frames.at(-1).value >= 50 ? 0 : 1;
  } else if (kind === "charge") {
    T = 6;
    p = {
      chargeToMass: 1,
      magneticField: (r() - 0.5) * 0.6,
      electricField: (r() - 0.5) * 0.12,
      x0: 0,
      y0: 0,
      vx0: 0.8 + 0.4 * r(),
      vy0: (r() - 0.5) * 0.15,
      target: [5, 0],
      targetRadius: 1.4,
      physicalDuration: T,
    };
    initial = chargedState(0, p);
    frames = Array.from({ length: FRAME_COUNT + 1 }, (_, i) => {
      const t = (T * i) / FRAME_COUNT,
        s = chargedState(t, p);
      return frame(s, t, Math.hypot(s[0] - 5, s[1]));
    });
    result = frames.at(-1).value <= p.targetRadius ? 0 : 1;
  } else if (kind === "orbit") {
    T = 12;
    p = {
      masses: [1, 1, 1],
      softening: 0.04,
      escapeRadius: 6,
      escapeCriterion:
        "At the deadline: distance from total COM > escapeRadius AND relative position dot relative velocity > 0 AND 0.5*|v_i-v_othersCOM|^2 - sum_j(m_j/sqrt(|r_i-r_j|^2+softening^2)) > 0. All three conditions must hold for the same body.",
      G: 1,
      physicalDuration: T,
      integrator: "velocity Verlet",
      step: 0.00025,
    };
    const kick = 0.6 + 1.1 * r();
    initial = [
      -0.97000436,
      0.24308753,
      0.466203685 * kick,
      0.43236573 * kick,
      0.97000436,
      -0.24308753,
      0.466203685 * kick,
      0.43236573 * kick,
      0,
      0,
      -0.93240737 * kick,
      -0.86473146 * kick,
    ];
    initial[10] += (r() - 0.5) * 1.4;
    initial[11] += (r() - 0.5) * 1.4;
    let s = initial.slice();
    const obs = (t) => {
      const c = centre(s, p);
      return frame(
        s,
        t,
        Math.max(
          ...[0, 1, 2].map((i) =>
            Math.hypot(s[4 * i] - c[0], s[4 * i + 1] - c[1]),
          ),
        ),
      );
    };
    frames = [obs(0)];
    const sub = 200,
      h = T / FRAME_COUNT / sub;
    for (let f = 1; f <= FRAME_COUNT; f++) {
      for (let k = 0; k < sub; k++) {
        const a = gravity(s, p);
        for (let i = 0; i < 3; i++) {
          s[4 * i] += h * s[4 * i + 2] + 0.5 * h * h * a[2 * i];
          s[4 * i + 1] += h * s[4 * i + 3] + 0.5 * h * h * a[2 * i + 1];
        }
        const b = gravity(s, p);
        for (let i = 0; i < 3; i++) {
          s[4 * i + 2] += 0.5 * h * (a[2 * i] + b[2 * i]);
          s[4 * i + 3] += 0.5 * h * (a[2 * i + 1] + b[2 * i + 1]);
        }
      }
      frames.push(obs((f * T) / FRAME_COUNT));
    }
    result = orbitEscaped(s, p) ? 1 : 0;
  } else if (kind === "beam") {
    T = 8;
    p = {
      length: 0.8,
      width: 0.025,
      height: 0.004,
      youngModulus: 70e9,
      density: 2700,
      dampingRatio: 0.035,
      force: 0.2 + 0.8 * r(),
      driveFrequency: 1.5 + 4 * r(),
      physicalDuration: T,
    };
    p.inertia = (p.width * p.height ** 3) / 12;
    p.stiffness = (3 * p.youngModulus * p.inertia) / p.length ** 3;
    p.effectiveMass = 0.236 * p.density * p.width * p.height * p.length;
    p.damping = 2 * p.dampingRatio * Math.sqrt(p.stiffness * p.effectiveMass);
    initial = [0, 0];
    frames = ode(
      initial,
      T,
      0.001,
      (s, t) => [
        s[1],
        (p.force *
          (1 - Math.exp(-3 * t)) *
          (1 + 0.5 * Math.sin(p.driveFrequency * t)) -
          p.damping * s[1] -
          p.stiffness * s[0]) /
          p.effectiveMass,
      ],
      (s, t) => frame(s, t, s[0] * 1000),
    );
    result = frames.at(-1).value >= 10 ? 0 : 1;
  } else if (kind === "piston") {
    T = 10;
    p = {
      area: 0.01,
      moles: 0.04,
      R: 8.314462618,
      Cv: 20.786156545,
      mass: 2,
      spring: 400,
      damping: 15,
      heaterPower: 2 + 12 * r(),
      heatLoss: 0.02,
      initialPosition: 0.1,
      initialTemperature: 300,
      physicalDuration: T,
    };
    p.externalPressure =
      (p.moles * p.R * p.initialTemperature) / (p.area * p.initialPosition);
    initial = [p.initialPosition, 0, p.initialTemperature];
    frames = ode(
      initial,
      T,
      0.001,
      (s) => {
        const [x, v, temp] = s,
          pressure = (p.moles * p.R * temp) / (p.area * x);
        return [
          v,
          (p.area * (pressure - p.externalPressure) -
            p.spring * (x - p.initialPosition) -
            p.damping * v) /
            p.mass,
          (p.heaterPower -
            pressure * p.area * v -
            p.heatLoss * (temp - p.initialTemperature)) /
            (p.moles * p.Cv),
        ];
      },
      (s, t) => frame(s, t, s[0]),
    );
    result = frames.at(-1).value >= 0.12 ? 0 : 1;
  } else if (kind === "interference") {
    T = 6;
    p = {
      wavelength: (480 + 180 * r()) * 1e-9,
      sourceSeparation: 0.0002,
      screenDistance: 1,
      detectorX: (r() - 0.5) * 0.012,
      phase0: 2 * Math.PI * r(),
      phaseRate: (r() - 0.5) * 2,
      physicalDuration: T,
    };
    initial = [p.phase0];
    frames = Array.from({ length: FRAME_COUNT + 1 }, (_, i) => {
      const t = (T * i) / FRAME_COUNT,
        phase = p.phase0 + p.phaseRate * t,
        r1 = Math.hypot(p.detectorX + p.sourceSeparation / 2, p.screenDistance),
        r2 = Math.hypot(p.detectorX - p.sourceSeparation / 2, p.screenDistance),
        value =
          (1 + Math.cos((2 * Math.PI * (r1 - r2)) / p.wavelength + phase)) / 2;
      return frame([phase], t, value);
    });
    result = frames.at(-1).value >= 0.6 ? 0 : 1;
  } else if (kind === "diffusion") {
    T = 20;
    p = {
      count: 120,
      diffusivity: 0.02 + 0.03 * r(),
      step: 0.04,
      bounds: [-1, 1, -1, 1],
      physicalDuration: T,
    };
    initial = Array.from({ length: p.count * 2 }, () => r() * 1.4 - 0.7);
    let s = initial.slice(),
      step = 0;
    frames = [];
    const normal = () =>
      Math.sqrt(-2 * Math.log(Math.max(1e-12, noise()))) *
      Math.cos(2 * Math.PI * noise());
    for (let i = 0; i <= FRAME_COUNT; i++) {
      const end = Math.floor((i * T) / FRAME_COUNT / p.step + 1e-7);
      while (step < end) {
        s = s.map((x) =>
          reflect(x + Math.sqrt(2 * p.diffusivity * p.step) * normal()),
        );
        step++;
      }
      frames.push(
        frame(s, end * p.step, s.filter((x, j) => j % 2 === 0 && x < 0).length),
      );
    }
    result = frames.at(-1).value > 60 ? 0 : 1;
  } else if (kind === "random-walk") {
    T = 120;
    p = {
      steps: 120,
      lattice: "2D square",
      targetRadius: 10,
      stepProbability: 0.25,
      physicalDuration: T,
      timeUnit: "steps",
    };
    initial = [0, 0];
    let s = initial.slice(),
      step = 0;
    frames = [];
    for (let i = 0; i <= FRAME_COUNT; i++) {
      const end = Math.floor((i * T) / FRAME_COUNT);
      while (step < end) {
        const d = Math.floor(noise() * 4);
        s[d < 2 ? 0 : 1] += d % 2 ? 1 : -1;
        step++;
      }
      frames.push(frame(s, step, Math.hypot(...s)));
    }
    result = frames.at(-1).value <= p.targetRadius ? 0 : 1;
  } else if (kind === "induction") {
    T = 6;
    p = {
      turns: 20,
      fluxConstant: 0.00003,
      coilRadius: 0.22,
      resistance: 4,
      inductance: 0.8,
      z0: -0.8,
      velocity: 0.07 + 0.19 * r(),
      positiveTolerance: 0.005,
      physicalDuration: T,
    };
    initial = [0];
    const emf = (t) => {
      const z = p.z0 + p.velocity * t;
      return (
        (3 * p.turns * p.fluxConstant * z * p.velocity) /
        (p.coilRadius ** 2 + z * z) ** 2.5
      );
    };
    frames = ode(
      initial,
      T,
      0.002,
      (s, t) => [(emf(t) - p.resistance * s[0]) / p.inductance],
      (s, t) => frame([s[0], p.z0 + p.velocity * t, emf(t)], t, s[0]),
    );
    result = frames.at(-1).value > p.positiveTolerance ? 0 : 1;
  } else if (kind === "collision") {
    p = {
      m1: 0.4 + 2.4 * r(),
      m2: 0.4 + 2.4 * r(),
      u1: 0.8 + 0.6 * r(),
      u2: -0.2 - 0.5 * r(),
      restitution: 0.65 + 0.35 * r(),
      radius1: 0.16,
      radius2: 0.16,
      x1: -2,
      x2: 2,
    };
    const impact = (p.x2 - p.x1 - p.radius1 - p.radius2) / (p.u1 - p.u2);
    T = impact * 1.12;
    p.physicalDuration = T;
    const [v1, v2] = collisionVelocities(p);
    initial = [p.x1, p.x2, p.u1, p.u2];
    frames = Array.from({ length: FRAME_COUNT + 1 }, (_, i) => {
      const t = (i * T) / FRAME_COUNT,
        after = Math.max(0, t - impact),
        before = Math.min(t, impact);
      return frame(
        [
          p.x1 + p.u1 * before + v1 * after,
          p.x2 + p.u2 * before + v2 * after,
          t < impact ? p.u1 : v1,
          t < impact ? p.u2 : v2,
        ],
        t,
        t < impact ? p.u1 : v1,
        { collided: t >= impact },
      );
    });
    result = v1 > 0 ? 0 : 1;
  } else if (kind === "monte-carlo") {
    T = 1600;
    p = {
      samples: 1600,
      domain: [-1, 1, -1, 1],
      radius: 1,
      physicalDuration: T,
      timeUnit: "samples",
    };
    initial = [0, 0];
    points = Array.from({ length: T }, () => [
      noise() * 2 - 1,
      noise() * 2 - 1,
    ]);
    let count = 0,
      index = 0;
    frames = [];
    for (let i = 0; i <= FRAME_COUNT; i++) {
      const n = Math.floor((i * T) / FRAME_COUNT);
      while (index < n) {
        const [x, y] = points[index++];
        if (x * x + y * y <= 1) count++;
      }
      frames.push(frame([count, n], n, n ? (4 * count) / n : 0));
    }
    result = frames.at(-1).value > 3.14 ? 0 : 1;
  }
  if (kind === "vortex") {
    p = {
      nx: 96,
      ny: 48,
      speed: 0.07,
      radius: 4,
      centre: [24, 24],
      steps: 3600,
      reynolds: 70 + 20 * r(),
      perturbation: (r() < 0.5 ? -1 : 1) * (0.001 + 0.002 * r()),
      timeUnit: "D/U",
      physicalDuration: 31.5,
      fieldNx: 48,
      fieldNy: 24,
      inletDensity: 1,
      boundaries: {
        y: "periodic",
        left: "equilibrium rho=1, ux=0.07, uy=0",
        right: "zero gradient",
      },
      initialPerturbation:
        "uy = perturbation × exp(−((x−cx−8)/10)^2 − ((y−cy)/8)^2); ux=speed; populations are local equilibrium; cylinder nodes are stationary",
      forceAverageSteps: 15,
    };
    T = p.physicalDuration;
    initial = [p.speed, p.perturbation];
    const wake = cylinderWake(p, FRAME_COUNT);
    p.viscosity = wake.viscosity;
    p.relaxationTime = wake.tau;
    frames = wake.frames;
    result = frames.at(-1).value > 0 ? 0 : 1;
  } else if (kind === "tunneling") {
    T = 16;
    const momentum = 1.6 + 0.8 * r();
    p = {
      grid: 1024,
      xmin: -40,
      xmax: 40,
      centre: -12,
      sigma: 1.3 + 0.7 * r(),
      momentum,
      barrierWidth: 0.7 + 0.7 * r(),
      barrierHeight: ((momentum * momentum) / 2) * (1.05 + 0.35 * r()),
      maxStep: 0.01,
      physicalDuration: T,
      timeUnit: "dimensionless",
      hbar: 1,
      mass: 1,
    };
    initial = [p.centre, p.sigma, p.momentum];
    const wave = wavePacket(p, FRAME_COUNT);
    frames = wave.frames;
    p.dx = wave.dx;
    result = noise() < frames.at(-1).state[2] ? 0 : 1;
  } else if (kind === "prism") {
    T = 600;
    p = {
      wavelengths: [650e-9, 530e-9, 450e-9],
      launchDelays: [r() * 12, r() * 12, r() * 12],
      entryAngle: 0.3 + 0.05 * r(),
      airSpeed: 0.000299792458,
      physicalDuration: T,
      timeUnit: "ps",
      vertices: [
        [-0.03, -Math.sqrt(3) * 0.01],
        [0.03, -Math.sqrt(3) * 0.01],
        [0, Math.sqrt(3) * 0.02],
      ],
      glass: "SCHOTT N-BK7",
      sellmeierB: [1.03961212, 0.231792344, 1.01046945],
      sellmeierC: [0.00600069867, 0.0200179144, 103.560653],
      sellmeierWavelengthUnit: "micrometres",
    };
    p.rays = p.wavelengths.map((w) => prismRay(w, p.entryAngle));
    initial = p.launchDelays.slice();
    const times = p.rays.map((ray) =>
        ray.lengths.map(
          (length, i) =>
            (length * (i === 1 ? ray.indices.group : 1)) / p.airSpeed,
        ),
      ),
      arrivals = times.map(
        (a, i) => a.reduce((x, y) => x + y, 0) + p.launchDelays[i],
      );
    frames = Array.from({ length: FRAME_COUNT + 1 }, (_, i) => {
      const t = (i * T) / FRAME_COUNT,
        progress = [],
        state = [];
      p.rays.forEach((ray, j) => {
        let remaining = Math.max(0, t - p.launchDelays[j]),
          segment = 0;
        while (segment < 2 && remaining >= times[j][segment]) {
          remaining -= times[j][segment];
          segment++;
        }
        const fraction = clamp(remaining / times[j][segment], 0, 1),
          a = ray.points[segment],
          b = ray.points[segment + 1];
        state.push(
          a[0] + fraction * (b[0] - a[0]),
          a[1] + fraction * (b[1] - a[1]),
        );
        progress.push(
          clamp(
            (t - p.launchDelays[j]) / (arrivals[j] - p.launchDelays[j]),
            0,
            1,
          ),
        );
      });
      return frame([...state, ...progress], t, 100 * Math.max(...progress));
    });
    result = arrivals.indexOf(Math.min(...arrivals));
  }
  if (
    !frames?.length ||
    frames.some(
      (f) => !Number.isFinite(f.value) || !f.state.every(Number.isFinite),
    )
  )
    throw new Error("The experiment could not be integrated safely.");
  const model = {
    kind,
    parameters: p,
    initial,
    frames,
    result,
    points,
    durationMs: DURATION_MS,
    physicalDuration: T,
  };
  cache.set(key, model);
  while (cache.size > 32) cache.delete(cache.keys().next().value);
  return model;
}
function probabilities(model, index) {
  const f = model.frames[Math.min(FRAME_COUNT, Math.max(0, index))],
    p = model.parameters,
    progress = index / FRAME_COUNT,
    def = definitions[model.kind];
  if (model.kind === "prism") {
    const weights = f.state.slice(6).map((v) => Math.exp(5 * v)),
      total = weights.reduce((a, b) => a + b, 0);
    return weights.map((v) => 0.02 + (0.94 * v) / total);
  }
  if (model.kind === "tunneling") {
    const chance = clamp(f.state[2] + (1 - progress) * 0.3, 0.01, 0.99);
    return [chance, 1 - chance];
  }
  if (def.outcomes.length > 2) {
    const weights = p.magnets.map(
        ([x, y]) => 1 / (0.07 + (f.state[0] - x) ** 2 + (f.state[1] - y) ** 2),
      ),
      total = weights.reduce((a, b) => a + b, 0);
    return weights.map((w) => 0.02 + (0.94 * w) / total);
  }
  let chance = 0.5,
    scale = 1;
  if (model.kind === "convection") {
    chance = 1 / (1 + Math.exp(-f.value / (2 + 12 * (1 - progress))));
  } else if (model.kind === "random-walk") {
    const n = p.steps - f.t,
      A = f.state[0] + f.state[1],
      B = f.state[0] - f.state[1],
      pmf = [2 ** -n],
      cdf = [pmf[0]];
    for (let k = 1; k <= n; k++) {
      pmf[k] = (pmf[k - 1] * (n - k + 1)) / k;
      cdf[k] = cdf[k - 1] + pmf[k];
    }
    chance = 0;
    for (let k = 0; k <= n; k++) {
      const a = A + 2 * k - n,
        b2 = 2 * p.targetRadius ** 2 - a * a;
      if (b2 < 0) continue;
      const bound = Math.sqrt(b2),
        lo = Math.max(0, Math.ceil((n - B - bound) / 2)),
        hi = Math.min(n, Math.floor((n - B + bound) / 2));
      if (hi >= lo) chance += pmf[k] * (cdf[hi] - (lo ? cdf[lo - 1] : 0));
    }
  } else if (model.kind === "monte-carlo") {
    const n = f.state[1],
      inside = f.state[0],
      left = p.samples - n,
      mean = inside + (left * Math.PI) / 4,
      sd = Math.sqrt(Math.max(1, ((left * Math.PI) / 4) * (1 - Math.PI / 4)));
    chance = 1 / (1 + Math.exp((-(mean - (3.14 * p.samples) / 4) / sd) * 1.7));
  } else if (model.kind === "orbit")
    chance = 1 / (1 + Math.exp((f.value - 5) / 2));
  else {
    const scales = {
      "double-pendulum": 0.7,
      heat: 18,
      charge: 1.6,
      beam: 8,
      piston: 0.025,
      interference: 0.3,
      diffusion: 9,
      induction: 0.025,
      collision: 0.5,
      vortex: 0.25,
    };
    scale = scales[model.kind] || 1;
    let target = def.threshold;
    if (model.kind === "induction") target = 0.005;
    const signed = (def.comparison === "below" ? -1 : 1) * (f.value - target);
    chance =
      1 / (1 + Math.exp(-signed / (scale * (0.35 + 0.65 * (1 - progress)))));
  }
  chance = clamp(chance, 0.01, 0.99);
  return [chance, 1 - chance];
}
export {
  experiment,
  probabilities,
  FRAME_COUNT,
  DURATION_MS,
  COOLDOWN_MS,
  rk4,
  lorenz,
  magnetic,
  magneticEnergy,
  doublePendulum,
  pendulumEnergy,
  heatTemperature,
  chargedState,
  collisionVelocities,
  gravity,
  orbitEnergy,
  reflect,
  randomStream,
};
