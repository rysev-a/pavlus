import { afterEach, describe, expect, it } from "vitest";
import { cleanup, flush, mount } from "../testing/mod.ts";
import { computed, effect, signal, subscriberCount } from "../core/mod.ts";
import { children, html, mergeProps, splitProps } from "./mod.ts";
import type { Child } from "./mod.ts";

afterEach(cleanup);

describe("mergeProps", () => {
  it("later sources win, undefined does not override", () => {
    const p = mergeProps({ a: 1, b: 2 }, { b: 3, c: undefined }, { c: 4 });
    expect(p).toMatchObject({ a: 1, b: 3, c: 4 });
    expect(mergeProps({ a: 1 }, { a: undefined }).a).toBe(1);
  });

  it("keeps getters lazy and reactive", async () => {
    const n = signal(1);
    const merged = mergeProps(
      {
        get v() {
          return n();
        },
      },
      { label: "x" },
    );
    const seen: number[] = [];
    effect(() => void seen.push(merged.v));
    n.set(2);
    await flush();
    expect(seen).toEqual([1, 2]);
  });

  it("supports reactive sources (functions returning objects)", async () => {
    const extra = signal<{ x?: number }>({ x: 1 });
    const p = mergeProps({ x: 0, y: 5 }, extra);
    const seen: unknown[] = [];
    effect(() => void seen.push(p.x));
    extra.set({ x: 9 });
    await flush();
    expect(seen).toEqual([1, 9]);
    expect(p.y).toBe(5);
  });

  it("enumerates and has() across sources, tolerates null sources, is read-only", () => {
    const p = mergeProps({ a: 1 }, null, undefined, { b: 2 });
    expect(Object.keys(p).sort()).toEqual(["a", "b"]);
    expect("a" in p && "b" in p && !("z" in p)).toBe(true);
    expect({ ...p }).toEqual({ a: 1, b: 2 });
    expect(() => {
      "use strict";
      (p as Record<string, unknown>).a = 5;
    }).toThrow();
  });
});

describe("splitProps", () => {
  it("splits keys without reading values and keeps reactivity", async () => {
    const n = signal(1);
    let reads = 0;
    const props = {
      get a() {
        reads++;
        return n();
      },
      b: "b",
      c: "c",
    };
    const [mine, rest] = splitProps(props, ["a", "b"]);
    expect(reads).toBe(0);
    const seen: number[] = [];
    effect(() => void seen.push(mine.a));
    n.set(2);
    await flush();
    expect(seen).toEqual([1, 2]);
    expect(mine.b).toBe("b");
    expect(Object.keys(mine)).toEqual(["a", "b"]);
    expect(rest.c).toBe("c");
    expect("a" in rest).toBe(false);
    expect(Object.keys(rest)).toEqual(["c"]);
    expect({ ...rest }).toEqual({ c: "c" });
  });

  it("supports several groups; the last element is the rest", () => {
    const [x, y, rest] = splitProps(
      { a: 1, b: 2, c: 3, d: 4 },
      ["a"],
      ["b", "c"],
    );
    expect(x.a).toBe(1);
    expect(y.c).toBe(3);
    expect(Object.keys(rest)).toEqual(["d"]);
    expect(rest.d).toBe(4);
  });

  it("the rest can be spread onto an element", () => {
    function Button(props: { label: string; id?: string; "data-x"?: string }) {
      const [mine, others] = splitProps(props, ["label"]);
      return html`<button ...${others}>${mine.label}</button>`;
    }
    const m = mount(() => Button({ label: "go", id: "b", "data-x": "1" }));
    expect(m.query("button").id).toBe("b");
    expect(m.query("button").getAttribute("data-x")).toBe("1");
    expect(m.query("button").textContent).toBe("go");
  });
});

describe("children", () => {
  function Card(props: { children?: () => Child }) {
    const kids = children(() => props.children?.());
    return html`<section data-count=${() => kids().length}>${kids}</section>`;
  }

  it("resolves strings, nodes, arrays and fragments into a flat node list", () => {
    const m = mount(() =>
      Card({
        children: () => [
          "a",
          html`<b>b</b>`,
          [html`<i>i</i>`, null],
          html`<u>1</u><u>2</u>`,
        ],
      }),
    );
    expect(m.query("section").getAttribute("data-count")).toBe("5");
    expect(m.html()).toBe(
      '<section data-count="5">a<b>b</b><i>i</i><u>1</u><u>2</u></section>',
    );
  });

  it("is eager: children are created in the component, once, even when never inserted", () => {
    let created = 0;
    children(() => (created++, "x"));
    expect(created).toBe(1);
  });

  it("re-resolves when reactive children change", async () => {
    const n = signal(1);
    const m = mount(() =>
      Card({
        children: () => html`<b>${() => (n() > 1 ? "big" : "small")}</b>`,
      }),
    );
    expect(m.text()).toBe("small");
    n.set(2);
    await flush();
    expect(m.text()).toBe("big");
  });

  it("works with computed-driven children and releases subscriptions", async () => {
    const n = signal(0);
    const m = mount(() => {
      const label = computed(() => "n=" + n());
      return Card({ children: () => label });
    });
    expect(m.text()).toBe("n=0");
    m.unmount();
    expect(subscriberCount(n)).toBe(0);
  });
});
