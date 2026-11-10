// Starts a throwaway redis-server on an ephemeral port for tests.
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import net from "node:net";

export function redisServerBinary(): string | undefined {
  for (const c of [
    process.env.REDIS_SERVER,
    "/usr/bin/redis-server",
    "redis-server",
  ]) {
    if (!c) continue;
    if (spawnSync(c, ["--version"], { stdio: "ignore" }).status === 0) return c;
  }
  return undefined;
}

export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address() as net.AddressInfo;
      s.close(() => resolve(port));
    });
    s.on("error", reject);
  });
}

export interface TestRedis {
  port: number;
  url: string;
  stop(): Promise<void>;
  /** Starts again on the same port after `stop()`. */
  start(): Promise<void>;
}

async function waitPing(port: number, ms = 5000): Promise<void> {
  const until = Date.now() + ms;
  for (;;) {
    const ok = await new Promise<boolean>((resolve) => {
      const s = net.connect(port, "127.0.0.1");
      s.once("connect", () => s.write("PING\r\n"));
      s.once(
        "data",
        (d) => (s.destroy(), resolve(/^(\+PONG|-NOAUTH)/.test(d.toString()))),
      );
      s.once("error", () => resolve(false));
    });
    if (ok) return;
    if (Date.now() > until) throw new Error("redis-server did not start");
    await new Promise((r) => setTimeout(r, 25));
  }
}

export async function startTestRedis(
  extraArgs: string[] = [],
): Promise<TestRedis> {
  const bin = redisServerBinary();
  if (!bin) throw new Error("redis-server not found");
  const port = await freePort();
  let child: ChildProcess | undefined;
  const start = async () => {
    child = spawn(
      bin,
      [
        "--port",
        String(port),
        "--bind",
        "127.0.0.1",
        "--save",
        "",
        "--appendonly",
        "no",
        ...extraArgs,
      ],
      {
        stdio: "ignore",
      },
    );
    await waitPing(port);
  };
  const stop = async () => {
    const c = child;
    if (!c || c.exitCode !== null) return;
    await new Promise<void>((resolve) => {
      c.once("exit", () => resolve());
      c.kill("SIGKILL");
    });
    child = undefined;
  };
  await start();
  return { port, url: `redis://127.0.0.1:${port}`, stop, start };
}
