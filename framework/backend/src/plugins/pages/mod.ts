// The pages plugin: everything impure about serving a frontend — Vite in
// development, the build in `dist/`, the assets — behind one effect:
//
//   pages.serve({ path, search })  ->  replies `pages.served` with the whole
//   answer {status, headers, body}, so the pure handler answers the request
//   with one http respond effect (the server-rendered document included: for
//   ssr we return http).
//
// The document itself is injected: `document({ template, frontend, path,
// search })` renders the whole HTML — typically the server render through
// @pavlus/frontend, which the app (not the plugin) imports. Without the hook,
// or when it throws, the plain template is served and the app renders in the
// browser.

import { readFile, stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, join, normalize } from "node:path";
import { pathToFileURL } from "node:url";
import type { Plugin, PluginContext } from "@pavlus/core";
import { deliver, fail, ok, toErrorPayload } from "../../ctx.ts";

/** Where the pages come from. */
export type FrontendMode = "dev" | "dist" | "none";

/** What the plugin answers one `pages.serve` with. */
export interface ServedPage {
  status: number;
  headers: Record<string, string | string[]>;
  body: string | Uint8Array;
}

export interface PagesEffect {
  plugin: "pages";
  type: "serve";
  /** The request path, as it came in ("/", "/1/edit", "/@vite/client"). */
  path: string;
  /** "?a=b" or "". */
  search: string;
  /** The request's cookies, so a server render can act as the user. */
  cookies?: Record<string, string>;
  ctx?: Record<string, unknown>;
  replyTo?: string;
  onError?: string;
  [k: string]: unknown;
}

export const pagesEffector = {
  serve: (
    path: string,
    search: string,
    cookies?: Record<string, string>,
  ): PagesEffect => ({
    plugin: "pages",
    type: "serve",
    path,
    search,
    ...(cookies && { cookies }),
    replyTo: "pages.served",
    onError: "pages.failed",
  }),
};

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

const jsonAnswer = (status: number, body: unknown): ServedPage => ({
  status,
  headers: JSON_HEADERS,
  body: JSON.stringify(body),
});

const htmlAnswer = (html: string): ServedPage => ({
  status: 200,
  headers: { "content-type": "text/html; charset=utf-8" },
  body: html,
});

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

// ------------------------------------------------------------- the frontends --

/** What one mode needs to render a page (and to answer an asset). */
interface Pages {
  /** index.html for `path` (in development, with Vite's client script). */
  template(path: string): Promise<string>;
  /**
   * The frontend's server entry (app + initialState), loaded. Opaque to the
   * plugin: the `document` hook knows what to do with it.
   */
  frontend(): Promise<unknown>;
  /**
   * Serves an asset of the mode; null when the request is not one (a page).
   * In development Vite's own middleware decides, writing into a buffer.
   */
  asset(path: string, search: string): Promise<ServedPage | null>;
  close(): Promise<void>;
}

/** Production: the build in `dist/`. */
function distPages(root: string): Pages {
  const dist = join(root, "dist");
  let template: Promise<string> | undefined;
  let frontend: Promise<unknown> | undefined;
  return {
    template: () =>
      (template ??= readFile(join(dist, "index.html"), "utf8").catch((e) => {
        template = undefined;
        throw e;
      })),
    frontend: () =>
      (frontend ??= import(
        pathToFileURL(join(dist, "server", "entry-server.js")).href
      )),
    async asset(path) {
      if (!extname(path)) return null;
      // `normalize` collapses `..`, and the join keeps the result inside dist.
      const relative = normalize(path).replace(/^(\.\.[/\\])+/, "");
      let file = join(dist, relative);
      if (!file.startsWith(dist)) file = join(dist, "index.html");
      try {
        if ((await stat(file)).isDirectory()) file = join(file, "index.html");
      } catch {
        return jsonAnswer(404, { error: `no file ${path}` });
      }
      try {
        return {
          status: 200,
          headers: {
            "content-type": TYPES[extname(file)] ?? "application/octet-stream",
          },
          body: await readFile(file),
        };
      } catch {
        return jsonAnswer(404, {
          error: "frontend not built: run `npm run build`",
        });
      }
    },
    close: async () => {},
  };
}

/**
 * Development: Vite in middleware mode. The middleware writes into a buffer
 * that stands in for the response (the flow owns the socket; the bytes go back
 * as one `pages.served` reply), and calls `next` for what it does not know —
 * a page.
 */
async function devPages(
  root: string,
  quiet: boolean,
  hmrPort?: number,
): Promise<Pages> {
  const { createServer: createVite } = await import("vite");
  const { pavlus } = await import("@pavlus/frontend/vite");
  const vite = await createVite({
    // Inline on purpose (`configFile: false`): letting Vite load the config
    // makes it bundle it into node_modules/.vite-temp and delete it right
    // after, which `node --watch` (npm run dev) reports as a change and
    // restarts the whole server at every boot. Keep in sync with
    // vite.config.mjs — vitest and `vite build` use the file.
    configFile: false,
    root,
    appType: "custom",
    server: {
      middlewareMode: true,
      // The HMR websocket needs its own port (Vite's default 24678): two dev
      // servers on one machine — admin and an application — would collide.
      ...(hmrPort && { hmr: { port: hmrPort } }),
    },
    logLevel: quiet ? "silent" : "info",
    plugins: [pavlus()],
    ssr: { external: ["@pavlus/frontend"] },
  });

  /** The buffer Vite's middleware writes its answer into. */
  const bufferRes = (
    done: (r: ServedPage) => void,
  ): Record<string, unknown> => {
    let status = 200;
    let headersSent = false;
    const headers: Record<string, string | string[]> = {};
    const chunks: Buffer[] = [];
    const put = (k: string, v: unknown) => {
      headers[k.toLowerCase()] = Array.isArray(v) ? v.map(String) : String(v);
    };
    return {
      get statusCode() {
        return status;
      },
      set statusCode(n: number) {
        status = n;
      },
      get headersSent() {
        return headersSent;
      },
      get writableEnded() {
        return headersSent;
      },
      setHeader(k: string, v: unknown) {
        put(k, v);
        return this;
      },
      getHeader(k: string) {
        return headers[k.toLowerCase()];
      },
      removeHeader(k: string) {
        delete headers[k.toLowerCase()];
      },
      writeHead(s: number, h?: Record<string, unknown>) {
        status = s;
        if (h) for (const [k, v] of Object.entries(h)) put(k, v);
        return this;
      },
      write(c: unknown) {
        headersSent = true;
        chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(String(c)));
        return true;
      },
      end(c?: unknown) {
        if (c !== undefined && c !== null)
          chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(String(c)));
        headersSent = true;
        done({ status, headers, body: Buffer.concat(chunks) });
        return this;
      },
      on() {
        return this;
      },
      once() {
        return this;
      },
      off() {
        return this;
      },
      removeListener() {
        return this;
      },
      emit() {
        return false;
      },
    };
  };

  return {
    async template(path) {
      const raw = await readFile(join(root, "index.html"), "utf8");
      return vite.transformIndexHtml(path, raw);
    },
    async frontend() {
      try {
        return await vite.ssrLoadModule("/app/entry-server.ts");
      } catch (e) {
        if (e instanceof Error) vite.ssrFixStacktrace(e);
        throw e;
      }
    },
    asset: (path, search) =>
      new Promise<ServedPage | null>((resolve) => {
        let settled = false;
        const finish = (r: ServedPage | null) => {
          if (!settled) {
            settled = true;
            resolve(r);
          }
        };
        // Vite answers what it knows (its client, modules, public/ files)
        // and calls `next` for the rest: a page.
        const req = {
          url: path + search,
          method: "GET",
          headers: {},
        } as unknown as IncomingMessage;
        const res = bufferRes((r) => finish(r)) as unknown as ServerResponse;
        try {
          vite.middlewares(req, res, () => finish(null));
        } catch {
          finish(null);
        }
      }),
    close: () => vite.close(),
  };
}

// ------------------------------------------------------------------ plugin --

/** What the `document` hook renders one page with. */
export interface DocumentInput {
  /** index.html for the path, already through the mode's transform. */
  template: string;
  /** The frontend's server entry, loaded by the mode (dev: by Vite). */
  frontend: () => Promise<unknown>;
  /** The request path, and "?a=b" or "". */
  path: string;
  search: string;
  /** The request's cookies — a server render can act as the user. */
  cookies: Record<string, string>;
}

export interface PagesPluginOptions {
  mode: FrontendMode;
  /** The app root: where index.html, public/ and dist/ live. */
  root: string;
  /** No Vite log (tests). */
  quiet?: boolean;
  /**
   * The port of Vite's HMR websocket in dev (default: Vite's own 24678).
   * Give each dev server on one machine its own — e.g. admin stays on the
   * default and team-up takes 24679 — or the second one fails to bind.
   */
  hmrPort?: number;
  /**
   * Renders the whole document — the server render. The answer is the full
   * HTML. When the hook throws, or is not given, the plain template is served
   * and the app renders in the browser.
   */
  document?: (input: DocumentInput) => Promise<string>;
}

export interface PagesPlugin extends Plugin<PagesEffect, unknown> {
  /** Everything is served once this resolves (Vite is up). */
  ready(): Promise<void>;
  close(): Promise<void>;
}

export function createPagesPlugin(opts: PagesPluginOptions): PagesPlugin {
  const pages: Promise<Pages> | undefined =
    opts.mode === "dev"
      ? devPages(opts.root, opts.quiet ?? false, opts.hmrPort)
      : opts.mode === "dist"
        ? Promise.resolve(distPages(opts.root))
        : undefined;

  /**
   * Renders the page; if that fails, the plain document (the app renders in
   * the browser).
   */
  async function render(
    pages: Pages,
    path: string,
    search: string,
    cookies: Record<string, string>,
  ) {
    let template: string;
    try {
      template = await pages.template(path);
    } catch (e) {
      return jsonAnswer(404, {
        error: e instanceof Error ? e.message : String(e),
      });
    }
    let html = template;
    if (opts.document) {
      try {
        html = await opts.document({
          template,
          frontend: () => pages.frontend(),
          path,
          search,
          cookies,
        });
      } catch (e) {
        console.error(`render ${path}:`, e);
      }
    }
    return htmlAnswer(html);
  }

  async function serve(
    path: string,
    search: string,
    cookies: Record<string, string>,
  ): Promise<ServedPage> {
    if (!pages)
      return jsonAnswer(404, {
        error: "no frontend: this server runs the API only",
      });
    const p = await pages;
    const asset = await p.asset(path, search);
    return asset ?? (await render(p, path, search, cookies));
  }

  let closing: Promise<void> | undefined;
  const onceClosed = (): Promise<void> =>
    (closing ??= pages
      ? pages
          .then((p) => p.close())
          .then(
            () => {},
            () => {},
          )
      : Promise.resolve());
  return {
    name: "pages",
    ready: () => (pages ? pages.then(() => {}) : Promise.resolve()),
    handle(effect: PagesEffect, ctx: PluginContext) {
      if (effect.type !== "serve") return;
      void (async () => {
        try {
          deliver(
            ctx.dispatch,
            ok(
              effect,
              await serve(
                effect.path,
                effect.search,
                (effect.cookies as Record<string, string> | undefined) ?? {},
              ),
            ),
          );
        } catch (e) {
          deliver(
            ctx.dispatch,
            fail(effect, toErrorPayload(e, "pages_error"), "pages.failed"),
          );
        }
      })();
    },
    dispose() {
      void onceClosed();
    },
    close: () => onceClosed(),
  };
}
