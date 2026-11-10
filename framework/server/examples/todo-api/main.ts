// node examples/todo-api/main.ts
//   DATABASE_URL=postgres://admin@127.0.0.1:54329/postgres \
//   REDIS_URL=redis://127.0.0.1:6379 PORT=3000 node examples/todo-api/main.ts
import { buildServer } from "./server.ts";

const env = process.env;
const databaseUrl = env.DATABASE_URL;
const redisUrl = env.REDIS_URL;
if (!databaseUrl || !redisUrl) {
  console.error("DATABASE_URL and REDIS_URL are required");
  process.exit(2);
}

const s = buildServer({
  databaseUrl,
  redisUrl,
  port: Number(env.PORT ?? 3000),
  host: env.HOST,
  trustProxy: env.TRUST_PROXY ? Number(env.TRUST_PROXY) : false,
  requestTimeoutMs: Number(env.REQUEST_TIMEOUT_MS ?? 10_000),
  config: {
    rateLimit: {
      limit: Number(env.RATE_LIMIT ?? 100),
      windowSec: Number(env.RATE_WINDOW_SEC ?? 60),
    },
  },
  log: { pretty: env.LOG_PRETTY === "1" },
});
s.boot();

// Graceful shutdown: report not-ready and end the event streams first so the
// load balancer moves on, give it DRAIN_MS, then close the listener, let
// in-flight requests finish (up to SHUTDOWN_MS) and release pg/redis.
let stopping = false;
async function stop(signal: string) {
  if (stopping) return;
  stopping = true;
  s.log.log("info", "shutdown requested", { signal });
  s.drain();
  await new Promise((r) => setTimeout(r, Number(env.DRAIN_MS ?? 1000)));
  await s.server.shutdown({ timeoutMs: Number(env.SHUTDOWN_MS ?? 10_000) });
  await s.pg.close();
  s.log.log("info", "bye", { stats: s.server.stats() });
  process.exit(0);
}
process.on("SIGTERM", () => void stop("SIGTERM"));
process.on("SIGINT", () => void stop("SIGINT"));
