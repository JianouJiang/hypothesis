/* Real browser + HTTP check of the Kīlauea live-stream page with a stubbed official record. */
const assert = require("node:assert/strict");
const { readFileSync, mkdirSync } = require("node:fs");
const { chromium } = require("playwright");
const { Exchange } = require("../exchange");
const { createApp } = require("../server");
const Live = require("../livestreams");
(async () => {
  const def = Live.definitions.kilauea;
  let now = Date.parse("2026-10-11T08:00:00Z");
  const ex = new Exchange({ now: () => now, bots: false, seed: 91 });
  const app = createApp({
    market: ex,
    persist: false,
    liveFeeds: false,
    fetchObservation: async () => ({
      at: now,
      ok: true,
      source: def.source.name,
      events: def.seedEvents,
      meta: { streams: { v1cam: "HggWKlZv9yk" }, newest: { type: "DU", sent: now - 3600000 } },
    }),
  });
  await app.pollFeeds();
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  mkdirSync("/tmp/hypothesis-live-qa", { recursive: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } }),
      page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const session = async () => (await context.request.get(base + "/api/session?market=kilauea")).json();
    await page.goto(base + "/live.html?game=kilauea");
    await page.locator("#review-trade:not([disabled])").waitFor();
    assert.match(await page.locator("#live-title").textContent(), /Kīlauea.*before 1 November\?/);
    assert.match(await page.locator("#live-eyebrow").textContent(), /DEADLINE 1 NOV 2026/);
    assert.match(await page.locator("#live-countdown").textContent(), /^20d 1[56]h$/);
    assert.match(await page.locator("#live-last-event").textContent(), /Episode 54/);
    assert.match(await page.locator("#live-feed-status").textContent(), /ago|just now/);
    assert.equal(await page.locator("#live-video").getAttribute("src"), "https://www.youtube.com/embed/HggWKlZv9yk?autoplay=1&mute=1&rel=0&playsinline=1");
    assert.equal(await page.locator("#live-cameras button").count(), 3);
    await page.locator('[data-camera="v2cam"]').click();
    assert.match(await page.locator("#live-video").getAttribute("src"), /f9-oSpYpubg/);
    assert.equal(await page.locator("#live-events li").count(), 7);
    assert.match(await page.locator("#lab-chart canvas, #live-timeline").first().getAttribute("aria-label"), /Timeline/);
    const downloading = page.waitForEvent("download");
    await page.locator("#download-conditions").click();
    const data = JSON.parse(readFileSync(await (await downloading).path(), "utf8"));
    assert.equal(data.experiment, "kilauea");
    assert.equal(data.deadlineUtc, "2026-11-01T00:00:00.000Z");
    assert.equal(data.officialRecord.snapshot.events.length, 7);
    console.log("PASS live page renders the stream, official record, countdown, cameras and round download");
    await page.locator("#choose-down").click();
    await page.locator("#trade-amount").fill("12");
    await page.locator("#review-trade").click();
    assert.match(await page.locator("#confirm-summary").textContent(), /No.*Deadline/s);
    assert.equal((await session()).player.balance, 1000);
    await page.locator("#confirm-submit").click();
    await page.locator("#trade-confirm[open]").waitFor({ state: "hidden" });
    const bought = await session();
    assert.ok(bought.player.positions.down.shares > 0);
    assert.ok(bought.player.balance < 1000);
    await page.locator("#results-tab").click();
    assert.match(await page.locator("#aero-market-panel").textContent(), /Completed windows/);
    await page.goto(base + "/profile.html");
    await page.locator("#edit-profile:not([disabled])").waitFor();
    assert.match(await page.locator("#profile-results").textContent(), /Kīlauea lava fountains/);
    assert.ok(await page.locator('a[href*="live.html?game=kilauea"]').count());
    await page.goto(base + "/live.html?game=kilauea");
    await page.locator("#review-trade:not([disabled])").waitFor();
    console.log("PASS review, confirm, positions and profile link on the weeks-long market");
    for (const size of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width: size, height: 1050 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "overflow " + size);
    }
    await page.setViewportSize({ width: 390, height: 1050 });
    await page.screenshot({ path: "/tmp/hypothesis-live-qa/live-mobile.png", fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.screenshot({ path: "/tmp/hypothesis-live-qa/live-desktop.png", fullPage: true });
    // Yes resolution from an official episode inside the window.
    now = Date.parse("2026-10-12T03:00:00Z");
    ex.observeLive("kilauea", {
      at: now,
      ok: true,
      source: def.source.name,
      events: [...def.seedEvents, { id: "episode-55", time: Date.parse("2026-10-12T01:10:00Z"), label: "Episode 55 lava fountaining began", url: "https://volcanoes.usgs.gov/hans-public/" }],
    });
    await page.waitForFunction(() => document.getElementById("stage-result").textContent.includes("Yes wins"));
    assert.match(await page.locator("#live-phase").textContent(), /RESOLVED/);
    assert.match(await page.locator("#live-clock-label").textContent(), /NEXT WINDOW/);
    assert.ok((await page.locator("#review-trade").getAttribute("disabled")) !== null);
    await page.locator("#results-tab").click();
    assert.match(await page.locator("#aero-market-panel").textContent(), /Episode 55.*Yes/s);
    await page.screenshot({ path: "/tmp/hypothesis-live-qa/live-resolved.png", fullPage: false });
    console.log("PASS official episode settles Yes on screen and in past windows");
    await page.goto(base + "/");
    await page.waitForFunction(() => document.querySelector("#home-connection").textContent.includes("Connected"));
    assert.equal(await page.locator('[data-market="kilauea"] .card-title-link').getAttribute("href"), "live.html?game=kilauea");
    await page.waitForFunction(() => /Next window in|to deadline/.test(document.getElementById("kilauea-countdown").textContent));
    await page.locator("#next-feature").click();
    assert.match(await page.locator("#featured-market h2").textContent(), /Kīlauea/);
    await page.screenshot({ path: "/tmp/hypothesis-live-qa/home.png", fullPage: false });
    console.log("PASS home card, featured carousel and countdown");
    assert.deepEqual(errors, []);
    console.log("ALL LIVE BROWSER CHECKS PASSED");
  } finally {
    await browser.close();
    app.stop();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
