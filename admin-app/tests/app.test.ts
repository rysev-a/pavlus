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

/** Types into the field and lets the view record it in the state. */
const type = (sel: string, value: string) => {
  const el = document.querySelector(sel) as HTMLInputElement;
  el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
};

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

/** Opens the form, types, picks a role, submits. */
function fillAndSubmit(name: string, email: string) {
  (document.querySelector("button.new") as HTMLButtonElement).click();
  expect(text("form.card h2")).toBe("New user");
  type(`input[placeholder="Name"]`, name);
  type(`input[placeholder="Email"]`, email);
  const select = document.querySelector("select.inp") as HTMLSelectElement;
  select.value = select.options[1].value; // the seed's first real role
  select.dispatchEvent(new Event("change", { bubbles: true }));
  document
    .querySelector("form.card")!
    .dispatchEvent(new Event("submit", { cancelable: true }));
}

test("the app over the real API: load, create, edit a seed row, delete", async () => {
  document.body.innerHTML = `<div id="app"></div>`;
  // The http plugin reads the page's fetch per request, so the page's fetch
  // can become the real API even after main.ts booted.
  const pageFetch = globalThis.fetch;
  globalThis.fetch = backend.fetch;
  try {
    const { app, store } = await import("../frontend/main.ts");

    // `mounted` puts "loading" on the screen (an explicit dom.update()), the
    // answers paint the list. Nothing repaints on its own.
    expect(text("p.status")).toBe("Loading...");
    await until("the seed loads (8 users)", () => rows().length === 8);
    expect(store.getState().status).toBe("idle");
    expect(document.querySelector("p.status")).toBe(null);

    // Create: the POST answers `user.created`, which appends the user,
    // closes the form and paints — all in one handler.
    fillAndSubmit("Edsger Dijkstra", "edsger@example.com");
    await until("the new user lands (9 rows)", () => rows().length === 9);
    expect(store.getState().form).toBe(null);
    expect(document.querySelector("form.card")).toBe(null);
    const created = store
      .getState()
      .users.find((u) => u.email === "edsger@example.com");
    expect(created).toMatchObject({ name: "Edsger Dijkstra" });
    expect(created?.role_id).toBeGreaterThan(0);

    // Edit a seed row: the list carries `role_id`, so the form opens filled.
    const row = [...rows()].find((r) => r.textContent?.includes("ann@"));
    (row!.querySelector("button.edit") as HTMLButtonElement).click();
    expect(text("form.card h2")).toBe("Edit user");
    const nameInput = document.querySelector(
      `input[placeholder="Name"]`,
    ) as HTMLInputElement;
    expect(nameInput.value).toBe("Ann");
    const roleSelect = document.querySelector(
      "select.inp",
    ) as HTMLSelectElement;
    expect(roleSelect.value).toBe("1");
    type(`input[placeholder="Name"]`, "Ann A.");
    document
      .querySelector("form.card")!
      .dispatchEvent(new Event("submit", { cancelable: true }));
    await until(
      "the edit lands",
      () =>
        store.getState().users.find((u) => u.email === "ann@example.com")
          ?.name === "Ann A.",
    );
    expect(store.getState().form).toBe(null);
    expect(rows().length).toBe(9);

    // Delete: the row goes away.
    const bob = [...rows()].find((r) => r.textContent?.includes("bob@"));
    (bob!.querySelector("button.del") as HTMLButtonElement).click();
    await until("the user is removed", () => rows().length === 8);
    expect(
      store.getState().users.find((u) => u.email === "bob@example.com"),
    ).toBe(undefined);

    // Cancel: the form closes without a request.
    (document.querySelector("button.new") as HTMLButtonElement).click();
    expect(document.querySelector("form.card")).toBeTruthy();
    (document.querySelector("button.cancel") as HTMLButtonElement).click();
    expect(store.getState().form).toBe(null);
    expect(document.querySelector("form.card")).toBe(null);

    app.dispose();
  } finally {
    globalThis.fetch = pageFetch;
  }
}, 20_000);
