"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { Market } = require("../market");
const { Exchange } = require("../exchange");
// Deliberately synthetic test data. Production accepts only the private CFD bank.
function fixture() {
  return {
    version: 1,
    metadata: { id: "test-only", releaseY: 0, timeScale: 2 / 3 },
    grid: { nx: 2, ny: 2, xmin: -3, xmax: 6, ymin: -3, ymax: 3, scale: 1000 },
    frames: [0, 6, 12].map((time) => ({
      time,
      velocity: [1000, 0, 1000, 0, 1000, 0, 1000, 0],
    })),
    traces: [-0.4, 0.2, 0.7, -0.1].map((end, id) => ({
      id,
      durationMs: [90000, 120000, 150000, 105000][id],
      times: Array.from({ length: 121 }, (_, i) => i / 10),
      points: Array.from({ length: 121 }, (_, i) => [
        -3 + (i * 9) / 120,
        (end * i) / 120,
      ]),
    })),
  };
}
const id = "test-guest-a";
function setup() {
  let now = 1200000;
  const data = fixture();
  const ex = new Exchange({
    now: () => now,
    flowData: data,
    bots: false,
    seed: 47,
  });
  ex.addPlayer(id);
  return {
    ex,
    data,
    setTime: (t) => {
      now = t;
    },
    now: () => now,
  };
}
const limit = (roundId, quantity = 60000) => ({
  roundId,
  side: "up",
  action: "buy",
  type: "limit",
  quantity,
  price: 0.01,
});

test("one wallet reserves across both markets and cannot double spend", () => {
  const { ex } = setup();
  ex.place(id, limit(ex.select().state.round.id));
  assert.equal(ex.snapshot(id, "aerofoil").player.balance, 400);
  assert.throws(
    () => ex.place(id, limit(ex.select("aerofoil").state.round.id), "aerofoil"),
    /gold|balance|afford/i,
  );
  const s = ex.snapshot(id);
  assert.equal(s.player.reserved, 600);
  assert.equal(s.player.allOrders.length, 1);
  assert.equal(s.player.equity, 1000);
  ex.cancel(id, s.player.allOrders[0].id, "bitcoin");
  assert.equal(ex.snapshot(id, "aerofoil").player.balance, 1000);
});
test("CFD rounds settle on arrival and target exactly the preceding trajectory exit", () => {
  const { ex, setTime, now } = setup(),
    m = ex.select("aerofoil"),
    r = m.state.round;
  assert.equal(r.end - r.start, m.traceAt(r.start).durationMs);
  assert.equal(r.opening, m.traceAt(r.start - 1).points.at(-1)[1]);
  ex.place(
    id,
    { side: "up", action: "buy", type: "market", amount: 10, roundId: r.id },
    "aerofoil",
  );
  const before = ex.snapshot(id, "aerofoil").player;
  const shares = before.positions.up.shares,
    exit = r.path.at(-1),
    won = exit >= r.opening;
  setTime(r.end);
  const s = ex.snapshot(id, "aerofoil");
  assert.equal(s.round.opening, exit);
  assert.equal(s.history[0].outcome, won ? "up" : "down");
  assert.ok(
    Math.abs(s.player.balance - (before.balance + (won ? shares : 0))) < 1e-6,
  );
  const balance = s.player.balance;
  ex.advance();
  assert.equal(ex.snapshot(id).player.balance, balance);
  assert.throws(
    () =>
      ex.place(
        id,
        {
          side: "up",
          action: "buy",
          type: "market",
          amount: 10,
          roundId: r.id,
        },
        "aerofoil",
      ),
    /round/i,
  );
});
test("public CFD snapshots contain only elapsed paths and one observed field", () => {
  const { ex, setTime } = setup();
  const r = ex.select("aerofoil").state.round;
  setTime(r.start + 30000);
  const s = ex.snapshot(id, "aerofoil"),
    text = JSON.stringify(s);
  assert.equal(s.flow.points.length, 31);
  assert.equal(s.round.points.length, 31);
  assert.equal(s.flow.field.length, 8);
  assert.equal(s.round.end, null, "future arrival time must remain private");
  assert.equal(s.flow.traces, undefined);
  assert.equal(s.flow.frames, undefined);
  assert.equal(text.includes('"seed"'), false);
  assert.equal(text.includes(id), false);
});
test("profile, positions and balance survive serialized exchange restart", () => {
  const { ex, data, now } = setup();
  ex.updateProfile(id, { name: "Wake Explorer", bio: "Flow", avatar: 3 });
  for (const marketId of ["bitcoin", "aerofoil"])
    ex.place(
      id,
      {
        side: "up",
        action: "buy",
        type: "market",
        amount: 20,
        roundId: ex.select(marketId).state.round.id,
      },
      marketId,
    );
  const before = ex.snapshot(id),
    saved = JSON.parse(JSON.stringify(ex.state));
  const restored = new Exchange({
    state: saved,
    flowData: data,
    now,
    bots: false,
  });
  const after = restored.snapshot(id, "aerofoil");
  assert.equal(after.player.balance, before.player.balance);
  assert.equal(after.player.name, "Wake Explorer");
  assert.equal(after.player.marketsTraded, 2);
  assert.equal(after.player.allPositions.filter((p) => p.shares > 0).length, 2);
  assert.deepEqual(
    new Set(after.player.activity.map((a) => a.marketId)),
    new Set(["bitcoin", "aerofoil"]),
  );
  assert.ok(Math.abs(after.player.equity - before.player.equity) < 1e-6);
  const board = restored.leaderboard({ period: "all" }, id);
  assert.equal(board.entries[0].name, "Wake Explorer");
  assert.equal(board.entries[0].volume, after.player.totalVolume);
  assert.equal(board.entries[0].profit, after.player.realized);
  assert.equal(board.entries[0].isYou, true);
  assert.ok(restored.leaderboard({ period: "all", category: "fluid" }).entries[0].volume > 19);
  assert.ok(restored.leaderboard({ period: "all", category: "maths" }).entries[0].volume > 19);
  restored.reset(id);
  assert.equal(restored.leaderboard({ period: "all" }).entries.length, 0);
});
test("legacy Bitcoin wallets migrate without a top-up or lost positions", () => {
  const data = fixture(),
    now = () => 1200000,
    legacy = new Market({ now, bots: false });
  legacy.addPlayer(id);
  legacy.updateProfile(id, {
    name: "Existing Guest",
    bio: "Keep me",
    avatar: 2,
  });
  legacy.place(id, {
    side: "up",
    action: "buy",
    type: "market",
    amount: 85,
    roundId: legacy.state.round.id,
  });
  const before = legacy.snapshot(id),
    ex = new Exchange({
      state: JSON.parse(JSON.stringify(legacy.state)),
      flowData: data,
      now,
      bots: false,
    });
  const s = ex.snapshot(id, "aerofoil");
  assert.equal(s.player.balance, before.player.balance);
  assert.equal(s.player.name, "Existing Guest");
  assert.equal(
    ex.snapshot(id).player.positions.up.shares,
    before.player.positions.up.shares,
  );
});
test("reset clears positions and reserves in every market without changing profile", () => {
  const { ex } = setup();
  for (const marketId of ["bitcoin", "aerofoil"]) {
    const roundId = ex.select(marketId).state.round.id;
    ex.place(
      id,
      { side: "up", action: "buy", type: "market", amount: 10, roundId },
      marketId,
    );
    ex.place(id, limit(roundId, 1000), marketId);
  }
  ex.updateProfile(id, { name: "Keep Profile", bio: "", avatar: 7 });
  ex.reset(id);
  const s = ex.snapshot(id);
  assert.equal(s.player.balance, 1000);
  assert.equal(s.player.equity, 1000);
  assert.equal(s.player.reserved, 0);
  assert.equal(s.player.allOrders.length, 0);
  assert.equal(
    s.player.allPositions.reduce((n, p) => n + p.shares, 0),
    0,
  );
  assert.equal(s.player.name, "Keep Profile");
});
test("missing private CFD data cannot silently replace active positions with fake flow", () => {
  const { ex } = setup();
  assert.throws(
    () => new Exchange({ state: JSON.parse(JSON.stringify(ex.state)) }),
    /unavailable/i,
  );
  const fresh = new Exchange({ bots: false });
  fresh.addPlayer(id);
  assert.throws(() => fresh.snapshot(id, "aerofoil"), /unavailable/i);
  assert.equal(fresh.snapshot(id).player.balance, 1000);
});
module.exports = { fixture };

test("variable-duration schedules survive idle gaps and never show the final point early", () => {
  const { ex, setTime, data, now } = setup(),
    m = ex.select("aerofoil"),
    durations = new Set();
  for (let i = 0; i < 12; i++) {
    const r = m.state.round;
    durations.add(r.end - r.start);
    setTime(r.end - 1);
    const s = ex.snapshot(id, "aerofoil");
    assert.equal(s.round.id, r.id);
    assert.ok(s.flow.particle[0] < 6);
    setTime(r.end);
    const next = ex.snapshot(id, "aerofoil");
    assert.equal(next.round.opening, r.path.at(-1));
  }
  assert.ok(durations.size > 1);
  setTime(now() + 86400000 * 4);
  ex.advance();
  const restored = new Exchange({
    state: JSON.parse(JSON.stringify(ex.state)),
    flowData: data,
    now,
    bots: false,
  });
  assert.equal(
    restored.snapshot(id, "aerofoil").round.id,
    ex.snapshot(id, "aerofoil").round.id,
  );
});
