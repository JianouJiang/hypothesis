/* Optional end-to-end QA for discovery, profiles, and confirmation. */
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { pathToFileURL } = require("node:url");
const path = require("node:path");
const base = (process.env.PHYSICS_TEST_URL || "http://127.0.0.1:3000").replace(
  /\/$/,
  "",
);

(async () => {
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1100 },
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(base + "/");
    await page.waitForFunction(() =>
      document
        .querySelector("#home-connection")
        .textContent.includes("Connected"),
    );
    assert.equal(await page.locator(".market-card").count(), 12);
    await page.locator("#load-more").click();
    assert.equal(await page.locator(".market-card").count(), 22);
    await page.locator('#subject-nav [data-subject="maths"]').click();
    assert.equal(
      await page.locator("#markets-heading").textContent(),
      "Maths & Statistics",
    );
    assert.equal(await page.locator(".market-card").count(), 3);
    await page
      .locator('[data-market="bitcoin"] a[href="bitcoin.html"]')
      .waitFor();
    console.log(
      "PASS Maths & Statistics includes playable Bitcoin; all science subjects filter",
    );
    await page.locator('#subject-nav [data-subject=""]').click();
    await page.locator("#home-search").fill("convection");
    assert.equal(await page.locator(".market-card").count(), 1);
    assert.equal(
      await page
        .locator('[data-market="convection"] .card-title-link')
        .getAttribute("href"),
      "experiment.html?game=convection",
    );
    assert.equal(await page.locator("#home-balance").textContent(), "1,000.00");
    await page.locator('[data-market="convection"] [data-bookmark]').click();
    await page.reload();
    await page.locator("#home-search").fill("");
    await page.locator("#watchlist-filter").click();
    assert.equal(await page.locator(".market-card").count(), 1);
    assert.equal(await page.locator('[data-market="convection"]').count(), 1);
    await page.locator("#watchlist-filter").click();
    await page.locator("#next-feature").click();
    assert.match(
      await page.locator("#featured-market h2").textContent(),
      /Galton/,
    );
    console.log(
      "PASS search, playable experiment links, persistent watchlist, and featured carousel",
    );
    await page.goto(base + "/profile.html");
    await page.locator("#edit-profile:not([disabled])").waitFor();
    await page.locator("#edit-profile").click();
    const name = "Explorer " + Date.now().toString().slice(-9);
    await page.locator("#username").fill(name);
    await page
      .locator("#profile-bio-input")
      .fill("Curious about chaos & fluid dynamics.");
    await page.locator('[data-avatar="3"]').click();
    await page.screenshot({ path: "/tmp/physics-profile-edit.png" });
    await page.locator("#save-profile").click();
    await page.waitForFunction(
      (name) => document.querySelector("#profile-name").textContent === name,
      name,
    );
    await page.reload();
    await page.waitForFunction(
      (name) => document.querySelector("#profile-name").textContent === name,
      name,
    );
    assert.equal(
      await page.locator("#profile-bio").textContent(),
      "Curious about chaos & fluid dynamics.",
    );
    console.log(
      "PASS username, bio, and avatar save to guest account and survive reload",
    );
    await page.goto(base + "/bitcoin.html?side=down");
    await page.locator("#submit-trade:not([disabled])").waitFor();
    assert.match(
      await page.locator(".avatar").getAttribute("aria-label"),
      new RegExp(name),
    );
    assert.equal(
      await page.locator('[data-side="down"]').getAttribute("aria-pressed"),
      "true",
    );
    await page.locator("#trade-amount").fill("20");
    await page.locator("#submit-trade").click();
    await page.locator("#confirm-trade").waitFor();
    assert.equal(
      await page.locator("#header-balance").textContent(),
      "1,000.00",
    );
    await page.screenshot({ path: "/tmp/physics-trade-confirmation.png" });
    await page.keyboard.press("Escape");
    assert.equal(
      await page.locator("#header-balance").textContent(),
      "1,000.00",
    );
    await page.locator("#submit-trade").click();
    await page.locator("#confirm-trade").click();
    await page.locator(".position-row").waitFor();
    const afterBuy = await page.locator("#header-balance").textContent();
    await page.locator("a.portfolio-link").click();
    await page.waitForFunction(
      (name) => document.querySelector("#profile-name").textContent === name,
      name,
    );
    assert.equal(await page.locator("#home-balance").textContent(), afterBuy);
    await page.locator(".profile-table tbody tr").first().waitFor();
    assert.equal(await page.locator("#profile-predictions").textContent(), "1");
    await page.screenshot({
      path: "/tmp/physics-profile-with-position.png",
      fullPage: true,
    });
    await page.locator('[data-tab="activity"]').click();
    await page.locator(".activity-profile-table tbody tr").first().waitFor();
    assert.match(
      await page.locator(".activity-profile-table").textContent(),
      /Bought Down/,
    );
    await page.locator("#activity-type").selectOption("sell");
    await page.locator(".profile-empty").waitFor();
    await page.locator("#activity-type").selectOption("all");
    await page.locator('[data-period="1D"]').click();
    assert.equal(
      await page.locator("#pnl-period-caption").textContent(),
      "Past day",
    );
    console.log(
      "PASS same account across pages, real position values, activity filters, and chart periods",
    );
    await page.locator('[data-tab="positions"]').click();
    for (const url of [base + "/", base + "/profile.html"]) {
      await page.goto(url);
      await page
        .locator(
          url.endsWith("html")
            ? "#edit-profile:not([disabled])"
            : ".market-card",
        )
        .first()
        .waitFor();
      for (const width of [1440, 1024, 900, 768, 720, 540, 390, 360, 320]) {
        await page.setViewportSize({ width, height: 950 });
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
          false,
          `Overflow at ${url} ${width}px`,
        );
      }
    }
    console.log("PASS home and profile responsive layouts at 320–1440px");
    await context.close();
    if (!process.env.PHYSICS_SKIP_OFFLINE) {
      const offline = await browser.newContext();
      const local = await offline.newPage();
      local.on("pageerror", (e) => errors.push(e.message));
      await local.clock.install();
      const localUrl = (name) =>
        pathToFileURL(path.resolve(__dirname, "..", name)).href;
      await local.goto(localUrl("profile.html"));
      await local.locator("#edit-profile:not([disabled])").waitFor();
      await local.locator("#edit-profile").click();
      await local.locator("#username").fill("Offline Explorer");
      await local.locator("#save-profile").click();
      await local.locator("#edit-profile-dialog").waitFor({ state: "hidden" });
      await local.goto(localUrl("bitcoin.html"));
      await local.locator("#submit-trade:not([disabled])").waitFor();
      assert.match(
        await local.locator(".avatar").getAttribute("aria-label"),
        /Offline Explorer/,
      );
      await local.locator("#trade-amount").fill("10");
      await local.locator("#submit-trade").click();
      await local.locator("#confirm-trade").waitFor();
      await local.clock.fastForward(300001);
      assert.equal(await local.locator("#confirm-trade").isDisabled(), true);
      assert.match(
        await local.locator("#confirm-error").textContent(),
        /ended/,
      );
      assert.equal(
        await local.locator("#header-balance").textContent(),
        "1,000.00",
      );
      await local.keyboard.press("Escape");
      await local.goto(localUrl("index.html"));
      await local.waitForFunction(() =>
        document
          .querySelector("#home-connection")
          .textContent.includes("Practice wallet"),
      );
      assert.equal(
        await local.locator("#home-balance").textContent(),
        "1,000.00",
      );
      console.log(
        "PASS standalone shared profile and expired trade confirmation without spending",
      );
      await offline.close();
    }
    assert.deepEqual(errors, []);
    console.log("PASS no browser JavaScript errors");
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
