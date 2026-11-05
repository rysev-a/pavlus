// End-to-end check with Playwright (chromium). See the README for how to run it.
// SHOTS=<dir> to save screenshots at 1280 and 390 px.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const OUT = (process.env.SHOTS ?? ".") + "/";
(async () => {
  const browser = await chromium.launch();
  const page = await (
    await browser.newContext({ viewport: { width: 1280, height: 900 } })
  ).newPage();
  const errors = [];
  page.on("console", (m) => {
    if (["error", "warning"].includes(m.type())) errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push("pageerror " + e.message));
  await page.goto("http://localhost:4302/");
  await page.selectOption("select", "250");
  await page.waitForFunction(
    () => document.querySelectorAll("table.sales tbody tr").length >= 12,
  );
  const rows = await page.locator("tbody tr").count();
  console.log("rows", rows);
  // key identity: remember a row, let more arrive
  await page.evaluate(() => {
    const r = document.querySelector("tbody tr:last-child");
    window.__row = r;
    window.__id = r.cells[0].textContent;
  });
  await page.waitForTimeout(800);
  // sorting by amount keeps row elements
  await page.click("th button:has-text('Amount')");
  assert.equal(
    await page.locator("th:has-text('Amount')").getAttribute("aria-sort"),
    "descending",
  );
  const amounts = await page.$$eval("tbody tr td:nth-child(4)", (t) =>
    t.map((x) => Number(x.textContent.replace("$", ""))),
  );
  assert.deepEqual(
    amounts,
    [...amounts].sort((a, b) => b - a),
  );
  const same = await page.evaluate(() => {
    const el = [...document.querySelectorAll("tbody tr")].find(
      (r) => r.cells[0].textContent === window.__id,
    );
    return el === window.__row;
  });
  console.log("row element identity kept across sort + new rows:", same);
  await page.click("th button:has-text('Region')");
  assert.equal(
    await page.locator("th:has-text('Region')").getAttribute("aria-sort"),
    "ascending",
  );
  // pause stops the stream
  await page.click("button:has-text('Pause')");
  const a = await page.locator("tbody tr").count(),
    idA = await page.locator("tbody tr td:first-child").first().textContent();
  const ids = async () =>
    (
      await page.$$eval("tbody tr td:first-child", (t) =>
        t.map((x) => x.textContent),
      )
    ).join();
  const before = await ids();
  await page.waitForTimeout(1200);
  assert.equal(await ids(), before, "paused: no new rows");
  await page.click("button:has-text('Resume')");
  await page.waitForFunction(
    (b) =>
      [...document.querySelectorAll("tbody tr td:first-child")]
        .map((x) => x.textContent)
        .join() !== b,
    before,
  );
  await page.waitForTimeout(1500);
  // charts have content
  const circles = await page.locator("svg circle[stroke-dasharray]").count();
  const rects = await page.locator("svg g.bar rect").count();
  const path = await page.getAttribute("svg path.line", "d");
  console.log(
    "donut arcs",
    circles,
    "bars",
    rects,
    "line d length",
    path.length,
  );
  assert.equal(circles, 3);
  assert.equal(rects, 4);
  assert.ok(path.length > 20);
  console.log(
    "aria:",
    await page.getAttribute(
      "svg[aria-label^='Revenue by region']",
      "aria-label",
    ),
  );
  await page.screenshot({ path: OUT + "dashboard-1280.png" });
  // reset
  await page.click("button:has-text('Reset')");
  await browser.close();
  const m = await (
    await chromium.launch()
  ).newContext({ viewport: { width: 390, height: 844 } });
  const mp = await m.newPage();
  await mp.goto("http://localhost:4302/");
  await mp.selectOption("select", "250");
  await mp.waitForFunction(
    () => document.querySelectorAll("table.sales tbody tr").length >= 8,
  );
  await mp.waitForTimeout(1000);
  await mp.screenshot({ path: OUT + "dashboard-390.png", fullPage: true });
  assert.equal(
    await mp.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
  );
  console.log("console problems", errors);
  console.log("OK");
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
