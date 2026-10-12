/* Isolated browser QA. All seeded traders/results stay in memory. */
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { pathToFileURL } = require("node:url");
const path = require("node:path");
const { Market } = require("../market");
const { createApp } = require("../server");

(async () => {
  const now = Date.now();
  const market = new Market({ now: () => now, bots: false });
  for (let i = 0; i < 45; i++) {
    const player = market.addPlayer(`test-trader-${i}`);
    market.updateProfile(player.id, { name: `Researcher${String(i).padStart(2, "0")}`, avatar: i % 8, bio: "" });
    const profit = 450 - i * 12;
    player.realized = profit;
    market.recordActivity(player, { type: "sell", profit, total: 1000 + i * 15,
      marketId: i % 2 ? "galton-4" : "bitcoin", time: now });
  }
  const app = createApp({ market, persist: false, liveFeeds: false });
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${base}/leaderboard.html`);
    const loaded = () => page.waitForFunction(() => document.querySelector("#leaderboard-table").getAttribute("aria-busy") === "false");
    await page.locator("#leaderboard-rows tr").first().waitFor();
    assert.equal(await page.locator("#leaderboard-rows tr").count(), 20);
    assert.match(await page.locator("#leaderboard-rows tr").first().innerText(), /Researcher00/);
    assert.equal(await page.locator(".leaderboard-medal").count(), 3);
    assert.equal(await page.locator(".leaderboard-win").count(), 10);
    await page.screenshot({ path: "/tmp/hypothesis-leaderboard-desktop.png" });
    await page.getByRole("button", { name: "Next page" }).click();
    await page.waitForFunction(() => document.querySelector(".leaderboard-rank").textContent === "21");
    await page.locator("#leaderboard-search").fill("researcher44");
    await page.waitForFunction(() => document.querySelectorAll("#leaderboard-rows tr").length === 1);
    assert.match(await page.locator("#leaderboard-rows").innerText(), /45/);
    assert.match(await page.locator(".leaderboard-loss").innerText(), /−78.00/);
    await page.locator("#leaderboard-search").fill("");
    await page.waitForFunction(() => document.querySelectorAll("#leaderboard-rows tr").length === 20);
    await page.getByRole("button", { name: "Volume", exact: true }).click();
    await page.waitForFunction(() => document.querySelector("#leaderboard-table").dataset.sort === "volume");
    assert.match(await page.locator("#leaderboard-rows tr").first().innerText(), /Researcher44/);
    await page.locator("#leaderboard-category").selectOption("solid");
    await loaded();
    await page.waitForFunction(() => document.querySelector("#leaderboard-status").textContent.startsWith("22 traders"));
    await page.locator("#leaderboard-category").selectOption("quantum");
    await page.locator("#leaderboard-empty").waitFor();
    assert.match(await page.locator("#leaderboard-empty").innerText(), /No predictions/);
    await page.locator("#leaderboard-category").selectOption("all");
    await page.getByRole("button", { name: "Today", exact: true }).click();
    await page.waitForFunction(() => document.querySelector("#leaderboard-wins-title").textContent === "Biggest wins today");
    await page.getByRole("button", { name: "How leaderboard rankings work" }).click();
    await page.getByRole("dialog").waitFor();
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("dialog").isVisible(), false);
    console.log("PASS desktop rows, medals, wins, ranks, pagination, search, sorts, categories, periods and keyboard dialog");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator(".leaderboard-sort-mobile:visible").selectOption("profit");
    await page.waitForFunction(() => document.querySelector("#leaderboard-table").dataset.sort === "profit");
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: "/tmp/hypothesis-leaderboard-mobile.png", fullPage: true });
    await page.locator(".leaderboard-sort-mobile:visible").selectOption("volume");
    await page.waitForFunction(() => document.querySelector("#leaderboard-table").dataset.sort === "volume");
    assert.equal(await page.locator("#leaderboard-table th.profit-column").isVisible(), false);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.setViewportSize({ width: 320, height: 740 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    console.log("PASS mobile sort controls and overflow at 390px and 320px");

    await page.route("**/api/leaderboard?**", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Test outage" }) }));
    await page.getByRole("button", { name: "All", exact: true }).click();
    await page.locator("#leaderboard-retry").waitFor();
    assert.equal(await page.locator("#leaderboard-rows tr").count(), 0);
    await page.unroute("**/api/leaderboard?**");
    await page.locator("#leaderboard-retry").click();
    await page.locator("#leaderboard-rows tr").first().waitFor();
    console.log("PASS failed requests clear stale rows and retry recovers");

    const session = await page.evaluate(() => fetch("/api/session").then((r) => r.json()));
    assert.match(session.player.name, /^(?=.*[a-z])(?=.*[0-9])[a-z0-9]{12}$/);
    const newName = session.player.name;
    await page.reload();
    await page.locator("#leaderboard-rows tr").first().waitFor();
    assert.equal((await page.evaluate(() => fetch("/api/session").then((r) => r.json()))).player.name, newName);
    const ownPlayer = Object.values(market.state.players).find((player) => player.name === newName);
    ownPlayer.realized = 100;
    market.recordActivity(ownPlayer, { type: "sell", profit: 100, total: 5000, time: now });
    await page.getByRole("button", { name: "Monthly", exact: true }).click();
    await page.locator(".leaderboard-own-row").waitFor();
    assert.match(await page.locator(".leaderboard-own-row").innerText(), /You/);
    console.log("PASS fresh random usernames persist and the current trader is highlighted");

    await page.goto(pathToFileURL(path.resolve(__dirname, "../leaderboard.html")).href);
    await page.waitForFunction(() => document.querySelector("#leaderboard-connection").textContent.includes("Practice wallet"));
    await loaded();
    assert.match(await page.locator("#leaderboard-empty").innerText(), /No predictions/);
    assert.equal(errors.length, 0, errors.join("\n"));
    console.log("PASS standalone practice mode and no browser errors");
  } finally {
    await browser.close();
    app.stop();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
