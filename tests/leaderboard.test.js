"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { Market } = require("../market");
const Rankings = require("../rankings");
const { createApp } = require("../server");

function setup() {
  let time = Date.UTC(2026, 9, 12, 12);
  const market = new Market({ bots: false, now: () => time, seed: 17 });
  return { market, now: () => time, setTime: (value) => { time = value; } };
}
function fill(market, player, { profit = 0, total = 10, marketId = "bitcoin", time = market.clock(), type = "sell" } = {}) {
  // A completed fill, as delivered by the matching engine, including the
  // account counter it updates before recording the activity.
  player.realized += profit;
  market.recordActivity(player, { type, profit, total, marketId, time });
}

test("new usernames are unique alphanumeric handles, stable across reload and profile edits", () => {
  const { market, now } = setup();
  const names = new Set();
  for (let i = 0; i < 200; i++) {
    const player = market.addPlayer(`session-secret-${i}`);
    assert.match(player.name, /^(?=.*[a-z])(?=.*[0-9])[a-z0-9]{12}$/);
    assert.ok(!names.has(player.name.toLowerCase()));
    assert.notEqual(player.name, player.id);
    names.add(player.name.toLowerCase());
  }
  const player = market.addPlayer("session-secret-0");
  const name = player.name;
  const restored = new Market({ state: JSON.parse(JSON.stringify(market.state)), now, bots: false });
  assert.equal(restored.addPlayer(player.id).name, name);
  restored.updateProfile(player.id, { name: "My chosen name", avatar: 3, bio: "" });
  assert.equal(restored.addPlayer(player.id).name, "My chosen name");
});

test("username collisions retry and respect case-insensitive custom names", (t) => {
  const { market } = setup();
  const first = market.addPlayer("first-secret");
  market.updateProfile(first.id, { name: "AAAAAAAAAAA0", avatar: 0, bio: "" });
  let calls = 0;
  t.mock.method(globalThis.crypto, "getRandomValues", (bytes) => {
    bytes.fill(calls++ ? 11 : 10);
    bytes[0] = 0;
    bytes[11] = 0;
    return bytes;
  });
  const second = market.addPlayer("second-secret");
  assert.notEqual(second.name.toLowerCase(), first.name.toLowerCase());
  assert.equal(calls, 2);
});

test("rankings measure realized profit, filter categories, and do not count reserves or bots", () => {
  const { market, setTime } = setup();
  const winner = market.addPlayer("winner-secret");
  const idle = market.addPlayer("idle-secret");
  const bot = market.addPlayer("bot-hidden");
  bot.bot = true;
  bot.realized = 1000000;
  const round = market.state.round;
  const outcome = round.path.at(-1) >= round.opening ? "up" : "down";
  market.place(winner.id, { side: outcome, action: "buy", type: "market", amount: 20, roundId: round.id });
  market.place(idle.id, { side: "up", action: "buy", type: "limit", price: .01, quantity: 100, roundId: round.id });
  let board = market.leaderboard({ period: "all" }, winner.id);
  assert.equal(board.entries.length, 1);
  assert.equal(board.entries[0].profit, 0, "open positions are not earned profit");
  assert.ok(board.entries[0].volume > 19);
  setTime(round.end);
  board = market.leaderboard({ period: "all" }, winner.id);
  assert.equal(board.entries[0].profit, winner.realized);
  assert.ok(board.entries[0].profit > 0);
  assert.equal(board.entries[0].isYou, true);
  assert.equal(board.wins[0].profit, winner.realized);
  assert.equal(market.leaderboard({ category: "solid" }).entries.length, 0);
  assert.equal(market.leaderboard({ category: "maths" }).entries.length, 1);
  const text = JSON.stringify(board);
  for (const secret of [winner.id, idle.id, bot.id, "playerId", "balance", "bio", "activity"])
    assert.ok(!text.includes(secret), `public board leaked ${secret}`);
});

test("periods use UTC boundaries and durable counters outlive the activity cap and restart", () => {
  const { market, now } = setup();
  const player = market.addPlayer("active-secret");
  fill(market, player, { profit: 70, total: 100, time: Date.UTC(2026, 8, 30, 23, 59) });
  fill(market, player, { profit: -10, total: 20, marketId: "galton-3", time: Date.UTC(2026, 9, 11, 23, 59) });
  for (let i = 0; i < 550; i++) fill(market, player, { profit: 1, total: 2 });
  assert.equal(player.activity.length, 500);
  assert.equal(market.leaderboard({ period: "day" }).entries[0].profit, 550);
  assert.equal(market.leaderboard({ period: "week" }).entries[0].profit, 550);
  assert.equal(market.leaderboard({ period: "month" }).entries[0].profit, 540);
  assert.equal(market.leaderboard({ period: "all" }).entries[0].profit, 610);
  assert.equal(market.leaderboard({ period: "month", category: "solid" }).entries[0].profit, -10);
  const restored = new Market({ state: JSON.parse(JSON.stringify(market.state)), now, bots: false });
  assert.deepEqual(restored.leaderboard({ period: "month" }), market.leaderboard({ period: "month" }));
  restored.reset(player.id);
  assert.equal(restored.leaderboard({ period: "all" }).entries.length, 0);
  assert.equal(restored.leaderboard({ period: "month" }).wins.length, 0);
});

test("search preserves rank; sort, pagination, ties and invalid input are deterministic", () => {
  const { market } = setup();
  for (let i = 0; i < 45; i++) {
    const p = market.addPlayer(`ranked-secret-${i}`);
    market.updateProfile(p.id, { name: `Trader${String(i).padStart(2, "0")}`, bio: "", avatar: i % 8 });
    fill(market, p, { profit: i, total: 100 - i });
  }
  const board = market.leaderboard({ period: "all", page: "2" }, "ranked-secret-0");
  assert.equal(board.pages, 3);
  assert.equal(board.entries.length, 20);
  assert.equal(board.entries[0].rank, 21);
  assert.equal(board.you.rank, 45);
  assert.equal(market.leaderboard({ q: "TRADER00" }).entries[0].rank, 45);
  assert.equal(market.leaderboard({ sort: "volume" }).entries[0].name, "Trader00");
  assert.equal(market.leaderboard({ page: "Infinity" }).page, 1);
  assert.equal(market.leaderboard({ page: "999" }).page, 3);
  assert.throws(() => market.leaderboard({ category: "__proto__" }), /category/);
  assert.throws(() => market.leaderboard({ period: "invalid" }), /period/);
  assert.throws(() => market.leaderboard({ sort: "id" }), /profit or volume/);
});

test("legacy account totals remain complete and truncated category history is disclosed", () => {
  const { market, now } = setup();
  const player = market.addPlayer("legacy-secret");
  player.name = "Guest 19";
  for (let i = 0; i < 550; i++) fill(market, player, { profit: 2, total: 5 });
  delete player.leaderboard;
  const restored = new Market({ state: JSON.parse(JSON.stringify(market.state)), now, bots: false });
  const board = restored.leaderboard({ period: "all" });
  assert.equal(board.entries[0].name, "Guest 19", "existing usernames stay intact");
  assert.equal(board.entries[0].profit, 1100);
  assert.equal(board.entries[0].volume, 2750);
  assert.equal(board.limitedSince, now());
  assert.equal(restored.leaderboard({ category: "maths" }).entries[0].profit, 1000);
  assert.equal(Rankings.category("prism:2"), "optics");
});

test("public HTTP leaderboard needs no wallet and serves assets without exposing authentication", async (t) => {
  const { market } = setup();
  const player = market.addPlayer("private-session-token");
  fill(market, player, { profit: 5, total: 15 });
  const app = createApp({ market, persist: false, liveFeeds: false });
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  t.after(() => app.stop());
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const response = await fetch(`${base}/api/leaderboard?period=all`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("set-cookie"), null);
  const body = await response.text();
  assert.ok(!body.includes(player.id));
  assert.equal(JSON.parse(body).entries[0].profit, 5);
  assert.equal(Object.keys(market.state.players).length, 1);
  assert.equal((await fetch(`${base}/api/leaderboard?sort=secret`)).status, 400);
  for (const asset of ["leaderboard.html", "leaderboard.js", "leaderboard.css", "rankings.js"])
    assert.equal((await fetch(`${base}/${asset}`)).status, 200);
});
