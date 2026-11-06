// The pages plugin, without Vite: the `none` and `dist` modes, the injected
// `document` hook, and the reply contract (the answer carries the effect's
// ctx, so the flow continues in the same request).
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { PluginContext } from "@pavlus/core";
import { collector } from "../../testing/mod.ts";
import {
  createPagesPlugin,
  type PagesEffect,
  type PagesPlugin,
  pagesEffector,
  type ServedPage,
} from "./mod.ts";

/** Hands one serve effect to the plugin, with a reply collector. */
function serve(p: PagesPlugin, path: string, search = "") {
  const c = collector();
  const effect: PagesEffect = {
    ...pagesEffector.serve(path, search),
    ctx: { rid: "r1", conn: "test" },
  };
  p.handle(effect, { dispatch: c.dispatch } as PluginContext);
  return c;
}

const body = (p: unknown): string =>
  typeof p === "string"
    ? p
    : String.fromCharCode(...new Uint8Array(p as ArrayBufferLike));

let root: string;

afterAll(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});

describe("mode: none", () => {
  it("answers 404 json: the server runs the API only", async () => {
    const p = createPagesPlugin({ mode: "none", root: "/dev/null" });
    const c = serve(p, "/anything");
    const m = await c.next("pages.served");
    const answer = m.payload as ServedPage;
    expect(answer.status).toBe(404);
    expect(JSON.parse(body(answer.body))).toEqual({
      error: "no frontend: this server runs the API only",
    });
    // the reply carries the effect's ctx: the flow keeps its rid
    expect(m.ctx?.rid).toBe("r1");
    await expect(p.ready()).resolves.toBeUndefined();
    await expect(p.close()).resolves.toBeUndefined();
  });
});

describe("mode: dist", () => {
  it("without a build: the template read fails, answered as 404 json", async () => {
    root = await mkdtemp(join(tmpdir(), "pages-empty-"));
    const p = createPagesPlugin({ mode: "dist", root });
    const m = await serve(p, "/").next("pages.served");
    const answer = m.payload as ServedPage;
    expect(answer.status).toBe(404);
    expect(JSON.parse(body(answer.body)).error).toMatch(/index\.html/);
    expect(m.ctx?.rid).toBe("r1");
  });

  it("serves an asset of dist/ as-is", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pages-dist-"));
    await mkdir(join(dir, "dist"));
    await writeFile(join(dir, "dist", "index.html"), TEMPLATE);
    await writeFile(join(dir, "dist", "styles.css"), "body{color:red}");
    const p = createPagesPlugin({ mode: "dist", root: dir });

    const css = await serve(p, "/styles.css").next("pages.served");
    const answer = css.payload as ServedPage;
    expect(answer.status).toBe(200);
    expect(answer.headers["content-type"]).toBe("text/css; charset=utf-8");
    expect(body(answer.body)).toBe("body{color:red}");
    expect(css.ctx?.rid).toBe("r1");

    const missing = await serve(p, "/nope.css").next("pages.served");
    expect((missing.payload as ServedPage).status).toBe(404);
    await rm(dir, { recursive: true, force: true });
  });

  it("renders the page through the injected document hook", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pages-dist-"));
    await mkdir(join(dir, "dist"));
    await writeFile(join(dir, "dist", "index.html"), TEMPLATE);
    const seen: unknown[] = [];
    const p = createPagesPlugin({
      mode: "dist",
      root: dir,
      document: async (input) => {
        seen.push({ path: input.path, search: input.search });
        return input.template.replace("{{}}", `rendered ${input.path}`);
      },
    });

    const page = await serve(p, "/3/edit", "?a=b").next("pages.served");
    const answer = page.payload as ServedPage;
    expect(answer.status).toBe(200);
    expect(answer.headers["content-type"]).toBe("text/html; charset=utf-8");
    expect(body(answer.body)).toContain("rendered /3/edit");
    expect(seen).toEqual([{ path: "/3/edit", search: "?a=b" }]);
    expect(page.ctx?.rid).toBe("r1");
    await rm(dir, { recursive: true, force: true });
  });

  it("falls back to the plain template when the hook throws (or there is none)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pages-dist-"));
    await mkdir(join(dir, "dist"));
    await writeFile(join(dir, "dist", "index.html"), TEMPLATE);
    const boom = createPagesPlugin({
      mode: "dist",
      root: dir,
      document: async () => {
        throw new Error("ssr exploded");
      },
    });
    const failed = await serve(boom, "/").next("pages.served");
    expect((failed.payload as ServedPage).status).toBe(200);
    expect(body((failed.payload as ServedPage).body)).not.toContain("rendered");

    const plain = createPagesPlugin({ mode: "dist", root: dir });
    const noHook = await serve(plain, "/").next("pages.served");
    expect(body((noHook.payload as ServedPage).body)).toBe(TEMPLATE);
    await rm(dir, { recursive: true, force: true });
  });

  it("a failure of serve reaches pages.failed with the ctx and {code, message}", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pages-dist-"));
    await mkdir(join(dir, "dist"));
    await writeFile(join(dir, "dist", "index.html"), TEMPLATE);
    const p = createPagesPlugin({ mode: "dist", root: dir });
    // a non-string path: extname throws, the error is answered, not thrown
    const c = serve(p, 42 as unknown as string);
    const m = await c.next("pages.failed");
    // toErrorPayload keeps the error's own code when it has one
    expect(typeof (m.payload as { code: string }).code).toBe("string");
    expect(typeof (m.payload as { message: string }).message).toBe("string");
    expect(m.ctx?.rid).toBe("r1");
    await rm(dir, { recursive: true, force: true });
  });

  it("ignores effects that are not a serve", () => {
    const p = createPagesPlugin({ mode: "none", root: "/dev/null" });
    const c = collector();
    p.handle(
      { plugin: "pages", type: "bogus" } as unknown as PagesEffect,
      { dispatch: c.dispatch } as PluginContext,
    );
    expect(c.messages).toEqual([]);
  });
});

const TEMPLATE = '<html><body><div id="app">{{}}</div></body></html>';
