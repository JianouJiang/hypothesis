"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Community, adminAuthorized } = require("../community");
const { createApp } = require("../server");
const { Exchange } = require("../exchange");
const a = "a".repeat(48),
  b = "b".repeat(48);
function fixture() {
  return new Community(
    undefined,
    {
      accounts: {
        [a]: { name: "Ada", avatar: 1 },
        [b]: { name: "Bo", avatar: 2 },
      },
      markets: {
        bitcoin: {
          round: { end: 600000 },
          players: {
            [a]: { positions: { up: { shares: 12 }, down: { shares: 0 } } },
          },
          trades: [],
        },
        "galton-2": {
          round: { end: 600000 },
          players: { [b]: { positions: { down: { shares: 5 } } } },
        },
      },
    },
    100000,
  );
}
const post = (c, token, text, game = "bitcoin", parentId = null) =>
  c.mutate(token, {
    action: "comment",
    game,
    text,
    parentId,
    requestId: `${token.slice(0, 2)}-${c.state.next}`,
  });
test("shared comments support replies, likes, holders, sorting, and author ownership", () => {
  const c = fixture();
  const first = post(c, a, "Predicting Up"),
    second = post(c, b, "Looking at the model");
  post(c, b, "What timestep?", "bitcoin", first.id);
  post(c, b, "Slot two?", "galton");
  c.mutate(b, { action: "like", id: first.id, liked: true });
  c.mutate(b, { action: "like", id: first.id, liked: true });
  let feed = c.feed(b, { game: "bitcoin", sort: "liked" });
  assert.equal(feed.count, 3);
  assert.equal(feed.comments[0].id, first.id);
  assert.equal(feed.comments[0].likes, 1);
  assert.equal(feed.comments[0].liked, true);
  assert.equal(feed.comments[0].replies[0].text, "What timestep?");
  assert.equal(feed.comments[0].positions[0].shares, 12);
  assert.equal(
    c.feed(b, { game: "bitcoin", holders: "true" }).comments.length,
    1,
  );
  assert.equal(c.feed(b, { game: "galton" }).positions[0].label, "Slot 2 No");
  assert.throws(
    () => c.mutate(b, { action: "delete", id: first.id }),
    /own comments/,
  );
  assert.throws(
    () => post(c, b, "Cross game", "escape", first.id),
    /no longer available/,
  );
  c.mutate(a, { action: "delete", id: first.id });
  feed = c.feed(b, { game: "bitcoin" });
  assert.equal(
    feed.comments.find((x) => x.id === first.id).text,
    "Comment removed",
  );
  assert.equal(feed.comments.find((x) => x.id === first.id).replies.length, 1);
  assert.equal(feed.comments.find((x) => x.id === second.id).own, true);
  assert.equal(JSON.stringify(feed).includes(a), false);
});
test("retries are idempotent and spam/invalid input are rejected", () => {
  const c = fixture(),
    input = {
      action: "comment",
      game: "bitcoin",
      text: "A prediction",
      requestId: "retry-123",
    };
  assert.equal(c.mutate(a, input).id, c.mutate(a, input).id);
  assert.equal(c.state.comments.length, 1);
  for (let i = 0; i < 4; i++) post(c, a, "More models");
  assert.throws(() => post(c, a, "Too fast"), /slow down/);
  assert.throws(() => post(c, b, "x".repeat(1201)), /1200/);
  assert.throws(() => post(c, b, " "), /characters/);
  assert.throws(
    () =>
      c.mutate(b, { action: "like", id: c.state.comments[0].id, liked: "yes" }),
    /like state/,
  );
  assert.throws(() => c.feed(a, { game: "../../data" }), /live game/);
});
test("feedback emails and explicit update requests stay private and can be erased", () => {
  const c = fixture();
  c.mutate(a, {
    action: "feedback",
    kind: "bug",
    game: "escape",
    message: "Audio issue",
    email: "ada@example.test",
    updates: false,
    requestId: "f1",
  });
  assert.equal(c.adminFeed().contacts.length, 0);
  c.mutate(b, {
    action: "feedback",
    kind: "idea",
    message: "New geometry",
    email: "bo@example.test",
    updates: true,
    requestId: "f2",
  });
  assert.equal(c.adminFeed().contacts.length, 1);
  assert.equal(c.adminFeed().contacts[0].verified, false);
  assert.equal(
    JSON.stringify(c.feed(a, { game: "escape" })).includes("example.test"),
    false,
  );
  assert.equal(JSON.stringify(c.adminFeed()).includes(a), false);
  assert.throws(
    () =>
      c.mutate(b, {
        action: "feedback",
        kind: "idea",
        message: "Hello",
        updates: true,
        requestId: "f3",
      }),
    /Add an email/,
  );
  c.mutate(b, { action: "forget-email" });
  assert.equal(c.adminFeed().contacts.length, 0);
  assert.equal(c.adminFeed().feedback.find((f) => f.name === "Bo").email, "");
  assert.equal(
    c.adminFeed().feedback.find((f) => f.name === "Ada").email,
    "ada@example.test",
  );
});
test("engagement is aggregated, deduplicated and expires; moderation is private", () => {
  const c = fixture();
  const event = {
    action: "event",
    kind: "click",
    game: "galton",
    eventId: "click-1",
  };
  c.mutate(a, event);
  c.mutate(a, event);
  c.mutate(b, { ...event, eventId: "click-2" });
  assert.equal(Object.values(c.adminFeed().stats)[0].galton.click, 2);
  const comment = post(c, a, "Model results");
  c.mutate(b, { action: "report", id: comment.id, reason: "Spam" });
  c.mutate(b, { action: "report", id: comment.id, reason: "Spam" });
  assert.equal(c.adminFeed().reports.length, 1);
  assert.equal(
    JSON.stringify(c.feed(a, { game: "bitcoin" })).includes("Spam"),
    false,
  );
  c.adminMutate({ action: "moderate", id: comment.id, hidden: true });
  assert.equal(c.feed(a, { game: "bitcoin" }).count, 0);
  c.adminMutate({ action: "moderate", id: comment.id, hidden: false });
  assert.equal(c.feed(a, { game: "bitcoin" }).count, 1);
  c.now += 91 * 86400000;
  c.mutate(a, { ...event, eventId: "click-new" });
  assert.equal(Object.keys(c.adminFeed().stats).length, 1);
  assert.equal(c.feed(a, { game: "bitcoin" }).holders.length, 0);
});
test("owner key check rejects absent, short, and incorrect credentials", () => {
  const key = "key-".repeat(16);
  assert.equal(adminAuthorized(`Bearer ${key}`, key), true);
  for (const header of [
    undefined,
    "",
    `Bearer ${key}x`,
    `Bearer ${"bad-".repeat(16)}`,
  ])
    assert.equal(adminAuthorized(header, key), false);
  assert.equal(adminAuthorized("Bearer abc", "abc"), false);
});
test("HTTP community persists across restarts, keeps guest wallets separate, and protects owner data", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "physics-community-")),
    dataFile = path.join(dir, "market.json"),
    adminToken = "test-owner-".repeat(6);
  let app = createApp({
    dataFile,
    adminToken,
    market: new Exchange({ bots: false, now: () => 100000 }),
  });
  const listen = async () => {
    await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
    return `http://127.0.0.1:${app.server.address().port}`;
  };
  let base = await listen();
  const call = async (route, cookie, body, extra = {}) => {
    const response = await fetch(base + route, {
      method: body ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
        ...extra,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, data: await response.json() };
  };
  try {
    const guest = await fetch(base + "/api/session"),
      cookie = guest.headers.get("set-cookie").split(";")[0];
    const before = await guest.json();
    assert.equal((await call("/api/community?game=bitcoin")).status, 401);
    const posted = await call("/api/community", cookie, {
      action: "comment",
      game: "bitcoin",
      text: "<img onerror=alert(1)>",
      requestId: "persisted-comment",
    });
    assert.equal(posted.status, 200);
    await call("/api/community", cookie, {
      action: "feedback",
      kind: "question",
      message: "Will you add wings?",
      email: "private@example.test",
      updates: true,
      requestId: "persisted-feedback",
    });
    assert.equal(
      (
        await call(
          "/api/community",
          cookie,
          {
            action: "event",
            kind: "view",
            game: "escape",
            eventId: "one-view",
          },
          { Origin: "https://evil.example" },
        )
      ).status,
      403,
    );
    assert.equal((await call("/api/community-admin", cookie)).status, 403);
    assert.equal(
      (
        await call("/api/community-admin", null, undefined, {
          Authorization: "Bearer wrong",
        })
      ).status,
      403,
    );
    let inbox = await call("/api/community-admin", null, undefined, {
      Authorization: `Bearer ${adminToken}`,
    });
    assert.equal(inbox.data.feedback[0].email, "private@example.test");
    const other = await fetch(base + "/api/session"),
      otherCookie = other.headers.get("set-cookie").split(";")[0];
    const publicFeed = await call("/api/community?game=bitcoin", otherCookie);
    assert.equal(publicFeed.data.comments[0].text, "<img onerror=alert(1)>");
    assert.equal(
      JSON.stringify(publicFeed).includes("private@example.test"),
      false,
    );
    assert.equal(
      (
        await call("/api/community", otherCookie, {
          action: "delete",
          id: posted.data.id,
        })
      ).status,
      400,
    );
    const after = await call("/api/session", cookie);
    assert.equal(after.data.player.balance, before.player.balance);
    await new Promise((r) => {
      app.server.once("close", r);
      app.stop();
    });
    app = createApp({ dataFile, adminToken });
    base = await listen();
    assert.equal(
      (await call("/api/community?game=bitcoin", cookie)).data.comments.length,
      1,
    );
    inbox = await call("/api/community-admin", null, undefined, {
      Authorization: `Bearer ${adminToken}`,
    });
    assert.equal(inbox.data.contacts[0].email, "private@example.test");
    assert.equal(
      fs.statSync(path.join(dir, "community.json")).mode & 0o777,
      0o600,
    );
  } finally {
    if (app.server.listening)
      await new Promise((r) => {
        app.server.once("close", r);
        app.stop();
      });
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
