// @vitest-environment jsdom
/**
 * The back office: the section of the panel follows the address.
 *
 * A routed child does not see the whole address in `route.path` — the router
 * keeps the matched pattern in `route.base` (`/app/admin/tasks`) and leaves
 * the remainder (`/`) in the path. The panel reads the base, so `/app/admin`
 * opens the users and `/app/admin/tasks` the system tasks; a panel that read
 * the path alone showed the users everywhere.
 */
import { describe, expect, test } from "vitest";
import { AdminPage } from "../app/admin/admin.ts";
import { type AppState, initialState } from "../app/state.ts";

/** The slice of the panel at the given address (the router's shape). */
const sliceAt = (base: string): AppState["admin"] => ({
  ...initialState.admin,
  route: { path: "/", base, search: "", hash: "", params: {} },
});

/** The value the panel writes for a key (its `enter` writes the section). */
const written = (base: string, key: string): unknown => {
  const effects = new AdminPage().enter(
    { id: "enter", payload: {} },
    sliceAt(base),
  );
  const effect = effects.find(
    (e) => e.plugin === "store" && e.type === "set" && e.path === key,
  );
  return effect ? (effect as { value?: unknown }).value : undefined;
};

describe("the back office", () => {
  test("the address of the panel picks the section", () => {
    expect(written("/app/admin", "section")).toBe("users");
    expect(written("/app/admin/roles", "section")).toBe("roles");
    expect(written("/app/admin/permissions", "section")).toBe("permissions");
    expect(written("/app/admin/sessions", "section")).toBe("sessions");
    expect(written("/app/admin/tasks", "section")).toBe("tasks");
  });

  test("the tasks section asks for the list of the tasks", () => {
    const effects = new AdminPage().enter(
      { id: "enter", payload: {} },
      sliceAt("/app/admin/tasks"),
    );
    const urls = effects
      .filter((e) => e.plugin === "http" && e.type === "request")
      .map((e) => (e as { url?: string }).url);
    expect(urls).toContain("/api/admin/tasks");
  });
});
