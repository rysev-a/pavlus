// End-to-end check with Playwright (chromium). See the README for how to run it.
// SHOTS=<dir> to save screenshots at 1280 and 390 px.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const OUT = (process.env.SHOTS ?? ".") + "/";
(async () => {
  const browser = await chromium.launch();
  for (const mode of ["", "?stream"]) {
    const page = await (
      await browser.newContext({ viewport: { width: 1280, height: 800 } })
    ).newPage();
    const problems = [];
    page.on("console", (m) => {
      if (["error", "warning"].includes(m.type())) problems.push(m.text());
    });
    page.on("pageerror", (e) => problems.push("pageerror " + e.message));
    await page.addInitScript(() => {
      document.addEventListener("readystatechange", () => {
        if (document.readyState === "interactive") {
          window.__h1 = document.querySelector("h1");
          window.__article = document.querySelector("article");
          window.__busy = 0;
          new MutationObserver(() => {
            if (document.querySelector("[aria-busy=true]")) window.__busy++;
          }).observe(document, {
            subtree: true,
            childList: true,
            attributes: true,
          });
        }
      });
    });
    // no JS first: the server HTML alone has the content
    const raw = await (
      await page.request.get("http://localhost:4400/products/3" + mode)
    ).text();
    assert.match(raw, /Jasmine Pearl/);
    await page.goto("http://localhost:4400/products/3" + mode);
    await page.waitForSelector("article.detail h1");
    await page.waitForTimeout(600); // a refetch would show here (latency 80 ms in the server, 250 ms in the browser)
    const info = await page.evaluate(() => ({
      sameH1: window.__h1 === document.querySelector("h1"),
      sameArticle: window.__article === document.querySelector("article"),
      busy: window.__busy,
      stateLeft: !!document.getElementById("__MAXIMUS_STATE__"),
      title: document.title,
    }));
    console.log(mode || "string", info);
    assert.equal(info.sameH1, true);
    assert.equal(info.sameArticle, true);
    assert.equal(info.stateLeft, false);
    if (mode === "") await page.screenshot({ path: OUT + "ssr-1280.png" });
    // interactive after hydration
    await page.click("text=Add to cart");
    await page.click("text=Add to cart");
    assert.equal(await page.locator("output").innerText(), "2");
    // client navigation to another product and back
    await page.click("nav >> text=Sencha");
    await page.waitForSelector("h1:has-text('Sencha')");
    assert.equal(new URL(page.url()).pathname, "/products/1");
    await page.goBack();
    await page.waitForSelector("h1:has-text('Jasmine Pearl')");
    assert.equal(new URL(page.url()).pathname, "/products/3");
    console.log("problems", problems);
    assert.equal(problems.length, 0);
    await page.close();
  }
  const m = await (
    await browser.newContext({ viewport: { width: 390, height: 844 } })
  ).newPage();
  await m.goto("http://localhost:4400/products/5");
  await m.waitForSelector("article.detail");
  await m.screenshot({ path: OUT + "ssr-390.png" });
  assert.equal(
    await m.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
  );
  await browser.close();
  console.log("OK");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
