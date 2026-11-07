// Spawned by cluster.test.ts: 2 workers on one port, each answering with its
// pid; `/die` crashes the worker that served it (respawn), SIGTERM stops all.

import { createServer } from "node:http";
import { runCluster } from "./mod.ts";

const port = Number(process.env.PORT ?? 0);

runCluster(() => {
  const server = createServer((req, res) => {
    if (req.url === "/die") process.exit(17);
    res.writeHead(200, { "content-type": "text/plain" });
    res.end(String(process.pid));
  });
  server.listen(port, "127.0.0.1");
}, { workers: 2 });
