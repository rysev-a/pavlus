/**
 * The phone-crm-app server: plain `node:http`, no framework, no CORS (the
 * browser talks to the same origin; Vite proxies /api in development).
 *
 * - `/api/*` answers JSON from Postgres (api.ts).
 * - With `NODE_ENV=production` the build in `dist/` is served too, and any
 *   path without a file extension gets index.html (single-page app deep links).
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
import { fileURLToPath } from "node:url";
import type pg from "pg";
import { handleApi } from "./api.ts";
import { createPool } from "./db/pool.ts";
import { createQuery } from "./db/query.ts";
import { countRows } from "./db/repo.ts";
import { ensureSchema, seedDatabase } from "./db/reset.ts";

const PORT = Number(process.env.PORT ?? 3010);
// Plain paths: under jsdom (the tests) the global `URL` is not Node's.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist") + "/";
const MAX_BODY = 50 * 1024 * 1024;

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
  ".map": "application/json; charset=utf-8",
};

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(text),
  });
  res.end(text);
}

class BadBody extends Error {}

/** The request body as JSON; undefined without one; throws BadBody when it is not JSON. */
async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new BadBody("the body is too large");
    chunks.push(chunk as Buffer);
  }
  if (!chunks.length) return undefined;
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new BadBody("the body is not valid JSON");
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
  let decoded = pathname;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    // keep the raw path
  }
  // `normalize` collapses `..`, and the join keeps the result inside `dist`.
  const relative = normalize(decoded).replace(/^(\.\.[/\\])+/, "");
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

export interface ServerOptions {
  /** Defaults to a pool for `DATABASE_URL`; the server ends it when closed. */
  pool?: pg.Pool;
  /** No log lines (tests). */
  quiet?: boolean;
  /** Serve dist/ with the SPA fallback. Default: only under `NODE_ENV=production`. */
  static?: boolean;
  /** Create the tables and seed an empty database at start. Default: false. */
  init?: boolean;
}

export function startServer(
  port = PORT,
  opts: ServerOptions = {},
): ReturnType<typeof createServer> {
  const pool = opts.pool ?? createPool();
  const query = createQuery(pool);
  const serveStatic = opts.static ?? process.env.NODE_ENV === "production";
  const ready = opts.init
    ? (async () => {
        await ensureSchema(pool);
        if ((await countRows(query)) === 0) {
          const n = await seedDatabase(pool);
          if (!opts.quiet) console.log(`seeded an empty database: ${n} rows`);
        }
      })()
    : Promise.resolve();
  ready.catch((e) => console.error("database init failed:", e));

  const server = createServer(
    async (req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(
        req.url ?? "/",
        `http://${req.headers.host ?? "localhost"}`,
      );
      try {
        if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
          let body: unknown;
          try {
            body = await readBody(req);
          } catch (e) {
            sendJson(res, 400, { error: (e as Error).message });
            return;
          }
          await ready;
          const reply = await handleApi(
            req.method ?? "GET",
            url.pathname,
            query,
            body,
            url.searchParams,
          );
          sendJson(res, reply.status, reply.body);
        } else if (!serveStatic) {
          sendJson(res, 404, {
            error: "no frontend: this server runs the API only",
          });
        } else if (req.method === "GET" || req.method === "HEAD") {
          await sendStatic(url.pathname, res);
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
    console.log(
      `phone-crm-app (${serveStatic ? "production" : "api only"}) on http://localhost:${bound}/`,
    );
  });
  server.on("close", () => {
    void pool.end();
  });
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = startServer(PORT, { init: true });
  const shutdown = (signal: string): void => {
    console.log(`\n${signal}: shutting down`);
    server.close(() => process.exit(0));
    server.closeIdleConnections();
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}
