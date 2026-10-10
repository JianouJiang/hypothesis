/* Run against a server with genuine CFD data loaded. */
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const base = (process.env.PHYSICS_TEST_URL || "http://127.0.0.1:3001").replace(
  /\/$/,
  "",
);
(async () => {
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  try {
    const context = await browser.newContext({
        viewport: { width: 1440, height: 1100 },
      }),
      page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(base + "/aerofoil.html");
    await page.locator("#review-trade:not([disabled])").waitFor();
    const session = () =>
      page.evaluate(async () => {
        const h = {};
        const token = localStorage.getItem("physics-server-guest");
        if (token) h.Authorization = `Bearer ${token}`;
        const d = await (
          await fetch("/api/session?market=aerofoil", { headers: h })
        ).json();
        return d.snapshot || d;
      });
    let start = await session();
    assert.equal(start.round.end, null);
    assert.ok(start.flow.points.length <= 180);
    assert.equal(start.flow.frames, undefined);
    assert.equal(
      await page.locator("#height-chart line[stroke-dasharray]").count(),
      1,
    );
    assert.equal(await page.locator("#height-chart path").count(), 1);
    await page.locator("#trade-amount").fill("20");
    await page.locator("#review-trade").click();
    await page.locator("#trade-confirm[open]").waitFor();
    assert.equal((await session()).player.balance, start.player.balance);
    await page.locator("#confirm-cancel").click();
    assert.equal((await session()).player.balance, start.player.balance);
    await page.locator("#review-trade").click();
    await page.locator("#confirm-submit").click();
    await page.locator("#trade-confirm[open]").waitFor({ state: "hidden" });
    let bought = await session();
    assert.ok(bought.player.positions.up.shares > 0);
    assert.ok(bought.player.balance < start.player.balance);
    console.log(
      "PASS CFD snapshot, height reference lines, and confirm/cancel without premature spending",
    );
    await page.goto(base + "/profile.html");
    await page.locator("#edit-profile:not([disabled])").waitFor();
    assert.match(
      await page.locator("#profile-results").textContent(),
      /Dust above or below/,
    );
    await page.goto(base + "/bitcoin.html");
    await page.locator("#submit-trade:not([disabled])").waitFor();
    assert.equal(
      Number(
        (await page.locator("#header-balance").textContent()).replace(/,/g, ""),
      ),
      Math.round(bought.player.balance * 100) / 100,
    );
    await page.goto(base + "/aerofoil.html");
    await page.locator("#review-trade:not([disabled])").waitFor();
    await page.locator("#trade-type").selectOption("limit");
    await page.locator("#limit-price").fill("0.01");
    await page.locator("#trade-amount").fill("100");
    await page.locator("#review-trade").click();
    await page.locator("#confirm-submit").click();
    await page.locator("#trade-confirm[open]").waitFor({ state: "hidden" });
    await page.locator("[data-cancel]").first().click();
    await page.locator("[data-cancel]").waitFor({ state: "hidden" });
    assert.equal((await session()).player.allOrders.length, 0);
    for (const size of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width: size, height: 1000 });
      await page.waitForTimeout(100);
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        `overflow at ${size}`,
      );
    }
    await page.screenshot({ path: "/tmp/aerofoil-mobile.png", fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.screenshot({
      path: "/tmp/aerofoil-desktop.png",
      fullPage: true,
    });
    for (const file of [
      "naca0012.dat",
      "naca0012-tilted.csv",
      "naca0012.stl",
      "parameters.json",
    ])
      assert.equal(
        (await context.request.get(base + "/geometry/" + file)).status(),
        200,
      );
    for (const file of [
      "flow-bank.json",
      "exchange.js",
      "data/market.json",
      "system/fvSolution",
    ])
      assert.equal(
        (await context.request.get(base + "/" + file)).status(),
        404,
      );
    console.log(
      "PASS shared Bitcoin/profile wallet, limit order cancellation, downloads, and responsive flow view",
    );
    // Observe a real server-timed rollover, including payout and new target.
    bought = await session();
    const baseline = bought.round.opening,
      shares = bought.player.positions.up.shares,
      balance = bought.player.balance;
    let settled = bought;
    const deadline = Date.now() + 190000;
    while (settled.round.id === bought.round.id && Date.now() < deadline) {
      await page.waitForTimeout(1000);
      settled = await session();
    }
    const result = settled.history.find((r) => r.id === bought.round.id);
    assert.ok(result, JSON.stringify({ oldId: bought.round.id, oldNow: bought.now, newId: settled.round.id, now: settled.now, history: settled.history.map(r=>r.id) }));
    assert.equal(settled.round.opening, result.close);
    assert.equal(result.outcome, result.close >= baseline ? "up" : "down");
    assert.ok(
      Math.abs(
        settled.player.balance -
          (balance + (result.outcome === "up" ? shares : 0)),
      ) < 1e-6,
    );
    assert.equal(settled.player.positions.up.shares, 0);
    assert.equal(settled.player.positions.down.shares, 0);
    console.log(
      "PASS arrival-based round rollover, previous-exit target, and automatic payout",
    );
    assert.deepEqual(errors, []);
    console.log("PASS no browser JavaScript errors");
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
