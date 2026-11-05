// @vitest-environment jsdom
import { afterAll, beforeAll, expect, test } from "vitest";
// The real API on a real Postgres, like the browser sees it (backend/server.ts
// with the frontend off; the database is reseeded first).
import { startBackend, type Backend } from "./backend.ts";

let backend: Backend;

beforeAll(async () => {
  backend = await startBackend();
});

afterAll(async () => {
  // Leave the development database as it was.
  await backend.reseed();
  await backend.close();
});

const rows = () => document.querySelectorAll("tbody tr");
const text = (sel: string) => document.querySelector(sel)?.textContent;

/** The sidebar's menu link (the app has one section: Users). */
const menuLink = () =>
  document.querySelector("a.ui-sidebar-button") as HTMLAnchorElement;

/** Types into the field and lets the view record it in the state. */
const type = (sel: string, value: string) => {
  const el = document.querySelector(sel) as HTMLInputElement;
  el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
};

/** Picks an option in a select and lets the view record the choice. */
const pick = (sel: string, value: string) => {
  const el = document.querySelector(sel) as HTMLSelectElement;
  el.value = value;
  el.dispatchEvent(new Event("change", { bubbles: true }));
};

/** Clicks a button and lets the view record the click. */
const click = (sel: string, i = 0) =>
  (document.querySelectorAll(sel)[i] as HTMLButtonElement).click();

/** Real network, real async: wait until the store says so. */
async function until(
  what: string,
  fn: () => boolean,
  ms = 3000,
): Promise<void> {
  const t0 = Date.now();
  while (!fn()) {
    if (Date.now() - t0 > ms) throw new Error(`timeout: ${what}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

test("the app over the real API: pages, filter, CRUD, reset", async () => {
  document.body.innerHTML = `<div id="app"></div>`;
  // The route the router reports is the page jsdom is at.
  window.history.replaceState(null, "", "/");
  // The http plugin reads the page's fetch per request, so the page's fetch
  // can become the real API even after main.ts booted.
  const pageFetch = globalThis.fetch;
  globalThis.fetch = backend.fetch;
  try {
    const { app, store } = await import("../frontend/main.ts");

    // `mounted` starts the router; its first report ("/") activates the users
    // page, whose `enter` asks for the users: the write answers "paint",
    // the page paints "Loading..." from the answer. Nothing repaints on its own.
    expect(text("p.status")).toBe("Loading...");
    // The seed holds 500 users, ten rows to a page.
    await until(
      "the seed loads (10 rows of 500)",
      () => rows().length === 10 && store.getState().list.users.length === 500,
    );
    expect(document.querySelector("p.status")).toBe(null);
    expect(text("span.count")).toBe("Page 1 of 50");
    expect(rows()[0].querySelector("td.id")?.textContent).toBe("1");

    // The shell's sidebar: one menu item, "Users", active on the users page.
    expect(menuLink().textContent).toContain("Users");
    expect(menuLink().dataset.active).toBe("true");

    // The row's star: the row's own component (the `row` child of the page)
    // owns it — the click arrives as `list.row.star`, its write answers
    // `list.row.paint`, and the page repaints the row it embedded (the first
    // row's button flips its class and aria-pressed, nothing else changes).
    const star = () =>
      document.querySelector("button.star") as HTMLButtonElement;
    click("button.star");
    await until("user 1 is starred", () =>
      store.getState().list.starred.includes(1),
    );
    expect(star().getAttribute("aria-pressed")).toBe("true");
    expect(star().classList.contains("starred")).toBe(true);
    click("button.star");
    await until(
      "the star is gone",
      () => store.getState().list.starred.length === 0,
    );
    expect(star().getAttribute("aria-pressed")).toBe("false");
    expect(star().classList.contains("starred")).toBe(false);

    // The pager: one page forward lands on user 11, back again on user 1.
    click("button.pg", 1); // next
    await until(
      "page 2 (user 11)",
      () => !!rows()[0].querySelector("td.id")?.textContent?.includes("11"),
    );
    expect(text("span.count")).toBe("Page 2 of 50");
    click("button.pg", 0); // prev
    await until(
      "back on page 1",
      () => !!rows()[0].querySelector("td.id")?.textContent?.includes("1"),
    );

    // The rows-per-page select: fifty rows on a page.
    pick("select.pages", "50");
    await until("50 rows on a page", () => rows().length === 50);
    pick("select.pages", "10");
    await until("back to 10 rows", () => rows().length === 10);

    // The filter narrows the table to the matches, back on page 1.
    type("input.flt", "ann@");
    await until("one match for ann@", () => rows().length === 1);
    expect(text("span.count")).toBe("Page 1 of 1");
    expect(rows()[0].textContent).toContain("ann@example.com");

    // Edit the match, a page of its own: the row's button navigates to
    // /:id/edit, the page's `enter` fetches that user (the form opens filled).
    click("button.edit");
    await until("/1/edit", () => /\/\d+\/edit$/.test(window.location.pathname));
    await until(
      "the form opens filled",
      () => !!document.querySelector("form.card"),
    );
    expect(text("form.card h2")).toBe("Edit user");
    const nameInput = document.querySelector(
      `input[placeholder="Name"]`,
    ) as HTMLInputElement;
    expect(nameInput.value).toBe("Ann");
    type(`input[placeholder="Name"]`, "Ann A.");
    document
      .querySelector("form.card")!
      .dispatchEvent(new Event("submit", { cancelable: true }));
    await until(
      "the edit lands",
      () =>
        store.getState().list.users.find((u) => u.email === "ann@example.com")
          ?.name === "Ann A.",
    );
    expect(document.querySelector("form.card")).toBe(null);

    // Delete, found through the filter: the row goes away, the count follows.
    type("input.flt", "bob@");
    await until("one match for bob@", () => rows().length === 1);
    click("button.del");
    await until("the user is removed", () => store.getState().list.total === 0);
    expect(
      store.getState().list.users.find((u) => u.email === "bob@example.com"),
    ).toBe(undefined);
    type("input.flt", "");
    await until("the table is full again", () => rows().length === 10);
    expect(store.getState().list.total).toBe(499);

    // Sorting: a header click re-orders the whole list, pages and all.
    const nameHeader = [...document.querySelectorAll("th.sortable")].find(
      (th) => th.textContent?.startsWith("Name"),
    ) as HTMLElement | undefined;
    nameHeader!.click();
    await until("sorted by name (Ann A. first)", () =>
      rows()[0]?.textContent?.includes("Ann A."),
    );
    expect(store.getState().list.sortKey).toBe("name");

    // Create, a page of its own: the button navigates to /new, the page's
    // `enter` writes an empty form (the paint puts it in), the POST answers
    // `created`, and the page navigates back — the users page re-enters and
    // reloads itself.
    click("button.new");
    await until("/new", () => window.location.pathname === "/new");
    await until("the form opens", () => !!document.querySelector("form.card"));
    expect(text("form.card h2")).toBe("New user");
    type(`input[placeholder="Name"]`, "Edsger Dijkstra");
    type(`input[placeholder="Email"]`, "edsger@example.com");
    pick("select.inp", "2");
    document
      .querySelector("form.card")!
      .dispatchEvent(new Event("submit", { cancelable: true }));
    // 500 in the seed − Bob, deleted above, + Edsger: back at 500, reloaded.
    await until(
      "back on / with the new user",
      () =>
        window.location.pathname === "/" &&
        store.getState().list.users.length === 500,
    );
    const created = store
      .getState()
      .list.users.find((u) => u.email === "edsger@example.com");
    expect(created).toMatchObject({ name: "Edsger Dijkstra" });

    // Cancel: back to the users page without a request.
    click("button.new");
    await until("the form opens", () => !!document.querySelector("form.card"));
    click("button.cancel");
    await until("back on /", () => window.location.pathname === "/");
    expect(document.querySelector("form.card")).toBe(null);
    // The re-entered page reloads itself; the next clicks need its table.
    await until("the table is back", () => rows().length === 10);

    // The sidebar's link navigates like any in-app link: its click arrives
    // as `sidebar.navigate`, which the framework's default routes.
    click("button.new");
    await until("the form opens", () => !!document.querySelector("form.card"));
    expect(menuLink().dataset.active).toBe("false");
    menuLink().click();
    await until(
      "back on / via the sidebar",
      () => window.location.pathname === "/",
    );
    expect(document.querySelector("form.card")).toBe(null);
    expect(menuLink().dataset.active).toBe("true");
    await until("the table is back again", () => rows().length === 10);

    // Reset: the bottom button rebuilds the seed — everything is as it was.
    // A starred user goes first, to see the star go with the reset.
    click("button.star");
    await until(
      "a user is starred",
      () => store.getState().list.starred.length === 1,
    );
    click("button.reset");
    await until(
      "the database is reseeded",
      () =>
        store.getState().list.users.length === 500 &&
        store.getState().list.users.some((u) => u.email === "bob@example.com"),
    );
    await until("the table is on page 1", () => rows().length === 10);
    expect(text("span.count")).toBe("Page 1 of 50");
    expect(
      store.getState().list.users.find((u) => u.email === "bob@example.com")
        ?.name,
    ).toBe("Bob");
    expect(store.getState().list.filter).toBe("");
    expect(store.getState().list.sortKey).toBe("id");
    expect(store.getState().list.starred).toEqual([]);

    app.dispose();
  } finally {
    globalThis.fetch = pageFetch;
  }
}, 20_000);
