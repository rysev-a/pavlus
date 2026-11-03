// @vitest-environment jsdom
import { expect, test } from "vitest";
import { startBackend } from "./backend.ts";

const text = (sel: string) =>
  [...document.querySelectorAll(sel)].map((e) => e.textContent);

test("main.ts boots the whole app on the dashboard route, like the browser does", async () => {
  document.body.innerHTML = `<div id="app"></div>`;
  window.history.replaceState(null, "", "/dashboard");
  // main.ts uses the page's `fetch` with relative urls, as in the browser;
  // here the page's `fetch` is the real API on a port of its own.
  const api = await startBackend();
  const pageFetch = globalThis.fetch;
  globalThis.fetch = api.fetch;
  try {
    const { store } = await import("../main.ts");
    expect(text(".ui-sidebar-button")).toEqual([
      "Auth",
      "Dashboard",
      "Shop",
      "System",
    ]);
    expect(text(".status")).toEqual(["Loading..."]);
    await new Promise((r) => setTimeout(r, 200)); // a round trip to Postgres

    // only the dashboard's data: the admin page loads its own when visited
    expect(api.requests).toEqual(["GET /api/users"]);
    expect(text(".users .ui-card-title")).toEqual(["Users (8)"]);
    expect(text(".users__name").slice(0, 2)).toEqual(["Ann", "Bob"]);
    expect(store.getState().route).toEqual({
      path: "/dashboard",
      base: "",
      params: {},
      search: "",
      hash: "",
    });
  } finally {
    globalThis.fetch = pageFetch;
    await api.close();
  }
});
