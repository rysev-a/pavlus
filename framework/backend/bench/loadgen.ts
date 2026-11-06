// A closed-loop load generator on node's own http client: `connections`
// keep-alive sockets, each sends the next request as soon as the previous one
// finished. Runs in its own process (forked by run.ts) so it does not share an
// event loop with the server under test. Prints one JSON line.
import { Agent, request } from "node:http";

interface Args {
  port: number;
  path: (i: number) => string;
  connections: number;
  seconds: number;
  warmupSeconds: number;
}

const [, , port, pathKind, connections, seconds, warmup] = process.argv;
const args: Args = {
  port: Number(port),
  connections: Number(connections),
  seconds: Number(seconds),
  warmupSeconds: Number(warmup),
  path: pathKind === "item" ? (i) => `/item?id=${(i % 1000) + 1}` : () => "/",
};

const agent = new Agent({ keepAlive: true, maxSockets: args.connections });
const latencies: number[] = [];
let errors = 0;
let non200 = 0;
let measuring = false;
let stop = false;
let n = 0;

function one(): Promise<void> {
  return new Promise((resolve) => {
    const t0 = process.hrtime.bigint();
    const req = request(
      { port: args.port, host: "127.0.0.1", path: args.path(n++), agent },
      (res) => {
        res.resume();
        res.on("end", () => {
          if (measuring) {
            latencies.push(Number(process.hrtime.bigint() - t0) / 1e6);
            if (res.statusCode !== 200) non200++;
          }
          resolve();
        });
      },
    );
    req.on("error", () => {
      if (measuring) errors++;
      resolve();
    });
    req.end();
  });
}

async function worker() {
  while (!stop) await one();
}

const workers = Array.from({ length: args.connections }, worker);
setTimeout(() => {
  measuring = true;
  const start = process.hrtime.bigint();
  setTimeout(async () => {
    stop = true;
    const elapsed = Number(process.hrtime.bigint() - start) / 1e9;
    await Promise.all(workers);
    latencies.sort((a, b) => a - b);
    const q = (p: number) =>
      latencies[
        Math.min(latencies.length - 1, Math.floor(latencies.length * p))
      ] ?? 0;
    console.log(
      JSON.stringify({
        requests: latencies.length,
        seconds: elapsed,
        rps: latencies.length / elapsed,
        p50: q(0.5),
        p90: q(0.9),
        p99: q(0.99),
        max: latencies.at(-1) ?? 0,
        errors,
        non200,
      }),
    );
    agent.destroy();
    process.exit(0);
  }, args.seconds * 1000);
}, args.warmupSeconds * 1000);
