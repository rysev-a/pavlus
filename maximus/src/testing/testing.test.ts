import { afterEach, describe, expect, it } from "vitest";
import { signal } from "../core/mod.ts";
import { html } from "../dom/mod.ts";
import { cleanup, fire, flush, mount, waitFor } from "./mod.ts";

afterEach(cleanup);

describe("testing helpers", () => {
  it("mount/query/text/html/unmount", () => {
    const m = mount(() => html`<p class="a">hi</p>`);
    expect(m.query("p").className).toBe("a");
    expect(m.queryAll("p").length).toBe(1);
    expect(m.text()).toBe("hi");
    expect(m.html()).toBe('<p class="a">hi</p>');
    expect(document.body.contains(m.container)).toBe(true);
    expect(() => m.query("nope")).toThrow(/nothing matches/);
    m.unmount();
    expect(document.body.contains(m.container)).toBe(false);
  });

  it("the documented counter flow", async () => {
    const count = signal(0);
    const t = mount(
      () =>
        html`<button @click=${() => count.update((n) => n + 1)}>
          ${count}
        </button>`,
    );
    t.query("button").click();
    await flush();
    expect(t.text()).toContain("1");
    t.unmount();
  });

  it("flush waits for promise continuations that write signals", async () => {
    const s = signal("a");
    const t = mount(() => html`<p>${s}</p>`);
    void Promise.resolve().then(() => s.set("b"));
    await flush();
    expect(t.text()).toBe("b");
  });

  it("waitFor retries until the assertion passes, and fails with the last error", async () => {
    const s = signal(0);
    setTimeout(() => s.set(3), 20);
    await waitFor(() => {
      expect(s()).toBe(3);
    });
    await expect(
      waitFor(() => expect(1).toBe(2), { timeout: 40, interval: 5 }),
    ).rejects.toThrow(/expected 1 to be 2/);
    expect(await waitFor(() => s() === 3)).toBe(true);
  });

  it("fire builds proper event types and cleanup() unmounts everything", () => {
    const seen: string[] = [];
    mount(
      () =>
        html`<input
          @keydown=${(e: Event) => seen.push((e as KeyboardEvent).key)}
          @click=${(e: Event) => seen.push(e.constructor.name)}
        />`,
    );
    const input = document.querySelector("input")!;
    fire(input, "keydown", { key: "Enter" });
    fire(input, "click");
    expect(seen).toEqual(["Enter", "MouseEvent"]);
    cleanup();
    expect(document.querySelector("input")).toBeNull();
  });
});
