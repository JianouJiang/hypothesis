"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict");
const { Exchange } = require("../exchange");
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
    }
  }
  assert.ok(landed.size >= 4, "varied releases produce multiple landing slots");
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
  const { exchange: ex, setNow } = setup();
  setNow(63000);
  for (const id of ["galton", "escape"]) {
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
    assert.ok(m.resolveMs + 3500 >= 60000 && m.resolveMs + 3500 <= 300000);
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
