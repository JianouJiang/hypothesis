"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict");
const { definitions, ids, contractIds } = require("../experiments");
const physics = require("../lab-physics");
const { wavePacket, glassIndex, prismRay } = require("../wave-physics");
const { cylinderWake } = require("../wake-physics");
const { Exchange } = require("../exchange");
const { Community } = require("../community");
const secret = "9".repeat(64),
  model = (kind) => physics.experiment(kind, secret, 0);
const near = (a, b, tol = 1e-7) =>
  assert.ok(
    Math.abs(a - b) <= tol,
    `${a} differs from ${b} by more than ${tol}`,
  );
test("all 17 new experiments integrate finite states, publish a reproducible specification, and normalize quotes", () => {
  assert.equal(ids.length, 17);
  for (const kind of ids) {
    const m = model(kind);
    assert.equal(m.frames.length, 241, kind);
    assert.ok(m.initial.every(Number.isFinite));
    assert.ok(m.parameters.physicalDuration > 0);
    assert.ok(m.result >= 0 && m.result < definitions[kind].outcomes.length);
    assert.ok(definitions[kind].stateVariables.length);
    for (let i = 0; i < m.frames.length; i++) {
      const f = m.frames[i];
      assert.ok(
        Number.isFinite(f.value) && f.state.every(Number.isFinite),
        kind,
      );
      assert.ok((f.field || []).every(Number.isFinite), kind);
      assert.ok(i === 0 || f.t >= m.frames[i - 1].t, kind);
      const probs = physics.probabilities(m, i);
      near(
        probs.reduce((a, b) => a + b, 0),
        1,
      );
      assert.ok(probs.every((x) => x >= 0 && x <= 1));
    }
    assert.deepEqual(physics.experiment(kind, secret, 0).frames, m.frames);
  }
});
test("Lorenz equilibria and symmetry; magnetic damping dissipates mechanical energy", () => {
  const p = { sigma: 10, rho: 28, beta: 8 / 3 },
    a = Math.sqrt(p.beta * (p.rho - 1));
  physics.lorenz([a, a, p.rho - 1], p).forEach((v) => near(v, 0));
  const d = physics.lorenz([1, 2, 3], p),
    r = physics.lorenz([-1, -2, 3], p);
  near(r[0], -d[0]);
  near(r[1], -d[1]);
  near(r[2], d[2]);
  const m = model("magnetic-pendulum"),
    energies = m.frames.map((f) =>
      physics.magneticEnergy(f.state, m.parameters),
    );
  for (let i = 1; i < energies.length; i++)
    assert.ok(energies[i] <= energies[i - 1] + 1e-6);
});
test("double pendulum and softened gravity conserve energy within integration tolerance", () => {
  for (const kind of ["double-pendulum", "orbit"]) {
    const m = model(kind),
      energy = kind === "orbit" ? physics.orbitEnergy : physics.pendulumEnergy,
      e0 = energy(m.initial, m.parameters),
      error = Math.max(
        ...m.frames.map((f) => Math.abs(energy(f.state, m.parameters) - e0)),
      );
    assert.ok(
      error / Math.max(1, Math.abs(e0)) < (kind === "orbit" ? 0.006 : 1e-5),
      `${kind}: energy drift ${error}`,
    );
  }
});
test("heat equation obeys fixed boundaries, the maximum principle, and the Fourier modal decay", () => {
  const m = model("heat"),
    p = m.parameters;
  for (const f of m.frames) {
    near(physics.heatTemperature(0, 0.05, f.t, p), p.boundary);
    for (const value of f.field)
      assert.ok(
        value >= p.initialTemperature - 1e-4 && value <= p.boundary + 1e-4,
      );
  }
  const cold = { ...p, initialTemperature: 37, boundary: 37 };
  near(physics.heatTemperature(0.04, 0.06, 10, cold), 37);
  assert.ok(m.frames.at(-1).value > m.frames[1].value);
});
test("uniform magnetic field preserves speed and closes the cyclotron orbit; zero B becomes a parabola", () => {
  const p = {
      chargeToMass: 2,
      magneticField: 0.7,
      electricField: 0,
      x0: 1,
      y0: 2,
      vx0: 0.8,
      vy0: -0.2,
    },
    period = (2 * Math.PI) / (p.chargeToMass * p.magneticField);
  for (let i = 0; i < 20; i++) {
    const s = physics.chargedState((i * period) / 20, p);
    near(s[2] ** 2 + s[3] ** 2, p.vx0 ** 2 + p.vy0 ** 2);
  }
  const end = physics.chargedState(period, p);
  near(end[0], p.x0);
  near(end[1], p.y0);
  const s = physics.chargedState(3, {
    ...p,
    magneticField: 0,
    electricField: 0.4,
  });
  near(s[1], p.y0 + p.vy0 * 3 + 0.5 * 0.8 * 9);
});
test("collision conserves momentum and implements restitution, including equal-mass elastic exchange", () => {
  for (const restitution of [0, 0.65, 1]) {
    const p = { m1: 2, m2: 3, u1: 1.3, u2: -0.6, restitution },
      [a, b] = physics.collisionVelocities(p);
    near(p.m1 * a + p.m2 * b, p.m1 * p.u1 + p.m2 * p.u2);
    near(b - a, restitution * (p.u1 - p.u2));
    assert.ok(
      p.m1 * a * a + p.m2 * b * b <= p.m1 * p.u1 ** 2 + p.m2 * p.u2 ** 2 + 1e-8,
    );
  }
  assert.deepEqual(
    physics.collisionVelocities({ m1: 1, m2: 1, u1: 1, u2: 0, restitution: 1 }),
    [0, 1],
  );
});
test("Brownian reflection preserves bounds, the walk has unit steps, and Monte Carlo counts the circle", () => {
  const d = model("diffusion");
  assert.ok(d.frames.every((f) => f.state.every((v) => v >= -1 && v <= 1)));
  near(physics.reflect(1.2), 0.8);
  near(physics.reflect(-1.2), -0.8);
  const w = model("random-walk");
  for (let i = 2; i < w.frames.length; i += 2) {
    const a = w.frames[i - 2].state,
      b = w.frames[i].state;
    assert.equal(Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]), 1);
  }
  const m = model("monte-carlo"),
    inside = m.points.filter(([x, y]) => x * x + y * y <= 1).length;
  near(m.frames.at(-1).value, (4 * inside) / 1600);
  assert.notDeepEqual(
    physics.randomStream(secret, "future")(),
    physics.randomStream(secret, "conditions")(),
  );
});
test("Faraday emf is the negative flux derivative and the coil follows the RL equation", () => {
  const m = model("induction"),
    p = m.parameters,
    flux = (t) =>
      (p.turns * p.fluxConstant) /
      (p.coilRadius ** 2 + (p.z0 + p.velocity * t) ** 2) ** 1.5,
    h = 1e-5;
  for (const f of m.frames.slice(1, -1))
    near(f.state[2], -(flux(f.t + h) - flux(f.t - h)) / (2 * h), 1e-7);
  for (let i = 2; i < m.frames.length - 2; i++) {
    const before = m.frames[i - 1],
      f = m.frames[i],
      after = m.frames[i + 1],
      di = (after.state[0] - before.state[0]) / (after.t - before.t);
    near(p.inductance * di + p.resistance * f.state[0], f.state[2], 2e-4);
  }
});
test("wave evolution conserves probability; free propagation and refinement agree", () => {
  const m = model("tunneling");
  for (const f of m.frames)
    near(
      f.state.reduce((a, b) => a + b, 0),
      1,
      2e-10,
    );
  const p = {
    ...m.parameters,
    centre: -5,
    barrierHeight: 0,
    physicalDuration: 3,
  };
  const free = wavePacket(p, 60),
    f = free.frames.at(-1);
  let mean = 0,
    variance = 0;
  for (let i = 0; i < free.x.length; i++)
    mean += free.x[i] * f.field[i] * free.dx;
  for (let i = 0; i < free.x.length; i++)
    variance += (free.x[i] - mean) ** 2 * f.field[i] * free.dx;
  near(mean, p.centre + p.momentum * p.physicalDuration, 0.15);
  near(
    variance,
    p.sigma ** 2 + p.physicalDuration ** 2 / (4 * p.sigma ** 2),
    0.12,
  );
  const finer = wavePacket({ ...m.parameters, grid: 2048, maxStep: 0.005 });
  near(finer.frames.at(-1).value, m.frames.at(-1).value, 1.5);
});
test("N-BK7 dispersion matches SCHOTT reference and Snell refraction at both faces", () => {
  near(glassIndex(587.6e-9).phase, 1.5168, 0.000005);
  const m = model("prism");
  for (const wavelength of m.parameters.wavelengths) {
    const ray = prismRay(wavelength, m.parameters.entryAngle);
    near(
      Math.sin(m.parameters.entryAngle + Math.PI / 6),
      ray.indices.phase * Math.sin(ray.insideAngle + Math.PI / 6),
    );
    near(
      ray.indices.phase * Math.sin(ray.insideAngle - Math.PI / 6),
      Math.sin(ray.exitAngle - Math.PI / 6),
    );
    assert.ok(ray.indices.group > ray.indices.phase);
  }
  assert.ok(glassIndex(450e-9).group > glassIndex(650e-9).group);
});
test("cylinder lattice keeps density bounded and mirror initial conditions reverse lift", () => {
  const m = model("vortex");
  for (const f of m.frames) {
    assert.ok(f.maxSpeed < 0.2);
    assert.ok(f.mass > 4000 && f.mass < 4800);
  }
  const p = {
    nx: 48,
    ny: 32,
    speed: 0.07,
    radius: 3,
    centre: [12, 16],
    steps: 300,
    reynolds: 70,
    perturbation: 0.002,
  };
  const a = cylinderWake(p, 20),
    b = cylinderWake({ ...p, perturbation: -p.perturbation }, 20);
  near(a.frames.at(-1).value, -b.frames.at(-1).value, 1e-10);
  const uniform = cylinderWake(
    { ...p, radius: 0, steps: 50, perturbation: 0 },
    10,
  );
  for (const f of uniform.frames) {
    near(f.mass, p.nx * p.ny, 1e-7);
    near(f.maxSpeed, p.speed, 1e-9);
  }
});
test("every new contract trades from one wallet, hides future state, settles once and resets after exactly three seconds", () => {
  let now = 0;
  const state = {
    version: 2,
    accounts: {},
    markets: {},
    experimentSeed: 77,
    labSecret: secret,
  };
  const ex = new Exchange({ state, now: () => now, bots: false }),
    guest = "new-lab-guest";
  ex.addPlayer(guest);
  for (const id of contractIds) {
    const r = ex.select(id).state.round;
    ex.place(
      guest,
      { roundId: r.id, side: "up", action: "buy", type: "market", amount: 3 },
      id,
    );
  }
  now = 60000;
  const before = ex.snapshot(guest, "diffusion");
  assert.ok(before.player.balance < 1000);
  assert.equal(before.lab.index, 120);
  assert.ok(before.lab.history.every(([t]) => t <= 10));
  assert.equal(before.lab.result, null);
  const serialized = JSON.stringify(before);
  assert.ok(!serialized.includes(secret));
  for (const key of ['"secret"', '"seed"', '"frames"', '"labSecret"'])
    assert.ok(!serialized.includes(key));
  const pi = ex.snapshot(guest, "monte-carlo");
  assert.equal(pi.lab.points.length, 800);
  const comment = new Community(undefined, ex.state, now);
  comment.mutate(guest, {
    action: "comment",
    game: "prism",
    text: "Testing the group delay model.",
    requestId: "lab-comment",
  });
  assert.equal(comment.feed(guest, { game: "prism" }).comments.length, 1);
  assert.equal(comment.contracts("prism").length, 3);
  const held = before.player.allPositions.filter((p) => p.shares > 0);
  let expected = before.player.balance;
  for (const pos of held) {
    const game = pos.marketId.split(":")[0],
      idx = Number(pos.marketId.split(":")[1]) || 0;
    if (model(game).result === idx) expected += pos.shares;
  }
  now = 120000;
  const final = ex.snapshot(guest, "convection");
  assert.ok(final.round.closed);
  near(final.player.balance, expected, 1e-5);
  assert.equal(final.round.nextAt, 123000);
  assert.equal(final.player.allPositions.filter((p) => p.shares > 0).length, 0);
  assert.throws(
    () =>
      ex.place(
        guest,
        { roundId: "0", side: "up", action: "buy", type: "market", amount: 3 },
        "convection",
      ),
    /resolved/,
  );
  const restart = new Exchange({
    state: JSON.parse(JSON.stringify(ex.state)),
    now: () => now,
    bots: false,
  });
  near(restart.snapshot(guest).player.balance, expected, 1e-5);
  for (const id of contractIds) {
    const s = restart.snapshot(guest, id);
    assert.equal(s.history.length, 1);
    assert.equal(s.lab.result, model(id.split(":")[0]).result);
  }
  now = 122999;
  assert.equal(restart.snapshot(guest, "convection").round.id, "0");
  now = 123000;
  const next = restart.snapshot(guest, "convection");
  assert.equal(next.round.id, "123000");
  assert.ok(!next.round.closed);
  assert.equal(next.lab.result, null);
  assert.notDeepEqual(next.lab.initial, final.lab.initial);
});
