// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { seedDb } from "../../../framework/ui-kit/frontend/templates/phone-retail-crm/seed.ts";

const seed = seedDb() as unknown as Record<string, unknown[]>;

let online = true;
const posted: { url: string; body: any }[] = [];

function stubFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (!online) throw new TypeError("fetch failed");
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      posted.push({ url, body });
      const json = (o: unknown, status = 200) =>
        new Response(JSON.stringify(o), {
          status,
          headers: { "content-type": "application/json" },
        });
      if (url === "/api/health") return json({ ok: true, db: true });
      if (url === "/api/sync/load")
        return json({
          data: Object.fromEntries(
            (body.tables as string[]).map((t) => [t, seed[t] ?? []]),
          ),
        });
      return json({ saved: 1, removed: 1, rows: 1 });
    }),
  );
}

async function boot(path: string) {
  vi.resetModules();
  document.body.innerHTML = '<div id="app"></div>';
  history.replaceState(null, "", path);
  stubFetch();
  return import("../frontend/main.ts");
}

async function until(what: string, fn: () => boolean, ms = 4000) {
  const t0 = Date.now();
  while (!fn()) {
    if (Date.now() - t0 > ms) throw new Error(`timeout: ${what}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}

const q = (s: string) => document.querySelector(s);

beforeEach(() => {
  online = true;
  posted.length = 0;
});
afterEach(() => {
  vi.unstubAllGlobals();
});

test("boots, loads from the API and renders the screen of the address", async () => {
  await boot("/users");
  await until(
    "users table",
    () => document.querySelectorAll("tbody tr").length > 0,
  );
  expect(posted.some((p) => p.url === "/api/sync/load")).toBe(true);
  expect(q(".k-atop__title")?.textContent).toBe("Users");
  expect(location.pathname).toBe("/users");
  expect(document.title).toBe("Users - PhoneHub CRM");
});

test("the root redirects to the orders", async () => {
  await boot("/");
  await until("orders", () => q(".k-atop__title")?.textContent === "Orders");
  expect(location.pathname).toBe("/orders");
});

test("navigation links are real links; a click changes the address and the screen", async () => {
  await boot("/orders");
  await until("orders", () => document.querySelectorAll("tbody tr").length > 0);
  const link = q('a.ui-sidebar-button[href="/products"]') as HTMLAnchorElement;
  expect(link).toBeTruthy();
  link.click();
  await until(
    "products",
    () => q(".k-atop__title")?.textContent === "Products",
  );
  expect(location.pathname).toBe("/products");
  expect(document.title).toBe("Products - PhoneHub CRM");
});

test("a deep link opens the form of a row", async () => {
  await boot("/roles/3");
  await until("form", () => !!q("form, .ui-card input"));
  expect(q("h1, h2")?.textContent).toBeTruthy();
  expect(document.body.textContent).toContain("Edit role");
});

test("an unknown path shows the not-found screen", async () => {
  await boot("/no-such-screen");
  await until("not found", () =>
    document.body.textContent!.includes("Page not found"),
  );
  expect(document.title).toContain("not found");
});

test("a server that is down shows an error with a retry", async () => {
  online = false;
  await boot("/orders");
  await until("error", () =>
    document.body.textContent!.includes("Cannot open the database"),
  );
  expect(document.body.textContent).toContain("offline");
  online = true;
  (document.querySelector(".app-failed button") as HTMLButtonElement).click();
  await until("orders", () => document.querySelectorAll("tbody tr").length > 0);
});
