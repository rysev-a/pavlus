import { afterEach, describe, expect, it, vi } from "vitest";
import { flushSync } from "../core/mod.ts";
import { html, suspense } from "../dom/mod.ts";
import { clearCache, resource } from "../resource/mod.ts";
import { createMemoryHistory, createRouter } from "../router/mod.ts";
import type { History } from "../router/mod.ts";
import { hydrate, renderToString } from "./mod.ts";

const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

const containers: HTMLElement[] = [];
function container(markup: string): HTMLElement {
  const c = document.body.appendChild(document.createElement("div"));
  c.innerHTML = markup;
  containers.push(c);
  return c;
}
afterEach(() => {
  for (const c of containers.splice(0)) c.remove();
  clearCache();
});

describe("resource + hydrate", () => {
  const make =
    (fetcher: (n: number) => Promise<{ n: number }>, staleTime: number) =>
    () => {
      const r = resource(() => 5, fetcher, {
        key: (n) => ["item", n],
        staleTime,
      });
      return html`<main>
        ${suspense(
          () => html`<i>loading</i>`,
          () => html`<b>${() => r()?.n}</b>`,
        )}
      </main>`;
    };

  it("starts from the server's value: no refetch within staleTime, nodes keep identity", async () => {
    const fetcher = vi.fn((n: number) => sleep(2).then(() => ({ n })));
    const App = make(fetcher, 60_000);
    const markup = await renderToString(App, { url: "/" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const c = container(markup);
    const b = c.querySelector("b")!;
    const warn = vi.fn();
    hydrate(App, c, { onMismatch: warn });
    await sleep(10);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
    expect(c.querySelector("b")).toBe(b);
    expect(b.textContent).toBe("5");
  });

  it("revalidates in the background when staleTime is 0, showing the server value meanwhile", async () => {
    let calls = 0;
    const fetcher = vi.fn((n: number) => {
      const v = ++calls;
      return sleep(2).then(() => ({ n: n * 100 + v }));
    });
    const App = make(fetcher, 0);
    const c = container(await renderToString(App, { url: "/" }));
    const b = c.querySelector("b")!;
    expect(b.textContent).toBe("501");
    hydrate(App, c, { onMismatch: () => {} });
    flushSync();
    expect(b.textContent).toBe("501");
    expect(fetcher).toHaveBeenCalledTimes(2);
    await sleep(10);
    expect(b.textContent).toBe("502");
    expect(c.querySelector("b")).toBe(b);
  });

  it("takes each transferred value once", async () => {
    const fetcher = vi.fn((n: number) => sleep(2).then(() => ({ n })));
    const App = make(fetcher, 60_000);
    const c = container(await renderToString(App, { url: "/" }));
    const stop = hydrate(App, c, { onMismatch: () => {} });
    stop();
    clearCache();
    // a second mount (client navigation later) must fetch, not reuse the server snapshot
    const d = document.body.appendChild(document.createElement("div"));
    containers.push(d);
    const { render } = await import("../dom/mod.ts");
    render(App, d);
    await sleep(10);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

describe("router + hydrate", () => {
  const App = (history?: History) => () => {
    const r = createRouter({
      routes: [
        { path: "/", component: () => html`<h1>home</h1>` },
        {
          path: "/p/:id",
          component: (p) => html`<h1>p ${() => p.params().id}</h1>`,
        },
      ],
      history,
    });
    return html`<main>${r.outlet()}</main>`;
  };

  it("renders the page of the request url and hydrates it in place", async () => {
    const markup = await renderToString(App(), { url: "/p/9" });
    expect(markup).not.toContain("home");
    const c = container(markup);
    const h1 = c.querySelector("h1")!;
    const warn = vi.fn();
    hydrate(App(createMemoryHistory(["/p/9"])), c, { onMismatch: warn });
    expect(warn).not.toHaveBeenCalled();
    expect(c.querySelector("h1")).toBe(h1);
    expect(h1.textContent).toMatch(/p\s*9/);
  });
});

describe("hydrate claim order", () => {
  it("claims a template nested in a reactive child in the order the client builds it (regression)", async () => {
    const App = () =>
      html`<main>
        ${() => html`<h1>x</h1>`}
        <footer>${() => html`<em>y</em>`}</footer>
      </main>`;
    const c = container(await renderToString(App));
    const [main, h1, em] = [
      c.querySelector("main")!,
      c.querySelector("h1")!,
      c.querySelector("em")!,
    ];
    const warn = vi.fn();
    hydrate(App, c, { onMismatch: warn });
    expect(warn).not.toHaveBeenCalled();
    expect(c.querySelector("main")).toBe(main);
    expect(c.querySelector("h1")).toBe(h1);
    expect(c.querySelector("em")).toBe(em);
  });
});
