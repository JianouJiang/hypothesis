/* Optional browser QA: install Playwright separately, then set NODE_PATH if needed. */
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const base = process.env.PHYSICS_TEST_URL || "http://127.0.0.1:3000";

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox"],
  });
  const errors = [];
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1100 },
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${base.replace(/\/$/, "")}/bitcoin.html`);
    await page.waitForFunction(() =>
      document
        .getElementById("connection-text")
        .textContent.includes("connected"),
    );
    assert.equal(
      await page.locator("#header-balance").textContent(),
      "1,000.00",
    );
    await page.locator("#trade-amount").fill("25");
    await page.locator("#submit-trade").click();
    await page.locator("#confirm-trade").waitFor();
    assert.equal(
      await page.locator("#header-balance").textContent(),
      "1,000.00",
    );
    await page.locator("#cancel-trade").click();
    assert.equal(
      await page.locator("#header-balance").textContent(),
      "1,000.00",
    );
    console.log(
      "PASS confirmation opens without spending; cancel preserves balance",
    );
    await page.locator("#submit-trade").click();
    await page.locator("#confirm-trade").click();
    await page.locator(".position-row").first().waitFor();
    assert.ok(
      Number(
        (await page.locator("#header-balance").textContent()).replaceAll(
          ",",
          "",
        ),
      ) < 980,
    );
    console.log("PASS market buy and position display");

    await page.locator('[data-sell="up"]').click();
    await page.locator("#submit-trade").click();
    await page.locator("#confirm-trade").click();
    await page.waitForFunction(() => !document.querySelector(".position-row"));
    console.log("PASS sell position");

    await page.locator('[data-action="buy"]').click();
    await page.locator('[data-side="down"]').click();
    await page.locator("#trade-amount").fill("10");
    await page.locator("#submit-trade").click();
    await page.locator("#confirm-trade").click();
    await page.locator('[data-sell="down"]').waitFor();
    console.log("PASS Down outcome trading");

    await page.locator("#order-type").selectOption("limit");
    await page.locator("#limit-price").fill("1");
    await page.locator("#trade-amount").fill("30");
    await page.locator("#submit-trade").click();
    await page.locator("#confirm-trade").click();
    await page.locator("[data-cancel]").first().waitFor();
    await page.locator("[data-cancel]").first().click();
    await page.waitForFunction(() => !document.querySelector("[data-cancel]"));
    console.log("PASS limit placement and cancellation");

    await page.locator("#order-type").selectOption("market");
    await page.locator("#trade-amount").fill("999999");
    await page.locator("#submit-trade").click();
    await page.locator("#trade-error:not([hidden])").waitFor();
    assert.match(await page.locator("#trade-error").textContent(), /gold/);
    console.log("PASS insufficient balance feedback");

    await page.reload();
    await page.waitForFunction(() =>
      document
        .getElementById("connection-text")
        .textContent.includes("connected"),
    );
    assert.ok(
      Number(
        (await page.locator("#header-balance").textContent()).replaceAll(
          ",",
          "",
        ),
      ) < 1000,
    );
    await page.locator('.detail-tabs [data-panel="positions"]').click();
    await page.locator('[data-sell="down"]').waitFor();
    console.log("PASS wallet and positions survive reload");

    await page.locator(".wallet-button").click();
    await page.locator("#reset-wallet").click();
    await page.locator("#confirm-reset").click();
    await page.waitForFunction(
      () =>
        document.getElementById("header-balance").textContent === "1,000.00",
    );
    console.log("PASS explicit wallet reset");

    await page.locator("#search-trigger").click();
    await page.locator("#market-search").fill("btc");
    await page.locator(".search-result").waitFor();
    await page.keyboard.press("Escape");
    await page.locator('.detail-tabs [data-panel="activity"]').click();
    await page.locator(".activity-table tbody tr").first().waitFor();
    assert.ok(await page.locator(".bot-label").count());
    console.log("PASS search, dialogs, and labeled bot activity");

    for (const width of [1440, 1024, 900, 768, 720, 390, 320]) {
      await page.setViewportSize({ width, height: 950 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth,
        ),
        false,
        `Horizontal overflow at ${width}px`,
      );
    }
    console.log("PASS responsive layout from 320 to 1440px");
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.locator('.detail-tabs [data-panel="book"]').click();
    await page.screenshot({
      path: "/tmp/polymarket-verified-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "/tmp/polymarket-verified-mobile.png",
      fullPage: true,
    });

    const second = await browser.newContext();
    const other = await second.newPage();
    await other.goto(`${base.replace(/\/$/, "")}/bitcoin.html`);
    await other.waitForFunction(() =>
      document
        .getElementById("connection-text")
        .textContent.includes("connected"),
    );
    assert.equal(
      await other.locator("#header-balance").textContent(),
      "1,000.00",
    );
    assert.equal(
      await other.locator("#opening-price").textContent(),
      await page.locator("#opening-price").textContent(),
    );
    console.log("PASS separate guests share the same live market");
    await second.close();
    await context.close();

    if (!process.env.PHYSICS_SKIP_OFFLINE) {
      const offline = await browser.newContext({
        viewport: { width: 1200, height: 900 },
      });
      const local = await offline.newPage();
      local.on("pageerror", (error) => errors.push(error.message));
      await local.clock.install();
      await local.goto(
        pathToFileURL(path.resolve(__dirname, "../bitcoin.html")).href,
      );
      await local.waitForFunction(() =>
        document
          .getElementById("connection-text")
          .textContent.includes("Practice mode"),
      );
      await local.locator("#trade-amount").fill("10");
      await local.locator("#submit-trade").click();
      await local.locator("#confirm-trade").click();
      await local.locator(".position-row").waitFor();
      const before = await local.evaluate(() => {
        const state = JSON.parse(
          localStorage.getItem("polymarket-physics-market-v1"),
        );
        const p = state.players[localStorage.getItem("physics-local-guest")];
        const wins = state.round.path[300] >= state.round.opening;
        return {
          expected: p.balance + (wins ? p.positions.up.shares : 0),
          end: state.round.end,
        };
      });
      await local.clock.fastForward(300001);
      await local.waitForFunction(
        () => document.getElementById("positions-count").textContent === "0",
      );
      const after = await local.evaluate(
        () =>
          JSON.parse(localStorage.getItem("polymarket-physics-market-v1"))
            .players[localStorage.getItem("physics-local-guest")],
      );
      assert.ok(Math.abs(after.balance - before.expected) < 0.000001);
      assert.equal(after.history.length, 1);
      await local.locator('.detail-tabs [data-panel="history"]').click();
      await local.locator(".history-item").first().waitFor();
      console.log(
        "PASS standalone HTML, round rollover, automatic payout, and history",
      );
      await offline.close();
    }
    assert.deepEqual(errors, []);
    console.log("PASS no browser JavaScript errors");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
