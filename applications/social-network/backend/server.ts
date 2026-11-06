/**
 * The Orbit server: plain `node:http`, no framework.
 *
 * - `/api/*` answers JSON from Postgres (see api.ts).
 * - In production (`NODE_ENV=production`) it also serves the build in `dist/`;
 *   a path without a file extension is a route of the single-page app and gets
 *   index.html, so deep links work.
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
import { handleApi } from "./api.ts";
import { createPool } from "./db/pool.ts";
import { createQuery } from "./db/query.ts";
import { ensureDatabase } from "./db/reset.ts";

const PORT = Number(process.env.PORT ?? 3020);
// Plain paths: under jsdom (the tests) the global `URL` is not Node's.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist") + "/";
/** The biggest request body: a whole database import. */
const MAX_BODY = 256 * 1024 * 1024;

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
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

class TooLarge extends Error {}
class BadJson extends Error {}

/** The request body as JSON, or undefined without one. */
async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new TooLarge();
    chunks.push(chunk as Buffer);
  }
  if (!chunks.length) return undefined;
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new BadJson();
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
  head = false,
): Promise<void> {
  // `normalize` collapses `..`, and the join keeps the result inside `dist`.
  const relative = normalize(decodeURIComponent(pathname)).replace(
    /^(\.\.[/\\])+/,
    "",
  );
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
    res.end(head ? undefined : data);
  } catch {
    sendJson(res, 404, { error: "frontend not built: run `npm run build`" });
  }
}

export interface ServerOptions {
  /** Defaults to a pool for `DATABASE_URL`; the server ends it when closed. */
  pool?: import("pg").Pool;
  /** No log lines (tests). */
  quiet?: boolean;
  /** Serve `dist/` and the SPA fallback. Default: under `NODE_ENV=production`. */
  frontend?: boolean;
  /** Where the build is (tests). */
  dist?: string;
  /** Create and seed the schema when it is missing (default true). */
  init?: boolean;
}

export function startServer(
  port = PORT,
  opts: ServerOptions = {},
): ReturnType<typeof createServer> {
  const pool = opts.pool ?? createPool();
  const db = createQuery(pool);
  const serveDist = opts.frontend ?? process.env.NODE_ENV === "production";
  const dist = opts.dist ?? DIST;
  // the first request waits for the schema (a failure is retried by the next)
  let ready: Promise<void> | undefined;
  const prepare = (): Promise<void> =>
    (ready ??= (
      opts.init === false ? Promise.resolve() : ensureDatabase(pool)
    ).catch((e) => {
      ready = undefined;
      throw e;
    }));

  const server = createServer(
    async (req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(
        req.url ?? "/",
        `http://${req.headers.host ?? "localhost"}`,
      );
      try {
        if (url.pathname.startsWith("/api/") || url.pathname === "/api") {
          let body: unknown;
          try {
            body = await readBody(req);
          } catch (e) {
            if (e instanceof TooLarge)
              return sendJson(res, 413, { error: "the body is too large" });
            return sendJson(res, 400, { error: "the body is not valid JSON" });
          }
          try {
            await prepare();
          } catch {
            return sendJson(
              res,
              url.pathname === "/api/health" ? 503 : 503,
              url.pathname === "/api/health"
                ? { ok: false, db: false }
                : { error: "the database is not reachable" },
            );
          }
          const auth = req.headers.authorization ?? "";
          const token = /^Bearer\s+(\S+)$/i.exec(auth)?.[1] ?? null;
          const reply = await handleApi(
            req.method ?? "GET",
            url.pathname,
            db,
            body,
            {
              token,
              params: url.searchParams,
            },
          );
          sendJson(res, reply.status, reply.body);
        } else if (
          serveDist &&
          (req.method === "GET" || req.method === "HEAD")
        ) {
          await sendStatic(url.pathname, res, dist, req.method === "HEAD");
        } else if (serveDist) {
          sendJson(res, 405, { error: `${req.method} is not allowed` });
        } else {
          sendJson(res, 404, {
            error: "no frontend: this server runs the API only",
          });
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
      `orbit (${serveDist ? "api + dist" : "api"}) on http://localhost:${bound}/`,
    );
  });
  server.on("close", () => {
    void pool.end();
  });
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = startServer();
  const shutdown = (signal: string): void => {
    console.log(`\n${signal}: shutting down`);
    server.close(() => process.exit(0));
    server.closeIdleConnections();
    // a stuck connection must not hold the exit
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}
