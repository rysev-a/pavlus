import { afterEach, describe, expect, it, vi } from "vitest";
import { computed, signal, registerPending, flushSync } from "../core/mod.ts";
import { each, html, show, suspense, svg } from "../dom/mod.ts";
import { fire } from "../testing/mod.ts";
import { clearCache, resource } from "../resource/mod.ts";
import { createForm, required } from "../form/mod.ts";
import {
  TransferState,
  deserializeState,
  hydrate,
  isServer,
  renderToStream,
  renderToString,
  serializeState,
  stateScript,
  useServer,
  useTransferState,
} from "./mod.ts";

const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

/** The mini resource used by the tests: server fetches and records, client takes the transferred value. */
function res<T>(key: string, fetcher: () => Promise<T>): () => T | undefined {
  const st = useTransferState();
  const data = signal<T | undefined>(undefined);
  const cached = isServer() ? undefined : st?.take<T>(key);
  if (cached !== undefined) data.set(cached);
  else
    registerPending(
      fetcher().then((v) => {
        data.set(v);
        if (isServer()) st?.set(key, v);
      }),
    );
  return data;
}

async function collect(stream: ReadableStream<string>): Promise<string[]> {
  const out: string[] = [];
  const reader = stream.getReader();
  for (;;) {
    const r = await reader.read();
    if (r.done) return out;
    out.push(r.value);
  }
}

const containers: HTMLElement[] = [];
function container(markup: string): HTMLElement {
  const c = document.body.appendChild(document.createElement("div"));
  c.innerHTML = markup;
  containers.push(c);
  return c;
}
afterEach(() => {
  for (const c of containers.splice(0)) c.remove();
  vi.restoreAllMocks();
});

describe("renderToString", () => {
  it("renders templates, attributes, props, booleans, classes and styles", async () => {
    const out = await renderToString(
      () =>
        html`<div
          class=${["a", { on: true, off: false }]}
          style=${{ color: "red" }}
          title="x ${"y"}"
        >
          <input .value=${"v"} ?disabled=${true} .checked=${true} />
          <p>${"hi"} ${3}</p>
        </div>`,
    );
    expect(out).toContain('class="a on"');
    expect(out).toContain('style="color: red;"');
    expect(out).toContain('title="x y"');
    expect(out).toContain('<input value="v" disabled="" checked=""');
    expect(out).toMatch(/<p>.*hi.*3.*<\/p>/);
  });

  it("escapes text and attributes", async () => {
    const evil = `<img src=x onerror=alert(1)>"&`;
    const out = await renderToString(() => html`<p title=${evil}>${evil}</p>`);
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;img src=x onerror=alert(1)&gt;&quot;&amp;");
  });

  it("rejects unsafe URLs like the client does", async () => {
    await expect(
      renderToString(() => html`<a href=${"javascript:alert(1)"}>x</a>`),
    ).rejects.toThrow(/unsafe URL/);
  });

  it("renders each, show, nested templates and svg", async () => {
    const items = signal(["a", "b"]);
    const out = await renderToString(
      () =>
        html`<ul>
            ${each(
              items,
              (s) => s,
              (s) => html`<li>${s}</li>`,
            )}
          </ul>
          ${show(
            () => true,
            () => html`<b>yes</b>`,
          )}${svg`<circle r=${5}/>`}`,
    );
    expect(out).toMatch(/<li[^>]*>a<\/li>.*<li[^>]*>b<\/li>/s);
    expect(out).toContain("<b");
    expect(out).toContain("yes");
    expect(out).toContain('<circle r="5"');
  });

  it("exposes the url to the app", async () => {
    let seen: string | undefined;
    await renderToString(() => ((seen = useServer()?.url), html`<i></i>`), {
      url: "/users/1?x=2",
    });
    expect(seen).toBe("/users/1?x=2");
    expect(useServer()).toBeNull();
    expect(isServer()).toBe(false);
  });

  it("waits for registered resources and renders the ready content", async () => {
    const out = await renderToString(() => {
      const data = res("k", () => sleep(15).then(() => "loaded"));
      return html`${suspense(
        () => html`<p>loading</p>`,
        () => html`<p>${() => data() ?? "?"}</p>`,
      )}`;
    });
    expect(out).toContain("loaded");
    expect(out).not.toContain("loading");
    expect(out).toContain("__MAXIMUS_STATE__");
    expect(out).toContain('{"k":"loaded"}');
  });

  it("waits for resources outside any suspense boundary", async () => {
    const out = await renderToString(() => {
      const data = res("a", () => sleep(5).then(() => 42));
      return html`<p>${() => data() ?? "none"}</p>`;
    });
    expect(out).toContain("42");
  });

  it("times out and renders the fallback", async () => {
    const onTimeout = vi.fn();
    const out = await renderToString(
      () =>
        suspense(
          () => html`<p>loading</p>`,
          () => {
            const d = res("slow", () => sleep(200).then(() => "late"));
            return html`<p>${() => d() ?? ""}</p>`;
          },
        ),
      { timeout: 20, onTimeout },
    );
    expect(onTimeout).toHaveBeenCalledWith(1);
    expect(out).toContain("loading");
    await sleep(220);
  });

  it("restores the environment and disposes the tree", async () => {
    let disposed = false;
    const { onCleanup } = await import("../core/mod.ts");
    await renderToString(() => {
      onCleanup(() => (disposed = true));
      return html`<i></i>`;
    });
    expect(disposed).toBe(true);
    expect(isServer()).toBe(false);
    expect(html`<b>${"x"}</b>`).toBeInstanceOf(HTMLElement);
  });

  it("runs concurrent renders independently", async () => {
    const [a, b] = await Promise.all([
      renderToString(() => {
        const d = res("x", () => sleep(10).then(() => "A"));
        return html`<p>${() => d() ?? ""}</p>`;
      }),
      renderToString(() => {
        const d = res("x", () => sleep(1).then(() => "B"));
        return html`<p>${() => d() ?? ""}</p>`;
      }),
    ]);
    expect(a).toContain("A");
    expect(a).not.toContain(">B<");
    expect(b).toContain("B");
  });
});

describe("hydrate", () => {
  it("adopts the server DOM: node identity is kept and handlers work", async () => {
    const App = () => {
      const n = signal(0);
      return html`<div id="app">
        <button @click=${() => n.update((c) => c + 1)}>clicked ${n}</button>
        <p class=${() => (n() > 0 ? "on" : "off")}>${() => n() * 2}</p>
      </div>`;
    };
    const c = container(await renderToString(App));
    const button = c.querySelector("button")!;
    const p = c.querySelector("p")!;
    const text = button.firstChild;
    const warn = vi.fn();
    const dispose = hydrate(App, c, { onMismatch: warn });
    expect(warn).not.toHaveBeenCalled();
    expect(c.querySelector("button")).toBe(button);
    expect(c.querySelector("p")).toBe(p);
    expect(c.innerHTML).not.toContain("data-mx-i");
    fire(button, "click");
    flushSync();
    expect(button.textContent).toBe("clicked 1");
    expect(p.textContent).toBe("2");
    expect(p.className).toBe("on");
    expect(button.firstChild).toBe(text);
    dispose();
  });

  it("adopts nested templates, each rows and show branches without recreating elements", async () => {
    const Row = (name: () => string, onPick: () => void) =>
      html`<li @click=${onPick}>${name}</li>`;
    const App = () => {
      const items = signal([
        { id: 1, n: "a" },
        { id: 2, n: "b" },
      ]);
      const picked = signal("");
      return html`<section>
        <ul>
          ${each(
            items,
            (i) => i.id,
            (item) =>
              Row(
                () => item().n,
                () => picked.set(item().n),
              ),
          )}
        </ul>
        ${show(
          () => picked() !== "",
          () => html`<em>${picked}</em>`,
          () => html`<span>none</span>`,
        )}
        <button @click=${() => items.update((l) => [...l, { id: 3, n: "c" }])}>
          add
        </button>
      </section>`;
    };
    const c = container(await renderToString(App));
    const lis = [...c.querySelectorAll("li")];
    const span = c.querySelector("span")!;
    const section = c.querySelector("section")!;
    const warn = vi.fn();
    hydrate(App, c, { onMismatch: warn });
    expect(warn).not.toHaveBeenCalled();
    expect(c.querySelector("section")).toBe(section);
    expect([...c.querySelectorAll("li")]).toEqual(lis);
    expect(c.querySelector("span")).toBe(span);
    fire(lis[1]!, "click");
    flushSync();
    expect(c.querySelector("em")!.textContent).toBe("b");
    expect(c.querySelector("span")).toBeNull();
    fire(c.querySelector("button")!, "click");
    flushSync();
    const after = [...c.querySelectorAll("li")];
    expect(after.length).toBe(3);
    expect(after[0]).toBe(lis[0]);
    expect(after[1]).toBe(lis[1]);
  });

  it("hydrates multi-root templates and text-only holes", async () => {
    const App = () => {
      const n = signal(1);
      return html`<h1>t</h1>
        ${() => `n=${n()}`}
        <p>${n}</p>`;
    };
    const c = container(await renderToString(App));
    const h1 = c.querySelector("h1")!;
    const warn = vi.fn();
    hydrate(App, c, { onMismatch: warn });
    expect(warn).not.toHaveBeenCalled();
    expect(c.querySelector("h1")).toBe(h1);
    expect(c.textContent).toBe("tn=11");
  });

  it("reports a text mismatch and repairs it", async () => {
    const c = container(await renderToString(() => html`<p>${"server"}</p>`));
    const p = c.querySelector("p")!;
    const warn = vi.fn();
    hydrate(() => html`<p>${"client"}</p>`, c, { onMismatch: warn });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toMatch(
      /text mismatch.*server "server".*client "client"/,
    );
    expect(c.querySelector("p")).toBe(p);
    expect(p.textContent).toBe("client");
  });

  it("reports a template mismatch and builds the client version", async () => {
    const c = container(await renderToString(() => html`<p>${"x"}</p>`));
    const warn = vi.fn();
    hydrate(() => html`<div>${"x"}</div>`, c, { onMismatch: warn });
    expect(warn.mock.calls.some((m) => /template mismatch/.test(m[0]))).toBe(
      true,
    );
    expect(c.querySelector("div")!.textContent).toBe("x");
    expect(c.querySelector("p")).toBeNull();
  });

  it("warns on console by default", async () => {
    const c = container(await renderToString(() => html`<p>${"a"}</p>`));
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    hydrate(() => html`<p>${"b"}</p>`, c);
    expect(spy.mock.calls[0]![0]).toMatch(/^Maximus hydrate:/);
  });

  it("transfers the resource cache: the client does not fetch again", async () => {
    const fetcher = vi.fn(() => sleep(5).then(() => ({ name: "Ada" })));
    const App = () => {
      const user = res("user", fetcher);
      return html`<main>
        ${suspense(
          () => html`<p>loading</p>`,
          () => html`<h1>${() => user()?.name ?? "..."}</h1>`,
        )}
      </main>`;
    };
    const markup = await renderToString(App);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const c = container(markup);
    const h1 = c.querySelector("h1")!;
    expect(h1.textContent).toBe("Ada");
    const warn = vi.fn();
    hydrate(App, c, { onMismatch: warn });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
    expect(c.querySelector("h1")).toBe(h1);
    expect(c.querySelector("script")).toBeNull();
    expect(h1.textContent).toBe("Ada");
  });

  it("accepts state passed explicitly", () => {
    const c = container("<p>x</p>");
    let got: unknown;
    hydrate(() => ((got = useTransferState()?.get("a")), html`<p>x</p>`), c, {
      state: { a: 1 },
      onMismatch: () => {},
    });
    expect(got).toBe(1);
  });

  it("dispose tears down the bindings", async () => {
    const n = signal(0);
    const App = () => html`<p>${n}</p>`;
    const c = container(await renderToString(App));
    const p = c.querySelector("p")!;
    const dispose = hydrate(App, c, { onMismatch: () => {} });
    n.set(5);
    flushSync();
    expect(p.textContent).toBe("5");
    dispose();
    n.set(6);
    flushSync();
    expect(c.querySelector("p")).toBeNull();
    expect(p.textContent).toBe("5");
  });
});

describe("with resource and form", () => {
  it("waits for the real resource primitive", async () => {
    clearCache();
    const App = () => {
      const user = resource(
        () => 1,
        (id) => sleep(10).then(() => ({ name: `user ${id}` })),
        { key: (id) => ["u", id] },
      );
      return html`${suspense(
        () => html`<p>loading</p>`,
        () => html`<h1>${() => user()?.name ?? ""}</h1>`,
      )}`;
    };
    const out = await renderToString(App);
    expect(out).toContain("user 1");
    expect(out).not.toContain("loading");
    clearCache();
  });

  it("server-renders a prefilled form and hydrates it", async () => {
    const make = () =>
      createForm({
        initial: { name: "Ann", agree: true, color: "b", bio: "hello" },
        validators: { name: [required()] },
      });
    const App = () => {
      const f = make();
      return html`<form>
        <input class="n" ${f.field("name").bind} />
        <input type="checkbox" class="c" ${f.field("agree").bind} />
        <select class="s" ${f.field("color").bind}>
          <option value="a">A</option>
          <option value="b">B</option>
        </select>
        <textarea class="t" ${f.field("bio").bind}></textarea>
        <p>${f.field("name").value}</p>
      </form>`;
    };
    const markup = await renderToString(App);
    expect(markup).toContain('value="Ann"');
    expect(markup).toContain("checked");
    expect(markup).toMatch(/<option value="b" selected/);
    expect(markup).toMatch(/<textarea[^>]*>hello<\/textarea>/);
    const c = container(markup);
    const input = c.querySelector<HTMLInputElement>(".n")!;
    const warn = vi.fn();
    hydrate(App, c, { onMismatch: warn });
    expect(warn).not.toHaveBeenCalled();
    expect(c.querySelector(".n")).toBe(input);
    expect(input.value).toBe("Ann");
    fire(input, "input", { value: "Zed" });
    flushSync();
    expect(c.querySelector("p")!.textContent).toBe("Zed");
  });
});

describe("renderToStream", () => {
  const App =
    (ms = 10): (() => Node) =>
    () => {
      return html`<main>
        <h1>shell</h1>
        ${suspense(
          () => html`<p>fallback</p>`,
          () => {
            const slow = res("slow", () => sleep(ms).then(() => "SLOW"));
            return html`<p>${() => slow() ?? ""}</p>`;
          },
        )}
      </main>` as Node;
    };

  it("sends the shell first, then the suspended parts, then the state", async () => {
    const chunks = await collect(renderToStream(App()));
    expect(chunks[0]).toContain("<h1");
    expect(chunks[0]).toContain("fallback");
    expect(chunks[0]).not.toContain("SLOW");
    expect(chunks[0]).toContain("<!--suspense:1-->");
    const rest = chunks.slice(1).join("");
    expect(chunks[1]).toContain("function $MX");
    expect(rest).toContain('<template id="mx-b1">');
    expect(rest).toContain("SLOW");
    expect(rest).toContain("$MX(1)");
    expect(chunks[chunks.length - 1]).toContain("__MAXIMUS_STATE__");
    expect(rest.indexOf("<template")).toBeLessThan(
      rest.indexOf("__MAXIMUS_STATE__"),
    );
  });

  it("the replacement scripts swap the content in a real document, then hydration adopts it", async () => {
    const chunks = await collect(renderToStream(App()));
    const c = document.body.appendChild(document.createElement("div"));
    containers.push(c);
    c.innerHTML = chunks[0]!;
    expect(c.textContent).toContain("fallback");
    // run the inline scripts the way a browser would (innerHTML does not execute them)
    for (const chunk of chunks.slice(1)) {
      const tmp = document.createElement("div");
      tmp.innerHTML = chunk;
      for (const node of [...tmp.childNodes]) {
        if (
          node.nodeName === "SCRIPT" &&
          (node as HTMLScriptElement).type !== "application/json"
        ) {
          // jsdom does not run inserted scripts: evaluate in the global scope like a browser would
          (0, eval)((node as HTMLScriptElement).textContent!);
        } else c.appendChild(node);
      }
    }
    expect(c.textContent).not.toContain("fallback");
    expect(c.textContent).toContain("SLOW");
    const h1 = c.querySelector("h1")!;
    const warn = vi.fn();
    hydrate(App(), c, { onMismatch: warn });
    expect(warn).not.toHaveBeenCalled();
    expect(c.querySelector("h1")).toBe(h1);
    expect(c.textContent).toContain("SLOW");
  });

  it("streams two boundaries in completion order", async () => {
    const App2 = () => {
      return html`<div>
        ${suspense(
          () => html`<i>fa</i>`,
          () => {
            const a = res("a", () => sleep(40).then(() => "AAA"));
            return html`<p>${() => a() ?? ""}</p>`;
          },
        )}${suspense(
          () => html`<i>fb</i>`,
          () => {
            const b = res("b", () => sleep(5).then(() => "BBB"));
            return html`<p>${() => b() ?? ""}</p>`;
          },
        )}
      </div>`;
    };
    const chunks = await collect(renderToStream(App2));
    const order = chunks.filter((c) => c.includes("<template"));
    expect(order[0]).toContain("BBB");
    expect(order[0]).toContain('id="mx-b2"');
    expect(order[1]).toContain("AAA");
    expect(chunks[0]).toContain("fa");
    expect(chunks[0]).toContain("fb");
  });

  it("can be cancelled", async () => {
    const stream = renderToStream(App(500));
    const reader = stream.getReader();
    const first = await reader.read();
    expect(first.value).toContain("shell");
    await reader.cancel();
    expect(isServer()).toBe(false);
  });
});

describe("state transfer and escaping", () => {
  it("escapes </script>, html metacharacters and line separators", () => {
    const text = serializeState({
      a: "</script><script>alert(1)</script>",
      b: "x\u2028y\u2029z",
      c: "<!-- & -->",
    });
    expect(text).not.toContain("<");
    expect(text).not.toContain(">");
    expect(text).not.toContain("&");
    expect(text).not.toContain("\u2028");
    expect(text).not.toContain("\u2029");
    expect(deserializeState(text).toJSON()).toEqual({
      a: "</script><script>alert(1)</script>",
      b: "x\u2028y\u2029z",
      c: "<!-- & -->",
    });
  });

  it("the state script cannot be closed early by data", () => {
    const html = stateScript({ evil: "</script><img src=x onerror=alert(1)>" });
    expect(html.match(/<\/script>/g)).toHaveLength(1);
    const d = document.createElement("div");
    d.innerHTML = html;
    expect(d.querySelectorAll("script")).toHaveLength(1);
    expect(d.querySelector("img")).toBeNull();
    expect(
      deserializeState(d.querySelector("script")!.textContent!).get("evil"),
    ).toBe("</script><img src=x onerror=alert(1)>");
  });

  it("rejects non-object state", () => {
    expect(() => deserializeState("[1]")).toThrow(/object/);
  });

  it("TransferState basics", () => {
    const s = new TransferState({ a: 1 });
    expect(s.get("a")).toBe(1);
    expect(s.take("a")).toBe(1);
    expect(s.has("a")).toBe(false);
    s.set("b", 2);
    expect(s.size).toBe(1);
    expect(computed(() => 1)()).toBe(1);
  });
});
