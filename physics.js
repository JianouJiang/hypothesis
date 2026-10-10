"use strict";
// Authoritative rigid-body trajectories. Only elapsed samples leave the server.
const pl = require("./vendor/planck.cjs");
const V = pl.Vec2;
const cache = new Map();
const DT = 1 / 120;
const GALTON = {
  engine: "Planck.js 1.5.0 / Box2D",
  units: "metres, seconds",
  gravity: 9.81,
  width: 7,
  height: 9,
  rows: 11,
  rowSpacing: 0.6,
  firstRow: 1.3,
  pegRadius: 0.115,
  ballRadius: 0.105,
  restitution: 0.54,
  friction: 0.025,
  slots: 7,
  binTop: 7.85,
  floor: 9,
  releaseY: 0.32,
  releaseXRange: [-0.22, 0.22],
  releaseVXRange: [-0.24, 0.24],
  playbackScale: 20,
  minimumTransitMs: 75000,
  preludeMs: 10000,
  durationMs: 250000,
  maxPhysicalSeconds: 12,
};
const ESCAPE = {
  engine: "Planck.js 1.5.0 / Box2D",
  units: "metres, seconds",
  gravity: 0.5,
  radii: [1.65, 2.75, 3.85],
  gap: 1.05,
  angularSpeeds: [0.23, -0.16, 0.11],
  ballRadius: 0.12,
  restitution: 1,
  friction: 0,
  initialSpeed: 2.2,
  preludeMs: 0,
  durationMs: 60000,
  deadlineSeconds: 60,
  cooldownMs: 3000,
};
function random(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let n = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    n ^= n + Math.imul(n ^ (n >>> 7), 61 | n);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}
function pegs() {
  const result = [];
  for (let row = 0; row < GALTON.rows; row++) {
    const count = row % 2 ? 6 : 7;
    for (let col = 0; col < count; col++)
      result.push([
        col - (count - 1) / 2,
        GALTON.firstRow + row * GALTON.rowSpacing,
      ]);
  }
  return result;
}
const PEGS = pegs();
function galton(seed) {
  const c = GALTON,
    rng = random(seed),
    world = new pl.World(V(0, c.gravity));
  const staticBody = world.createBody();
  const material = { friction: c.friction, restitution: c.restitution };
  for (const [x, y] of PEGS)
    staticBody.createFixture(pl.Circle(V(x, y), c.pegRadius), material);
  for (const x of [-3.5, 3.5])
    staticBody.createFixture(pl.Edge(V(x, -1), V(x, c.floor)), material);
  staticBody
    .createFixture(pl.Edge(V(-3.5, c.floor), V(3.5, c.floor)), {
      friction: 0.3,
      restitution: 0.05,
    })
    .setUserData("floor");
  for (let x = -2.5; x <= 2.5; x++)
    staticBody.createFixture(pl.Edge(V(x, c.binTop), V(x, c.floor)), {
      friction: 0.08,
      restitution: 0.15,
    });
  const ball = world.createDynamicBody({
    position: V((rng() - 0.5) * 0.44, c.releaseY),
    bullet: true,
    linearDamping: 0.005,
  });
  ball.createFixture(pl.Circle(c.ballRadius), { density: 1, ...material });
  ball.setLinearVelocity(V((rng() - 0.5) * 0.48, 0));
  // Keep the actual starting state available even after the visible history
  // window no longer contains the release. Do not consume another random draw.
  const release = {
    x: ball.getPosition().x,
    y: ball.getPosition().y,
    vx: ball.getLinearVelocity().x,
    vy: ball.getLinearVelocity().y,
    angle: ball.getAngle(),
    angularVelocity: ball.getAngularVelocity(),
  };
  let collisions = 0,
    stepTime = 0,
    lastImpact = -1000,
    floorContact = null;
  const impacts = [];
  world.on("post-solve", (contact, impulse) => {
    if (
      contact.getFixtureA().getUserData() === "floor" ||
      contact.getFixtureB().getUserData() === "floor"
    ) {
      const contactPoint = contact.getWorldManifold(null).points[0];
      floorContact = [contactPoint.x, contactPoint.y];
    }
    const strength = Math.max(...impulse.normalImpulses);
    if (strength > 0.004 && stepTime - lastImpact > 30) {
      const p = ball.getPosition();
      collisions++;
      lastImpact = stepTime;
      impacts.push([
        stepTime,
        p.x,
        p.y,
        Math.max(0, Math.round((p.y - c.firstRow) / c.rowSpacing)),
        Math.min(1, strength / 0.2),
      ]);
    }
  });
  const frames = [
    [0, ball.getPosition().x, c.releaseY, 0, 0],
    [c.preludeMs, ball.getPosition().x, c.releaseY, 0, 0],
  ];
  let slot = null,
    landedAt = null;
  for (let i = 1; i <= c.maxPhysicalSeconds / DT; i++) {
    stepTime = Math.round(c.preludeMs + i * DT * c.playbackScale * 1000);
    world.step(DT, 8, 3);
    const p = ball.getPosition();
    if (i % 2 === 0)
      frames.push([
        Math.round(c.preludeMs + i * DT * c.playbackScale * 1000),
        +p.x.toFixed(5),
        +p.y.toFixed(5),
        +ball.getAngle().toFixed(4),
        collisions,
      ]);
    if (floorContact) {
      slot = Math.max(0, Math.min(c.slots - 1, Math.floor(p.x + 3.5)));
      landedAt = Math.round(c.preludeMs + i * DT * c.playbackScale * 1000);
      frames.push([
        landedAt,
        +p.x.toFixed(5),
        +p.y.toFixed(5),
        +ball.getAngle().toFixed(4),
        collisions,
      ]);
      break;
    }
  }
  const original = landedAt ?? c.durationMs,
    transit = original - c.preludeMs;
  const factor = Math.max(1, c.minimumTransitMs / transit);
  if (factor > 1) {
    for (const f of frames)
      if (f[0] > c.preludeMs)
        f[0] = Math.round(c.preludeMs + (f[0] - c.preludeMs) * factor);
    for (const hit of impacts)
      hit[0] = Math.round(c.preludeMs + (hit[0] - c.preludeMs) * factor);
  }
  return {
    kind: "galton",
    config: { ...c, playbackScale: c.playbackScale * factor },
    release,
    pegs: PEGS,
    frames,
    impacts,
    slot,
    landingContact: floorContact,
    resolveMs: Math.round(c.preludeMs + transit * factor),
    void: slot === null,
  };
}
function escape(seed, timingVersion) {
  // Finish rounds opened by the previous release on their original clock.
  // New rounds launch immediately, with only a three-second result interval.
  const c =
      timingVersion === 1
        ? { ...ESCAPE, preludeMs: 60000, durationMs: 120000, cooldownMs: 3500 }
        : ESCAPE,
    rng = random(seed),
    world = new pl.World(V(0, c.gravity));
  const phases = c.radii.map(() => rng() * Math.PI * 2);
  c.radii.forEach((radius, index) => {
    const ring = world.createKinematicBody({
      angle: phases[index],
      angularVelocity: c.angularSpeeds[index],
    });
    ring.setUserData({ ring: index });
    const segments = 84,
      span = Math.PI * 2 - c.gap;
    for (let i = 0; i < segments; i++) {
      const a = c.gap / 2 + (span * i) / segments,
        b = c.gap / 2 + (span * (i + 1)) / segments;
      ring.createFixture(
        pl.Edge(
          V(radius * Math.cos(a), radius * Math.sin(a)),
          V(radius * Math.cos(b), radius * Math.sin(b)),
        ),
        { friction: 0, restitution: c.restitution },
      );
    }
  });
  const angle = rng() * Math.PI * 2;
  const ball = world.createDynamicBody({
    position: V((rng() - 0.5) * 0.25, (rng() - 0.5) * 0.25),
    bullet: true,
  });
  ball.createFixture(pl.Circle(c.ballRadius), {
    density: 1,
    friction: 0,
    restitution: c.restitution,
  });
  ball.setLinearVelocity(
    V(c.initialSpeed * Math.cos(angle), c.initialSpeed * Math.sin(angle)),
  );
  let collisions = 0,
    escaped = false,
    resolveMs = c.durationMs,
    stepTime = 0,
    lastImpact = -1000;
  const impacts = [];
  world.on("post-solve", (contact, impulse) => {
    const strength = Math.max(...impulse.normalImpulses);
    if (strength > 0.008 && stepTime - lastImpact > 45) {
      const p = ball.getPosition(),
        a = contact.getFixtureA().getBody().getUserData(),
        b = contact.getFixtureB().getBody().getUserData();
      collisions++;
      lastImpact = stepTime;
      impacts.push([
        stepTime,
        p.x,
        p.y,
        a?.ring ?? b?.ring ?? 0,
        Math.min(1, strength / 0.2),
      ]);
    }
  });
  const p0 = ball.getPosition(),
    frames = [
      [0, p0.x, p0.y, 0, 0],
      [c.preludeMs, p0.x, p0.y, 0, 0],
    ];
  for (let i = 1; i <= c.deadlineSeconds / DT; i++) {
    stepTime = Math.round(c.preludeMs + i * DT * 1000);
    world.step(DT, 8, 3);
    const p = ball.getPosition(),
      t = Math.round(c.preludeMs + i * DT * 1000);
    if (i % 4 === 0)
      frames.push([
        t,
        +p.x.toFixed(5),
        +p.y.toFixed(5),
        +ball.getAngle().toFixed(4),
        collisions,
      ]);
    if (Math.hypot(p.x, p.y) > c.radii.at(-1) + c.ballRadius + 0.04) {
      escaped = true;
      resolveMs = t;
      frames.push([
        t,
        +p.x.toFixed(5),
        +p.y.toFixed(5),
        +ball.getAngle().toFixed(4),
        collisions,
      ]);
      break;
    }
  }
  return {
    kind: "escape",
    config: c,
    phases,
    frames,
    impacts,
    escaped,
    resolveMs,
    void: false,
  };
}
function experiment(kind, seed, start, timingVersion = 2) {
  const key = `${kind}:${seed}:${start}:${timingVersion}`;
  if (!cache.has(key)) {
    if (cache.size > 24) cache.delete(cache.keys().next().value);
    const physicalSeed =
      seed ^ ((start / 1000) | 0) ^ Math.imul(start % 100000, 65537);
    cache.set(
      key,
      kind === "galton"
        ? galton(physicalSeed)
        : escape(physicalSeed, timingVersion),
    );
  }
  return cache.get(key);
}
function atTime(model, elapsed) {
  const f = model.frames;
  let lo = 0,
    hi = f.length - 1;
  while (lo < hi) {
    const m = Math.ceil((lo + hi) / 2);
    if (f[m][0] <= elapsed) lo = m;
    else hi = m - 1;
  }
  return { index: lo, point: f[lo] };
}
// A normalized, observation-only heuristic; this is not a calibrated probability.
function slotProbabilities(model, elapsed) {
  const p = atTime(model, elapsed).point;
  const spread = Math.max(
    0.22,
    1.45 * Math.sqrt(Math.max(0, (GALTON.binTop - p[2]) / GALTON.binTop)),
  );
  const weights = Array.from(
    { length: 7 },
    (_, i) => Math.exp(-0.5 * ((i - 3 - p[1]) / spread) ** 2) + 0.006,
  );
  const total = weights.reduce((a, b) => a + b, 0);
  // Keep the normalized vector inside the binary maker's 2–98 cent bounds.
  return weights.map((w) => 0.02 + (0.86 * w) / total);
}
module.exports = {
  experiment,
  atTime,
  slotProbabilities,
  GALTON,
  ESCAPE,
  PEGS,
};
