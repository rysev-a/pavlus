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
import { type App, type Plugin, createApp } from "@service-laboratory/pavlus";
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
/** The menu flattened to its links: the categories stand in for their children. */
const LEAVES = [
  "Users",
  "Roles",
  "Permissions",
  "Sessions",
  "Dashboard",
  "Products",
  "Orders",
  "Categories",
  "Tasks",
  "Processes",
  "Notifications",
  "Settings",
];
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
  "Ergonomic Trackball",
  "Split Mechanical Keyboard",
  "Wireless Presenter",
  "Graphics Tablet",
  "Studio Microphone",
  "USB Microphone",
  "Desktop Speakers",
  "Monitor Headphones",
  "USB Audio Interface",
  "Ultrawide Monitor",
  "Portable Monitor",
  "Monitor Light Bar",
  "Monitor Arm",
  "Screen Privacy Filter",
  "NVMe SSD 2TB",
  "External HDD 4TB",
  "SD Card 256GB",
  "USB Flash Drive 128GB",
  "RAID Enclosure",
  "Wi-Fi 6 Router",
  "Mesh Wi-Fi Point",
  "Gigabit Switch 8-port",
  "USB LAN Adapter",
  "Cable Kit braided",
  "USB-C Cable 2m",
  "DisplayPort Cable 3m",
  "Adapter Set USB-C",
  "KVM Switch",
  "Cable Clips",
  "Monitor Riser",
  "Under-Desk Drawer",
  "Desk Organizer",
  "LED Desk Lamp",
  "RGB Light Strip",
  "Smart Bulb Kit",
  "Desk Floodlight",
  "Wall Charger 65W",
  "Power Bank 20000mAh",
  "UPS 850VA",
  "Magnetic Cable Manager",
];
/** Who has which role in the seed (the users, in id order). */
const USER_ROLES = [
  "admin",
  "editor",
  "editor",
  "viewer",
  "viewer",
  "editor",
  "viewer",
  "admin",
];

/** jsdom delivers `popstate` for back/forward a few ms after `history.back()`. */
const settle = () => new Promise((r) => setTimeout(r, 15));
const text = (sel: string) =>
  [...document.querySelectorAll(sel)].map((e) => e.textContent);
const click = (sel: string, index = 0) =>
  (document.querySelectorAll(sel)[index] as HTMLElement).click();
/** The highlighted link of the sidebar menu. */
const activeTop = () => text('.ui-sidebar-button[data-active="true"]');
/** Navigates to a path without a menu link: `pushState` fires no event, so the synthetic
    `popstate` is what the router itself dispatches after its own `navigate`. */
const go = (path: string) => {
  window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
};

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
  // The theme effect from `/system/settings`: the plugin puts the class on
  // `<html>` (the same wiring as in `main.ts`).
  const theme: Plugin = {
    name: "theme",
    handle(effect) {
      const t = effect.theme;
      if (t === "light" || t === "dark") {
        const root = document.documentElement;
        root.classList.remove("light", "dark");
        root.classList.add(t);
      }
    },
  };
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
      theme,
    ],
    mount: "#app",
  });
  return { store, logs };
}

describe("the sidebar menu and the pages", () => {
  test("starts on the home page: menu, active link, nothing to load", async () => {
    const { store } = setup("/");
    expect(text(".ui-sidebar-button")).toEqual([
      "Auth",
      "Dashboard",
      "Shop",
      "System",
    ]);
    expect(activeTop()).toEqual([]);
    expect(text(".index__pages a")).toEqual(LEAVES);
    expect(store.getState().route).toMatchObject({ path: "/", base: "" });
    expect(api.requests).toEqual([]);
    click(".index__pages a", 4); // Dashboard, from the home page
    expect(window.location.pathname).toBe("/dashboard");
    expect(document.querySelector(".dashboard")).not.toBeNull();
    await loaded();
  });

  test("a category opens for its own routes and its leaf is highlighted", () => {
    setup("/auth/users");
    expect(
      [...document.querySelectorAll("details.ui-sidebar-collapsible")].map(
        (d) => d.hasAttribute("open"),
      ),
    ).toEqual([true, false, false]);
    expect(text('.ui-sidebar-sub-button[data-active="true"]')).toEqual([
      "Users",
    ]);
    expect(activeTop()).toEqual([]);
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

  test("a leaf click changes the URL and swaps the page", async () => {
    setup("/dashboard");
    await loaded();
    click(".ui-sidebar-sub-button", 0); // Users, from the auth category
    expect(window.location.pathname).toBe("/auth/users");
    expect(activeTop()).toEqual([]);
    expect(text('.ui-sidebar-sub-button[data-active="true"]')).toEqual([
      "Users",
    ]);
    expect(document.querySelector(".dashboard")).toBeNull();
    await loaded();
    // the dashboard loaded its users, and the users table loads its own
    expect(api.requests).toEqual(["GET /api/users", "GET /api/users"]);
    expect(text(".auth-users .page-title")).toEqual(["Users"]);
    expect(text(".auth-users__row td:nth-child(2)")).toEqual(USERS);
  });

  test("about has no logic; its links go through the shell", async () => {
    setup("/dashboard");
    await loaded();
    go("/about");
    expect(window.location.pathname).toBe("/about");
    expect(text(".about__pages a")).toEqual(LEAVES);
    expect(api.requests).toEqual(["GET /api/users"]); // nothing to load
    click(".about__pages a", 4); // Dashboard, from inside About
    expect(window.location.pathname).toBe("/dashboard");
    expect(document.querySelector(".dashboard")).not.toBeNull();
    await loaded();
  });

  test("the brand in the sidebar is a link to the start page", () => {
    setup("/about");
    expect(document.querySelector("a.ui-brand")?.getAttribute("href")).toBe(
      "/",
    );
    click("a.ui-brand");
    expect(window.location.pathname).toBe("/");
    expect(activeTop()).toEqual([]);
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
    go("/admin"); // the admin page has no menu link any more, it is reached by URL
    await loaded();
    click(".ui-sidebar-button", 1); // Dashboard
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
    expect(activeTop()).toEqual([]); // /admin is not in the menu
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
    go("/about");
    go("/admin");
    expect(window.location.pathname).toBe("/admin");
    await loaded();
    window.history.back();
    await settle();
    expect(window.location.pathname).toBe("/about");
    expect(activeTop()).toEqual([]);
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
    go("/about");
    go("/admin");
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

describe("the generated lists", () => {
  test("the users table: every row has a checkbox, an Edit link and a trash", async () => {
    setup("/auth/users");
    await loaded();
    expect(api.requests).toEqual(["GET /api/users"]);
    // first cell is the checkbox, then Name, Email, Role, Edit, trash
    expect(text(".auth-users__row td:nth-child(4)")).toEqual(USER_ROLES);
    expect(text(".auth-users__row a")).toHaveLength(8);
    expect(text(".auth-users__row .row-delete")).toHaveLength(8);
    expect(
      document.querySelector('.auth-users th input[type="checkbox"]'),
    ).not.toBeNull();
    expect(document.querySelector('a[href="/auth/users/new"]')).not.toBeNull();
    expect(text(".auth-users .ui-cell-muted")).toContain("8 row(s)");
  });

  test("the users table: the header checkbox selects the page for a bulk delete", async () => {
    setup("/auth/users");
    await loaded();
    // one tick marks the whole page; the footer offers to remove them all
    click('.auth-users th input[type="checkbox"]');
    expect(text(".auth-users .delete-selected")).toEqual([
      "Delete selected (8)",
    ]);
    // unticking clears the selection; nothing has asked the API yet
    click('.auth-users th input[type="checkbox"]');
    expect(text(".auth-users .delete-selected")).toEqual([]);
    expect(api.requests).toEqual(["GET /api/users"]);
  });

  test("the roles list: three roles with a New button and Edit links", async () => {
    setup("/auth/roles");
    await loaded();
    expect(api.requests).toEqual(["GET /api/roles"]);
    expect(text(".auth-roles__row td:first-child")).toEqual(ROLES);
    expect(text(".auth-roles__row a")).toHaveLength(3);
    expect(document.querySelector('a[href="/auth/roles/new"]')).not.toBeNull();
  });

  test("the permissions list: twelve permissions with their role names", async () => {
    setup("/auth/permissions");
    await loaded();
    expect(api.requests).toEqual(["GET /api/permissions"]);
    expect(text(".auth-permissions__row")).toHaveLength(12);
    expect(text(".auth-permissions__row td:first-child")).toContain(
      "users.write",
    );
  });

  test("the sessions table: the users behind the sessions, deletable", async () => {
    setup("/auth/sessions");
    await loaded();
    expect(api.requests).toEqual(["GET /api/sessions"]);
    const users = text(".auth-sessions__row td:nth-child(2)");
    expect(users.length).toBeGreaterThan(0);
    for (const user of users) expect(USERS).toContain(user);
    expect(text(".auth-sessions__row .row-delete").length).toBe(users.length);
  });

  test("the shop lists: ten categories and twenty orders from the users", async () => {
    setup("/shop/categories");
    await loaded();
    expect(api.requests).toEqual(["GET /api/categories"]);
    expect(text(".shop-categories__row")).toHaveLength(10);

    api.requests.length = 0;
    setup("/shop/orders");
    await loaded();
    expect(api.requests).toEqual(["GET /api/orders"]);
    const customers = text(".shop-orders__row td:first-child");
    expect(customers).toHaveLength(20);
    for (const customer of customers) expect(USERS).toContain(customer);
  });

  test("the products table: fifty rows over five pages, paged ten at a time", async () => {
    setup("/shop/products");
    await loaded();
    expect(api.requests).toEqual(["GET /api/products"]);
    expect(text(".shop-products__row")).toHaveLength(10);
    expect(text(".shop-products .ui-cell-muted")).toContain("Page 1 of 5");
    click(".shop-products .ui-resource-pager button", 2); // page "2"
    await until(
      () => text(".shop-products__row td:nth-child(2)")[0] === PRODUCTS[10],
      "page 2",
    );
    expect(text(".shop-products .ui-cell-muted")).toContain("Page 2 of 5");
    // the rows-per-page select resizes the table
    const select = document.querySelector(
      ".shop-products .ui-data-rows-select",
    ) as HTMLSelectElement;
    select.value = "50";
    select.dispatchEvent(new Event("change"));
    await until(() => text(".shop-products__row").length === 50, "50 rows");
    expect(text(".shop-products .ui-cell-muted")).toContain("Page 1 of 1");
  });

  test("the system lists: tasks and processes are paged data tables", async () => {
    setup("/system/tasks");
    await loaded();
    expect(api.requests).toEqual(["GET /api/tasks"]);
    expect(text(".system-tasks__row")).toHaveLength(10); // page 1 of 3
    expect(text(".system-tasks .ui-cell-muted")).toContain("30 row(s)");

    api.requests.length = 0;
    setup("/system/processes");
    await loaded();
    expect(api.requests).toEqual(["GET /api/processes"]);
    expect(text(".system-processes__row")).toHaveLength(10); // page 1 of 2
    expect(text(".system-processes .ui-cell-muted")).toContain("20 row(s)");

    api.requests.length = 0;
    setup("/system/notifications");
    await loaded();
    expect(api.requests).toEqual(["GET /api/notifications"]);
    expect(text(".system-notifications__row")).toHaveLength(6);
  });

  test("the tasks table: the toolbar filters, the trash deletes without asking", async () => {
    setup("/system/tasks");
    await loaded();
    expect(api.requests).toEqual(["GET /api/tasks"]);
    expect(text(".system-tasks__row")).toHaveLength(10);
    // the search narrows the table to the Cleanup jobs
    const search = document.querySelector(
      ".system-tasks .ui-data-search input",
    ) as HTMLInputElement;
    search.value = "Cleanup";
    search.dispatchEvent(new Event("input"));
    await until(() => text(".system-tasks__row").length === 3, "the search");
    expect(text(".system-tasks__row td:nth-child(2)")).toEqual([
      "Cleanup temp files #1",
      "Cleanup temp files #11",
      "Cleanup temp files #21",
    ]);
    expect(text(".system-tasks .ui-cell-muted")).toContain("3 row(s)");
    search.value = "";
    search.dispatchEvent(new Event("input"));
    await until(
      () => text(".system-tasks__row").length === 10,
      "the query reset",
    );
    // the status facet keeps only the running jobs (the third seed run)
    expect(text(".system-tasks .ui-facet-active")).toEqual([]);
    click(".system-tasks .ui-facet-option .ui-data-check", 1); // running
    await until(() => text(".system-tasks__row").length === 8, "the facet");
    expect(text(".system-tasks__row .ui-badge")).toEqual(
      new Array(8).fill("running"),
    );
    expect(text(".system-tasks .ui-facet-active")).toEqual(["1"]);
    expect(text(".system-tasks .ui-cell-muted")).toContain("Page 1 of 1");
    // the reset brings the whole list back
    click(".system-tasks .filters-reset");
    await until(
      () => text(".system-tasks .ui-facet-active").length === 0,
      "the filter reset",
    );
    expect(text(".system-tasks__row")).toHaveLength(10);
    // to page 2, then its first two rows go in one request
    click(".system-tasks .ui-resource-pager button", 2); // the page "2"
    await until(
      () => text(".system-tasks .ui-cell-muted").includes("Page 2 of 3"),
      "page 2",
    );
    click(".system-tasks__row .ui-data-check", 0);
    click(".system-tasks__row .ui-data-check", 1);
    expect(text(".system-tasks .delete-selected")).toEqual([
      "Delete selected (2)",
    ]);
    click(".system-tasks .delete-selected");
    await until(
      () => text(".system-tasks .ui-cell-muted").includes("28 row(s)"),
      "the bulk delete",
    );
    expect(api.requests).toEqual(["GET /api/tasks", "DELETE /api/tasks/11,12"]);
    expect(text(".system-tasks__row td:nth-child(2)")[0]).toBe(
      "Send weekly digest #13",
    );
    // one row's trash: gone at once, no confirmation anywhere
    api.requests.length = 0;
    click(".system-tasks__row .row-delete", 0);
    await until(
      () => text(".system-tasks .ui-cell-muted").includes("27 row(s)"),
      "the row delete",
    );
    expect(api.requests).toEqual(["DELETE /api/tasks/13"]);
    await api.reseed();
  });
});

describe("the create and edit forms", () => {
  test("a role is created through the form and lands in the list", async () => {
    setup("/auth/roles");
    await loaded();
    click('a[href="/auth/roles/new"]');
    expect(window.location.pathname).toBe("/auth/roles/new");
    expect(text(".role-form .page-title")).toEqual(["New role"]);
    const name = document.querySelector("#role-name") as HTMLInputElement;
    name.value = "qa";
    name.dispatchEvent(new Event("input"));
    const description = document.querySelector(
      "#role-description",
    ) as HTMLTextAreaElement;
    description.value = "Tests the releases";
    description.dispatchEvent(new Event("input"));
    click('.role-form button[type="submit"]');
    await until(
      () => text(".auth-roles__row td:first-child").length === 4,
      "the new role in the list",
    );
    expect(text(".auth-roles__row td:first-child")).toEqual([...ROLES, "qa"]);
    expect(api.requests).toEqual([
      "GET /api/roles",
      "POST /api/roles",
      "GET /api/roles",
    ]);
    await api.reseed();
  });

  test("a role is edited: the form is filled from the API", async () => {
    setup("/auth/roles/1/edit");
    await until(
      () =>
        (document.querySelector("#role-name") as HTMLInputElement)?.value ===
        "admin",
      "the role to load",
    );
    expect(text(".role-form .page-title")).toEqual(["Edit role"]);
    const description = document.querySelector(
      "#role-description",
    ) as HTMLTextAreaElement;
    expect(description.value).toBe("Full access to everything");
    description.value = "Everything, really";
    description.dispatchEvent(new Event("input"));
    click('.role-form button[type="submit"]');
    await until(
      () => text(".auth-roles__row").length === 3,
      "the list after the save",
    );
    expect(text(".auth-roles__row td:nth-child(2)")).toEqual([
      "Everything, really",
      "Can change content",
      "Read only",
    ]);
    expect(api.requests).toEqual([
      "GET /api/roles/1",
      "PUT /api/roles/1",
      "GET /api/roles",
    ]);
    await api.reseed();
  });

  test("a user is created with a role picked from the select", async () => {
    setup("/auth/users");
    await loaded();
    click('a[href="/auth/users/new"]');
    expect(window.location.pathname).toBe("/auth/users/new");
    expect(text(".user-form .page-title")).toEqual(["New user"]);
    await until(
      () =>
        (document.querySelector("#user-role") as HTMLSelectElement)?.options
          ?.length === 4,
      "the roles for the select",
    );
    const name = document.querySelector("#user-name") as HTMLInputElement;
    name.value = "Zoe";
    name.dispatchEvent(new Event("input"));
    const email = document.querySelector("#user-email") as HTMLInputElement;
    email.value = "zoe@example.com";
    email.dispatchEvent(new Event("input"));
    const select = document.querySelector("#user-role") as HTMLSelectElement;
    select.value = "2";
    select.dispatchEvent(new Event("change"));
    click('.user-form button[type="submit"]');
    await until(
      () => text(".auth-users__row td:nth-child(2)").length === 9,
      "the new user in the list",
    );
    expect(text(".auth-users__row td:nth-child(2)")).toEqual([...USERS, "Zoe"]);
    expect(text(".auth-users__row td:nth-child(4)")).toEqual([
      ...USER_ROLES,
      "editor",
    ]);
    expect(api.requests).toEqual([
      "GET /api/users",
      "GET /api/roles",
      "POST /api/users",
      "GET /api/users",
    ]);
    await api.reseed();
  });

  test("a user is edited: the form is filled, the role changes", async () => {
    setup("/auth/users/2/edit");
    await until(
      () =>
        (document.querySelector("#user-name") as HTMLInputElement)?.value ===
        "Bob",
      "the user to load",
    );
    expect(text(".user-form .page-title")).toEqual(["Edit user"]);
    expect(
      (document.querySelector("#user-email") as HTMLInputElement).value,
    ).toBe("bob@example.com");
    const select = document.querySelector("#user-role") as HTMLSelectElement;
    expect(select.value).toBe("2"); // Bob is an editor
    select.value = "1";
    select.dispatchEvent(new Event("change"));
    click('.user-form button[type="submit"]');
    await until(
      () => text(".auth-users__row").length === 8,
      "the list after the save",
    );
    expect(text(".auth-users__row td:nth-child(4)")).toEqual([
      "admin",
      "admin", // Bob moved from editor to admin
      "editor",
      "viewer",
      "viewer",
      "editor",
      "viewer",
      "admin",
    ]);
    expect(api.requests).toEqual([
      "GET /api/roles",
      "GET /api/users/2",
      "PUT /api/users/2",
      "GET /api/users",
    ]);
    await api.reseed();
  });
});

describe("the settings page", () => {
  test("the theme is loaded, switched and applied to <html>", async () => {
    setup("/system/settings");
    await loaded();
    expect(api.requests).toEqual(["GET /api/settings"]);
    const light = document.querySelector(
      'input[name="theme"][value="light"]',
    ) as HTMLInputElement;
    expect(light.checked).toBe(true);

    const dark = document.querySelector(
      'input[name="theme"][value="dark"]',
    ) as HTMLInputElement;
    dark.checked = true;
    dark.dispatchEvent(new Event("change"));
    click("button.save");
    await until(
      () => document.documentElement.classList.contains("dark"),
      "the theme to apply",
    );
    expect(text(".settings__saved")).toEqual(["Theme applied"]);
    expect(api.requests).toEqual(["GET /api/settings", "PUT /api/settings"]);

    await api.reseed(); // the tests after this one want the seed's light theme
    document.documentElement.classList.remove("dark");
  });
});
