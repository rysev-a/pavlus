// @vitest-environment jsdom
import { afterAll, beforeAll, expect, test } from "vitest";
// The real API on a real Postgres, like the browser sees it — the same
// harness the admin-app tests use (it reseeds `backend/db/seed.sql` first).
import {
  startBackend,
  type Backend,
} from "../../admin-app/frontend/tests/backend.ts";

let backend: Backend;

beforeAll(async () => {
  backend = await startBackend();
});

afterAll(async () => {
  // Leave the development database as it was.
  await backend.reseed();
  await backend.close();
});

const rows = () => document.querySelectorAll(".row");
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
  (document.querySelector(".new") as HTMLButtonElement).click();
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

test("the tiny app over the real API: load, create (through the store chain), edit", async () => {
  document.body.innerHTML = `<div id="app"></div>`;
  // The http plugin reads the page's fetch per request, so the page's fetch
  // can become the real API even after main.ts booted.
  const pageFetch = globalThis.fetch;
  globalThis.fetch = backend.fetch;
  try {
    const { app, store } = await import("./main.ts");

    // The view is mounted empty, then `mounted` loads the list; every state
    // change repaints, no dom.update needed.
    expect(rows().length).toBe(0);
    await until("the seed loads (8 users)", () => rows().length === 8);
    expect(store.getState().status).toBe("idle");

    // Create: the POST answers `user.created`, which appends the user with
    // a store write that answers `users.changed`, which closes the form.
    fillAndSubmit("Edsger Dijkstra", "edsger@example.com");
    await until("the new user lands (9 rows)", () => rows().length === 9);
    expect(store.getState().form).toBe(null);
    expect(document.querySelector("form.card")).toBe(null);
    const created = store
      .getState()
      .users.find((u) => u.email === "edsger@example.com");
    expect(created).toMatchObject({ name: "Edsger Dijkstra" });
    expect(created?.role_id).toBeGreaterThan(0);

    // Edit: the row fills the form (id set), the PUT replaces the user.
    const row = [...rows()].find((r) => r.textContent?.includes("edsger@"));
    (row!.querySelector(".edit") as HTMLButtonElement).click();
    expect(text("form.card h2")).toBe("Edit user");
    type(`input[placeholder="Name"]`, "Edsger W. Dijkstra");
    document
      .querySelector("form.card")!
      .dispatchEvent(new Event("submit", { cancelable: true }));
    await until(
      "the edit lands",
      () =>
        store.getState().users.find((u) => u.email === "edsger@example.com")
          ?.name === "Edsger W. Dijkstra",
    );
    expect(store.getState().form).toBe(null);
    expect(rows().length).toBe(9);

    // Cancel: the form closes without a request.
    (document.querySelector(".new") as HTMLButtonElement).click();
    expect(document.querySelector("form.card")).toBeTruthy();
    (document.querySelector(".cancel") as HTMLButtonElement).click();
    expect(store.getState().form).toBe(null);
    expect(document.querySelector("form.card")).toBe(null);

    app.dispose();
  } finally {
    globalThis.fetch = pageFetch;
  }
}, 20_000);
