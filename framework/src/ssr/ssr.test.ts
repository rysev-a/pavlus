// @vitest-environment jsdom
import { describe, expect, test, vi } from "vitest";
import type { Message, PluginContext } from "../core/types.ts";
import { Component, viewOf } from "../component/mod.ts";
import { createDomPlugin } from "../plugins/dom/mod.ts";
import type { ElementVNode, View, VNode } from "../runtime/vnode.ts";
import { renderToString, reviveState, serializeState } from "./mod.ts";

interface S {
  items: string[];
  who: string;
  on: boolean;
}

/** A hand-written "compiled" view: a list with a marker pair, a button, text pieces. */
const view: View<S> = {
  render(s): VNode[] {
    const items: VNode[] = [{ t: "marker", id: "ls" }];
    for (const it of s.items) {
      items.push({
        t: "el",
        id: `i#${it}`,
        tag: "li",
        attrs: { class: "item" },
        events: { click: { id: "pick", payload: it } },
        children: [{ t: "text", text: it }],
      });
    }
    items.push({ t: "marker", id: "le" });
    return [
      {
        t: "el",
        tag: "p",
        attrs: {},
        events: {},
        children: [
          { t: "text", text: "hello " },
          { t: "text", id: "who", text: s.who },
          { t: "text", id: "empty", text: s.on ? "!" : "" },
        ],
      },
      { t: "el", tag: "ul", attrs: {}, events: {}, children: items },
      {
        t: "el",
        id: "b",
        tag: "button",
        attrs: { class: s.on ? "on" : "off" },
        events: { click: { id: "toggle" } },
        children: [{ t: "text", text: "toggle" }],
      },
    ];
  },
  diff(prev, next) {
    const patches: ReturnType<View<S>["diff"]> = [];
    if (prev.who !== next.who)
      patches.push({ op: "text", id: "who", text: next.who });
    if (prev.on !== next.on) {
      patches.push({ op: "text", id: "empty", text: next.on ? "!" : "" });
      patches.push({
        op: "attr",
        id: "b",
        name: "class",
        value: next.on ? "on" : "off",
      });
    }
    if (prev.items.join() !== next.items.join()) {
      patches.push({ op: "clear", from: "ls", to: "le" });
      patches.push({
        op: "insert",
        before: "le",
        nodes: (
          this.render({ ...next, who: "", on: false })[1] as ElementVNode
        ).children.slice(1, -1),
      });
    }
    return patches;
  },
};

const state: S = { items: ["a", "b"], who: "world", on: false };

function harness(html: string) {
  document.body.innerHTML = `<div id="app">\n  ${html}\n</div>`;
  const root = document.getElementById("app")!;
  const messages: Message[] = [];
  let current = state;
  const dom = createDomPlugin();
  const ctx: PluginContext<S> = {
    dispatch: (m) => messages.push(m),
    getState: () => current,
    dispatchEffect() {},
  };
  dom.init!(ctx);
  dom.handle(
    { plugin: "dom", type: "mount", target: root, view, onMounted: "ready" },
    ctx,
  );
  return {
    root,
    dom,
    messages,
    set(next: S) {
      const prev = current;
      current = next;
      // An explicit repaint: a bare mount does not follow the state.
      dom.handle({ plugin: "dom", type: "update", prev, next }, ctx);
    },
  };
}

describe("renderToString", () => {
  test("is the markup of the view, with its markers, between two comments", () => {
    expect(renderToString(view, state)).toBe(
      '<!--pavlus--><p>hello world</p><ul><!--ls--><li class="item">a</li><li class="item">b</li><!--le--></ul><button class="off">toggle</button><!--/pavlus-->',
    );
  });

  test("works for a component through viewOf", () => {
    class C extends Component<S> {
      view = view;
    }
    expect(renderToString(viewOf(new C())!, state)).toContain("hello world");
  });
});

describe("hydration: mounting into a server render", () => {
  test("keeps the markup, attaches the listeners, reports mounted", () => {
    const h = harness(renderToString(view, state));
    const li = h.root.querySelector("li")!;
    const button = h.root.querySelector("button")!;
    expect(h.messages).toEqual([{ id: "ready" }]);
    expect(h.dom.stats()).toMatchObject({ mounts: 1, listeners: 3 });
    li.click();
    button.click();
    expect(h.messages.slice(1)).toMatchObject([
      { id: "pick", payload: "a" },
      { id: "toggle" },
    ]);
    // the same DOM nodes: nothing was rebuilt
    expect(h.root.querySelector("li")).toBe(li);
    expect(h.root.querySelector("button")).toBe(button);
  });

  test("splits merged text nodes and inserts empty ones, so patches land", () => {
    const h = harness(renderToString(view, state));
    const p = h.root.querySelector("p")!;
    expect(p.childNodes).toHaveLength(3); // "hello ", "world", ""
    h.set({ ...state, who: "there", on: true });
    expect(p.textContent).toBe("hello there!");
    expect(h.root.querySelector("button")!.className).toBe("on");
    h.set({ ...state, items: ["c"] });
    expect(
      [...h.root.querySelectorAll("li")].map((l) => l.textContent),
    ).toEqual(["c"]);
  });

  test("a render that does not match the view is replaced, with a warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const stale = renderToString(view, state)
      .replace("<ul>", "<ol>")
      .replace("</ul>", "</ol>");
    const h = harness(stale);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0][0]).toMatch(/does not match/);
    expect(h.root.querySelector("ol")).toBeNull();
    expect(h.root.querySelector("ul")).not.toBeNull();
    expect(h.messages).toEqual([{ id: "ready" }]);
    h.root.querySelector("button")!.click();
    expect(h.messages[1]).toMatchObject({ id: "toggle" });
    expect(h.dom.stats()).toMatchObject({ mounts: 1, listeners: 3 });
    warn.mockRestore();
  });

  test("without a server render, mount builds as before", () => {
    const h = harness("");
    expect(h.root.querySelector("ul")).not.toBeNull();
    expect(h.messages).toEqual([{ id: "ready" }]);
  });
});

describe("serializeState / reviveState", () => {
  class A extends Component {}
  class B extends Component {}
  const a = new A();
  const b = new B();

  test("component values become their names and come back as the instances", () => {
    const json = serializeState(
      { n: 1, mode: a, nested: { other: b } },
      { a, b },
    );
    expect(JSON.parse(json)).toEqual({
      n: 1,
      mode: { $component: "a" },
      nested: { other: { $component: "b" } },
    });
    const back = reviveState<{ mode: unknown; nested: { other: unknown } }>(
      json,
      { a, b },
    );
    expect(back.mode).toBe(a);
    expect(back.nested.other).toBe(b);
  });

  test("an instance that is not listed, or an unknown name, is an error", () => {
    expect(() => serializeState({ mode: a }, { b })).toThrow(
      /list it in `components`/,
    );
    expect(() => reviveState('{"mode":{"$component":"zzz"}}', { a })).toThrow(
      /no component named "zzz"/,
    );
  });
});
