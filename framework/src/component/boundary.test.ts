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
      { id: string; text: unknown } | undefined;
    expect(text?.text).toBe("2");
    // Both scopes composed in front of the grandchild's own node id.
    expect(text?.id).toBe(`${scope}2`);
  });

  test("a grandchild's store write gets every key in front, its reply id every prefix", () => {
    const h = toHandler(new Root());
    const effects = h({ id: "c.g.inc" }, { c: { title: "t", g: { n: 1 } } });
    const write = effects.find((e) => e.plugin === "store") as
      { path: unknown; value: unknown; onSuccess: unknown } | undefined;
    expect(write).toBeDefined();
    expect(write!.path).toBe("c.g.n");
    expect(write!.value).toBe(2);
    expect(write!.onSuccess).toBe("c.g.paint");
  });
});
