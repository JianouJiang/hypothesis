/* Real browser, isolated HTTP server; never sends email or writes to production. */
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { createApp } = require("../server");
(async () => {
  const adminToken = "browser-test-owner-".repeat(4);
  const app = createApp({ persist: false, adminToken });
  await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1100 },
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    const post = async (text) => {
      await page.locator("#community-draft").fill(text);
      await page
        .locator("#community-composer button[type=submit]:not([disabled])")
        .click();
      await page.waitForFunction(
        (text) =>
          document
            .querySelector("#community-content")
            .textContent.includes(text),
        text,
      );
    };
    for (const game of ["bitcoin", "aerofoil", "galton", "escape"]) {
      await page.goto(`${base}/${game}.html`);
      await post(
        `${game}: comparing initial conditions <img src=x onerror=alert(1)>`,
      );
      assert.equal(await page.locator(".community-text img").count(), 0);
      assert.equal(await page.locator(".community-comment").count(), 1);
      assert.equal(await page.locator(".brand").innerText(), "Hypothesis");
      assert.equal(
        (await page.locator("body").innerText())
          .toLowerCase()
          .includes("polymarket"),
        false,
      );
      assert.equal(
        await page
          .locator('.community-contact a[href="mailto:jianou.works@gmail.com"]')
          .count(),
        1,
      );
    }
    const commentId = await page
      .locator(".community-comment")
      .getAttribute("id");
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    otherPage.on("pageerror", (e) => errors.push(e.message));
    await otherPage.goto(`${base}/escape.html#${commentId}`);
    await otherPage.locator(".community-comment").waitFor();
    await otherPage.locator("[data-like]").click();
    await otherPage.locator("[data-like][aria-pressed=true]").waitFor();
    await otherPage.locator("[data-reply]").click();
    await otherPage
      .locator("#community-reply-draft")
      .fill("I get a different impact angle.");
    await otherPage
      .locator(".community-reply-form button[type=submit]")
      .click();
    await otherPage.locator(".community-comment.is-reply").waitFor();
    await otherPage
      .locator(".community-comment")
      .first()
      .locator(".community-menu summary")
      .first()
      .click();
    assert.equal(
      await otherPage
        .locator(".community-comment")
        .first()
        .locator("[data-delete]")
        .count(),
      1,
    ); // Own reply only.
    await otherPage.locator("[data-report]").first().click();
    await otherPage.locator("#community-report button[type=submit]").click();
    await otherPage.waitForFunction(() =>
      document
        .querySelector("#community-report [role=status]")
        .textContent.includes("Report sent"),
    );
    await otherPage.locator("#community-report [data-close]").click();
    await page.reload();
    await page.locator("[data-replies]").click();
    await page.locator(".community-comment.is-reply").waitFor();
    await page.locator("[data-community-tab=holders]").click();
    await page.locator("[data-community-tab=positions]").click();
    await page.locator("[data-community-tab=activity]").click();
    await page.locator("[data-community-tab=comments]").click();
    await page.locator("#community-sort").selectOption("liked");
    await page.locator("#community-holders").check();
    await page.locator(".community-empty").waitFor();
    await page.locator("#community-holders").uncheck();
    await page.locator(".community-comment").first().waitFor();
    await page.locator("#comments").scrollIntoViewIfNeeded();
    await page.screenshot({ path: "/tmp/hypothesis-comments-desktop.png" });
    await page.locator(".community-contact [data-feedback]").click();
    await page
      .locator("#community-feedback [name=message]")
      .fill("The experiment is useful; add a Reynolds-number challenge.");
    await page
      .locator("#community-feedback [name=email]")
      .fill("qa-private@example.test");
    assert.equal(
      await page.locator("#community-feedback [name=updates]").isChecked(),
      false,
    );
    await page.locator("#community-feedback [name=updates]").check();
    await page.locator("#community-feedback button[type=submit]").click();
    await page.waitForFunction(() =>
      document
        .querySelector("#community-feedback [role=status]")
        .textContent.includes("feedback is saved"),
    );
    await page.locator("#community-feedback [data-close]").click();
    const publicFeed = await (
      await other.request.get(`${base}/api/community?game=escape`)
    ).json();
    assert.equal(
      JSON.stringify(publicFeed).includes("qa-private@example.test"),
      false,
    );
    const owner = await browser.newPage();
    owner.on("pageerror", (e) => errors.push(e.message));
    await owner.goto(`${base}/inbox.html`);
    await owner.locator("#inbox-key").fill(adminToken);
    await owner.locator("#inbox-login button").click();
    await owner.locator("#inbox-dashboard:not([hidden])").waitFor();
    assert.match(
      await owner.locator("#inbox-feedback").innerText(),
      /qa-private@example.test/,
    );
    assert.equal(await owner.locator("#inbox-contacts .inbox-card").count(), 1);
    assert.equal(await owner.locator("#inbox-reports .inbox-card").count(), 1);
    assert.equal(await owner.locator("#inbox-key").inputValue(), "");
    const download = owner.waitForEvent("download");
    await owner.locator("#inbox-export").click();
    assert.equal((await download).suggestedFilename(), "physics-inbox.json");
    await owner.locator("[data-action=moderate]").click();
    await owner.locator("[data-action=moderate][data-hidden=false]").waitFor();
    await owner.locator("[data-action=moderate]").click();
    await owner.locator("[data-action=moderate][data-hidden=true]").waitFor();
    await page.locator(".community-contact [data-privacy]").click();
    await page.locator("#community-forget-email").click();
    await page.waitForFunction(() =>
      document
        .querySelector("#community-privacy [role=status]")
        .textContent.includes("have been removed"),
    );
    await page.locator("#community-usage").uncheck();
    await page.locator("#community-privacy [data-close]").click();
    await owner.locator("#inbox-refresh").click();
    await owner.waitForFunction(
      () => !document.querySelector("#inbox-contacts .inbox-card"),
    );
    assert.equal(
      (await owner.locator("#inbox-feedback").innerText()).includes(
        "qa-private@example.test",
      ),
      false,
    );
    await page.goto(`${base}/index.html`);
    await page.waitForFunction(() => window.PhysicsSession?.mode === "server");
    assert.equal(
      await page.evaluate(() => localStorage.getItem("physics-usage-opt-out")),
      "true",
    );
    for (const name of [
      "index",
      "bitcoin",
      "aerofoil",
      "galton",
      "escape",
      "profile",
      "competitions",
    ]) {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`${base}/${name}.html`);
      await page.locator(".community-contact").waitFor();
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
        `${name} mobile overflow`,
      );
      assert.equal(
        (await page.locator("body").innerText())
          .toLowerCase()
          .includes("polymarket"),
        false,
      );
    }
    await page.goto(`${base}/galton.html`);
    await page.locator("#comments").scrollIntoViewIfNeeded();
    await page.screenshot({ path: "/tmp/hypothesis-comments-mobile.png" });
    await page.locator(".community-contact [data-feedback]").click();
    await page.screenshot({ path: "/tmp/hypothesis-feedback-mobile.png" });
    const dntContext = await browser.newContext();
    await dntContext.addInitScript(() =>
      Object.defineProperty(navigator, "doNotTrack", { get: () => "1" }),
    );
    const dntPage = await dntContext.newPage();
    let events = 0;
    dntPage.on("request", (req) => {
      if (req.postData()?.includes('"action":"event"')) events++;
    });
    await dntPage.goto(`${base}/bitcoin.html`);
    await dntPage.waitForFunction(
      () => window.PhysicsSession?.mode === "server",
    );
    assert.equal(await dntPage.locator("#community-usage").isChecked(), false);
    assert.equal(await dntPage.locator("#community-usage").isDisabled(), true);
    assert.equal(events, 0);
    await owner.locator("#inbox-lock").click();
    assert.equal(await owner.locator("#inbox-feedback").innerText(), "");
    assert.deepEqual(errors, []);
    console.log(
      "Community/browser PASS: four games, two guests, replies, likes, filters, reports, private emails, owner export, erasure, opt-out, DNT, seven mobile pages and Hypothesis branding.",
    );
  } finally {
    await browser.close();
    await new Promise((r) => {
      app.server.once("close", r);
      app.stop();
    });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
