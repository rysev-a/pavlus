// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { html, suspense } from "../dom/mod.ts";
import { cacheSize, resource } from "../resource/mod.ts";
import { createRouter } from "../router/mod.ts";
import { renderToString } from "./mod.ts";

const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

function app() {
  const router = createRouter({
    routes: [
      { path: "/", component: () => html`<h1>home</h1>` },
      {
        path: "/u/:id",
        component: (p) =>
          html`<h1>user ${() => p.params().id} ${() => p.query().tab}</h1>`,
      },
      { path: "*", component: () => html`<h1>missing</h1>` },
    ],
  });
  return html`<main>${router.outlet()}</main>`;
}

describe("router during SSR", () => {
  it("takes its location from the request url", async () => {
    expect(await renderToString(app, { url: "/u/7?tab=a" })).toMatch(
      /user <!--\$mx\$-->7<!--\/\$mx\$--> <!--\$mx\$-->a/,
    );
    expect(await renderToString(app, { url: "/nope" })).toContain("missing");
    expect(await renderToString(app, { url: "/" })).toContain("home");
  });

  it("strips the base from the request url", async () => {
    const out = await renderToString(
      () => {
        const r = createRouter({
          base: "/app",
          routes: [{ path: "/x", component: () => html`<p>x page</p>` }],
        });
        return r.outlet();
      },
      { url: "/app/x" },
    );
    expect(out).toContain("x page");
  });
});

describe("router loaders during SSR", () => {
  it("waits for the guards and loaders of the requested page", async () => {
    const out = await renderToString(
      () => {
        const r = createRouter({
          routes: [
            {
              path: "/p/:id",
              load: ({ params }) =>
                sleep(5).then(() => ({ name: `item ${params.id}` })),
              component: (p) => html`<h1>${() => p.data()?.name}</h1>`,
            },
          ],
        });
        return r.outlet();
      },
      { url: "/p/4" },
    );
    expect(out).toContain("item 4");
  });
});

describe("resource during SSR", () => {
  it("serialises keyed results into the transfer state", async () => {
    const out = await renderToString(
      () => {
        const r = resource(
          () => 3,
          (n) => sleep(2).then(() => ({ n })),
          { key: (n) => ["thing", n] },
        );
        return suspense(
          () => html`<i>…</i>`,
          () => html`<b>${() => r()?.n}</b>`,
        );
      },
      { url: "/" },
    );
    expect(out).toMatch(/<b[^>]*>3<\/b>/);
    const m =
      /<script type="application\/json" id="__MAXIMUS_STATE__">(.*?)<\/script>/.exec(
        out,
      );
    expect(m).not.toBeNull();
    expect(JSON.parse(m![1]!)).toEqual({ '"thing"\u00013': { n: 3 } });
  });

  it("keeps the cache per request", async () => {
    const fetcher = vi.fn((n: number) => sleep(2).then(() => n));
    const view = () => {
      const r = resource(() => 1, fetcher, {
        key: () => ["same"],
        staleTime: 60_000,
      });
      return suspense(
        () => html`<i>…</i>`,
        () => html`<b>${() => r()}</b>`,
      );
    };
    const before = cacheSize();
    await Promise.all([
      renderToString(view, { url: "/a" }),
      renderToString(view, { url: "/b" }),
    ]);
    // two requests, two fetches: nothing is shared, and nothing leaks into the global cache
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(cacheSize()).toBe(before);
    await renderToString(view, { url: "/c" });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});
