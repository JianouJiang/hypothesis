/* Browser + real HTTP checks using an injectable clock; no shortened production rounds. */
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { Exchange } = require("../exchange");
const { createApp } = require("../server");
(async () => {
  let now = 5000;
  const exchange = new Exchange({ now: () => now, seed: 7123, bots: false });
  const app = createApp({ market: exchange, persist: false });
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
        viewport: { width: 1440, height: 1100 },
      }),
      page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const session = async (id = "galton-2") =>
      (await context.request.get(base + "/api/session?market=" + id)).json();
    await page.goto(base + "/galton.html");
    await page.locator("#slot-markets .slot-row").first().waitFor();
    assert.equal(await page.locator("#slot-markets .slot-row").count(), 7);
    await page.locator('[data-slot="2"][data-side="down"]').click();
    await page.waitForFunction(() =>
      document
        .getElementById("selected-contract")
        .textContent.startsWith("Slot 2"),
    );
    await page.locator("#review-trade:not([disabled])").waitFor();
    const original = await session();
    assert.equal(original.player.balance, 1000);
    await page.locator("#trade-amount").fill("8");
    await page.locator("#review-trade").click();
    assert.match(
      await page.locator("#confirm-summary").textContent(),
      /Slot 2 · No/,
    );
    assert.equal((await session()).player.balance, 1000);
    await page.locator("#confirm-cancel").click();
    await page.locator("#review-trade").click();
    await page.locator("#confirm-submit").click();
    await page.locator("#trade-confirm[open]").waitFor({ state: "hidden" });
    const bought = await session();
    assert.ok(bought.player.positions.down.shares > 0);
    assert.ok(bought.player.balance < 1000);
    await page.locator("#trade-type").selectOption("limit");
    await page.locator("#limit-price").fill("0.01");
    await page.locator("#trade-amount").fill("10");
    await page.locator("#review-trade").click();
    await page.locator("#confirm-submit").click();
    await page.locator("#trade-confirm[open]").waitFor({ state: "hidden" });
    await page.locator("[data-cancel]").click();
    await page.locator("[data-cancel]").waitFor({ state: "hidden" });
    assert.equal((await session()).player.allOrders.length, 0);
    console.log(
      "PASS seven slot contracts, correct confirmation, no early spending, limit cancellation",
    );
    for (const size of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width: size, height: 1050 });
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        "Galton overflow " + size,
      );
    }
    await page.screenshot({ path: "/tmp/galton-mobile.png", fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.screenshot({ path: "/tmp/galton-desktop.png", fullPage: true });
    await page.goto(base + "/profile.html");
    await page.locator("#edit-profile:not([disabled])").waitFor();
    assert.match(
      await page.locator("#profile-results").textContent(),
      /Galton board · Slot 2/,
    );
    assert.ok(await page.locator('a[href*="galton.html?slot=2"]').count());
    assert.equal(
      (await session("bitcoin")).player.balance,
      bought.player.balance,
    );
    await page.goto(base + "/competitions.html");
    await page.locator("#interest-button:not([disabled])").waitFor();
    await page.locator("#interest-button").click();
    await page.waitForFunction(
      () =>
        document
          .getElementById("interest-button")
          .getAttribute("aria-pressed") === "true",
    );
    await page.reload();
    await page.waitForFunction(
      () =>
        document
          .getElementById("interest-button")
          .getAttribute("aria-pressed") === "true",
    );
    await page.locator("#interest-button").click();
    await page.waitForFunction(
      () =>
        document
          .getElementById("interest-button")
          .getAttribute("aria-pressed") === "false",
    );
    console.log(
      "PASS profile links, shared Bitcoin wallet, and persisted competition interest/undo",
    );
    await page.addInitScript(() => {
      window.__physicsNotes = [];
      const proto = window.AudioContext.prototype,
        original = proto.createOscillator;
      proto.createOscillator = function () {
        const node = original.call(this),
          start = node.start.bind(node);
        node.start = function (t) {
          window.__physicsNotes.push(node.frequency.value);
          return start(t);
        };
        return node;
      };
    });
    await page.goto(base + "/escape.html");
    await page.locator("#review-trade:not([disabled])").waitFor();
    await page.locator("#sound-toggle").click();
    await page.waitForTimeout(250);
    assert.equal(
      await page.locator("#sound-toggle").getAttribute("aria-pressed"),
      "true",
    );
    assert.equal(
      await page.evaluate(() => window.__physicsNotes.length),
      0,
      "prediction window must not play a background track",
    );
    const escape = exchange.select("escape"),
      hits = escape.model().impacts;
    now = escape.state.round.start + hits[0][0] + 1500;
    await page.waitForFunction(
      () => window.__physicsNotes.length > 0,
      {},
      { timeout: 15000 },
    );
    const played = await page.evaluate(() => window.__physicsNotes.length);
    assert.ok(played >= 3);
    await page.locator("#sound-toggle").click();
    assert.equal(
      await page.locator("#sound-toggle").getAttribute("aria-pressed"),
      "false",
    );
    now =
      escape.state.round.start + hits[Math.min(5, hits.length - 1)][0] + 1500;
    await page.waitForTimeout(1800);
    assert.equal(
      await page.evaluate(() => window.__physicsNotes.length),
      played,
      "muted impacts must not create notes",
    );
    await page.screenshot({ path: "/tmp/escape-desktop.png", fullPage: true });
    await page.setViewportSize({ width: 320, height: 1050 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    await page.screenshot({ path: "/tmp/escape-mobile.png", fullPage: true });
    console.log(
      "PASS collision-triggered music, silent prediction window, and functional mute",
    );
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.goto(base + "/galton.html?slot=2&side=down");
    await page.locator("#review-trade:not([disabled])").waitFor();
    await page.locator("#trade-amount").fill("1");
    await page.locator("#review-trade").click();
    const market = exchange.select("galton-2"),
      before = await session(),
      won = market.model().slot !== 1;
    now = market.state.round.settlementAt + 1;
    await page.waitForFunction(
      () => document.getElementById("confirm-submit").disabled,
    );
    const resolved = await session();
    assert.equal(resolved.round.resolved, true);
    assert.ok(
      Math.abs(
        resolved.player.balance -
          before.player.balance -
          (won ? before.player.positions.down.shares : 0),
      ) < 1e-6,
    );
    assert.match(
      await page.locator("#confirm-error").textContent(),
      /closed|lost/,
    );
    await page.locator("#confirm-cancel").click();
    console.log("PASS HTTP settlement and confirmation expiry at arrival");
    for (const path of ["geometry/galton.json", "geometry/escape.json"])
      assert.equal(
        (await context.request.get(base + "/" + path)).status(),
        200,
      );
    for (const path of [
      "physics.js",
      "collision-market.js",
      "vendor/planck.cjs",
    ])
      assert.equal(
        (await context.request.get(base + "/" + path)).status(),
        404,
      );
    assert.deepEqual(errors, []);
    console.log(
      "PASS parameter downloads, private runtime routes, and no browser errors",
    );
  } finally {
    await browser.close();
    app.stop();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
