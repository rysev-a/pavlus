import { describe, expect, test } from "vitest";
import { compileToView } from "../compiler/mod.ts";
import type { Effect, Message } from "../core/types.ts";
import { DomPlugin } from "../plugins/dom/mod.ts";
import { Component, toHandler } from "./mod.ts";
import type { Patch } from "../runtime/vnode.ts";

// The grandchild: a mini-application that paints itself — a write answers
// "paint", the handler diffs its own state and hands over target-less patches.
const grandView = compileToView<{ n: number }>(
  `div.g
  span {n}
  button(@click=inc) +`,
);

class Grand extends Component<{ n: number }> {
  view = grandView;

  paint(msg: Message): Effect[] {
    const { prev, next } = msg.payload as {
      prev: { n: number };
      next: { n: number };
    };
    return [DomPlugin.update(grandView.diff(prev, next))];
  }

  inc(_m: Message, s: { n: number }): Effect[] {
    return [
      {
        plugin: "store",
        type: "set",
        path: "n",
        value: s.n + 1,
        onSuccess: "paint",
      },
    ];
  }
}

// The child in the middle: embeds the grandchild, knows only its slice.
const childView = compileToView<{ title: string; g: { n: number } }>(
  `import Grand from "./grand.pavlus"
div.c
  h2 {title}
  +Grand#g(n={n.g.n})`,
  { components: { Grand: grandView } },
);

class Child extends Component<{ title: string; g: { n: number } }> {
  view = childView;
  children = { g: { component: new Grand(), key: "g" } };
}

// The root: embeds the child, knows nothing of the grandchild.
const rootView = compileToView<{ c: { title: string; g: { n: number } } }>(
  `import Child from "./child.pavlus"
section.r
  +Child#c(title={c.title} g={c.g})`,
  { components: { Child: childView } },
);

class Root extends Component<{ c: { title: string; g: { n: number } } }> {
  view = rootView;
  children = { c: { component: new Child(), key: "c" } };
}

const idsOf = (patches: Patch[]): string[] =>
  patches.map((p) =>
    "id" in p && p.id !== undefined
      ? p.id
      : "from" in p && p.from !== undefined
        ? p.from
        : "",
  );

describe("boundaries: sinking messages slice the state, bubbling effects get enriched", () => {
  test("a paint answer arrives sliced and its patches bubble up scoped", () => {
    const h = toHandler(new Root());
    const prev = { c: { title: "t", g: { n: 1 } }, other: true };
    const next = { c: { title: "t", g: { n: 2 } }, other: false };
    const effects = h({ id: "c.g.paint", payload: { prev, next } }, next);

    const update = effects.find(
      (e) => e.plugin === "dom" && e.type === "update",
    ) as { patches: Patch[] } | undefined;
    expect(update).toBeDefined();
    // A child that paints itself leaves the target to the boundary above.
    expect((update as { target?: unknown }).target).toBeUndefined();

    // The child's own node ids, prefixed by every embed it passed through.
    const scope = `${rootView.meta!.embeds.c}${childView.meta!.embeds.g}`;
    const patches = update!.patches;
    expect(patches.length).toBeGreaterThan(0);
    for (const id of idsOf(patches)) {
      expect(id.startsWith(scope)).toBe(true);
    }
    // The payload was sliced before the diff: the grandchild saw its `n`.
    const text = patches.find((p) => p.op === "text") as
      | { id: string; text: unknown }
      | undefined;
    expect(text?.text).toBe("2");
    // Both scopes composed in front of the grandchild's own node id.
    expect(text?.id).toBe(`${scope}2`);
  });

  test("a grandchild's store write gets every key in front, its reply id every prefix", () => {
    const h = toHandler(new Root());
    const effects = h({ id: "c.g.inc" }, { c: { title: "t", g: { n: 1 } } });
    const write = effects.find((e) => e.plugin === "store") as
      | { path: unknown; value: unknown; onSuccess: unknown }
      | undefined;
    expect(write).toBeDefined();
    expect(write!.path).toBe("c.g.n");
    expect(write!.value).toBe(2);
    expect(write!.onSuccess).toBe("c.g.paint");
  });

  test("a keyed child in a loop paints itself: ids carry the iteration key", () => {
    // The row's view: its props are its state (the keyed boundary slices
    // `state.byId[key]`, the embed spreads the same element as props).
    const rowView = compileToView<{ id: string; on: boolean }>(
      `td.r(class:on=on @click=toggle(id, on)) {id}`,
    );
    class Row extends Component<{ id: string; on: boolean }> {
      view = rowView;
      toggle(_m: Message, s: { id: string; on: boolean }): Effect[] {
        return [
          {
            plugin: "store",
            type: "set",
            path: "on",
            value: !s.on,
            onSuccess: "paint",
          },
        ];
      }
      paint(msg: Message): Effect[] {
        const { prev, next } = msg.payload as {
          prev: { id: string; on: boolean };
          next: { id: string; on: boolean };
        };
        return [DomPlugin.update(rowView.diff(prev, next))];
      }
    }
    const listView = compileToView<{
      byId: Record<string, { id: string; on: boolean }>;
      rows: { id: string; on: boolean }[];
    }>(
      `import Row from "./row.pavlus"
table
  for row in rows key row.id
    +Row#row(key=row.id ...row)`,
      { components: { Row: rowView } },
    );
    class List extends Component<{
      byId: Record<string, { id: string; on: boolean }>;
      rows: { id: string; on: boolean }[];
    }> {
      view = listView;
      children = { row: { component: new Row(), each: "byId" } };
    }
    const h = toHandler(new List());
    const prev = {
      byId: { a: { id: "a", on: false }, b: { id: "b", on: false } },
      rows: [
        { id: "a", on: false },
        { id: "b", on: false },
      ],
    };
    const next = {
      byId: { a: { id: "a", on: false }, b: { id: "b", on: true } },
      rows: [
        { id: "a", on: false },
        { id: "b", on: true },
      ],
    };
    const effects = h({ id: "row.b.paint", payload: { prev, next } }, next);

    const update = effects.find(
      (e) => e.plugin === "dom" && e.type === "update",
    ) as { patches: Patch[] } | undefined;
    expect(update).toBeDefined();
    // The row's own diff knew nothing of the loop; the boundary scoped its
    // ids with the key slot of the recorded scope ("#/…") and its events
    // with the keyed prefix — exactly what the list's render built.
    const scope = listView.meta!.embeds.row.replace("#", "#b");
    for (const id of idsOf(update!.patches)) {
      expect(id.startsWith(scope)).toBe(true);
    }
    const toggle = update!.patches.find(
      (p) => p.op === "handler",
    ) as unknown as { id: string; msg: { id: string } };
    expect(toggle).toBeDefined();
    expect(toggle.id.startsWith(scope)).toBe(true);
    expect(toggle.msg.id).toBe("row.b.toggle");
    const cls = update!.patches.find((p) => p.op === "attr") as unknown as {
      id: string;
      name: string;
    };
    expect(cls?.name).toBe("class");
    expect(cls.id.startsWith(scope)).toBe(true);
  });
});
