// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import { compileToView } from "../../compiler/mod.ts";
import { mountView } from "../../testing/mod.ts";
import type { View } from "../../runtime/vnode.ts";

// Child used inside a loop (static embed, two levels deep).
const Row = compileToView<{ id: number; label: string; on: boolean }>(
  `li.row(class:on=on @click=pick(id))
  span {label}
  button(@click.stop=drop(id)) x`,
);

const List = compileToView(
  `import Row from "./row.pavlus"
ul.list
  for it in items key it.id
    +Row#row(id=it.id label=it.label on={it.id === sel})`,
  { components: { Row } },
);

// Two interchangeable templates for the dynamic embed.
const Plain = compileToView(`p.plain {items.length} items ({title})`);
const Numbered = compileToView(
  `ol.numbered
  for it, i in items key it.id
    li {i}:{it.label}`,
);
const Alt: View[] = [Plain, Numbered];

const Page = compileToView(
  `import List from "./list.pavlus"
import Footer from "./footer.pavlus"
div.page
  h1 {title}
  if show
    +List#list(items=items sel=sel)
  else
    p none
  +{Alt}#alt(items=items title=title)
  +Footer#footer(text="count: {items.length}")`,
  { components: { List, Footer: compileToView(`footer {text}`) } },
);

interface Item {
  id: number;
  label: string;
}
interface State {
  title: string;
  show: boolean;
  sel: number;
  items: Item[];
  Alt: unknown;
}

function rng(seed: number): () => number {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

function randomState(r: () => number, prev?: State): State {
  const pick = <T>(xs: T[]): T => xs[Math.floor(r() * xs.length)];
  let items: Item[] =
    prev && r() < 0.8
      ? prev.items
          .filter(() => r() < 0.8)
          .map((i) => (r() < 0.8 ? i : { ...i, label: pick(["a", "b"]) }))
      : [];
  for (let k = 0; k < Math.floor(r() * 3); k++) {
    const id = Math.floor(r() * 10);
    if (!items.some((i) => i.id === id))
      items.splice(Math.floor(r() * (items.length + 1)), 0, {
        id,
        label: pick(["x", "y"]),
      });
  }
  if (r() < 0.2) items = [...items].sort(() => r() - 0.5);
  return {
    title: prev && r() < 0.7 ? prev.title : pick(["T1", "T2"]),
    show: r() < 0.6,
    sel: Math.floor(r() * 10),
    items,
    // a view, a component that has a view, or nothing
    Alt: pick<unknown>([
      Plain,
      Numbered,
      { view: Plain },
      { view: Numbered },
      null,
      undefined,
    ]),
  };
}

describe("embedded children: diff equals fresh render", () => {
  test("random state sequences (static in a loop, in an if, and dynamic swaps)", () => {
    const r = rng(2024);
    for (let run = 0; run < 300; run++) {
      let state = randomState(r);
      const h = mountView(Page, state);
      for (let step = 0; step < 8; step++) {
        const next = randomState(r, state);
        h.set(next);
        const fresh = mountView(Page, next);
        expect(h.root.innerHTML, `run ${run} step ${step}`).toBe(
          fresh.root.innerHTML,
        );
        fresh.unmount();
        state = next;
      }
      h.unmount();
      expect(h.dom.stats(), `run ${run}`).toEqual({
        mounts: 0,
        nodes: 0,
        listeners: 0,
      });
    }
  });

  test("events keep working through nested prefixes after updates and swaps", () => {
    const r = rng(11);
    let state = { ...randomState(r), show: true };
    const h = mountView(Page, state);
    for (let step = 0; step < 60; step++) {
      state = { ...randomState(r, state), show: r() < 0.8 };
      h.set(state);
      h.messages.length = 0;
      h.root.querySelectorAll<HTMLElement>(".row").forEach((el) => el.click());
      h.root
        .querySelectorAll<HTMLElement>(".row button")
        .forEach((el) => el.click());
      const ids = state.show ? state.items.map((i) => i.id) : [];
      expect(h.messages.map((m) => [m.id, m.payload])).toEqual([
        ...ids.map((id) => ["list.row.pick", id]),
        ...ids.map((id) => ["list.row.drop", id]),
      ]);
    }
  });

  test("swapping the dynamic child replaces the DOM; the same child is diffed", () => {
    const base: State = {
      title: "T",
      show: false,
      sel: 0,
      items: [{ id: 1, label: "a" }],
      Alt: Plain,
    };
    // different template: clear + insert, nothing diffed across templates
    expect(
      Page.diff(base, { ...base, Alt: Numbered }).map((p) => p.op),
    ).toEqual(["clear", "insert"]);
    // component object holding the same view counts as the same view
    expect(Page.diff(base, { ...base, Alt: { view: Plain } })).toEqual([]);
    // gone / back
    expect(Page.diff(base, { ...base, Alt: null }).map((p) => p.op)).toEqual([
      "clear",
    ]);
    expect(Page.diff({ ...base, Alt: null }, base).map((p) => p.op)).toEqual([
      "insert",
    ]);
    // same child, changed prop: one text patch, from inside the child
    expect(
      Page.diff(base, {
        ...base,
        items: [...base.items, { id: 2, label: "b" }],
      }).map((p) => p.op),
    ).toContain("text");
  });

  test("a child whose props did not change is skipped", () => {
    const s: State = {
      title: "T",
      show: true,
      sel: 1,
      items: [{ id: 1, label: "a" }],
      Alt: null,
    };
    expect(Page.diff(s, { ...s, items: s.items })).toEqual([]);
    // selecting another row touches only the two rows' class attributes
    const patches = Page.diff(s, {
      ...s,
      items: [...s.items, { id: 2, label: "b" }],
      sel: 2,
    });
    expect(patches.map((p) => p.op)).toEqual(
      expect.arrayContaining(["insert", "attr"]),
    );
  });
});
