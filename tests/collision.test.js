"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict");
const { Exchange } = require("../exchange");
const { CollisionMarket } = require("../collision-market");
const { experiment, GALTON, ESCAPE } = require("../physics");
const guest = "collision-guest";
function setup() {
  let now = 0;
  const exchange = new Exchange({ now: () => now, seed: 7123, bots: false });
  exchange.addPlayer(guest);
  return { exchange, setNow: (t) => (now = t) };
}
const buy = (roundId, side = "up", amount = 10) => ({
  roundId,
  side,
  action: "buy",
  type: "market",
  amount,
});

test("Galton uses actual gravity and contact trajectories; every round fits 1–5 minutes", () => {
  const landed = new Set();
  for (let seed = 1; seed <= 14; seed++) {
    const m = experiment("galton", seed * 19173, 0);
    assert.ok(m.resolveMs + 3500 >= 60000 && m.resolveMs + 3500 <= 300000);
    assert.ok(m.frames.every((f) => f.every(Number.isFinite)));
    assert.equal(m.release.x, m.frames[0][1]);
    assert.equal(m.release.y, m.frames[0][2]);
    assert.ok(
      m.release.x >= GALTON.releaseXRange[0] &&
        m.release.x <= GALTON.releaseXRange[1],
    );
    assert.ok(
      m.release.vx >= GALTON.releaseVXRange[0] &&
        m.release.vx <= GALTON.releaseVXRange[1],
    );
    assert.equal(m.release.vy, 0);
    assert.ok(m.impacts.length > 0);
    for (const f of m.frames) assert.ok(Math.abs(f[1]) < 3.6);
    if (!m.void) {
      landed.add(m.slot);
      const p = m.frames.at(-1);
      assert.equal(Math.floor(p[1] + 3.5), m.slot);
      assert.ok(
        Math.abs(m.landingContact[1] - GALTON.floor) < GALTON.ballRadius / 2,
      );
      // The integrator may already have moved the body a few centimetres up
      // after resolving the impact; the recorded contact is the settling event.
      assert.ok(p[2] >= GALTON.floor - GALTON.ballRadius - 0.1);
    }
    const beforeContact = m.frames.find(
      (f) => f[0] > m.config.preludeMs + 1000 && f[2] < 0.7,
    );
    if (beforeContact) {
      const t =
        (beforeContact[0] - m.config.preludeMs) / 1000 / m.config.playbackScale;
      assert.ok(
        Math.abs(
          beforeContact[2] - (GALTON.releaseY + 0.5 * GALTON.gravity * t * t),
        ) < 0.035,
      );
      assert.ok(
        Math.abs(beforeContact[1] - (m.release.x + m.release.vx * t)) < 0.0001,
        "published release velocity predicts the free-fall motion before contact",
      );
    }
  }
  assert.ok(landed.size >= 4, "varied releases produce multiple landing slots");
});
test("Galton release conditions stay public after launch, agree across slots and survive restart", () => {
  const { exchange: ex, setNow } = setup();
  const first = ex.snapshot(guest, "galton"),
    release = first.physics.release;
  assert.ok(release && first.physics.phase === "release");
  const roundEnd = ex.select("galton").state.round.end;
  setNow(first.round.start + 60000);
  for (let slot = 1; slot <= 7; slot++) {
    const current = ex.snapshot(guest, `galton-${slot}`);
    assert.ok(
      current.physics.frames[0][0] > 0,
      "release frame has left the observation window",
    );
    assert.deepEqual(current.physics.release, release);
    assert.equal(current.physics.result, null);
  }
  const restored = new Exchange({
    state: JSON.parse(JSON.stringify(ex.state)),
    now: () => first.round.start + 60000,
    bots: false,
  });
  assert.deepEqual(restored.snapshot(guest, "galton").physics.release, release);
  setNow(roundEnd + 1);
  const next = ex.snapshot(guest, "galton");
  assert.notEqual(next.round.id, first.round.id);
  assert.notEqual(next.physics.release.x, release.x);
  assert.equal(
    next.physics.release.x,
    ex.select("galton").model().frames[0][1],
  );
});
test("seven slots settle one Yes and six No outcomes, crediting every winning contract once", () => {
  const { exchange: ex, setNow } = setup(),
    first = ex.select("galton").state.round;
  let expected = 0;
  const winning = ex.select("galton").model().slot;
  assert.notEqual(winning, null);
  for (let slot = 0; slot < 7; slot++)
    for (const side of ["up", "down"]) {
      const key = `galton-${slot + 1}`;
      ex.place(guest, buy(first.id, side, 2), key);
      if (side === (slot === winning ? "up" : "down"))
        expected += ex.select(key).player(guest).positions[side].shares;
    }
  const balance = ex.snapshot(guest, "galton").player.balance;
  setNow(first.settlementAt);
  const settled = ex.snapshot(guest, "galton");
  assert.equal(settled.physics.result, winning);
  assert.ok(Math.abs(settled.player.balance - balance - expected) < 1e-6);
  const outcomes = Array.from(
    { length: 7 },
    (_, i) => ex.select(`galton-${i + 1}`).state.history[0].outcome,
  );
  assert.equal(outcomes.filter((o) => o === "up").length, 1);
  assert.equal(outcomes.filter((o) => o === "down").length, 6);
  assert.ok(
    settled.player.allPositions
      .filter((p) => p.marketId.startsWith("galton-"))
      .every((p) => p.shares === 0),
  );
  assert.throws(() => ex.place(guest, buy(first.id), "galton"), /resolved/);
  const restored = new Exchange({
    state: JSON.parse(JSON.stringify(ex.state)),
    now: () => first.settlementAt,
    seed: 7123,
    bots: false,
  });
  assert.equal(restored.snapshot(guest).player.balance, settled.player.balance);
  setNow(first.end + 1);
  const next = ex.snapshot(guest, "galton");
  assert.notEqual(next.round.id, first.id);
  assert.equal(new Set(next.outcomes.map((o) => o.roundId)).size, 1);
});
test("all seven contracts use one clock sample across a window boundary", () => {
  let time = 64999;
  const ex = new Exchange({ now: () => time++, seed: 132, bots: false });
  ex.addPlayer(guest);
  const s = ex.snapshot(guest, "galton");
  assert.equal(new Set(s.outcomes.map((o) => o.roundId)).size, 1);
  assert.equal(s.now, 65000);
});
test("ball snapshots and music contain elapsed samples only; quotes cannot read future results", () => {
  for (const id of ["galton", "escape"]) {
    const { exchange: ex, setNow } = setup();
    setNow(id === "galton" ? 63000 : 1000);
    const market = ex.select(id),
      s = ex.snapshot(guest, id),
      elapsed = s.now - s.round.start;
    assert.ok(s.physics.frames.every((f) => f[0] <= elapsed));
    assert.ok(s.physics.impacts.every((f) => f[0] <= elapsed));
    assert.equal(s.physics.result, null);
    assert.equal(s.round.nextAt, null);
    assert.equal(s.physics.resolveMs, undefined);
    assert.equal(s.physics.seed, undefined);
    assert.equal(s.physics.slot, undefined);
    const p = market.probability(),
      model = market.model(),
      saved = model.slot,
      escaped = model.escaped;
    model.slot = 6;
    model.escaped = !escaped;
    assert.equal(market.probability(), p);
    model.slot = saved;
    model.escaped = escaped;
  }
});
test("escape geometry and impulses support both escape and timeout, within the published deadline", () => {
  const results = new Set();
  for (let seed = 1; seed <= 8; seed++) {
    const m = experiment("escape", seed * 19173, 0);
    results.add(m.escaped);
    assert.equal(m.config.preludeMs, 0);
    assert.ok(m.resolveMs > 0 && m.resolveMs <= 60000);
    assert.equal(m.config.cooldownMs, 3000);
    assert.ok(m.impacts.length > 0);
    assert.ok(
      m.impacts.every((h) => h[3] >= 0 && h[3] < 3 && h[4] > 0 && h[4] <= 1),
    );
    assert.ok(m.resolveMs <= ESCAPE.preludeMs + 60000);
    const p = m.frames.at(-1);
    if (m.escaped)
      assert.ok(
        Math.hypot(p[1], p[2]) >
          ESCAPE.radii.at(-1) + ESCAPE.ballRadius + 0.039,
      );
  }
  assert.equal(results.size, 2);
});
test("escape settlement, shared reservations and competition interest survive restart", () => {
  const { exchange: ex, setNow } = setup(),
    m = ex.select("escape"),
    r = m.state.round;
  ex.updateCompetition(guest, { interested: true });
  ex.place(guest, buy(r.id, "down", 10), "escape");
  const before = ex.snapshot(guest, "escape").player,
    shares = before.positions.down.shares,
    won = !m.model().escaped;
  setNow(r.settlementAt);
  let s = ex.snapshot(guest, "escape");
  assert.ok(
    Math.abs(s.player.balance - before.balance - (won ? shares : 0)) < 1e-6,
  );
  const restored = new Exchange({
    state: JSON.parse(JSON.stringify(ex.state)),
    now: () => r.settlementAt,
    bots: false,
  });
  assert.equal(restored.snapshot(guest).player.balance, s.player.balance);
  assert.equal(restored.snapshot(guest).player.competitionInterest, true);
  const br = ex.select("bitcoin").state.round;
  ex.place(
    guest,
    { ...buy(br.id), type: "limit", quantity: 60000, price: 0.01 },
    "bitcoin",
  );
  const gr = ex.select("galton").state.round;
  assert.throws(
    () =>
      ex.place(
        guest,
        { ...buy(gr.id), type: "limit", quantity: 60000, price: 0.01 },
        "galton",
      ),
    /gold|resolved/,
  );
  ex.reset(guest);
  s = ex.snapshot(guest, "galton");
  assert.equal(s.player.balance, 1000);
  assert.equal(s.player.allOrders.length, 0);
  assert.equal(s.player.competitionInterest, true);
});

test("escape and timeout each launch the next moving ball exactly three seconds after settlement", () => {
  for (const escaped of [true, false]) {
    const seed = Array.from({ length: 8 }, (_, i) => (i + 1) * 19173).find(
      (s) => experiment("escape", s, 0).escaped === escaped,
    );
    let now = 0;
    const options = {
      now: () => now,
      marketId: "escape",
      simulation: { kind: "escape", seed },
      bots: false,
    };
    const m = new CollisionMarket(options);
    m.addPlayer(guest);
    const r = { ...m.state.round };
    now = r.settlementAt - 1;
    assert.equal(m.snapshot(guest).round.closed, false);
    now = r.settlementAt;
    const result = m.snapshot(guest);
    assert.equal(result.physics.result, escaped ? "yes" : "no");
    assert.equal(result.round.nextAt, now + 3000);
    now += 2999;
    assert.equal(m.snapshot(guest).round.id, r.id);
    const restored = new CollisionMarket({
      ...options,
      state: JSON.parse(JSON.stringify(m.state)),
    });
    now++;
    const next = restored.snapshot(guest);
    assert.notEqual(next.round.id, r.id);
    assert.equal(next.round.start, r.settlementAt + 3000);
    assert.equal(next.physics.phase, "running");
    assert.equal(next.physics.config.preludeMs, 0);
    now += 100;
    assert.ok(restored.snapshot(guest).physics.particle[0] > 0);
    assert.equal(restored.state.history.filter((h) => h.id === r.id).length, 1);
  }
});

test("in-flight escape positions keep their original trajectory and timing when the cadence changes", () => {
  const { exchange: ex, setNow } = setup();
  const m = ex.select("escape"),
    r = m.state.round;
  ex.place(guest, buy(r.id, "up", 10), "escape");
  const held = ex.snapshot(guest, "escape").player;
  const legacy = experiment("escape", m.simulation.seed, r.start, 1);
  delete r.timingVersion;
  r.settlementAt = r.start + legacy.resolveMs;
  r.end = r.settlementAt + 3500;
  r.path = Array.from(
    { length: Math.ceil((r.end - r.start) / 1000) + 1 },
    (_, i) => m.estimate(legacy, i * 1000),
  );
  r.path[r.path.length - 1] = legacy.escaped ? 1 : 0;
  let now = r.settlementAt - 1;
  const restored = new Exchange({
    state: JSON.parse(JSON.stringify(ex.state)),
    now: () => now,
    bots: false,
  });
  let s = restored.snapshot(guest, "escape");
  assert.equal(s.physics.config.preludeMs, 60000);
  assert.equal(s.round.closed, false);
  assert.equal(s.player.balance, held.balance);
  now++;
  s = restored.snapshot(guest, "escape");
  assert.equal(s.physics.result, legacy.escaped ? "yes" : "no");
  assert.ok(
    Math.abs(
      s.player.balance -
        held.balance -
        (legacy.escaped ? held.positions.up.shares : 0),
    ) < 1e-6,
  );
  now = r.end;
  s = restored.snapshot(guest, "escape");
  assert.equal(s.physics.config.preludeMs, 0);
  assert.equal(s.physics.phase, "running");
  assert.equal(restored.select("escape").state.round.timingVersion, 2);
});
