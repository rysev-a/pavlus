import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fire, flush, mount } from "../testing/mod.ts";
import {
  batch,
  computed,
  debugStats,
  effect,
  onCleanup,
  root,
  signal,
  subscriberCount,
} from "../core/mod.ts";
import { html, svg, render, show } from "./mod.ts";

afterEach(cleanup);

describe("html: structure", () => {
  it("returns an Element for a single root and a fragment otherwise", () => {
    const one = html`<p>x</p>`;
    expect(one.nodeType).toBe(1);
    expect(one.parentNode).toBeNull();
    const many = html`<p>a</p>
      <p>b</p>`;
    expect(many.nodeType).toBe(11);
    expect(many.childNodes.length).toBe(2);
    expect(html`text only`.nodeType).toBe(11);
  });

  it("ignores leading/trailing whitespace and indentation between elements", () => {
    const el = html`
      <ul>
        <li>a</li>
        <li>b</li>
      </ul>
    ` as HTMLElement;
    expect(el.tagName).toBe("UL");
    expect(el.childNodes.length).toBe(2);
  });

  it("parses once per call site and clones afterwards", () => {
    const make = (n: number) => html`<i>${n}</i>`;
    const spy = vi.spyOn(document, "createElement");
    make(1);
    const afterFirst = spy.mock.calls.filter((c) => c[0] === "template").length;
    make(2);
    make(3);
    expect(spy.mock.calls.filter((c) => c[0] === "template").length).toBe(
      afterFirst,
    );
    spy.mockRestore();
  });

  it("caches by strings identity: the same call site shares, different sites do not", () => {
    const a = (v: string) => html`<b>${v}</b>`;
    const b = (v: string) => html`<b>${v}</b>`;
    const x = a("1") as HTMLElement;
    const y = a("2") as HTMLElement;
    const z = b("3") as HTMLElement;
    expect([x.textContent, y.textContent, z.textContent]).toEqual([
      "1",
      "2",
      "3",
    ]);
    const strings: string[][] = [];
    const tag = (s: TemplateStringsArray, ..._v: unknown[]) => (
      strings.push([...s]),
      s
    );
    const s1 = tag`<b>${1}</b>`;
    const s2 = tag`<b>${1}</b>`;
    expect(s1).not.toBe(s2);
  });

  it("throws helpful errors for unsupported hole positions", () => {
    const tagName = "div";
    expect(() => html`<${tagName}></${tagName}>`).toThrow(/tag name/);
    expect(
      () =>
        html`<style>
          .a {
            color: ${"red"};
          }
        </style>`,
    ).toThrow(/<style>/);
    expect(() => html`<div class${"x"}></div>`).toThrow(/forget/);
    expect(() => html`<div @click="a ${1} b"></div>`).toThrow(/whole value/);
  });

  it("keeps static markup, entities and attributes intact", () => {
    const el = html`<a href="/x?a=1&amp;b=2" data-k='v"q' hidden
      >caf&eacute;</a
    >` as HTMLElement;
    expect(el.getAttribute("href")).toBe("/x?a=1&b=2");
    expect(el.getAttribute("data-k")).toBe('v"q');
    expect(el.hasAttribute("hidden")).toBe(true);
    expect(el.textContent).toBe("café");
  });
});

describe("html: child holes", () => {
  it("escapes text: markup in values is never parsed", () => {
    const evil = `<img src=x onerror="window.pwned=1">`;
    const m = mount(() => html`<p>${evil}</p>`);
    expect(m.query("p").textContent).toBe(evil);
    expect(m.container.querySelector("img")).toBeNull();
    expect((window as unknown as { pwned?: number }).pwned).toBeUndefined();
  });

  it("renders strings, numbers, bigint, null, undefined, booleans", () => {
    const m = mount(
      () =>
        html`<p>
          ${"a"}|${1}|${2n}|${null}|${undefined}|${true}|${false}|${0}
        </p>`,
    );
    expect(m.query("p").textContent).toBe("a|1|2|||||0");
  });

  it("updates a signal child in place (one text node)", () => {
    const n = signal(1);
    const m = mount(() => html`<p>${n}</p>`);
    const text = m.query("p").firstChild;
    n.set(2);
    return flush().then(() => {
      expect(m.query("p").textContent).toBe("2");
      expect(m.query("p").firstChild).toBe(text);
    });
  });

  it("supports function children and switching between kinds", async () => {
    const mode = signal<"text" | "el" | "none" | "list">("text");
    const m = mount(
      () =>
        html`<div>
          ${() => {
            switch (mode()) {
              case "text":
                return "hello";
              case "el":
                return html`<b>bold</b>`;
              case "list":
                return [html`<i>1</i>`, "-", html`<i>2</i>`];
              default:
                return null;
            }
          }}
        </div>`,
    );
    const text = () => m.query("div").innerHTML.replace(/<!--[^>]*-->/g, "");
    expect(text()).toBe("hello");
    mode.set("el");
    await flush();
    expect(text()).toBe("<b>bold</b>");
    mode.set("list");
    await flush();
    expect(text()).toBe("<i>1</i>-<i>2</i>");
    mode.set("none");
    await flush();
    expect(text()).toBe("");
    mode.set("text");
    await flush();
    expect(text()).toBe("hello");
  });

  it("nests templates and keeps their bindings live", async () => {
    const n = signal(1);
    const inner = html`<span>${n}</span>`;
    const m = mount(() => html`<div>a${inner}b</div>`);
    expect(m.text()).toBe("a1b");
    n.set(2);
    await flush();
    expect(m.text()).toBe("a2b");
  });

  it("accepts Node values and arrays with mixed content", () => {
    const node = document.createElement("hr");
    const m = mount(() => html`<div>${[node, "x", [1, 2], () => "f"]}</div>`);
    expect(m.query("div").innerHTML.replace(/<!--[^>]*-->/g, "")).toBe(
      "<hr>x12f",
    );
  });

  it("handles fragments with root-level holes and static siblings", async () => {
    const n = signal("a");
    const m = mount(() => html`${n}<br />${() => n().toUpperCase()}`);
    expect(m.html()).toBe("a<br>A");
    n.set("b");
    await flush();
    expect(m.html()).toBe("b<br>B");
  });

  it("works inside tables (comment markers survive the parser)", async () => {
    const rows = signal([1, 2]);
    const m = mount(
      () =>
        html`<table>
          <tbody>
            ${() =>
              rows().map(
                (r) =>
                  html`<tr>
                    <td>${r}</td>
                  </tr>`,
              )}
          </tbody>
        </table>`,
    );
    expect(m.queryAll("td").map((t) => t.textContent)).toEqual(["1", "2"]);
    rows.set([3]);
    await flush();
    expect(m.queryAll("td").map((t) => t.textContent)).toEqual(["3"]);
  });

  it("an element returned from a getter is reused when identical", async () => {
    const tick = signal(0);
    const el = document.createElement("em");
    const m = mount(() => html`<div>${() => (tick(), el)}</div>`);
    tick.set(1);
    await flush();
    expect(m.query("div").firstChild).toBe(el);
    expect(m.queryAll("em").length).toBe(1);
  });

  it("disposes bindings of replaced content", async () => {
    const which = signal(true);
    const inner = signal(0);
    const m = mount(
      () => html`<div>${() => (which() ? html`<b>${inner}</b>` : "off")}</div>`,
    );
    expect(subscriberCount(inner)).toBe(1);
    which.set(false);
    await flush();
    expect(subscriberCount(inner)).toBe(0);
    m.unmount();
  });

  it("inserts unsafe() strings as parsed HTML only when opted in", async () => {
    const { unsafe } = await import("./mod.ts");
    const m = mount(() => html`<div>${unsafe("<b>x</b>")}</div>`);
    expect(m.container.querySelector("b")?.textContent).toBe("x");
  });
});

describe("html: attributes", () => {
  it("binds attributes statically and reactively; null/false remove, true is empty", async () => {
    const v = signal<string | boolean | null>("a");
    const m = mount(() => html`<div data-x=${v} data-y=${"static"}></div>`);
    const d = m.query("div");
    expect(d.getAttribute("data-x")).toBe("a");
    expect(d.getAttribute("data-y")).toBe("static");
    v.set(null);
    await flush();
    expect(d.hasAttribute("data-x")).toBe(false);
    v.set(true);
    await flush();
    expect(d.getAttribute("data-x")).toBe("");
    v.set(false);
    await flush();
    expect(d.hasAttribute("data-x")).toBe(false);
  });

  it("builds composite attributes from several holes and static text", async () => {
    const a = signal("x");
    const m = mount(
      () =>
        html`<div title="1 ${a} 2 ${() => a() + a()} 3" data-p=${"q"}></div>`,
    );
    expect(m.query("div").getAttribute("title")).toBe("1 x 2 xx 3");
    a.set("y");
    await flush();
    expect(m.query("div").getAttribute("title")).toBe("1 y 2 yy 3");
  });

  it("accepts single-quoted, double-quoted and unquoted holes", () => {
    const m = mount(() => html`<p a=${1} b="${2}" c="${3}" d="x${4}"></p>`);
    const p = m.query("p");
    expect([
      p.getAttribute("a"),
      p.getAttribute("b"),
      p.getAttribute("c"),
      p.getAttribute("d"),
    ]).toEqual(["1", "2", "3", "x4"]);
  });

  it("preserves attribute-name case for svg-ish names", () => {
    const m = mount(
      () => html`<svg viewBox=${"0 0 10 10"}><path d=${"M0 0"} /></svg>`,
    );
    expect(m.query("svg").getAttribute("viewBox")).toBe("0 0 10 10");
    expect(m.query("path").getAttribute("d")).toBe("M0 0");
  });

  it("?bool toggles presence", async () => {
    const off = signal(true);
    const m = mount(() => html`<button ?disabled=${off}>x</button>`);
    const b = m.query<HTMLButtonElement>("button");
    expect(b.disabled).toBe(true);
    off.set(false);
    await flush();
    expect(b.disabled).toBe(false);
  });

  it(".prop assigns properties, skipping no-op writes", async () => {
    const v = signal("a");
    const m = mount(() => html`<input .value=${v} />`);
    const input = m.query<HTMLInputElement>("input");
    expect(input.value).toBe("a");
    input.value = "typed";
    v.set("b");
    await flush();
    expect(input.value).toBe("b");
    const set = vi.fn();
    const target = {} as Record<string, unknown>;
    Object.defineProperty(target, "x", {
      set,
      get: () => 5,
      configurable: true,
    });
    expect(input.value).toBe("b");
  });

  it("class accepts strings, arrays and objects with reactive entries, preserving static classes", async () => {
    const active = signal(true);
    const extra = signal("e1");
    const m = mount(
      () =>
        html`<div
          class=${() => ["base", extra(), { on: active, off: () => !active() }]}
        ></div>`,
    );
    const d = m.query("div");
    d.classList.add("external");
    expect([...d.classList].sort()).toEqual(["base", "e1", "external", "on"]);
    active.set(false);
    extra.set("e2");
    await flush();
    expect([...d.classList].sort()).toEqual(["base", "e2", "external", "off"]);
  });

  it("class composite keeps both static and dynamic parts", async () => {
    const c = signal("a");
    const m = mount(() => html`<p class="static ${c} tail"></p>`);
    expect([...m.query("p").classList]).toEqual(["static", "a", "tail"]);
    c.set("b");
    await flush();
    expect([...m.query("p").classList].sort()).toEqual(["b", "static", "tail"]);
  });

  it("style objects set and remove properties (camelCase, kebab, custom props)", async () => {
    const color = signal<string | null>("red");
    const m = mount(
      () =>
        html`<div
          style=${() => ({ color: color(), fontSize: "12px", "--gap": "4px", display: () => "block" })}
        ></div>`,
    );
    const d = m.query<HTMLElement>("div");
    expect(d.style.color).toBe("red");
    expect(d.style.fontSize).toBe("12px");
    expect(d.style.getPropertyValue("--gap")).toBe("4px");
    expect(d.style.display).toBe("block");
    color.set(null);
    await flush();
    expect(d.style.color).toBe("");
    expect(d.style.fontSize).toBe("12px");
  });

  it("style strings are supported", async () => {
    const s = signal("color: blue");
    const m = mount(() => html`<div style=${s}></div>`);
    expect(m.query<HTMLElement>("div").style.color).toBe("blue");
    s.set("");
    await flush();
    expect(m.query("div").hasAttribute("style")).toBe(false);
  });

  it("ref receives the element, with a function or a signal (reset on dispose)", () => {
    const seen: Element[] = [];
    const r = signal<Element | null>(null);
    const m = mount(
      () =>
        html`<p ref=${(el: Element) => seen.push(el)}></p>
          <i ref=${r}></i>`,
    );
    expect(seen[0]).toBe(m.query("p"));
    expect(r()).toBe(m.query("i"));
    m.unmount();
    expect(r()).toBeNull();
  });
});

describe("html: spread and directives", () => {
  it("spreads an object using attribute-position syntax", () => {
    const click = vi.fn();
    const m = mount(
      () =>
        html`<button
          ...${{ id: "b", class: "c", "?disabled": false, ".title": "t", "@click": click }}
        >
          x
        </button>`,
    );
    const b = m.query<HTMLButtonElement>("button");
    expect([b.id, b.className, b.disabled, b.title]).toEqual([
      "b",
      "c",
      false,
      "t",
    ]);
    b.click();
    expect(click).toHaveBeenCalledOnce();
  });

  it("a bare ${} in a tag is a spread too", () => {
    const m = mount(() => html`<a ${{ href: "/x", "data-k": "v" }}>l</a>`);
    expect(m.query("a").getAttribute("href")).toBe("/x");
    expect(m.query("a").getAttribute("data-k")).toBe("v");
  });

  it("a function is a directive called once with the element, may return a cleanup", () => {
    const log: string[] = [];
    const dir = (el: Element) => {
      log.push("dir:" + el.tagName);
      return () => log.push("cleanup");
    };
    const m = mount(() => html`<p ${dir}></p>`);
    expect(log).toEqual(["dir:P"]);
    m.unmount();
    expect(log).toEqual(["dir:P", "cleanup"]);
  });

  it("a reactive spread (signal of object) adds, changes and removes keys", async () => {
    const props = signal<Record<string, unknown>>({
      "data-a": "1",
      class: "x",
    });
    const m = mount(() => html`<div ...${props}></div>`);
    const d = m.query("div");
    expect(d.getAttribute("data-a")).toBe("1");
    expect(d.className).toBe("x");
    props.set({ "data-b": "2", class: "y" });
    await flush();
    expect(d.hasAttribute("data-a")).toBe(false);
    expect(d.getAttribute("data-b")).toBe("2");
    expect(d.className).toBe("y");
    props.set({});
    await flush();
    expect(d.hasAttribute("data-b")).toBe(false);
    expect(d.className).toBe("");
  });

  it("a reactive spread re-binds events without piling up listeners", async () => {
    const calls: string[] = [];
    const props = signal<Record<string, unknown>>({
      "@click": () => calls.push("one"),
    });
    const m = mount(() => html`<button ...${props}>x</button>`);
    props.set({ "@click": () => calls.push("two") });
    await flush();
    m.query("button").click();
    expect(calls).toEqual(["two"]);
  });
});

describe("html: events", () => {
  it("calls handlers with the event and `this` as the element", () => {
    let got: { e?: Event; self?: unknown } = {};
    const m = mount(
      () =>
        html`<button
          @click=${function (this: unknown, e: Event) {
            got = { e, self: this };
          }}
        >
          x
        </button>`,
    );
    m.query("button").click();
    expect(got.e?.type).toBe("click");
    expect(got.self).toBe(m.query("button"));
  });

  it("delegated events set currentTarget to the bound element and bubble in order", () => {
    const order: string[] = [];
    const m = mount(
      () =>
        html`<div
          @click=${(e: Event) => order.push("outer:" + (e.currentTarget as Element).id)}
          id="o"
        >
          <button
            @click=${(e: Event) => order.push("inner:" + (e.currentTarget as Element).id)}
            id="i"
          >
            x
          </button>
        </div>`,
    );
    m.query("button").click();
    expect(order).toEqual(["inner:i", "outer:o"]);
  });

  it("stopPropagation in a delegated handler stops delegated ancestors", () => {
    const outer = vi.fn();
    const m = mount(
      () =>
        html`<div @click=${outer}>
          <button @click=${(e: Event) => e.stopPropagation()}>x</button>
        </div>`,
    );
    m.query("button").click();
    expect(outer).not.toHaveBeenCalled();
  });

  it("modifiers: prevent, stop, self", () => {
    const parent = vi.fn();
    const onSubmit = vi.fn();
    const selfOnly = vi.fn();
    const m = mount(
      () =>
        html`<div @click=${parent}>
          <form @submit.prevent=${onSubmit}>
            <button type="submit">s</button>
          </form>
          <a href="#x" @click.prevent.stop=${() => {}}>a</a>
          <div @click.self=${selfOnly} id="s"><span>child</span></div>
        </div>`,
    );
    const ev = fire(m.query("form"), "submit");
    expect(ev.defaultPrevented).toBe(true);
    expect(onSubmit).toHaveBeenCalledOnce();
    const click = fire(m.query("a"), "click");
    expect(click.defaultPrevented).toBe(true);
    expect(parent).not.toHaveBeenCalled();
    m.query("span").click();
    expect(selfOnly).not.toHaveBeenCalled();
    m.query("#s").click();
    expect(selfOnly).toHaveBeenCalledOnce();
  });

  it(".once removes the listener after the first call; .capture and .passive attach directly", () => {
    const once = vi.fn();
    const cap = vi.fn();
    const order: string[] = [];
    const m = mount(
      () =>
        html`<div @click.capture=${() => order.push("capture")}>
          <button
            @click.once=${once}
            @click=${() => order.push("bubble")}
            @focus.passive=${cap}
          >
            x
          </button>
        </div>`,
    );
    const b = m.query("button");
    b.click();
    b.click();
    expect(once).toHaveBeenCalledTimes(1);
    expect(order).toEqual(["capture", "bubble", "capture", "bubble"]);
    fire(b, "focus");
    expect(cap).toHaveBeenCalledOnce();
  });

  it("rejects unknown modifiers", () => {
    expect(() => html`<b @click.nope=${() => {}}></b>`).toThrow(/modifier/);
    expect(() => html`<b @click=${"not a function"}></b>`).toThrow(/function/);
  });

  it("handlers are batched: several writes produce one update, visible synchronously after the event", () => {
    const a = signal(0);
    const b = signal(0);
    const runs = vi.fn();
    const m = mount(
      () =>
        html`<button
          @click=${() => (a.update((n) => n + 1), b.update((n) => n + 1))}
        >
          ${() => (runs(), a() + b())}
        </button>`,
    );
    runs.mockClear();
    m.query("button").click();
    expect(runs).toHaveBeenCalledTimes(1);
    expect(m.text()).toBe("2");
  });

  it("handlers are untracked", () => {
    const s = signal(0);
    const fx = vi.fn();
    const m = mount(() => html`<button @click=${() => s()}>x</button>`);
    root(() => effect(() => void fx()));
    m.query("button").click();
    expect(fx).toHaveBeenCalledTimes(1);
    expect(subscriberCount(s)).toBe(0);
  });

  it("listeners stop working after unmount and leave no leaks", () => {
    const base = debugStats();
    const fn = vi.fn();
    const n = signal(0);
    const m = mount(
      () =>
        html`<button @click=${fn} class=${() => "c" + n()} @focus.capture=${fn}>
          ${n}
        </button>`,
    );
    const b = m.query("button");
    expect(debugStats().owners).toBeGreaterThan(base.owners);
    m.unmount();
    b.click();
    fire(b, "focus");
    expect(fn).not.toHaveBeenCalled();
    expect(subscriberCount(n)).toBe(0);
    expect(debugStats()).toEqual(base);
  });

  it("fire() assigns value/checked for input handlers", () => {
    const v = signal("");
    const m = mount(
      () =>
        html`<input
            @input=${(e: Event) => v.set((e.target as HTMLInputElement).value)}
          />
          <p>${v}</p>`,
    );
    fire(m.query("input"), "input", { value: "hi" });
    expect(m.query("p").textContent).toBe("hi");
  });
});

describe("html: svg", () => {
  it("creates elements in the SVG namespace", () => {
    const r = signal(5);
    const frag = svg`<circle r=${r} cx="1"/><rect width="2" height="2"/>`;
    const c = frag.firstChild as SVGElement;
    expect(c.namespaceURI).toBe("http://www.w3.org/2000/svg");
    expect(c.getAttribute("r")).toBe("5");
    expect((frag.lastChild as SVGElement).namespaceURI).toBe(
      "http://www.w3.org/2000/svg",
    );
  });

  it("works nested in html and with reactive children and classes", async () => {
    const label = signal("a");
    const cls = signal("x");
    const m = mount(
      () => html`<svg><g class=${cls}>${svg`<text>${label}</text>`}</g></svg>`,
    );
    expect(m.query("text").textContent).toBe("a");
    expect(m.query("text").namespaceURI).toBe("http://www.w3.org/2000/svg");
    label.set("b");
    cls.set("y");
    await flush();
    expect(m.query("text").textContent).toBe("b");
    expect(m.query("g").getAttribute("class")).toBe("y");
  });
});

describe("render", () => {
  it("appends to the container, returns dispose, removes only its nodes", () => {
    const host = document.createElement("div");
    host.innerHTML = "<i>keep</i>";
    document.body.appendChild(host);
    const n = signal(1);
    const dispose = render(() => html`<b>${n}</b>`, host);
    expect(host.textContent).toBe("keep1");
    dispose();
    expect(host.innerHTML).toBe("<i>keep</i>");
    expect(subscriberCount(n)).toBe(0);
    dispose();
    host.remove();
  });

  it("runs onCleanup callbacks on dispose and user effects after attach", () => {
    const log: string[] = [];
    const host = document.createElement("div");
    document.body.appendChild(host);
    const dispose = render(() => {
      effect(
        () =>
          void log.push(
            "effect connected=" + host.contains(document.querySelector("#r")),
          ),
      );
      onCleanup(() => log.push("cleanup"));
      return html`<p id="r"></p>`;
    }, host);
    expect(log).toEqual(["effect connected=true"]);
    dispose();
    expect(log).toEqual(["effect connected=true", "cleanup"]);
    host.remove();
  });

  it("disposes and rethrows when the component throws", () => {
    const host = document.createElement("div");
    expect(() =>
      render(() => {
        throw new Error("render failed");
      }, host),
    ).toThrow("render failed");
    expect(host.childNodes.length).toBe(0);
  });

  it("a computed shared across components keeps working", async () => {
    const n = signal(2);
    const sq = computed(() => n() * n());
    const m = mount(
      () =>
        html`<p>${sq}</p>
          <p>${() => sq() + 1}</p>`,
    );
    expect(m.text()).toBe("45");
    n.set(3);
    await flush();
    expect(m.text()).toBe("910");
  });

  it("nested show inside a batch renders once", () => {
    const cond = signal(false);
    const m = mount(
      () => html`<div>${show(cond, () => html`<b>on</b>`)}</div>`,
    );
    batch(() => {
      cond.set(true);
      cond.set(false);
      cond.set(true);
    });
    expect(m.query("b").textContent).toBe("on");
  });
});
