// node examples/shop-api/main.ts
//
// Postgres comes from the compose file next to this example (OrbStack or any
// docker): `docker compose up -d`. Everything else has a default, so this just
// runs — and the API is on http://localhost:3001 with the seed data in place.
//
//   TRANSPORT=raw  serve through the hand-rolled socket.write() transport
//   TRANSPORT=node serve through node:http (default)

import type { Effect, Message } from "@service-laboratory/pavlus";
import {
  controllersApp,
  createHttpServerPlugin,
  createLogPlugin,
  createPostgresPlugin,
  createRawHttpServerPlugin,
  createServerApp,
  db,
  HttpController,
  httpEffector,
  logEffector,
  newRid,
  pgEffector,
  requestsEffector,
  type ServerState,
  sql,
} from "../../src/mod.ts";
import { OrderController } from "./api/orders.ts";
import { ProductController } from "./api/products.ts";
import { ShopController } from "./api/shops.ts";
import { UserController } from "./api/users.ts";
import { migrations } from "./schema.ts";

// ------------------------------------------------------------- controllers --

class LiveController extends HttpController {
  readonly path = "/healthz";
  get() {
    return httpEffector.makeResponse(200, { status: "ok" });
  }
}

class ReadyController extends HttpController {
  readonly path = "/readyz";
  get(_message: Message, state: ServerState) {
    const ready = (state.shared as { ready?: boolean }).ready;
    if (!ready) return httpEffector.makeResponse(503, { status: "starting" });
    return db.select({
      id: "readyCheck",
      query: sql`select 1 as ok`,
      timeoutMs: 1000,
    });
  }

  "readyCheck.onSuccess"() {
    return httpEffector.makeResponse(200, {
      status: "ready",
      checks: { pg: true },
    });
  }

  "readyCheck.onError"() {
    return httpEffector.makeResponse(503, {
      status: "degraded",
      checks: { pg: false },
    });
  }
}

// ------------------------------------------------------------------- boot --

/** Runs the migrations, then flips the shared `ready` flag. */
function lifecycle(msg: Message): Effect[] | undefined {
  switch (msg.id) {
    case "app.boot":
      return [
        logEffector.info("booting"),
        pgEffector.migrate(
          { steps: migrations },
          { replyTo: "app.migrated", onError: "app.bootFailed" },
        ),
      ];
    case "app.migrated":
      return [
        requestsEffector.sharedMerge({ ready: true }),
        logEffector.info("ready", msg.payload as Record<string, unknown>),
      ];
    case "app.bootFailed":
      return [logEffector.fatal("boot failed", { error: msg.payload })];
  }
  return undefined;
}

const env = process.env;
const { app: ctrlApp, routes } = controllersApp([
  new UserController(),
  new ShopController(),
  new ProductController(),
  new OrderController(),
  new LiveController(),
  new ReadyController(),
]);

const server = createServerApp({
  app: (msg: Message, state: ServerState) =>
    lifecycle(msg) ?? ctrlApp(msg, state),
  routes,
  plugins: [
    createLogPlugin({ pretty: env.LOG_PRETTY === "1" }),
    createPostgresPlugin({
      url:
        env.DATABASE_URL ?? "postgres://admin:admin@127.0.0.1:54329/postgres",
      config: { max: 10 },
      defaultTimeoutMs: 10_000,
    }),
    env.TRANSPORT === "raw"
      ? createRawHttpServerPlugin({
          port: Number(env.PORT ?? 3001),
          host: env.HOST,
          limits: {
            requestTimeoutMs: Number(env.REQUEST_TIMEOUT_MS ?? 10_000),
          },
        })
      : createHttpServerPlugin({
          port: Number(env.PORT ?? 3001),
          host: env.HOST,
          limits: {
            requestTimeoutMs: Number(env.REQUEST_TIMEOUT_MS ?? 10_000),
          },
        }),
  ],
  limits: { requestTimeoutMs: Number(env.REQUEST_TIMEOUT_MS ?? 10_000) },
});

server.dispatch({ id: "app.boot", ctx: { rid: newRid(), conn: "job" } });
console.log(
  `serving on http://127.0.0.1:${Number(env.PORT ?? 3001)} (${env.TRANSPORT === "raw" ? "raw socket.write()" : "node:http"})`,
);

// Graceful shutdown: close the listener, let in-flight requests finish (up to
// SHUTDOWN_MS, incl. their transactions), then release the pool.
let stopping = false;
async function stop(signal: string) {
  if (stopping) return;
  stopping = true;
  console.log("shutdown requested", { signal });
  await server.shutdown({ timeoutMs: Number(env.SHUTDOWN_MS ?? 10_000) });
  console.log("bye", server.stats());
  process.exit(0);
}
process.on("SIGTERM", () => void stop("SIGTERM"));
process.on("SIGINT", () => void stop("SIGINT"));
