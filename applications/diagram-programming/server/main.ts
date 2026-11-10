// node main.ts   (DATABASE_URL, PORT)
import { ensureDatabase } from "./db.ts";
import { buildServer } from "./server.ts";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required (see .env.example)");
await ensureDatabase(url);

const port = Number(process.env.PORT ?? 3030);
const server = buildServer({ url, port });
console.log(`diagram-programming api: http://127.0.0.1:${port}`);

// graceful shutdown: stop accepting, let in-flight requests finish
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => void server.shutdown({ timeoutMs: 10_000 }));
