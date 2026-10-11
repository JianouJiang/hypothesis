"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Exchange } = require("../exchange");
const Live = require("../livestreams");
const { RESULT_MS } = require("../live-market");
const {
  noticeText,
  parseEpisodeStarts,
  fetchObservation,
} = require("../live-feeds");
const { Community } = require("../community");
const { createApp } = require("../server");
const fixture = (name) =>
  JSON.parse(
    fs.readFileSync(path.join(__dirname, "fixtures", "hvo", name), "utf8"),
  );
const def = Live.definitions.kilauea;
const DAY = 86400000;
const guest = "guest-live-aaaaaaaaaa";
const iso = (t) => new Date(t).toISOString();
function setup(start = "2026-10-11T08:00:00Z") {
  let now = Date.parse(start);
  const ex = new Exchange({ now: () => now, bots: false, seed: 11 });
  ex.addPlayer(guest);
  return {
    ex,
    m: ex.markets.kilauea,
    now: () => now,
    set: (t) => {
      now = typeof t === "string" ? Date.parse(t) : t;
      ex.advance();
    },
  };
}
const order = (ex, roundId, side = "up", amount = 20) =>
  ex.place(
    guest,
    { roundId, side, action: "buy", type: "market", amount },
    "kilauea",
  );
const event = (n, time) => ({
  id: `episode-${n}`,
  time: Date.parse(time),
  label: `Episode ${n} lava fountaining began`,
});

test("deadlines fall at 00:00 UTC on the 1st or 16th, at least seven days after a window opens", () => {
  const d = (s) => iso(Live.deadline(def, Date.parse(s)));
  assert.equal(d("2026-10-11T08:00:00Z"), "2026-11-01T00:00:00.000Z");
  assert.equal(d("2026-10-01T00:00:00Z"), "2026-10-16T00:00:00.000Z");
  assert.equal(d("2026-10-09T00:00:01Z"), "2026-11-01T00:00:00.000Z");
  assert.equal(d("2027-01-28T12:00:00Z"), "2027-02-16T00:00:00.000Z");
  assert.equal(d("2026-12-30T00:00:00Z"), "2027-01-16T00:00:00.000Z");
  assert.match(
    Live.question(def, Date.UTC(2026, 10, 1)),
    /before 1 November\?$/,
  );
  assert.equal(Live.link("kilauea", "down"), "live.html?game=kilauea&side=down");
  assert.equal(Live.label("kilauea", "up"), "Yes");
});

test("the parser reads real HVO notices: start notices, summaries, overnight episodes, and no forecasts", () => {
  const parse = (name) => {
    const n = fixture(name);
    return parseEpisodeStarts(noticeText(n.notice_html), n.sent_unixtime * 1000);
  };
  assert.deepEqual(
    parse("van-episode-54-start.json").map((e) => [e.episode, iso(e.time)]),
    [[54, "2026-08-25T20:30:00.000Z"]],
  );
  assert.deepEqual(
    parse("sr-episode-54-summary.json").map((e) => [e.episode, iso(e.time)]),
    [[54, "2026-08-25T20:30:00.000Z"]],
  );
  // The 25 Aug daily update only restates episode 53 (3:45 p.m. HST, 12 Aug).
  assert.deepEqual(
    parse("du-episode-54-expected.json").map((e) => [e.episode, iso(e.time)]),
    [[53, "2026-08-13T01:45:00.000Z"]],
  );
  assert.deepEqual(
    parse("van-episode-48-start.json").map((e) => [e.episode, iso(e.time)]),
    [[48, "2026-06-01T14:40:00.000Z"]],
  );
  assert.deepEqual(parse("van-2026-10-06-weekly.json"), []);
  const sent = Date.UTC(2026, 9, 12, 20);
  const t = (s) => parseEpisodeStarts(s, sent).map((e) => [e.episode, iso(e.time)]);
  assert.deepEqual(
    t("Summary: Episode 55 of the ongoing Halemaʻumaʻu eruption began at 3:10 p.m. HST on October 12, 2026."),
    [[55, "2026-10-13T01:10:00.000Z"]],
  );
  assert.deepEqual(
    t("Episode 55 lava fountaining is expected to start today. Episode 55 fountaining could begin at any time. Forecast window for onset of episode 55 fountaining is now October 12-13."),
    [],
  );
  assert.deepEqual(
    t("Lava fountaining episode 55 at the summit started on October 12 at 3:45 p.m. HST and ended on October 13 at 1:23 a.m. HST."),
    [[55, "2026-10-13T01:45:00.000Z"]],
  );
  assert.deepEqual(
    t("Episode 55 of the ongoing eruption began around 9:45 p.m. HST and ended at 2:36 a.m. HST on October 12, 2026."),
    [[55, "2026-10-12T07:45:00.000Z"]],
  );
  assert.deepEqual(
    t("Episode 53 Chronology: Lava fountaining episode 55 in Halemaʻumaʻu began at noon HST on October 12."),
    [[55, "2026-10-12T22:00:00.000Z"]],
  );
  assert.equal(noticeText("<p>Tom &amp; Jerry&#8217;s &#x2019; test</p>"), "Tom & Jerry’s ’ test");
});

function stubFetch(options = {}) {
  const calls = [];
  const list = fixture("recent-all-7.json");
  const json = (body) => ({ ok: true, status: 200, json: async () => body, headers: new Map() });
  return {
    calls,
    fetch: async (url, init = {}) => {
      calls.push([init.method || "GET", url]);
      if (options.fail && url === def.source.feedUrl) throw new Error("socket hang up");
      if (url === def.source.feedUrl) return json(list);
      if (url.startsWith(def.source.noticeUrl)) {
        const id = decodeURIComponent(url.slice(def.source.noticeUrl.length));
        if (options.failNotice === id) return { ok: false, status: 500, json: async () => ({}), headers: new Map() };
        if (id === "DOI-USGS-HVO-2026-10-10T18:30:17+00:00")
          return json({
            ...fixture("van-episode-54-start.json"),
            notice_identifier: id,
            sent_unixtime: Date.UTC(2026, 9, 12, 20) / 1000,
            notice_html:
              "<b>Summary:</b> Episode 55 of the ongoing Halemaʻumaʻu eruption began at 3:10 p.m. HST on October 12, 2026.",
          });
        return json({ ...fixture("van-2026-10-06-weekly.json"), notice_identifier: id });
      }
      if (init.method === "HEAD")
        return {
          ok: false,
          status: 301,
          headers: new Map([["location", `https://www.youtube.com/watch?v=NEW${url.slice(-5)}`]]),
        };
      throw new Error("Unexpected URL " + url);
    },
  };
}

test("one feed check walks only HVO Kīlauea notices once, merges seeded history, and re-resolves camera links", async () => {
  const stub = stubFetch();
  const first = await fetchObservation(def, { fetch: stub.fetch, now: () => Date.UTC(2026, 9, 12, 21) });
  assert.equal(first.ok, true, first.error);
  const hvo = fixture("recent-all-7.json").filter((n) => n.obs_abbr === "hvo");
  assert.equal(Object.keys(first.meta.notices).length, hvo.length);
  assert.equal(first.meta.noticeCount, hvo.length);
  assert.ok(stub.calls.every(([, url]) => !/AVO/.test(url)));
  assert.deepEqual(
    first.events.map((e) => e.id),
    ["episode-48", "episode-49", "episode-50", "episode-51", "episode-52", "episode-53", "episode-54", "episode-55"],
  );
  assert.equal(iso(first.events.at(-1).time), "2026-10-13T01:10:00.000Z");
  assert.match(first.events.at(-1).url, /hans-public/);
  assert.equal(first.meta.streams.v1cam, "NEWv1cam");
  assert.equal(first.meta.streams.v3cam, "NEWv3cam");
  const before = stub.calls.length;
  const second = await fetchObservation(def, { fetch: stub.fetch, previousMeta: first.meta, now: () => Date.UTC(2026, 9, 12, 22) });
  assert.equal(second.ok, true);
  assert.equal(stub.calls.length - before, 1, "only the notice list is fetched again");
  assert.deepEqual(second.meta.streams, first.meta.streams);
  const failed = await fetchObservation(def, { fetch: stubFetch({ fail: true }).fetch, previousMeta: first.meta, resolveStreams: false });
  assert.equal(failed.ok, false);
  assert.match(failed.error, /socket/);
  assert.deepEqual(failed.events, []);
  const partial = await fetchObservation(def, { fetch: stubFetch({ failNotice: hvo[0].notice_identifier }).fetch, resolveStreams: false });
  assert.equal(partial.ok, false);
  assert.match(partial.error, /could not be read/);
  const limited = await fetchObservation(def, { fetch: stubFetch().fetch, resolveStreams: false, maxNotices: 2 });
  assert.equal(limited.ok, false);
  assert.match(limited.error, /Catching up/);
  assert.equal(Object.keys(limited.meta?.notices || {}).length, 0);
});

test("an official episode inside the window settles Yes at 1 gold per share and the next window opens after the result display", () => {
  const { ex, m, set, now } = setup();
  const s0 = ex.snapshot(guest, "kilauea");
  assert.equal(s0.live.phase, "open");
  assert.equal(s0.round.start, now(), "a cold start opens the window now");
  assert.equal(iso(s0.round.deadline), "2026-11-01T00:00:00.000Z");
  assert.equal(s0.live.model.basis, "published prior interval");
  const fill = order(ex, s0.round.id, "up", 20);
  assert.ok(fill.filled > 20 && fill.filled < 30);
  const round = m.state.round.id;
  set("2026-10-12T03:00:00Z");
  ex.observeLive("kilauea", {
    at: now(),
    ok: true,
    source: "test",
    events: [...def.seedEvents, event(55, "2026-10-12T01:10:00Z")],
  });
  const s1 = ex.snapshot(guest, "kilauea");
  assert.equal(s1.live.phase, "result");
  assert.equal(s1.live.resolution.outcome, "yes");
  assert.equal(s1.live.resolution.by, "feed");
  assert.equal(s1.live.resolution.event.id, "episode-55");
  assert.equal(s1.live.model.basis, "recent official events");
  assert.equal(
    s1.player.balance,
    Math.round((1000 - fill.total + fill.filled) * 1e8) / 1e8,
  );
  assert.equal(s1.player.history[0].outcome, "up");
  assert.equal(s1.player.history[0].id, round);
  assert.equal(m.state.history[0].resolution.event.id, "episode-55");
  assert.throws(() => order(ex, s1.round.id), /resolved/);
  assert.equal(s1.round.nextAt, now() + RESULT_MS);
  set(now() + RESULT_MS);
  const s2 = ex.snapshot(guest, "kilauea");
  assert.equal(s2.live.phase, "open");
  assert.notEqual(s2.round.id, round);
  assert.equal(s2.round.start, s1.round.nextAt);
  assert.equal(iso(s2.round.deadline), "2026-11-01T00:00:00.000Z");
  assert.equal(s2.player.positions.up.shares, 0);
});

test("events before the window do not count, and No settles only after a successful record check at or after the deadline", () => {
  const { ex, m, set, now } = setup();
  const r = ex.snapshot(guest, "kilauea").round;
  order(ex, r.id, "down", 10);
  ex.observeLive("kilauea", {
    at: now(),
    ok: true,
    events: [...def.seedEvents, event(55, "2026-10-10T22:00:00Z")],
  });
  assert.equal(ex.snapshot(guest, "kilauea").live.phase, "open");
  set("2026-11-01T00:00:01Z");
  let s = ex.snapshot(guest, "kilauea");
  assert.equal(s.live.phase, "awaiting");
  assert.equal(s.round.closed, true);
  assert.throws(() => order(ex, r.id), /deadline/);
  ex.observeLive("kilauea", { at: now(), ok: false, error: "timeout" });
  s = ex.snapshot(guest, "kilauea");
  assert.equal(s.live.phase, "awaiting");
  assert.equal(s.live.feed.ok, false);
  assert.equal(s.live.feed.events.length, def.seedEvents.length + 1, "last good events are kept");
  set("2026-11-01T00:05:00Z");
  ex.observeLive("kilauea", {
    at: now(),
    ok: true,
    events: [...def.seedEvents, event(55, "2026-10-10T22:00:00Z")],
  });
  s = ex.snapshot(guest, "kilauea");
  assert.equal(s.live.phase, "result");
  assert.equal(s.live.resolution.outcome, "no");
  assert.equal(s.live.resolution.by, "deadline");
  assert.ok(s.player.balance > 1000, "No holders are paid");
  set(now() + RESULT_MS);
  s = ex.snapshot(guest, "kilauea");
  assert.equal(iso(s.round.deadline), "2026-11-16T00:00:00.000Z");
  assert.equal(m.state.round.resolved, false);
});

test("owner override needs a note, void refunds cost basis, and resolved windows cannot be resolved twice", () => {
  const { ex } = setup();
  const r = ex.snapshot(guest, "kilauea").round;
  const fill = order(ex, r.id, "up", 10);
  assert.throws(() => ex.resolveLive("kilauea", { outcome: "void" }), /note/);
  assert.throws(() => ex.resolveLive("kilauea", { outcome: "maybe", note: "x" }), /Yes, No, or Void/);
  assert.throws(() => ex.resolveLive("nope", { outcome: "void", note: "x" }), /Unknown/);
  const result = ex.resolveLive("kilauea", { outcome: "void", note: "Feed discontinued; see HVO status report." });
  assert.equal(result.outcome, "void");
  const s = ex.snapshot(guest, "kilauea");
  assert.equal(s.player.balance, 1000);
  assert.equal(s.player.history[0].outcome, "void");
  assert.equal(s.player.history[0].profit, 0);
  assert.equal(s.player.activity[0].type, "refund");
  assert.equal(s.live.resolution.by, "owner");
  assert.match(s.live.resolution.note, /discontinued/);
  assert.ok(fill.filled > 0);
  assert.throws(() => ex.resolveLive("kilauea", { outcome: "no", note: "again" }), /already resolved/);
});

test("quotes follow the recent official event rate, clamp to 2–98%, and never leak private data", () => {
  const { ex, m, now } = setup();
  const remaining = (Date.UTC(2026, 10, 1) - now()) / DAY;
  assert.equal(m.probability(), Math.round((1 - Math.exp(-remaining / 14)) * 100) / 100);
  ex.observeLive("kilauea", {
    at: now(),
    ok: true,
    events: Array.from({ length: 6 }, (_, i) => event(40 + i, `2026-09-${10 + i * 2}T00:00:00Z`)),
  });
  assert.equal(m.intervalDays().days, 2);
  assert.equal(m.probability(), 0.98);
  ex.observeLive("kilauea", {
    at: now(),
    ok: true,
    events: [event(1, "2024-01-01T00:00:00Z"), event(2, "2026-01-01T00:00:00Z")],
  });
  assert.ok(m.probability() < 0.05);
  const s = ex.snapshot(guest, "kilauea");
  const text = JSON.stringify(s);
  assert.ok(!text.includes("labSecret"));
  assert.ok(!text.includes("bot-"));
  assert.equal(s.markets.kilauea.round.phase, "open");
  assert.equal(s.markets.kilauea.round.deadline, s.round.deadline);
  assert.ok(s.player.allPositions.some((p) => p.marketId === "kilauea"));
  assert.equal(s.live.stream.cameras.length, 3);
  assert.equal(s.live.schedule.days.join(","), "1,16");
});

test("windows, feed state and positions survive restart; the community lists the live game", () => {
  const { ex, now } = setup();
  const r = ex.snapshot(guest, "kilauea").round;
  order(ex, r.id, "up", 15);
  ex.observeLive("kilauea", { at: now(), ok: true, events: def.seedEvents });
  const copy = new Exchange({ state: JSON.parse(JSON.stringify(ex.state)), now: () => now() + 60000, bots: false });
  const s = copy.snapshot(guest, "kilauea");
  assert.equal(s.round.id, r.id);
  assert.equal(s.live.feed.events.length, def.seedEvents.length);
  assert.ok(s.player.positions.up.shares > 0);
  assert.equal(copy.liveFeedsDue(now() + 60000).length, 0);
  assert.deepEqual(copy.liveFeedsDue(now() + def.source.intervalMs + 1), ["kilauea"]);
  assert.equal(copy.liveFeedsDue(now() + def.source.intervalMs + 1, 20 * 60000).length, 0);
  assert.deepEqual(copy.liveFeedsDue(now() + 20 * 60000, 20 * 60000), ["kilauea"]);
  const community = new Community(undefined, ex.state);
  assert.equal(community.contracts("kilauea").length, 1);
  assert.equal(community.positions(guest, "kilauea")[0].label, "Yes");
});

test("the HTTP owner endpoint reads status and resolves with the owner key; the poller stores observations", async (t) => {
  let now = Date.parse("2026-10-11T08:00:00Z");
  const ex = new Exchange({ now: () => now, bots: false, seed: 5 });
  const token = "k".repeat(40);
  let observations = 0;
  const service = createApp({
    market: ex,
    persist: false,
    liveFeeds: false,
    adminToken: token,
    fetchObservation: async (d, options) => {
      observations++;
      assert.equal(d.id, "kilauea");
      return { at: now, ok: true, source: "stub", events: [...d.seedEvents], meta: { streams: { v1cam: "abc123def45" }, previous: options.previousMeta } };
    },
  });
  await new Promise((resolve) => service.server.listen(0, "127.0.0.1", resolve));
  t.after(() => service.stop());
  const base = `http://127.0.0.1:${service.server.address().port}`;
  const call = (method, body, key = token) =>
    fetch(`${base}/api/live-admin`, {
      method,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: body && JSON.stringify(body),
    });
  assert.equal((await call("GET", undefined, "short")).status, 403);
  const status = await (await call("GET")).json();
  assert.equal(status.live[0].game, "kilauea");
  assert.equal(status.live[0].resolved, false);
  await service.pollFeeds();
  assert.equal(observations, 1);
  const guestState = await (await fetch(`${base}/api/session?market=kilauea`)).json();
  assert.equal(guestState.live.feed.ok, true);
  assert.equal(guestState.live.feed.meta.streams.v1cam, "abc123def45");
  assert.equal(guestState.live.feed.events.length, def.seedEvents.length);
  // A trusted poller can hand observations to a server that cannot reach the record.
  const pushed = await (
    await call("POST", {
      action: "observe",
      game: "kilauea",
      observation: {
        at: 1,
        ok: true,
        source: "pushed",
        events: [...def.seedEvents, event(55, "2026-10-10T22:00:00Z")],
        meta: { streams: { v2cam: "pushedVideo1" } },
      },
    })
  ).json();
  assert.equal(pushed.result.ok, true);
  assert.equal(pushed.live[0].feed.source, "pushed");
  assert.equal(pushed.live[0].feed.checkedAt, now, "the server's clock stamps the observation");
  assert.equal(pushed.live[0].feed.events.length, def.seedEvents.length + 1);
  assert.equal(pushed.live[0].resolved, false, "an event before the window does not settle");
  assert.equal((await call("POST", { action: "observe", game: "kilauea", observation: "bad" })).status, 400);
  assert.equal((await call("POST", { action: "observe", game: "nope", observation: {} })).status, 400);
  const resolved = await (await call("POST", { game: "kilauea", outcome: "no", note: "Manual test" })).json();
  assert.equal(resolved.result.outcome, "no");
  assert.equal(resolved.live[0].resolution.by, "owner");
  assert.equal((await call("POST", { game: "kilauea", outcome: "no", note: "x" })).status, 400);
  assert.equal((await fetch(`${base}/live.html`)).status, 200);
  assert.equal((await fetch(`${base}/livestreams.js`)).status, 200);
  assert.equal((await fetch(`${base}/live.css`)).status, 200);
});
