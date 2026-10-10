/* Real HTTP/browser verification against an isolated wallet, clock and community. */
const assert = require("node:assert/strict");
const { readFileSync, mkdirSync } = require("node:fs");
const { chromium } = require("playwright");
const { Exchange } = require("../exchange");
const { createApp } = require("../server");
const { ids, definitions } = require("../experiments");
(async () => {
  let now = 61500;
  const ex = new Exchange({
    now: () => now,
    bots: false,
    seed: 581,
    state: {
      version: 2,
      accounts: {},
      markets: {},
      experimentSeed: 581,
      labSecret: "b".repeat(64),
    },
  });
  const app = createApp({ market: ex, persist: false });
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`,
    browser = await chromium.launch({ headless: true });
  mkdirSync("/tmp/hypothesis-labs-qa", { recursive: true });
  try {
    const context = await browser.newContext({
        viewport: { width: 1440, height: 1100 },
      }),
      page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const snapshot = async (market) =>
      (
        await context.request.get(
          `${base}/api/session?market=${encodeURIComponent(market)}`,
        )
      ).json();
    for (const id of ids) {
      await page.goto(`${base}/experiment.html?game=${id}`);
      await page.locator("#review-trade:not([disabled])").waitFor();
      assert.equal(
        await page.locator("h1").textContent(),
        definitions[id].title,
      );
      assert.equal(
        await page
          .locator("[data-community-game]")
          .getAttribute("data-community-game"),
        id,
      );
      assert.ok(
        !(await page.locator("#lab-parameters").textContent()).includes(
          "Connecting",
        ),
      );
      const opening = await snapshot(id),
        pending = page.waitForEvent("download");
      await page.locator("#download-conditions").click();
      const download = await pending,
        data = JSON.parse(readFileSync(await download.path(), "utf8"));
      assert.deepEqual(data.initialState, opening.lab.initial);
      assert.deepEqual(data.parameters, opening.lab.parameters);
      assert.ok(data.stateVariables.length);
      assert.ok(!JSON.stringify(data).includes('"secret"'));
      await page.locator("#trade-amount").fill("4");
      await page.locator("#review-trade").click();
      assert.equal(
        (await snapshot(id)).player.balance,
        opening.player.balance,
        "review must not spend",
      );
      await page.locator("#confirm-cancel").click();
      assert.equal((await snapshot(id)).player.balance, opening.player.balance);
      await page.locator("#review-trade").click();
      await page.locator("#confirm-submit").click();
      await page.locator("#trade-confirm[open]").waitFor({ state: "hidden" });
      assert.ok(
        (await snapshot(id)).player.positions.up.shares > 0,
        id + " shares",
      );
      await page.screenshot({
        path: `/tmp/hypothesis-labs-qa/${id}.png`,
        fullPage: false,
      });
      await page.setViewportSize({ width: 390, height: 844 });
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        id + " mobile overflow",
      );
      const canvas = await page.locator("#physics-canvas").boundingBox();
      assert.ok(
        canvas.width > 250 && canvas.width < 390,
        id + " mobile canvas",
      );
      if (["vortex", "magnetic-pendulum", "prism", "tunneling"].includes(id))
        await page.screenshot({
          path: `/tmp/hypothesis-labs-qa/${id}-mobile.png`,
        });
      await page.setViewportSize({ width: 1440, height: 1100 });
      console.log(
        "PASS",
        id,
        "simulation, download, confirmation, wallet and mobile",
      );
    }
    await page.goto(base + "/experiment.html?game=magnetic-pendulum");
    await page.locator('[data-choice="2"][data-side="down"]').waitFor();
    await page.locator('[data-choice="2"][data-side="down"]').click();
    await page.waitForFunction(
      () =>
        document.getElementById("selected-contract").textContent ===
        "Green magnet",
    );
    await page.locator("#review-trade:not([disabled])").waitFor();
    await page.locator("#review-trade").click();
    assert.match(
      await page.locator("#confirm-summary").textContent(),
      /Green magnet · No/,
    );
    await page.locator("#confirm-submit").click();
    await page.locator("#trade-confirm[open]").waitFor({ state: "hidden" });
    assert.ok(
      (await snapshot("magnetic-pendulum:2")).player.positions.down.shares > 0,
    );
    await page
      .locator("#community-draft")
      .fill("The published initial coordinates make this model reproducible.");
    await page.locator("#community-composer [type=submit]").click();
    await page
      .getByText(
        "The published initial coordinates make this model reproducible.",
        { exact: true },
      )
      .waitFor();
    await page.goto(base + "/profile.html");
    await page.locator(".profile-trade-link").first().waitFor();
    assert.ok(
      (await page.locator('a[href*="experiment.html?game="]').count()) >= 17,
    );
    assert.ok(
      (await page.locator("main").textContent()).includes("Green magnet"),
    );
    await page.goto(base + "/index.html?status=live");
    await page.locator(".market-card[data-market]").first().waitFor();
    while (await page.locator("#load-more").isVisible())
      await page.locator("#load-more").click();
    assert.equal(await page.locator(".market-card[data-market]").count(), 21);
    assert.equal(await page.locator(".market-card [data-preview]").count(), 0);
    assert.equal(
      await page
        .locator('[data-market="convection"] #convection-up')
        .getAttribute("href"),
      "experiment.html?game=convection&side=up",
    );
    await page.goto(base + "/experiment.html?game=convection");
    await page.locator("#review-trade:not([disabled])").waitFor();
    await page.locator("#review-trade").click();
    now = 120000;
    await page.waitForFunction(
      () => !document.getElementById("stage-result").hidden,
    );
    await page.locator("#confirm-submit").click();
    assert.match(await page.locator("#confirm-error").textContent(), /expired/);
    await page.locator("#confirm-cancel").click();
    assert.ok(await page.locator("#review-trade").isDisabled());
    now = 122999;
    assert.equal((await snapshot("convection")).round.id, "0");
    now = 123000;
    await page.waitForFunction(
      () =>
        document.getElementById("stage-result").hidden &&
        !document.getElementById("review-trade").disabled,
    );
    assert.equal((await snapshot("convection")).round.id, "123000");
    assert.deepEqual(errors, []);
    console.log(
      "PASS outcome switching, comments, portfolio links, catalogue, expired confirmation and three-second restart",
    );
  } finally {
    await browser.close();
    app.stop();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
