// @vitest-environment jsdom
import { afterAll, beforeAll, expect, test, vi } from "vitest";
import type pg from "pg";
import * as frontend from "../entry-server.ts";
import { createPool } from "../../backend/db/pool.ts";
import { renderPage } from "../../backend/ssr.ts";
import { type Backend, startBackend } from "./backend.ts";

const text = (sel: string) =>
  [...document.querySelectorAll(sel)].map((e) => e.textContent);
const until = async (cond: () => boolean) => {
  for (let i = 0; i < 400 && !cond(); i++)
    await new Promise((r) => setTimeout(r, 5));
};

let api: Backend;
let pool: pg.Pool;
beforeAll(async () => {
  api = await startBackend();
  pool = createPool();
});
afterAll(async () => {
  await api.close();
  await pool.end();
});

test("a server-rendered page is hydrated: same nodes, no second load, then it is alive", async () => {
  // The server's side: the page and its state (backend/ssr.ts).
  const page = await renderPage(
    frontend,
    new URL("http://admin.test/dashboard"),
    (sql, params = []) => pool.query(sql, params).then((r) => r.rows),
  );
  document.body.innerHTML = `<div id="app">${page.html}</div>`;
  (globalThis as { __PAVLUS_STATE__?: string }).__PAVLUS_STATE__ = page.state;
  window.history.replaceState(null, "", "/dashboard");
  const firstUser = document.querySelector(".users__item")!;
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const pageFetch = globalThis.fetch;
  globalThis.fetch = api.fetch;
  try {
    // The browser's side: main.ts starts from the state and hydrates #app.
    const { store } = await import("../main.ts");
    expect(warn).not.toHaveBeenCalled(); // no hydration mismatch
    expect(document.querySelector(".users__item")).toBe(firstUser); // kept
    expect(text(".users .ui-card-title")).toEqual(["Users (8)"]);
    expect(text(".status")).toEqual([]); // not loading again
    await new Promise((r) => setTimeout(r, 50));
    expect(api.requests).toEqual([]);
    expect(store.getState().dashboard.overview.users.items).toHaveLength(8);
    expect(store.getState().route).toMatchObject({ path: "/dashboard" });

    // The listeners are on: a click works, and the admin page loads its data.
    (document.querySelectorAll(".users__item")[1] as HTMLElement).click();
    expect(store.getState().dashboard.overview.users.selectedId).toBe(2);
    // The admin page has no menu link any more: go there like the router does.
    window.history.pushState(null, "", "/admin");
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(window.location.pathname).toBe("/admin");
    await until(() => text(".roles__name").length > 0);
    expect(api.requests).toEqual(["GET /api/roles"]);
    expect(text(".roles__name")).toEqual(["admin", "editor", "viewer"]);
  } finally {
    globalThis.fetch = pageFetch;
    warn.mockRestore();
    delete (globalThis as { __PAVLUS_STATE__?: string }).__PAVLUS_STATE__;
  }
});
