// The real thing, spawned: a fixture boots 2 workers on one port; we check
// both serve, a killed worker is replaced, and SIGTERM drains and exits 0.

import { spawn, type ChildProcess } from "node:child_process";
import { createServer, type AddressInfo } from "node:net";
import { request } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const FIXTURE = join(
  dirname(fileURLToPath(import.meta.url)),
  "cluster.fixture.ts",
);

const freePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      server.close(() => resolve(port));
    });
  });

// `agent: false`: a fresh connection per request, or keep-alive would pin
// them all to one worker and the round-robin would never show.
const get = (port: number, path: string): Promise<string | null> =>
  new Promise((resolve) => {
    const req = request(
      { host: "127.0.0.1", port, path, timeout: 2000, agent: false },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve(body));
      },
    );
    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
    req.end();
  });

const until = async (
  check: () => Promise<boolean>,
  ms = 5000,
): Promise<void> => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`condition not met within ${ms}ms`);
};

const exitOf = (child: ChildProcess, ms: number): Promise<number | null> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`no exit within ${ms}ms`));
    }, ms);
    child.once("exit", (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });

test(
  "runCluster: one port, many workers, respawn, clean stop",
  { timeout: 20_000 },
  async () => {
    const port = await freePort();
    const child = spawn(process.execPath, [FIXTURE], {
      cwd: process.cwd(),
      env: { ...process.env, PORT: String(port) },
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr?.on("data", (chunk) => (stderr += chunk));

    try {
      // Both workers come up and answer on the same port.
      await until(async () => (await get(port, "/")) !== null);
      const pids = new Set<string>();
      for (let i = 0; i < 8; i++) {
        const body = await get(port, "/");
        if (body !== null) pids.add(body);
      }
      expect(
        pids.size,
        `distinct worker pids: ${[...pids].join(", ")}`,
      ).toBeGreaterThanOrEqual(2);

      // A crashed worker is replaced; the other one kept serving meanwhile.
      await get(port, "/die");
      await until(async () => {
        const body = await get(port, "/");
        return body !== null && !pids.has(body);
      });
      expect(await get(port, "/")).not.toBeNull();

      // SIGTERM drains the workers and exits the primary cleanly.
      child.kill("SIGTERM");
      expect(await exitOf(child, 5000)).toBe(0);
    } catch (err) {
      throw new Error(`${err}; fixture stderr so far:\n${stderr}`);
    }
  },
);
