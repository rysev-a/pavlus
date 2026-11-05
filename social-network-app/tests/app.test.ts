// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test } from "vitest";
import { createApp } from "@service-laboratory/pavlus";
import {
  DomPlugin,
  createRouterPlugin,
  createStorePlugin,
  createTimePlugin,
} from "@service-laboratory/pavlus/plugins";
import { createThemePlugin } from "../../ui-kit/frontend/theme.ts";
import { seedDb } from "../../ui-kit/frontend/templates/orbit-social/seed.ts";
import { app as shell, type AppState, initialState } from "../app/app.ts";
import { createHttpIdbPlugin } from "../frontend/http-backend.ts";
import { createTitlePlugin } from "../frontend/title.ts";

const db = seedDb();
const wait = async (cond: () => boolean, ms = 8000) => {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error("timeout");
    await new Promise((r) => setTimeout(r, 10));
  }
};

/** A stubbed /api: the seed on load, `ok` switches it to a failing server. */
const server = { fail: "" };
const stub = (async (url: string) => {
  const json = (s: number, o: unknown) =>
    new Response(JSON.stringify(o), { status: s });
  if (url === "/api/health")
    return server.fail === "offline"
      ? Promise.reject(new TypeError("down"))
      : json(200, { ok: true });
  if (server.fail === "offline") throw new TypeError("down");
  if (server.fail) return json(500, { error: server.fail });
  if (url === "/api/sync/load") return json(200, { data: db });
  return json(200, {});
}) as typeof fetch;

let handle: { dispose?: () => void } | undefined;
function boot(path: string) {
  document.body.innerHTML = '<div id="app"></div>';
  history.replaceState(null, "", path);
  const store = createStorePlugin<AppState>(initialState());
  handle = createApp<AppState>({
    app: shell,
    plugins: [
      store,
      new DomPlugin(),
      createRouterPlugin(),
      createTimePlugin(),
      createHttpIdbPlugin({ fetch: stub }),
      createThemePlugin(),
      createTitlePlugin(),
    ],
    mount: "#app",
  }) as never;
  return store;
}
const text = () => document.body.textContent ?? "";

beforeEach(() => {
  server.fail = "";
  localStorage.clear();
});
afterEach(() => handle?.dispose?.());

test("boots, loads over HTTP and shows the sign-in screen at /login", async () => {
  boot("/login");
  expect(document.querySelector(".orbit__splash")).not.toBeNull();
  await wait(() => !!document.querySelector(".orbit__auth"));
  expect(text()).toContain("Sign in");
  expect(location.pathname).toBe("/login");
  expect(document.title).toBe("Sign in · Orbit");
});

test("a deep link of a signed-out visitor goes to /login?next=, and back after sign-in", async () => {
  boot("/music");
  await wait(() => !!document.querySelector(".orbit__auth"));
  expect(location.pathname + location.search).toBe("/login?next=%2Fmusic");
  (document.querySelector(".orbit__demobtns button") as HTMLElement).click();
  await wait(() => !!document.querySelector(".k-ashell"));
  expect(location.pathname).toBe("/music");
  expect(document.title).toBe("Music · Orbit");
  expect(document.querySelector(".k-atop__title")?.textContent).toBe("Music");
});

test("a signed-in visitor: nav links are real, clicking one changes the path", async () => {
  localStorage.setItem(
    "orbit-social:session",
    JSON.stringify([{ id: 1, userId: db.users[0].id }]),
  );
  boot("/photos");
  await wait(() => !!document.querySelector(".k-ashell"));
  expect(document.querySelector(".k-atop__title")?.textContent).toBe("Photos");
  const link = document.querySelector(
    'a.ui-sidebar-button[href="/communities"]',
  ) as HTMLElement;
  expect(link).not.toBeNull();
  link.click();
  await wait(() => location.pathname === "/communities");
  expect(document.querySelector(".k-atop__title")?.textContent).toBe(
    "Communities",
  );
  history.back();
  await wait(
    () => document.querySelector(".k-atop__title")?.textContent === "Photos",
  );
});

test("an unknown path is the not-found page", async () => {
  boot("/nope");
  await wait(() => text().includes("Page not found"));
  expect(document.querySelector(".k-ashell")).toBeNull();
});

test("a failed load shows the error and a retry that works", async () => {
  server.fail = "database exploded";
  boot("/login");
  await wait(() => text().includes("Orbit could not be opened"));
  expect(text()).toContain("database exploded");
  server.fail = "";
  (document.querySelector(".orbit-app__card button") as HTMLElement).click();
  await wait(() => !!document.querySelector(".orbit__auth"));
});

test("an offline server says so", async () => {
  server.fail = "offline";
  boot("/login");
  await wait(() => text().includes("The server is offline"));
});
