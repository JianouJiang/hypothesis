"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createApp } = require("../server");
const { Market } = require("../market");

async function app(t) {
  const service = createApp({
    persist: false,
    market: new Market({ bots: false }),
  });
  await new Promise((resolve) =>
    service.server.listen(0, "127.0.0.1", resolve),
  );
  const base = `http://127.0.0.1:${service.server.address().port}`;
  t.after(() => service.stop());
  const session = async (cookie = "") => {
    const response = await fetch(`${base}/api/session`, {
      headers: { cookie },
    });
    return {
      cookie: response.headers.get("set-cookie")?.split(";")[0] || cookie,
      state: await response.json(),
    };
  };
  const post = (path, cookie, body, extras = {}) =>
    fetch(`${base}/api/${path}`, {
      method: "POST",
      headers: { cookie, "Content-Type": "application/json", ...extras },
      body: JSON.stringify(body),
    });
  return { ...service, base, session, post };
}

test("HTTP guests have separate wallets, a shared round, and persistent sessions", async (t) => {
  const { session } = await app(t);
  const a = await session(),
    b = await session();
  assert.notEqual(a.cookie, b.cookie);
  assert.notEqual(a.state.player.name, b.state.player.name);
  assert.equal(a.state.round.id, b.state.round.id);
  assert.equal(a.state.round.price, b.state.round.price);
  assert.equal(
    (await session(a.cookie)).state.player.name,
    a.state.player.name,
  );
});

test("concurrent trades cannot double-spend a guest balance", async (t) => {
  const { session, post } = await app(t);
  const a = await session();
  const order = {
    side: "up",
    action: "buy",
    type: "limit",
    price: 0.01,
    quantity: 60000,
    roundId: a.state.round.id,
  };
  const results = await Promise.all([
    post("order", a.cookie, order),
    post("order", a.cookie, order),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 400]);
  const after = (await session(a.cookie)).state;
  assert.equal(after.player.balance, 400);
  assert.equal(after.player.reserved, 600);
});

test("HTTP trades reject unauthenticated writes and foreign origins", async (t) => {
  const { session, post } = await app(t);
  const a = await session();
  assert.equal((await post("reset", "", {})).status, 401);
  assert.equal(
    (await post("reset", a.cookie, {}, { origin: "https://unrelated.example" }))
      .status,
    403,
  );
});

test("profile changes are authenticated and persist with the same guest account", async (t) => {
  const { session, post, base } = await app(t);
  const a = await session(),
    b = await session();
  const input = {
    name: "Science Explorer",
    bio: "Testing predictions",
    avatar: 4,
  };
  assert.equal((await post("profile", "", input)).status, 401);
  assert.equal((await post("profile", a.cookie, input)).status, 200);
  assert.equal((await session(a.cookie)).state.player.name, input.name);
  assert.notEqual((await session(b.cookie)).state.player.name, input.name);
  assert.equal((await post("profile", b.cookie, input)).status, 400);
  for (const asset of [
    "/",
    "/bitcoin.html",
    "/profile.html",
    "/guest.js",
    "/catalog.js",
    "/home.js",
    "/profile.js",
  ])
    assert.equal((await fetch(base + asset)).status, 200);
});

test("only public assets are served; bot identity and saved market state stay private", async (t) => {
  const { session, base } = await app(t);
  for (const pathname of [
    "/data/market.json",
    "/server.js",
    "/hosting/.openai/hosting.json",
    "/.git/config",
  ])
    assert.equal((await fetch(base + pathname)).status, 404);
  const forged = await session("physics_guest=bot-momentum");
  assert.equal(forged.state.player.balance, 1000);
  assert.match(forged.state.player.name, /^(?=.*[a-z])(?=.*[0-9])[a-z0-9]{12}$/);
  assert.equal((await fetch(base + "/")).status, 200);
});
