import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type pg from "pg";
import * as frontend from "../frontend/entry-server.ts";
import type { Query } from "./api.ts";
import { createPool } from "./db/pool.ts";
import { resetDatabase } from "./db/reset.ts";
import { renderDocument, renderPage } from "./ssr.ts";

const at = (path: string) => new URL(path, "http://admin.test");

describe("renderPage against Postgres", () => {
  let pool: pg.Pool;
  let query: Query;
  beforeAll(async () => {
    pool = createPool();
    await resetDatabase(pool);
    query = (sql, params = []) => pool.query(sql, params).then((r) => r.rows);
  });
  afterAll(() => pool.end());

  test("the dashboard comes with its users loaded, in the markup and in the state", async () => {
    const page = await renderPage(frontend, at("/dashboard"), query);
    expect(page.html.startsWith("<!--pavlus-->")).toBe(true);
    expect(page.html).toContain("Users (8)");
    expect(page.html).toContain("galina@example.com");
    expect(page.html).not.toContain("Loading...");
    const state = JSON.parse(page.state);
    expect(state.route).toMatchObject({ path: "/dashboard", base: "" });
    expect(state.dashboard.overview.users.items).toHaveLength(8);
    expect(state.dashboard.overview.users.status).toBe("idle");
    // the component value is serialized by name
    expect(state.dashboard.overview.usersComponent).toEqual({
      $component: "list",
    });
  });

  test("the admin page loads only its roles; the home page loads nothing", async () => {
    const admin = await renderPage(frontend, at("/admin"), query);
    expect(admin.html).toContain("Roles (3)");
    expect(admin.html).toContain("Full access to everything");
    const adminState = JSON.parse(admin.state);
    expect(adminState.admin.roles.items).toHaveLength(3);
    expect(adminState.dashboard.overview.users.items).toEqual([]);

    const home = await renderPage(frontend, at("/"), query);
    expect(home.html).toContain("Welcome");
    expect(JSON.parse(home.state).admin.roles.items).toEqual([]);
  });

  test("the shop comes with its products, billing with its last payments", async () => {
    const shopPage = await renderPage(frontend, at("/dashboard/shop"), query);
    expect(shopPage.html).toContain("The catalogue: 50 products.");
    expect(shopPage.html).toContain("Mechanical Keyboard");
    const shopState = JSON.parse(shopPage.state);
    expect(shopState.dashboard.shop.items).toHaveLength(50);
    expect(shopState.dashboard.shop.status).toBe("idle");

    const billingPage = await renderPage(
      frontend,
      at("/dashboard/billing"),
      query,
    );
    expect(billingPage.html).toContain("The last 10 payments.");
    expect(billingPage.html).toContain("Ann");
    const billingState = JSON.parse(billingPage.state);
    expect(billingState.dashboard.billing.items).toHaveLength(10);
    // the newest first
    const dates = billingState.dashboard.billing.items.map(
      (p: { paid_at: string }) => p.paid_at,
    );
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  test("the users admin page brings the table and the Edit links", async () => {
    const page = await renderPage(frontend, at("/auth/users"), query);
    expect(page.html).toContain("Everybody with an account");
    expect(page.html).toContain("galina@example.com");
    expect(page.html).toContain('href="/auth/users/1/edit"');
    expect(page.html).toContain('href="/auth/users/new"');
    const state = JSON.parse(page.state);
    expect(state.usersAdmin.items).toHaveLength(8);
    expect(state.usersAdmin.status).toBe("idle");
  });

  test("the settings page has the theme radios and the stored theme", async () => {
    const page = await renderPage(frontend, at("/system/settings"), query);
    expect(page.html).toContain('name="theme"');
    expect(page.html).toContain("Save");
    expect(page.theme).toBe("light");
    const state = JSON.parse(page.state);
    expect(state.systemSettings.theme).toBe("light");
    expect(state.systemSettings.choice).toBe("light");
  });

  test("an unknown path renders the not-found page", async () => {
    const page = await renderPage(frontend, at("/nope"), query);
    expect(page.html).toContain("There is no page at /nope.");
  });
});

describe("renderDocument", () => {
  const template = `<!doctype html>\n<html>\n  <head>\n    <title>t</title>\n  </head>\n  <body>\n    <div id="app"></div>\n    <script type="module" src="/x.js"></script>\n  </body>\n</html>`;

  test("puts the page in #app and the state in a script in <head>", () => {
    const doc = renderDocument(template, {
      html: "<!--pavlus--><p>hi</p><!--/pavlus-->",
      state: '{"n":1}',
    });
    expect(doc).toContain(
      '<div id="app"><!--pavlus--><p>hi</p><!--/pavlus--></div>',
    );
    expect(doc.indexOf("__PAVLUS_STATE__")).toBeLessThan(
      doc.indexOf("</head>"),
    );
    expect(doc).toContain(
      `<script>window.__PAVLUS_STATE__ = "{\\"n\\":1}";</script>`,
    );
  });

  test("a < in the state cannot close the script", () => {
    const doc = renderDocument(template, { html: "", state: '"</script><b>"' });
    expect(doc).not.toContain("</script><b>");
    expect(doc).toContain("\\u003c/script>\\u003cb>");
  });

  test("refuses a template without the mount point", () => {
    expect(() =>
      renderDocument("<html></html>", { html: "", state: "{}" }),
    ).toThrow(/#app|<head>/);
  });

  test("the theme is a class on <html>, before the app runs", () => {
    const dark = renderDocument(template, {
      html: "",
      state: "{}",
      theme: "dark",
    });
    expect(dark).toContain('<html class="dark">');
    const light = renderDocument(template, {
      html: "",
      state: "{}",
      theme: "light",
    });
    expect(light).toContain('<html class="light">');
    const unthemed = renderDocument(template, { html: "", state: "{}" });
    expect(unthemed).toContain("<html>");
  });
});
