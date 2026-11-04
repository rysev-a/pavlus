/**
 * The admin-app server: plain `node:http`, no framework.
 *
 * - `/api/*` answers JSON from Postgres (see api.ts).
 * - A page (a path without a file extension) is rendered on the server
 *   (ssr.ts, from the same pure app/ code) and hydrated in the browser. In
 *   development Vite runs inside this server (middleware mode: hot reload,
 *   templates compiled on the fly). In production (`NODE_ENV=production`)
 *   the build in `dist/` is used: its assets as static files,
 *   `dist/server/entry-server.js` to render.
 *
 * Run with `node backend/server.ts` (Node strips the types itself).
 */
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { readFile, stat } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { ViteDevServer } from "vite";
import { handleApi, type Query } from "./api.ts";
import { createPool } from "./db/pool.ts";
import { type Frontend, renderDocument, renderPage } from "./ssr.ts";

const PORT = Number(process.env.PORT ?? 3000);
// Plain paths: under jsdom (the tests) the global `URL` is not Node's.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist") + "/";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(text),
  });
  res.end(text);
}

function sendHtml(res: ServerResponse, html: string): void {
  res.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "content-length": Buffer.byteLength(html),
  });
  res.end(html);
}

/** The request body as JSON, or undefined without one (or when it is not JSON). */
async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (!chunks.length) return undefined;
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return undefined;
  }
}

/**
 * Serves a file from `dist/`. A path without a file extension is a route of
 * the single-page app and gets the index; a missing file is a 404.
 */
export async function sendStatic(
  pathname: string,
  res: ServerResponse,
  dist = DIST,
): Promise<void> {
  // `normalize` collapses `..`, and the join keeps the result inside `dist`.
  const relative = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  let file = join(dist, relative);
  if (!file.startsWith(dist)) file = join(dist, "index.html");
  try {
    if ((await stat(file)).isDirectory()) file = join(file, "index.html");
  } catch {
    if (extname(relative)) {
      sendJson(res, 404, { error: `no file ${pathname}` });
      return;
    }
    file = join(dist, "index.html");
  }
  try {
    const data = await readFile(file);
    res.writeHead(200, {
      "content-type": TYPES[extname(file)] ?? "application/octet-stream",
      "content-length": data.byteLength,
    });
    res.end(data);
  } catch {
    sendJson(res, 404, { error: "frontend not built: run `npm run build`" });
  }
}

/** Where the pages come from. */
export type FrontendMode = "dev" | "dist" | "none";

/** The frontend of one mode: its document template, its module, its assets. */
interface Pages {
  /** index.html for `url` (in development, with Vite's client script). */
  template(url: URL): Promise<string>;
  /** app/entry-server.ts, loaded. */
  frontend(): Promise<Frontend>;
  /** Serves an asset; `false` when the request is not one. */
  asset(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean>;
  close(): Promise<void>;
}

/** Production: the build in `dist/`. */
function distPages(): Pages {
  let template: Promise<string> | undefined;
  let frontend: Promise<Frontend> | undefined;
  return {
    template: () =>
      (template ??= readFile(join(DIST, "index.html"), "utf8").catch(() => {
        template = undefined;
        throw new Error("frontend not built: run `npm run build`");
      })),
    frontend: () =>
      (frontend ??= import(
        pathToFileURL(join(DIST, "server", "entry-server.js")).href
      ) as Promise<Frontend>),
    async asset(_req, res, url) {
      if (!extname(url.pathname)) return false;
      await sendStatic(url.pathname, res);
      return true;
    },
    close: async () => {},
  };
}

/** Development: Vite in middleware mode, templates compiled on the fly. */
async function devPages(quiet: boolean): Promise<Pages> {
  const { createServer: createVite } = await import("vite");
  const { pavlus } = await import("@service-laboratory/pavlus/vite");
  const vite: ViteDevServer = await createVite({
    // Inline on purpose (`configFile: false`): letting Vite load the config
    // makes it bundle it into node_modules/.vite-temp and delete it right
    // after, which `node --watch` (npm run dev) reports as a change and
    // restarts the whole server at every boot. Keep in sync with
    // vite.config.mjs — vitest and `vite build` use the file.
    configFile: false,
    root: ROOT,
    appType: "custom",
    server: { middlewareMode: true },
    logLevel: quiet ? "silent" : "info",
    plugins: [pavlus()],
    ssr: { external: ["@service-laboratory/pavlus"] },
  });
  return {
    async template(url) {
      const raw = await readFile(join(ROOT, "index.html"), "utf8");
      return vite.transformIndexHtml(url.pathname, raw);
    },
    async frontend() {
      try {
        return (await vite.ssrLoadModule("/app/entry-server.ts")) as Frontend;
      } catch (e) {
        if (e instanceof Error) vite.ssrFixStacktrace(e);
        throw e;
      }
    },
    asset: (req, res) =>
      new Promise((resolve) => {
        // Vite answers what it knows (its client, modules, public/ files)
        // and calls `next` for the rest: a page.
        res.once("finish", () => resolve(true));
        vite.middlewares(req, res, () => resolve(false));
      }),
    close: () => vite.close(),
  };
}

export interface ServerOptions {
  /** Defaults to a pool for `DATABASE_URL`; the server ends it when closed. */
  pool?: import("pg").Pool;
  /** No log lines (tests). */
  quiet?: boolean;
  /**
   * `dev` (Vite inside the server), `dist` (the build), or `none` (the API
   * only, for the tests). Default: `dist` under `NODE_ENV=production`, else
   * `dev`.
   */
  frontend?: FrontendMode;
}

export function startServer(
  port = PORT,
  opts: ServerOptions = {},
): ReturnType<typeof createServer> {
  const pool = opts.pool ?? createPool();
  const query: Query = (sql, params = []) =>
    pool.query(sql, params).then((r) => r.rows);
  const mode =
    opts.frontend ?? (process.env.NODE_ENV === "production" ? "dist" : "dev");
  const pages: Promise<Pages> | undefined =
    mode === "dev"
      ? devPages(opts.quiet ?? false)
      : mode === "dist"
        ? Promise.resolve(distPages())
        : undefined;

  /** Renders the page; if that fails, the plain document (the app renders in the browser). */
  async function sendPage(res: ServerResponse, url: URL, p: Pages) {
    let template: string;
    try {
      template = await p.template(url);
    } catch (e) {
      sendJson(res, 404, { error: e instanceof Error ? e.message : String(e) });
      return;
    }
    let html = template;
    try {
      html = renderDocument(
        template,
        await renderPage(await p.frontend(), query),
      );
    } catch (e) {
      console.error(`render ${url.pathname}:`, e);
    }
    sendHtml(res, html);
  }

  const server = createServer(
    async (req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(
        req.url ?? "/",
        `http://${req.headers.host ?? "localhost"}`,
      );
      try {
        if (url.pathname.startsWith("/api/")) {
          const reply = await handleApi(
            req.method ?? "GET",
            url.pathname,
            query,
            await readBody(req),
          );
          sendJson(res, reply.status, reply.body);
        } else if (!pages) {
          sendJson(res, 404, {
            error: "no frontend: this server runs the API only",
          });
        } else if (await (await pages).asset(req, res, url)) {
          return;
        } else if (req.method === "GET" || req.method === "HEAD") {
          await sendPage(res, url, await pages);
        } else {
          sendJson(res, 405, { error: `${req.method} is not allowed` });
        }
      } catch (e) {
        console.error(`${req.method} ${url.pathname}:`, e);
        if (!res.headersSent) sendJson(res, 500, { error: "internal error" });
      }
    },
  );

  server.listen(port, () => {
    if (opts.quiet) return;
    const { port: bound } = server.address() as AddressInfo;
    console.log(`admin-app (${mode}) on http://localhost:${bound}/`);
  });
  server.on("close", () => {
    void pool.end();
    void pages?.then((p) => p.close());
  });
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = startServer();
  const shutdown = (signal: string): void => {
    console.log(`\n${signal}: shutting down`);
    server.close(() => process.exit(0));
  };
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}
