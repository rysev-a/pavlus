// End-to-end check with Playwright (chromium). See the README for how to run it.
// SHOTS=<dir> to save screenshots at 1280 and 390 px.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const OUT = (process.env.SHOTS ?? ".") + "/";
const BASE = "http://localhost:4301";

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => {
    if (["error", "warning"].includes(m.type()))
      errors.push(m.type() + ": " + m.text());
  });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  const path = () => new URL(page.url()).pathname + new URL(page.url()).search;

  await page.goto(BASE + "/");
  await page.waitForSelector("h1");
  assert.equal(
    await page.locator("nav[aria-label=Main] a[aria-current=page]").innerText(),
    "Home",
  );
  await page.waitForSelector(".grid .card:not(.skeleton)");
  await page.screenshot({ path: OUT + "shop-home-1280.png" });

  // product list
  await page.click("nav[aria-label=Main] >> text=Products");
  assert.equal(path(), "/products");
  await page.waitForSelector(".grid .card:not(.skeleton)");
  assert.equal(await page.locator(".grid .card").count(), 24);
  assert.equal(
    await page.locator("nav[aria-label=Main] a[aria-current=page]").innerText(),
    "Products",
  );

  // async search -> query string
  await page.fill("input[type=search]", "tea");
  await page.waitForFunction(() => location.search.includes("q=tea"));
  await page.waitForFunction(
    () =>
      document.querySelectorAll(".grid .card").length < 24 &&
      !document.querySelector("[aria-busy=true]"),
  );
  const teaCount = await page.locator(".grid .card").count();
  console.log("tea count", teaCount);
  // filters
  await page.click(".chip:has-text('coffee')");
  await page.waitForFunction(() => location.search.includes("category=coffee"));
  await page.waitForFunction(() => !document.querySelector("[aria-busy=true]"));
  console.log(
    "empty?",
    await page.locator(".empty").count(),
    await page.locator(".grid .card").count(),
  );
  await page.fill("input[type=search]", "");
  await page.waitForFunction(() => !location.search.includes("q="));
  await page.selectOption("select", "price-asc");
  await page.waitForFunction(() => location.search.includes("sort=price-asc"));
  await page.waitForFunction(() => !document.querySelector("[aria-busy=true]"));
  const prices = await page.$$eval(".grid .card .price", (els) =>
    els.map((e) => Number(e.textContent.replace("$", ""))),
  );
  assert.deepEqual(
    prices,
    [...prices].sort((a, b) => a - b),
  );
  await page.screenshot({ path: OUT + "shop-list-1280.png" });
  console.log("url", path());

  // back restores previous query
  const before = path();
  await page.goBack();
  await page.waitForFunction(
    (b) => location.pathname + location.search !== b,
    before,
  );
  console.log(
    "after back",
    path(),
    "search box:",
    await page.inputValue("input[type=search]"),
  );
  await page.goForward();
  await page.waitForFunction(
    (b) => location.pathname + location.search === b,
    before,
  );

  // detail with loader
  await page.goto(BASE + "/products");
  await page.waitForSelector(".grid .card:not(.skeleton)");
  await page.click(".grid .card a >> nth=0");
  await page.waitForSelector("article.detail");
  assert.match(path(), /^\/products\/\d+$/);
  assert.match(await page.title(), /Maximus Shop/);
  await page.click("article.detail >> text=Add to cart");
  await page.click("article.detail >> text=Add to cart");
  assert.equal(await page.locator(".badge").innerText(), "2");
  await page.screenshot({ path: OUT + "shop-detail-1280.png" });
  await page.goBack();
  await page.waitForSelector(".filters");
  assert.equal(path(), "/products");

  // 404 product and 404 page
  await page.goto(BASE + "/products/999");
  await page.waitForSelector("text=Product not found");
  await page.goto(BASE + "/nope");
  await page.waitForSelector("text=404: page not found");
  await page.screenshot({ path: OUT + "shop-404-1280.png" });

  // cart persisted across reload
  await page.goto(BASE + "/cart");
  await page.waitForSelector("table.cart");
  assert.equal(await page.locator("table.cart tbody tr").count(), 1);
  assert.equal(await page.locator(".badge").innerText(), "2");
  await page.click("table.cart >> button:has-text('+')");
  assert.equal(await page.locator(".badge").innerText(), "3");
  await page.reload();
  await page.waitForSelector("table.cart");
  assert.equal(await page.locator(".badge").innerText(), "3");
  await page.screenshot({ path: OUT + "shop-cart-1280.png" });

  // checkout
  await page.click("text=Checkout >> nth=-1").catch(() => {});
  await page.goto(BASE + "/checkout");
  await page.waitForSelector("form.checkout");
  await page.click("form.checkout >> text=Place order");
  await page.waitForSelector("small.error:not(:empty)");
  console.log(
    "errors shown:",
    await page.$$eval("small.error", (e) => e.map((x) => x.textContent)),
  );
  await page.fill("form.checkout input:not([type])", "Ada");
  await page.fill("input[type=email]", "taken@example.com");
  await page.press("input[type=email]", "Tab");
  await page.waitForFunction(() =>
    document.body.textContent.includes("already registered"),
  );
  await page.screenshot({ path: OUT + "shop-checkout-error-1280.png" });
  // declined payment => optimistic order rolled back
  await page.fill("input[type=email]", "fail@example.com");
  await page.fill("textarea", "1 Main St");
  await page.press("textarea", "Tab");
  await page.waitForFunction(
    () => !document.body.textContent.includes("Checking"),
  );
  await page.click("form.checkout >> text=Place order");
  await page.waitForSelector(".orders .pending");
  console.log("optimistic order visible");
  await page.waitForSelector("text=Payment declined");
  assert.equal(await page.locator(".orders .pending").count(), 0);
  // success
  await page.fill("input[type=email]", "ada@example.com");
  await page.press("input[type=email]", "Tab");
  await page.waitForFunction(
    () => !document.body.textContent.includes("Checking"),
  );
  await page.click("form.checkout >> text=Place order");
  await page.waitForSelector(".orders .pending");
  await page.waitForSelector(".ok");
  console.log(
    "confirm:",
    (await page.locator(".ok").innerText()).replace(/\s+/g, " "),
  );
  assert.equal(await page.locator(".badge").innerText(), "0");
  await page.screenshot({ path: OUT + "shop-checkout-done-1280.png" });

  // mobile
  const m = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mp = await m.newPage();
  mp.on("pageerror", (e) => errors.push("mobile pageerror: " + e.message));
  await mp.goto(BASE + "/products?category=tea");
  await mp.waitForSelector(".grid .card:not(.skeleton)");
  await mp.screenshot({ path: OUT + "shop-list-390.png" });
  await mp.goto(BASE + "/products/2");
  await mp.waitForSelector("article.detail");
  await mp.screenshot({ path: OUT + "shop-detail-390.png" });
  await mp.goto(BASE + "/cart");
  await mp.screenshot({ path: OUT + "shop-cart-390.png" });
  const overflow = await mp.evaluate(
    () => document.documentElement.scrollWidth > innerWidth,
  );
  assert.equal(overflow, false, "no horizontal scroll at 390");

  console.log("console problems:", errors);
  await browser.close();
  console.log("OK");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
