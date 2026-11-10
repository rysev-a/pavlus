// @vitest-environment jsdom
import { beforeEach, describe, expect, test } from "vitest";
import type { Message, PluginContext } from "../../core/types.ts";
import { circle, g, line, path, rect, root, svg, text } from "./h.ts";
import { createSvgPlugin, serializeSvg, svgEffector as s } from "./mod.ts";

const NS = "http://www.w3.org/2000/svg";

function setup() {
  document.body.innerHTML = '<div id="host"></div>';
  const host = document.getElementById("host")!;
  const msgs: Message[] = [];
  const ctx: PluginContext = {
    dispatch: (m) => msgs.push(m),
    getState: () => ({}),
    dispatchEffect: () => {},
  };
  const plugin = createSvgPlugin();
  const run = (e: unknown) => plugin.handle(e as any, ctx);
  return { host, msgs, plugin, run, ctx };
}

describe("h helpers", () => {
  test("builds plain nodes", () => {
    expect(
      svg("g", { transform: "x", key: "k", on: { click: { id: "c" } } }, [
        circle({ r: 1 }),
        false,
        null,
      ]),
    ).toEqual({
      tag: "g",
      attrs: { transform: "x" },
      key: "k",
      on: { click: { id: "c" } },
      children: [{ tag: "circle", attrs: { r: 1 } }],
    });
  });
  test("strings and numbers become text; shortcuts set the tag", () => {
    expect(text({ x: 1 }, "a", 2, "b")).toEqual({
      tag: "text",
      attrs: { x: 1 },
      text: "a2b",
    });
    expect(rect().tag).toBe("rect");
    expect(line(null).tag).toBe("line");
    expect(path({ d: "M0 0" }).attrs).toEqual({ d: "M0 0" });
    expect(g().tag).toBe("g");
    expect(root().tag).toBe("svg");
  });
});

describe("toString", () => {
  test("serializes without a DOM and adds xmlns", () => {
    const out = serializeSvg(
      root(
        { viewBox: "0 0 10 10" },
        rect({ x: 1, y: 2, width: 3, height: 4, fill: "red", key: "a" }),
        text({ x: 1 }, "a < b & c"),
        g(),
      ),
    );
    expect(out).toBe(
      `<svg viewBox="0 0 10 10" xmlns="${NS}"><rect x="1" y="2" width="3" height="4" fill="red"/><text x="1">a &lt; b &amp; c</text><g/></svg>`,
    );
  });
  test("escapes attribute values, drops null/false, booleans", () => {
    const out = serializeSvg(
      root({ id: 'a"b<', "data-x": true, stroke: null, fill: false }),
    );
    expect(out).toContain('id="a&quot;b&lt;"');
    expect(out).toContain('data-x="true"');
    expect(out).not.toContain("stroke");
  });
  test("adds xmlns:xlink when xlink:href is used", () => {
    const out = serializeSvg(
      root({}, svg("use", { "xlink:href": "#a" }), svg("use", { href: "#b" })),
    );
    expect(out).toContain('xmlns:xlink="http://www.w3.org/1999/xlink"');
  });
  test("effect replies the markup", () => {
    const t = setup();
    t.run(s.toString(root({}, circle({ r: 2 })), "done"));
    expect(t.msgs).toEqual([
      {
        id: "done",
        payload: `<svg xmlns="${NS}"><circle r="2"/></svg>`,
      },
    ]);
  });
  test("works with no DOM at all", () => {
    const p = createSvgPlugin({ document: undefined });
    const msgs: Message[] = [];
    // explicitly undefined falls back to global document in jsdom; emulate absence
    const bare = createSvgPlugin({ document: {} as any });
    bare.handle(
      s.toString(root(), "done") as any,
      {
        dispatch: (m: Message) => msgs.push(m),
      } as any,
    );
    expect(msgs[0]!.payload).toBe(`<svg xmlns="${NS}"/>`);
    void p;
  });
  test("invalid tree replies onError", () => {
    const t = setup();
    t.run(s.toString({ tag: "script" } as any, "done", "err"));
    expect(t.msgs[0]).toMatchObject({
      id: "err",
      payload: { code: "invalid" },
    });
  });
});

describe("whitelist", () => {
  const bad = (node: unknown) => {
    const t = setup();
    t.run(s.mount("#host", node as any, "mounted", "err"));
    expect(t.msgs.map((m) => m.id)).toEqual(["err"]);
    expect(t.host.innerHTML).toBe("");
    return (t.msgs[0]!.payload as any).message as string;
  };

  test.each([
    ["script", root({}, { tag: "script", text: "alert(1)" })],
    ["foreignObject", root({}, { tag: "foreignObject" })],
    ["style", root({}, { tag: "style" })],
    ["animate", root({}, { tag: "animate" })],
    ["unknown tag", root({}, { tag: "div" })],
    ["prototype tag", root({}, { tag: "constructor" })],
  ])("rejects tag %s", (_n, tree) => {
    expect(bad(tree)).toMatch(/not allowed/);
  });

  test.each(["onclick", "onload", "ONERROR", "onmouseover"])(
    "rejects event attribute %s",
    (name) => {
      expect(bad(root({ [name]: "alert(1)" }))).toMatch(/not allowed/);
    },
  );

  test("rejects unlisted and malformed attribute names", () => {
    bad(root({ srcdoc: "x" }));
    bad(root({ "a b": "x" }));
    bad(root({ '"><script>': "x" }));
  });

  test.each([
    "javascript:alert(1)",
    "  JaVa\nScRiPt:alert(1)",
    "\u0001javascript:alert(1)",
    "data:text/html,<script>",
    "vbscript:x",
  ])("rejects href %j", (href) => {
    bad(root({}, svg("a", { href }, circle({ r: 1 }))));
    bad(root({}, svg("a", { "xlink:href": href })));
  });

  test("href rules: use needs a fragment, image allows http/data:image", () => {
    bad(root({}, svg("use", { href: "https://evil/x.svg#a" })));
    const t = setup();
    t.run(
      s.mount(
        "#host",
        root(
          {},
          svg("use", { href: "#ok" }),
          svg("image", { href: "https://x/y.png" }),
          svg("image", { href: "data:image/png;base64,AAA" }),
          svg("image", { href: "pic.png" }),
          svg("a", { href: "#top" }),
        ),
        undefined,
        "err",
      ),
    );
    expect(t.msgs).toEqual([]);
    expect(t.host.querySelectorAll("*").length).toBe(6);
  });

  test("rejects unsafe style and url() references", () => {
    bad(root({ style: "background:url(javascript:alert(1))" }));
    bad(root({ style: "width:expression(alert(1))" }));
    bad(root({ style: "@import 'x'" }));
    bad(root({ fill: "url(https://evil/x)" }));
    bad(root({ style: "fill:red; \\6a avascript:x" }));
    const t = setup();
    t.run(
      s.mount(
        "#host",
        root({ style: "fill:url(#g)" }, circle({ fill: "url(#g)" })),
        undefined,
        "err",
      ),
    );
    expect(t.msgs).toEqual([]);
  });

  test("rejects non-finite numbers, bad xmlns, bad events, bad handlers", () => {
    bad(root({ x: NaN }));
    bad(root({ xmlns: "http://evil" }));
    bad(root({ x: {} as any }));
    bad(root({}, { tag: "g", on: { onclick: { id: "x" } } }));
    bad(root({}, { tag: "g", on: { click: {} } } as any));
    bad(root({}, { tag: "g", on: { constructor: { id: "x" } } }));
  });

  test("rejects non-object nodes, bad children, duplicate keys, deep trees", () => {
    bad({ tag: "svg", children: [5] });
    bad({ tag: "svg", children: "x" });
    bad({ tag: "svg", text: {} });
    bad(root({}, g({ key: "a" }), g({ key: "a" })));
    let deep: any = { tag: "g" };
    for (let i = 0; i < 300; i++) deep = { tag: "g", children: [deep] };
    bad(root({}, deep));
    bad({ tag: "svg", key: {} });
  });

  test("injection through text and attribute values stays inert", () => {
    const t = setup();
    t.run(
      s.mount(
        "#host",
        root(
          { id: '"><img src=x onerror=alert(1)>' },
          text({}, "<img src=x onerror=alert(1)>"),
        ),
      ),
    );
    expect(t.host.querySelector("img")).toBeNull();
    expect(t.host.querySelector("svg")!.getAttribute("id")).toContain("<img");
    expect(t.host.querySelector("text")!.textContent).toContain("<img");
    expect(serializeSvg(text({}, "<script>"))).toBe(
      `<text>&lt;script&gt;</text>`,
    );
  });
});

describe("mount", () => {
  test("creates SVG-namespaced elements", () => {
    const t = setup();
    t.run(
      s.mount(
        "#host",
        root(
          { viewBox: "0 0 100 100", width: 100 },
          g({}, circle({ cx: 5, cy: 6, r: 7 }), text({}, "hi")),
          svg("use", { "xlink:href": "#c" }),
        ),
        "mounted",
      ),
    );
    const el = t.host.firstElementChild!;
    expect(el.namespaceURI).toBe(NS);
    expect(el.getAttribute("viewBox")).toBe("0 0 100 100");
    expect(el.getAttribute("width")).toBe("100");
    const c = el.querySelector("circle")!;
    expect(c.namespaceURI).toBe(NS);
    expect(c.getAttribute("r")).toBe("7");
    expect(el.querySelector("text")!.textContent).toBe("hi");
    expect(
      el
        .querySelector("use")!
        .getAttributeNS("http://www.w3.org/1999/xlink", "href"),
    ).toBe("#c");
    expect(t.msgs).toEqual([{ id: "mounted" }]);
    expect(t.plugin.mounted()).toBe(1);
  });

  test("replaces existing content of the target", () => {
    const t = setup();
    t.host.innerHTML = "<p>old</p>";
    t.run(s.mount(t.host, root()));
    expect(t.host.children.length).toBe(1);
    expect(t.host.firstElementChild!.localName).toBe("svg");
  });

  test("mounting twice on the same target replaces the tree", () => {
    const t = setup();
    t.run(
      s.mount("#host", root({}, circle({ r: 1, on: { click: { id: "a" } } }))),
    );
    t.run(s.mount("#host", root({}, rect())));
    expect(t.host.querySelectorAll("svg").length).toBe(1);
    expect(t.host.querySelector("circle")).toBeNull();
    expect(t.plugin.mounted()).toBe(1);
    expect(t.plugin.listeners()).toBe(0);
  });

  test("root must be svg", () => {
    const t = setup();
    t.run(s.mount("#host", circle({ r: 1 }), undefined, "err"));
    expect(t.msgs[0]).toMatchObject({
      id: "err",
      payload: { code: "invalid" },
    });
  });

  test("adopts an existing svg element as the root", () => {
    const t = setup();
    t.host.innerHTML = '<svg id="chart" class="keep"><g id="old"/></svg>';
    const el = t.host.querySelector("svg")!;
    t.run(s.mount("#chart", root({ viewBox: "0 0 5 5" }, circle({ r: 1 }))));
    expect(t.host.querySelector("svg")).toBe(el);
    expect(el.getAttribute("viewBox")).toBe("0 0 5 5");
    expect(el.querySelector("#old")).toBeNull();
    expect(el.querySelector("circle")).not.toBeNull();
    t.run(s.update("#chart", root({ viewBox: "0 0 9 9" })));
    expect(el.getAttribute("viewBox")).toBe("0 0 9 9");
    expect(el.children.length).toBe(0);
    t.run(s.unmount("#chart"));
    expect(t.host.querySelector("svg")).toBe(el);
    expect(el.getAttribute("viewBox")).toBeNull();
  });

  test("missing target / no DOM", () => {
    const t = setup();
    t.run(s.mount("#nope", root(), undefined, "err"));
    expect(t.msgs[0]).toMatchObject({ payload: { code: "notFound" } });
    expect(() => t.run(s.mount("#nope", root()))).toThrow(/not found/);

    const p = createSvgPlugin({ document: {} as any });
    const msgs: Message[] = [];
    const ctx = { dispatch: (m: Message) => msgs.push(m) } as any;
    p.handle(s.mount("#x", root(), undefined, "err") as any, ctx);
    expect(msgs[0]).toMatchObject({ payload: { code: "unsupported" } });
    expect(() => p.handle(s.mount("#x", root()) as any, ctx)).not.toThrow();
  });
});

describe("update (diff)", () => {
  /** Records DOM mutations under the host. */
  function observe(host: Element) {
    const log: MutationRecord[] = [];
    const mo = new MutationObserver((r) => log.push(...r));
    mo.observe(host, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
    return () => {
      log.push(...mo.takeRecords());
      mo.disconnect();
      return log;
    };
  }

  test("changes, adds and removes attributes only where they differ", () => {
    const t = setup();
    t.run(
      s.mount("#host", root({}, circle({ cx: 1, cy: 2, r: 3, fill: "red" }))),
    );
    const c = t.host.querySelector("circle")!;
    const done = observe(t.host);
    t.run(
      s.update(
        "#host",
        root({}, circle({ cx: 1, cy: 5, fill: "blue", stroke: "k" })),
      ),
    );
    const log = done();
    expect(t.host.querySelector("circle")).toBe(c); // same element
    expect(c.getAttribute("cx")).toBe("1");
    expect(c.getAttribute("cy")).toBe("5");
    expect(c.hasAttribute("r")).toBe(false);
    expect(c.getAttribute("fill")).toBe("blue");
    expect(c.getAttribute("stroke")).toBe("k");
    const touched = log.map((r) => r.attributeName).sort();
    expect(touched).toEqual(["cy", "fill", "r", "stroke"]);
    expect(log.every((r) => r.type === "attributes")).toBe(true);
  });

  test("identical tree causes no mutations", () => {
    const t = setup();
    const tree = () =>
      root({ x: 1 }, g({}, text({}, "x"), circle({ r: 1, key: 1 })));
    t.run(s.mount("#host", tree()));
    const done = observe(t.host);
    t.run(s.update("#host", tree()));
    expect(done()).toEqual([]);
  });

  test("text add, change, remove", () => {
    const t = setup();
    t.run(s.mount("#host", root({}, text({}, "a"), text({}))));
    const [t1, t2] = [...t.host.querySelectorAll("text")];
    t.run(s.update("#host", root({}, text({}, "b"), text({}, "new"))));
    expect(t1!.textContent).toBe("b");
    expect(t2!.textContent).toBe("new");
    expect([...t.host.querySelectorAll("text")]).toEqual([t1, t2]);
    t.run(s.update("#host", root({}, text({}), text({}, "new"))));
    expect(t1!.textContent).toBe("");
    expect(t1!.childNodes.length).toBe(0);
  });

  test("text stays before children when children change", () => {
    const t = setup();
    t.run(
      s.mount(
        "#host",
        root({}, svg("text", {}, "lead", svg("tspan", {}, "a"))),
      ),
    );
    t.run(
      s.update(
        "#host",
        root(
          {},
          svg("text", {}, "lead", svg("tspan", {}, "a"), svg("tspan", {}, "b")),
        ),
      ),
    );
    expect(t.host.querySelector("text")!.textContent).toBe("leadab");
    expect(t.host.querySelector("text")!.firstChild!.nodeType).toBe(3);
  });

  test("keyed children move instead of being recreated", () => {
    const t = setup();
    const list = (ids: string[]) =>
      root({}, ...ids.map((id) => g({ key: id, id })));
    t.run(s.mount("#host", list(["a", "b", "c", "d"])));
    const els = Object.fromEntries(
      [...t.host.querySelectorAll("g")].map((e) => [e.id, e]),
    );
    t.run(s.update("#host", list(["d", "b", "e", "a"])));
    const now = [...t.host.querySelectorAll("g")];
    expect(now.map((e) => e.id)).toEqual(["d", "b", "e", "a"]);
    expect(now[0]).toBe(els.d);
    expect(now[1]).toBe(els.b);
    expect(now[3]).toBe(els.a);
    expect(els.c!.isConnected).toBe(false);
  });

  test("keyed reorder: children keep their own attributes", () => {
    const t = setup();
    const item = (k: string, x: number) => rect({ key: k, x });
    t.run(s.mount("#host", root({}, item("a", 1), item("b", 2))));
    const [ra, rb] = [...t.host.querySelectorAll("rect")];
    t.run(s.update("#host", root({}, item("b", 20), item("a", 1))));
    const now = [...t.host.querySelectorAll("rect")];
    expect(now).toEqual([rb, ra]);
    expect(rb!.getAttribute("x")).toBe("20");
    expect(ra!.getAttribute("x")).toBe("1");
  });

  test("unkeyed children patch by position; tag change replaces", () => {
    const t = setup();
    t.run(s.mount("#host", root({}, circle({ r: 1 }), rect({ x: 1 }))));
    const [c, r] = [...t.host.querySelector("svg")!.children];
    t.run(s.update("#host", root({}, circle({ r: 2 }), circle({ r: 9 }), g())));
    const kids = [...t.host.querySelector("svg")!.children];
    expect(kids.map((k) => k.localName)).toEqual(["circle", "circle", "g"]);
    expect(kids[0]).toBe(c);
    expect(kids[1]).not.toBe(r);
    expect(kids[0]!.getAttribute("r")).toBe("2");
    expect(r!.isConnected).toBe(false);
  });

  test("removing children", () => {
    const t = setup();
    t.run(
      s.mount("#host", root({}, g({ key: 1 }), g({ key: 2 }), g({ key: 3 }))),
    );
    t.run(s.update("#host", root({}, g({ key: 2 }))));
    expect(t.host.querySelectorAll("g").length).toBe(1);
    t.run(s.update("#host", root()));
    expect(t.host.querySelectorAll("g").length).toBe(0);
  });

  test("randomized updates always match a fresh render", () => {
    let seed = 7;
    const rnd = (n: number) => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed % n;
    };
    const gen = (): any => {
      const kids: any[] = [];
      const used = new Set<number>();
      for (let i = 0, n = rnd(6); i < n; i++) {
        const keyed = rnd(2) === 0;
        let k = rnd(8);
        if (keyed && used.has(k)) continue;
        used.add(k);
        const tag = ["g", "rect", "circle"][rnd(3)]!;
        kids.push(
          svg(
            tag,
            {
              ...(keyed ? { key: k } : {}),
              ...(rnd(2) ? { x: rnd(5) } : {}),
              ...(rnd(2) ? { fill: "red" } : {}),
            },
            rnd(3) === 0 ? "t" + rnd(3) : null,
            tag === "g" && rnd(2) ? [svg("rect", { key: rnd(3) })] : null,
          ),
        );
      }
      return root({}, kids);
    };
    const t = setup();
    t.run(s.mount("#host", gen()));
    for (let i = 0; i < 200; i++) {
      const tree = gen();
      t.run(s.update("#host", tree));
      const fresh = document.createElement("div");
      fresh.innerHTML = serializeSvg(tree);
      expect(
        t.host.firstElementChild!.outerHTML.replace(` xmlns="${NS}"`, ""),
      ).toBe(fresh.firstElementChild!.outerHTML.replace(` xmlns="${NS}"`, ""));
    }
  });

  test("invalid update leaves the DOM untouched", () => {
    const t = setup();
    t.run(s.mount("#host", root({}, circle({ r: 1 }))));
    const before = t.host.innerHTML;
    t.run(s.update("#host", root({}, { tag: "script" } as any), "err"));
    expect(t.msgs[0]).toMatchObject({
      id: "err",
      payload: { code: "invalid" },
    });
    expect(t.host.innerHTML).toBe(before);
  });

  test("update before mount is an error", () => {
    const t = setup();
    t.run(s.update("#host", root(), "err"));
    expect(t.msgs[0]).toMatchObject({
      id: "err",
      payload: { code: "notFound" },
    });
  });

  test("update root must be svg", () => {
    const t = setup();
    t.run(s.mount("#host", root()));
    t.run(s.update("#host", g(), "err"));
    expect(t.msgs[0]).toMatchObject({ payload: { code: "invalid" } });
  });
});

describe("events", () => {
  function svgWithRect(t: ReturnType<typeof setup>, handler: object) {
    t.run(
      s.mount(
        "#host",
        root(
          { viewBox: "0 0 200 100" },
          rect({
            id: "r",
            on: { click: handler as any, pointerdown: { id: "down" } },
          }),
        ),
      ),
    );
    const el = t.host.querySelector("svg")!;
    el.getBoundingClientRect = () =>
      ({ left: 10, top: 20, width: 100, height: 50 }) as DOMRect;
    return { el, r: t.host.querySelector("#r")! };
  }

  test("click dispatches id, payload and event info", () => {
    const t = setup();
    const { r } = svgWithRect(t, { id: "clicked", payload: { n: 1 } });
    r.dispatchEvent(
      new MouseEvent("click", { bubbles: true, clientX: 60, clientY: 45 }),
    );
    expect(t.msgs).toEqual([
      {
        id: "clicked",
        payload: { n: 1, x: 100, y: 50 },
        event: { type: "click" },
      },
    ]);
  });

  test("coordinates are in viewBox space", () => {
    const t = setup();
    const { r } = svgWithRect(t, { id: "c" });
    r.dispatchEvent(
      new MouseEvent("pointerdown", { clientX: 10, clientY: 20 }),
    );
    r.dispatchEvent(
      new MouseEvent("pointerdown", { clientX: 110, clientY: 70 }),
    );
    expect(t.msgs.map((m) => m.payload)).toEqual([
      { x: 0, y: 0 },
      { x: 200, y: 100 },
    ]);
  });

  test("uses the CTM when the browser provides one", () => {
    const t = setup();
    const { el, r } = svgWithRect(t, { id: "c" });
    (el as any).createSVGPoint = () => ({
      x: 0,
      y: 0,
      matrixTransform() {
        return { x: this.x / 10, y: this.y / 10 };
      },
    });
    (el as any).getScreenCTM = () => ({ inverse: () => ({}) });
    r.dispatchEvent(new MouseEvent("click", { clientX: 30, clientY: 50 }));
    expect(t.msgs[0]!.payload).toEqual({ x: 3, y: 5 });
  });

  test("non-object payloads are wrapped, no payload gives {x,y}", () => {
    const t = setup();
    const { r } = svgWithRect(t, { id: "c", payload: 5 });
    r.dispatchEvent(new MouseEvent("click", { clientX: 10, clientY: 20 }));
    r.dispatchEvent(
      new MouseEvent("pointerdown", { clientX: 10, clientY: 20 }),
    );
    expect(t.msgs[0]!.payload).toEqual({ payload: 5, x: 0, y: 0 });
    expect(t.msgs[1]!.payload).toEqual({ x: 0, y: 0 });
  });

  test("events without coordinates keep the payload untouched; key is reported", () => {
    const t = setup();
    t.run(
      s.mount(
        "#host",
        root({}, { tag: "g", on: { keydown: { id: "k", payload: "p" } } }),
      ),
    );
    t.host
      .querySelector("g")!
      .dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(t.msgs).toEqual([
      { id: "k", payload: "p", event: { type: "keydown", key: "Enter" } },
    ]);
  });

  test("prevent and stop", () => {
    const t = setup();
    const { r, el } = svgWithRect(t, { id: "c", prevent: true, stop: true });
    let bubbled = false;
    el.addEventListener("click", () => (bubbled = true));
    const ev = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      clientX: 0,
      clientY: 0,
    });
    r.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(bubbled).toBe(false);
  });

  test("update swaps handlers without stacking listeners, removal detaches", () => {
    const t = setup();
    t.run(s.mount("#host", root({}, rect({ on: { click: { id: "a" } } }))));
    const r = t.host.querySelector("rect")!;
    expect(t.plugin.listeners()).toBe(1);
    t.run(s.update("#host", root({}, rect({ on: { click: { id: "b" } } }))));
    expect(t.plugin.listeners()).toBe(1);
    r.dispatchEvent(new MouseEvent("click", { clientX: 0, clientY: 0 }));
    expect(t.msgs.map((m) => m.id)).toEqual(["b"]);
    t.run(s.update("#host", root({}, rect({ on: { dblclick: { id: "d" } } }))));
    expect(t.plugin.listeners()).toBe(1);
    r.dispatchEvent(new MouseEvent("click", { clientX: 0, clientY: 0 }));
    expect(t.msgs.length).toBe(1);
    t.run(s.update("#host", root({}, rect())));
    expect(t.plugin.listeners()).toBe(0);
  });

  test("removing a subtree detaches its listeners", () => {
    const t = setup();
    t.run(
      s.mount(
        "#host",
        root(
          {},
          g({ key: 1 }, rect({ on: { click: { id: "a" } } })),
          g({ key: 2 }),
        ),
      ),
    );
    expect(t.plugin.listeners()).toBe(1);
    t.run(s.update("#host", root({}, g({ key: 2 }))));
    expect(t.plugin.listeners()).toBe(0);
  });
});

describe("unmount / dispose", () => {
  test("unmount removes the svg and listeners", () => {
    const t = setup();
    t.run(s.mount("#host", root({}, rect({ on: { click: { id: "a" } } }))));
    t.run(s.unmount("#host"));
    expect(t.host.innerHTML).toBe("");
    expect(t.plugin.mounted()).toBe(0);
    expect(t.plugin.listeners()).toBe(0);
    t.run(s.unmount("#host")); // idempotent
    t.run(s.unmount("#nope")); // no throw
  });

  test("dispose unmounts everything", () => {
    const t = setup();
    t.host.innerHTML = '<div id="a"></div><div id="b"></div>';
    t.run(s.mount("#a", root({}, rect({ on: { click: { id: "x" } } }))));
    t.run(s.mount("#b", root()));
    expect(t.plugin.mounted()).toBe(2);
    t.plugin.dispose!();
    expect(t.plugin.mounted()).toBe(0);
    expect(t.plugin.listeners()).toBe(0);
    expect(t.host.querySelector("svg")).toBeNull();
  });
});

describe("measure", () => {
  beforeEach(() => {
    (SVGElement.prototype as any).getBBox = undefined;
  });

  test("replies getBBox of root or selector", () => {
    const t = setup();
    t.run(s.mount("#host", root({}, rect({ id: "r" }), circle({ id: "c" }))));
    (SVGElement.prototype as any).getBBox = function () {
      return {
        x: 1,
        y: 2,
        width: this.id === "r" ? 30 : 4,
        height: 5,
        extra: 1,
      };
    };
    t.run(s.measure("#host", "m", "#r"));
    t.run(s.measure("#host", "m"));
    expect(t.msgs).toEqual([
      { id: "m", payload: { x: 1, y: 2, width: 30, height: 5 } },
      { id: "m", payload: { x: 1, y: 2, width: 4, height: 5 } },
    ]);
  });

  test("unsupported getBBox, missing element, bad selector", () => {
    const t = setup();
    t.run(s.mount("#host", root({}, rect({ id: "r" }))));
    t.run(s.measure("#host", "m", "#r", "err"));
    expect(t.msgs[0]).toMatchObject({ payload: { code: "unsupported" } });
    (SVGElement.prototype as any).getBBox = () => ({
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    });
    t.run(s.measure("#host", "m", "#zzz", "err"));
    expect(t.msgs[1]).toMatchObject({ payload: { code: "notFound" } });
    t.run(s.measure("#host", "m", "!!", "err"));
    expect(t.msgs[2]).toMatchObject({ payload: { code: "invalid" } });
  });

  test("getBBox that throws replies failed", () => {
    const t = setup();
    t.run(s.mount("#host", root()));
    (SVGElement.prototype as any).getBBox = () => {
      throw new Error("not rendered");
    };
    t.run(s.measure("#host", "m", undefined, "err"));
    expect(t.msgs[0]).toMatchObject({
      payload: { code: "failed", message: "not rendered" },
    });
  });
});

describe("svgEffector", () => {
  test("builds plain data", () => {
    expect(s.unmount("#a")).toEqual({
      plugin: "svg",
      type: "unmount",
      target: "#a",
    });
    expect(s.mount("#a", root(), "m")).toEqual({
      plugin: "svg",
      type: "mount",
      target: "#a",
      tree: { tag: "svg" },
      onMounted: "m",
    });
  });
});
