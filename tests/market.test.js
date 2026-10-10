"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { Market, ROUND_MS } = require("../market");

function setup(options = {}) {
  let now = 1800000000000;
  const market = new Market({
    now: () => now,
    seed: 1031,
    bots: false,
    ...options,
  });
  market.addPlayer("player-one");
  market.addPlayer("player-two");
  const order = (id, value) =>
    market.place(id, {
      roundId: market.state.round.id,
      side: "up",
      action: "buy",
      type: "market",
      amount: 10,
      ...value,
    });
  return {
    market,
    order,
    next: (ms) => {
      now += ms;
      market.advance();
    },
  };
}

test("new guests receive exactly 1,000 gold, and reconnecting never tops up a wallet", () => {
  const { market, order } = setup();
  assert.equal(market.player("player-one").balance, 1000);
  order("player-one", { amount: 25 });
  market.addPlayer("player-one");
  assert.ok(market.player("player-one").balance < 976);
});

test("profile edits validate names, are isolated, and survive wallet resets and serialization", () => {
  const { market } = setup();
  market.updateProfile("player-one", {
    name: "Fluid Explorer",
    bio: "Curious about chaos.",
    avatar: 3,
  });
  assert.throws(
    () =>
      market.updateProfile("player-two", {
        name: "fluid explorer",
        bio: "",
        avatar: 0,
      }),
    /taken/,
  );
  assert.throws(
    () =>
      market.updateProfile("player-one", {
        name: "<script>",
        bio: "",
        avatar: 0,
      }),
    /3–24/,
  );
  assert.throws(
    () =>
      market.updateProfile("player-one", {
        name: "Fluid Explorer",
        bio: "x".repeat(201),
        avatar: 0,
      }),
    /200/,
  );
  market.reset("player-one");
  const restored = new Market({
    state: JSON.parse(JSON.stringify(market.state)),
    now: market.clock,
    bots: false,
  });
  const profile = restored.snapshot("player-one").player;
  assert.equal(profile.name, "Fluid Explorer");
  assert.equal(profile.bio, "Curious about chaos.");
  assert.equal(profile.avatar, 3);
  assert.equal(profile.balance, 1000);
  assert.notEqual(restored.player("player-two").name, profile.name);
});

test("both maker and taker receive persistent activity and profile statistics", () => {
  const { market, order, next } = setup({ liquidity: false });
  market.player("player-two").positions.up = { shares: 100, cost: 50 };
  order("player-one", { type: "limit", price: 0.6, quantity: 50 });
  order("player-two", { action: "sell", quantity: 20 });
  const a = market.snapshot("player-one").player;
  const b = market.snapshot("player-two").player;
  assert.equal(a.activity[0].type, "buy");
  assert.equal(b.activity[0].type, "sell");
  assert.equal(a.totalVolume, 12);
  assert.equal(b.totalVolume, 12);
  assert.equal(a.marketsTraded, 1);
  assert.equal(b.biggestWin, 2);
  assert.ok(a.equityHistory.length);
  next(ROUND_MS);
  assert.equal(
    market.snapshot("player-one").player.activity[0].type,
    "settlement",
  );
  assert.ok(
    market.snapshot("player-one").player.activity.some((a) => a.type === "buy"),
  );
  market.reset("player-one");
  const reset = market.snapshot("player-one").player;
  assert.deepEqual(reset.activity, []);
  assert.equal(reset.totalVolume, 0);
  assert.equal(reset.equity, 1000);
  assert.equal(reset.marketsTraded, 0);
});

test("market buy and sell fill at book prices, accounting for the spread", () => {
  const { market, order } = setup();
  const buy = order("player-one", { amount: 50 });
  const p = market.player("player-one");
  assert.ok(buy.filled > 0);
  assert.ok(Math.abs(p.balance + buy.total - 1000) < 1e-6);
  assert.equal(p.positions.up.shares, buy.filled);
  const sell = order("player-one", { action: "sell", quantity: buy.filled });
  assert.equal(p.positions.up.shares, 0);
  assert.ok(p.balance < 1000);
  assert.ok(Math.abs(p.balance - (1000 - buy.total + sell.total)) < 1e-6);
});

test("orders cannot overdraw cash, sell unowned shares, or submit invalid numbers", () => {
  const { market, order } = setup();
  for (const amount of [1001, NaN, Infinity, -1, 0])
    assert.throws(() => order("player-one", { amount }));
  assert.throws(
    () => order("player-one", { action: "sell", quantity: 1 }),
    /shares/,
  );
  assert.throws(
    () => order("player-one", { type: "limit", price: 0.555, quantity: 2 }),
    /1–99/,
  );
  assert.equal(market.player("player-one").balance, 1000);
});

test("resting limit buys reserve cash and cancellation releases it exactly", () => {
  const { market, order } = setup({ liquidity: false });
  const result = order("player-one", {
    type: "limit",
    price: 0.4,
    quantity: 100,
  });
  assert.equal(result.remaining, 100);
  assert.equal(market.player("player-one").balance, 960);
  assert.equal(market.snapshot("player-one").player.reserved, 40);
  assert.throws(() => market.cancel("player-two", result.id));
  market.cancel("player-one", result.id);
  assert.equal(market.player("player-one").balance, 1000);
  assert.equal(market.state.orders.length, 0);
});

test("two guests make and take orders; partial fills conserve their combined cash and shares", () => {
  const { market, order } = setup({ liquidity: false });
  market.player("player-two").positions.up = { shares: 100, cost: 50 };
  const maker = order("player-one", {
    type: "limit",
    price: 0.6,
    quantity: 50,
  });
  const taker = order("player-two", { action: "sell", quantity: 20 });
  assert.equal(taker.total, 12);
  assert.equal(market.player("player-one").positions.up.shares, 20);
  assert.equal(market.player("player-two").positions.up.shares, 80);
  const pending = market.snapshot("player-one").player.orders[0];
  assert.equal(pending.remaining, 30);
  assert.equal(pending.filled, 20);
  market.cancel("player-one", maker.id);
  assert.equal(
    market.player("player-one").balance + market.player("player-two").balance,
    2000,
  );
});

test("a crossing buy limit fills at the resting price and refunds price improvement", () => {
  const { market, order } = setup({ liquidity: false });
  market.player("player-two").positions.up = { shares: 100, cost: 40 };
  order("player-two", {
    action: "sell",
    type: "limit",
    price: 0.45,
    quantity: 20,
  });
  const buy = order("player-one", { type: "limit", price: 0.6, quantity: 20 });
  assert.equal(buy.total, 9);
  assert.equal(market.player("player-one").balance, 991);
  assert.equal(market.state.orders.length, 0);
});

test("shares reserved in sell orders cannot be sold twice; self-trades never fill", () => {
  const { market, order } = setup({ liquidity: false });
  market.player("player-one").positions.up = { shares: 50, cost: 25 };
  const sell = order("player-one", {
    action: "sell",
    type: "limit",
    price: 0.5,
    quantity: 40,
  });
  assert.equal(market.availableShares("player-one", "up"), 10);
  assert.throws(() => order("player-one", { action: "sell", quantity: 11 }));
  const self = order("player-one", { amount: 20 });
  assert.equal(self.filled, 0);
  market.cancel("player-one", sell.id);
  assert.equal(market.availableShares("player-one", "up"), 50);
});

test("limited liquidity produces a partial fill and returns all unused cash", () => {
  const { market, order } = setup({ liquidity: false });
  market.player("player-two").positions.down = { shares: 5, cost: 2.5 };
  order("player-two", {
    side: "down",
    action: "sell",
    type: "limit",
    price: 0.5,
    quantity: 5,
  });
  const result = order("player-one", { side: "down", amount: 100 });
  assert.equal(result.filled, 5);
  assert.equal(result.partial, true);
  assert.equal(market.player("player-one").balance, 997.5);
});

test("a tie settles Up, pays once, and refunds pending buy orders", () => {
  const { market, order, next } = setup({ liquidity: false });
  const p = market.player("player-one");
  p.positions.up = { shares: 30, cost: 15 };
  p.positions.down = { shares: 10, cost: 5 };
  p.balance = 980;
  order("player-one", { type: "limit", price: 0.2, quantity: 100 });
  market.state.round.path[300] = market.state.round.opening;
  next(ROUND_MS);
  assert.equal(p.balance, 1010);
  assert.equal(p.history[0].outcome, "up");
  assert.equal(p.history[0].payout, 30);
  assert.equal(p.positions.up.shares, 0);
  assert.equal(market.state.orders.length, 0);
  market.advance();
  assert.equal(p.balance, 1010);
});

test("a falling round pays Down, and a stale round order is rejected", () => {
  const { market, order, next } = setup({ liquidity: false });
  const oldId = market.state.round.id;
  market.player("player-one").positions.down = { shares: 40, cost: 20 };
  market.state.round.path[300] = market.state.round.opening - 1;
  next(ROUND_MS);
  assert.equal(market.player("player-one").balance, 1040);
  assert.throws(() => order("player-one", { roundId: oldId }), /new round/);
});

test("restart and long absence settle held positions without duplicate payouts", () => {
  const { market, order } = setup();
  order("player-one", { amount: 100 });
  const future = market.state.round.end + 86400000 * 40;
  const state = JSON.parse(JSON.stringify(market.state));
  const restarted = new Market({ state, now: () => future, bots: false });
  const balance = restarted.player("player-one").balance;
  assert.equal(restarted.player("player-one").history.length, 1);
  const again = new Market({
    state: JSON.parse(JSON.stringify(restarted.state)),
    now: () => future,
    bots: false,
  });
  assert.equal(again.player("player-one").balance, balance);
});

test("public snapshots never expose future prices, guest tokens, or bot capital", () => {
  const { market, next } = setup();
  next(13000);
  const s = market.snapshot("player-one");
  assert.equal(s.round.points.length, 14);
  assert.equal(s.round.path, undefined);
  assert.equal(s.players, undefined);
  assert.equal(JSON.stringify(s).includes("player-two"), false);
});

test("bots execute trades, refresh depth, and do not duplicate trades on repeated snapshots", () => {
  const { market, next } = setup({ bots: true });
  const start = market.snapshot("player-one");
  assert.ok(start.trades.some((t) => t.bot));
  const count = start.trades.length;
  market.snapshot("player-one");
  assert.equal(market.state.trades.length, count);
  next(1000);
  assert.notEqual(
    market.snapshot("player-one").book.up.asks[0].quantity,
    start.book.up.asks[0].quantity,
  );
  next(2000);
  assert.ok(market.state.trades.length > count);
});

test("bot market orders can take a human limit order", () => {
  const { market, order, next } = setup({ bots: true });
  for (const o of [...market.state.orders])
    market.cancel(o.playerId, o.id, false);
  market.liquidity = false;
  market.player("player-one").positions.up = { shares: 50, cost: 1 };
  market.player("player-one").positions.down = { shares: 50, cost: 1 };
  order("player-one", {
    type: "limit",
    action: "sell",
    side: "up",
    price: 0.01,
    quantity: 50,
  });
  order("player-one", {
    type: "limit",
    action: "sell",
    side: "down",
    price: 0.01,
    quantity: 50,
  });
  for (let i = 0; i < 10; i++) next(3000);
  const p = market.player("player-one");
  assert.ok(p.positions.up.shares + p.positions.down.shares < 100);
  assert.ok(market.state.trades.some((t) => t.bot && t.source === "player"));
});
