// @vitest-environment jsdom
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "vitest";
import { type App, createApp } from "@service-laboratory/pavlus";
import {
  createDomPlugin,
  createHttpPlugin,
  createLoggerPlugin,
  createRouterPlugin,
  createStorePlugin,
} from "@service-laboratory/pavlus/plugins";
import { app as shell, type AppState, initialState } from "../app.ts";
import { list, table } from "../modules/users/users.ts";
import { type Backend, startBackend } from "./backend.ts";

// The seed (backend/db/seed.sql), as the API answers it.
const USERS = [
  "Ann",
  "Bob",
  "Anton",
  "Clara",
  "Dmitry",
  "Elena",
  "Fedor",
  "Galina",
];
const ROLES = ["admin", "editor", "viewer"];
const ROLE_COUNTS = ["2 users", "3 users", "3 users"];
const PRODUCTS = [
  "Mechanical Keyboard",
  "Wireless Mouse",
  "USB-C Dock",
  "4K Monitor",
  "Laptop Stand",
  "Webcam 1080p",
  "Noise-Cancelling Headset",
  "External SSD 1TB",
  "Desk Mat",
  "HDMI Cable 2m",
];

/** jsdom delivers `popstate` for back/forward a few ms after `history.back()`. */
const settle = () => new Promise((r) => setTimeout(r, 15));
const text = (sel: string) =>
  [...document.querySelectorAll(sel)].map((e) => e.textContent);
const click = (sel: string, index = 0) =>
  (document.querySelectorAll(sel)[index] as HTMLElement).click();
/** The highlighted link of the top menu. */
const activeTop = () => text(".top-menu__link--active");

/** Waits for `cond`; the API answers over a real socket, so it takes a moment. */
async function until(cond: () => boolean, what = "the condition") {
  for (let i = 0; i < 400; i++) {
    if (cond()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error(`timed out waiting for ${what}; status: ${text(".status")}`);
}
/** Until nothing on the page is loading any more. */
const loaded = () =>
  until(() => document.querySelector(".status") === null, "the data");

let api: Backend;
let app: App | undefined;
beforeAll(async () => {
  api = await startBackend();
});
afterAll(() => api.close());
beforeEach(() => {
  api.requests.length = 0;
});
// An app left running would keep listening to the router (and the requests
// are counted per test), so each test gets a fresh one.
afterEach(() => {
  app?.dispose();
  app = undefined;
});

/** Boots the shell at `path` with the real router and the real API. */
function setup(path = "/") {
  document.body.innerHTML = `<div id="app"></div>`;
  window.history.replaceState(null, "", path);
  const logs: unknown[][] = [];
  const store = createStorePlugin<AppState>(initialState);
  app?.dispose();
  app = createApp<AppState>({
    app: shell,
    plugins: [
      store,
      createDomPlugin(),
      createHttpPlugin({ fetch: api.fetch }),
      createLoggerPlugin({
        sink: {
          debug() {},
          warn() {},
          error() {},
          info: (...a) => logs.push(a),
        },
      }),
      createRouterPlugin(),
    ],
    mount: "#app",
  });
  return { store, logs };
}

describe("the top menu and the pages", () => {
  test("starts on the home page: menu, active link, nothing to load", async () => {
    const { store } = setup("/");
    expect(text(".top-menu__link")).toEqual([
      "Home",
      "Dashboard",
      "About",
      "Admin",
    ]);
    expect(activeTop()).toEqual(["Home"]);
    expect(text(".index__pages a")).toEqual(["Dashboard", "About", "Admin"]);
    expect(store.getState().route).toMatchObject({ path: "/", base: "" });
    expect(api.requests).toEqual([]);
    click(".index__pages a", 0); // Dashboard, from the home page
    expect(window.location.pathname).toBe("/dashboard");
    expect(document.querySelector(".dashboard")).not.toBeNull();
    await loaded();
  });

  test("the dashboard: active link, and only the dashboard's data", async () => {
    const { store } = setup("/dashboard");
    expect(activeTop()).toEqual(["Dashboard"]);
    expect(document.querySelector(".dashboard")).not.toBeNull();
    expect(store.getState().route).toMatchObject({
      path: "/dashboard",
      base: "",
    });
    expect(text(".status")).toEqual(["Loading..."]);
    await loaded();
    expect(api.requests).toEqual(["GET /api/users"]);
    expect(text(".users__name")).toEqual(USERS);
    expect(text(".users .ui-card-title")).toEqual(["Users (8)"]);
  });

  test("a click changes the URL and swaps the page; the page loads when entered", async () => {
    setup("/dashboard");
    await loaded();
    click(".top-menu__link", 3); // Admin
    expect(window.location.pathname).toBe("/admin");
    expect(activeTop()).toEqual(["Admin"]);
    expect(document.querySelector(".dashboard")).toBeNull();
    expect(text(".status")).toEqual(["Loading..."]);
    await loaded();
    expect(api.requests).toEqual(["GET /api/users", "GET /api/roles"]);
    expect(text(".roles__name")).toEqual(ROLES);
    expect(text(".roles__count")).toEqual(ROLE_COUNTS);
  });

  test("about has no logic; its links go through the shell", async () => {
    setup("/dashboard");
    await loaded();
    click(".top-menu__link", 2); // About
    expect(window.location.pathname).toBe("/about");
    expect(text(".about__pages a")).toEqual([
      "Home",
      "Dashboard",
      "About",
      "Admin",
    ]);
    expect(api.requests).toEqual(["GET /api/users"]); // nothing to load
    click(".about__pages a", 3); // Admin, from inside About
    expect(window.location.pathname).toBe("/admin");
    expect(document.querySelector(".admin")).not.toBeNull();
    await loaded();
  });

  test("the brand in the header is a link to the start page", () => {
    setup("/about");
    expect(document.querySelector("a.ui-brand")?.getAttribute("href")).toBe(
      "/",
    );
    click("a.ui-brand");
    expect(window.location.pathname).toBe("/");
    expect(activeTop()).toEqual(["Home"]);
    expect(document.querySelector(".index")).not.toBeNull();
    expect(api.requests).toEqual([]);
  });

  test("an unknown path shows 'not found' with a way home", () => {
    setup("/nope");
    expect(activeTop()).toEqual([]);
    expect(text(".not-found .page-title")).toEqual(["Page not found"]);
    expect(text(".not-found .page-intro")).toEqual([
      "There is no page at /nope.",
    ]);
    expect(api.requests).toEqual([]);
    click(".not-found a");
    expect(window.location.pathname).toBe("/");
    expect(document.querySelector(".index")).not.toBeNull();
  });

  test("coming back to a page loads its data again", async () => {
    setup("/dashboard");
    await loaded();
    click(".top-menu__link", 3); // Admin
    await loaded();
    click(".top-menu__link", 1); // Dashboard
    await loaded();
    expect(api.requests).toEqual([
      "GET /api/users",
      "GET /api/roles",
      "GET /api/users",
    ]);
  });
});

describe("the admin page", () => {
  test("a direct load of /admin shows the roles and loads only them", async () => {
    setup("/admin");
    expect(activeTop()).toEqual(["Admin"]);
    expect(text(".admin .page-title")).toEqual(["Admin"]);
    await loaded();
    expect(api.requests).toEqual(["GET /api/roles"]);
    expect(text(".roles__name")).toEqual(ROLES);
    expect(text(".roles__description")).toEqual([
      "Full access to everything",
      "Can change content",
      "Read only",
    ]);
    expect(text(".roles__count")).toEqual(ROLE_COUNTS);
  });

  test("the browser's back button walks back through the pages", async () => {
    setup("/dashboard");
    await loaded();
    click(".top-menu__link", 2); // About
    click(".top-menu__link", 3); // Admin
    expect(window.location.pathname).toBe("/admin");
    await loaded();
    window.history.back();
    await settle();
    expect(window.location.pathname).toBe("/about");
    expect(activeTop()).toEqual(["About"]);
    expect(document.querySelector(".admin")).toBeNull();
    window.history.back();
    await settle();
    expect(activeTop()).toEqual(["Dashboard"]);
    expect(document.querySelector(".dashboard")).not.toBeNull();
    await loaded();
  });

  test("leaving the admin page and coming back loads the roles again", async () => {
    setup("/admin");
    await loaded();
    click(".top-menu__link", 2); // About
    click(".top-menu__link", 3); // Admin
    await loaded();
    expect(api.requests).toEqual(["GET /api/roles", "GET /api/roles"]);
  });
});

describe("the dashboard page", () => {
  test("the filter flows down to the users list", async () => {
    setup("/dashboard");
    await loaded();
    const input = document.querySelector(".filter") as HTMLInputElement;
    input.value = "An";
    input.dispatchEvent(new Event("input"));
    expect(text(".users__name")).toEqual(["Ann", "Anton"]);
  });

  test("select and remove reach the users child; the dashboard observes remove", async () => {
    const { store, logs } = setup("/dashboard");
    await loaded();
    click(".users__item", 1); // Bob
    expect(store.getState().dashboard.overview.users.selectedId).toBe(2);
    click(".users__remove", 0); // Ann: DELETE /api/users/1 first, then out of the list
    await until(() => !text(".users__name").includes("Ann"), "the removal");
    expect(text(".users__name")).toEqual(USERS.slice(1));
    expect(logs).toEqual([["user removed", 1]]);
    expect(api.requests).toContain("DELETE /api/users/1");
    await api.reseed(); // the tests after this one want the full seed
  });

  test("switching the component value replaces the markup and keeps the state", async () => {
    const { store } = setup("/dashboard");
    await loaded();
    click(".users__item", 2); // select Anton
    click(".switch");
    expect(store.getState().dashboard.overview.usersComponent).toBe(table);
    expect(text(".users-table td:first-child")).toEqual(USERS);
    expect(
      document.querySelector(".users-table__row--selected td")?.textContent,
    ).toBe("Anton");
    click(".switch");
    expect(store.getState().dashboard.overview.usersComponent).toBe(list);
    expect(text(".users__name")).toEqual(USERS);
  });

  test("reload asks the users child to load again", async () => {
    setup("/dashboard");
    await loaded();
    click(".reload");
    expect(text(".status")).toEqual(["Loading..."]);
    await loaded();
    expect(api.requests).toEqual(["GET /api/users", "GET /api/users"]);
  });
});

describe("the dashboard's own pages", () => {
  const hrefs = () =>
    [...document.querySelectorAll(".tabs__link")].map((a) =>
      a.getAttribute("href"),
    );
  const activeTab = () => text(".tabs__link--active");

  test("a direct load of /dashboard/shop: the tab bar, absolute hrefs, the products", async () => {
    const { store } = setup("/dashboard/shop");
    expect(activeTop()).toEqual(["Dashboard"]);
    expect(text(".tabs__link")).toEqual(["Overview", "Shop", "Billing"]);
    expect(hrefs()).toEqual([
      "/dashboard",
      "/dashboard/shop",
      "/dashboard/billing",
    ]);
    expect(activeTab()).toEqual(["Shop"]);
    expect(text(".shop .page-subtitle")).toEqual(["Shop"]);
    expect(document.querySelector(".overview")).toBeNull();
    // the dashboard sees only the part of the path below its base
    expect(store.getState().route).toMatchObject({ path: "/dashboard/shop" });
    await loaded();
    expect(api.requests).toEqual(["GET /api/products"]);
    expect(text(".shop__name")).toEqual(PRODUCTS);
  });

  test("the tabs navigate relative to the dashboard; each page loads when entered", async () => {
    setup("/dashboard/shop");
    await loaded();
    click(".tabs__link", 2); // Billing
    expect(window.location.pathname).toBe("/dashboard/billing");
    expect(activeTab()).toEqual(["Billing"]);
    expect(text(".billing .page-subtitle")).toEqual(["Billing"]);
    expect(document.querySelector(".dashboard")).not.toBeNull(); // the layout stays
    await loaded();
    click(".tabs__link", 0); // Overview
    expect(window.location.pathname).toBe("/dashboard");
    expect(activeTab()).toEqual(["Overview"]);
    expect(text(".status")).toEqual(["Loading..."]);
    await loaded();
    expect(text(".users__name")).toEqual(USERS);
    click(".tabs__link", 1); // Shop
    expect(window.location.pathname).toBe("/dashboard/shop");
    expect(document.querySelector(".overview")).toBeNull();
    await loaded();
    // every enter loads its own page's data, again
    expect(api.requests).toEqual([
      "GET /api/products",
      "GET /api/payments",
      "GET /api/users",
      "GET /api/products",
    ]);
  });

  test("an unknown sub-path shows 'not found' inside the dashboard; its link goes to the overview", async () => {
    setup("/dashboard/nope");
    expect(activeTop()).toEqual(["Dashboard"]);
    expect(activeTab()).toEqual([]);
    expect(text(".dashboard .not-found .page-intro")).toEqual([
      "There is no page at /nope.",
    ]);
    expect(document.querySelector(".not-found a")?.getAttribute("href")).toBe(
      "/dashboard",
    );
    click(".not-found a");
    expect(window.location.pathname).toBe("/dashboard");
    expect(activeTab()).toEqual(["Overview"]);
    await loaded();
  });
});
