// node main.ts   (DATABASE_URL, REDIS_URL, PORT)
// Wiring: the app is pure, everything that touches the world is a plugin.
import {
  createHttpServerPlugin,
  createPostgresPlugin,
  createServerApp,
} from "@pavlus/backend";
import { app } from "./app.ts";
import { ensureDatabase } from "./db.ts";
import { createMailerPlugin } from "./plugins/mailer.ts";
import { routes } from "./routes.ts";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
await ensureDatabase(process.env.DATABASE_URL);

const http = createHttpServerPlugin({ port: Number(process.env.PORT ?? 3000) });
const server = createServerApp({
  app,
  routes,
  plugins: [
    createPostgresPlugin({ url: process.env.DATABASE_URL }),
    createMailerPlugin(),
    http,
  ],
});

// graceful shutdown: stop accepting, let in-flight requests finish
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => void server.shutdown({ timeoutMs: 10_000 }));
