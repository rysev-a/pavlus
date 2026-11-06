// node bench/run.ts            (BENCH_SECONDS=5 BENCH_RUNS=3 BENCH_CONNECTIONS=100)
// Measures hello world and a one-row Postgres lookup, node:http vs
// @pavlus/backend, with a closed-loop load generator in a separate process.
import { fork } from "node:child_process";
import { writeFileSync } from "node:fs";
import { cpus, totalmem } from "node:os";
import {
  dropSchema,
  nodeHello,
  nodePg,
  pavlusHello,
  pavlusPg,
  type Running,
  seed,
} from "./servers.ts";

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://admin@127.0.0.1:54329/postgres";
const seconds = Number(process.env.BENCH_SECONDS ?? 5);
const runs = Number(process.env.BENCH_RUNS ?? 3);
const connections = Number(process.env.BENCH_CONNECTIONS ?? 100);
const warmup = 1;

interface Sample {
  requests: number;
  rps: number;
  p50: number;
  p90: number;
  p99: number;
  max: number;
  errors: number;
  non200: number;
}

function load(port: number, kind: "hello" | "item"): Promise<Sample> {
  return new Promise((resolve, reject) => {
    const child = fork(
      new URL("./loadgen.ts", import.meta.url),
      [
        String(port),
        kind,
        String(connections),
        String(seconds),
        String(warmup),
      ],
      { stdio: ["ignore", "pipe", "inherit", "ipc"] },
    );
    let out = "";
    child.stdout!.on("data", (d) => (out += d));
    child.on("exit", () => {
      try {
        resolve(JSON.parse(out.trim().split("\n").at(-1)!));
      } catch (e) {
        reject(new Error(`loadgen: ${out}`));
      }
    });
  });
}

const median = (xs: number[]) =>
  [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;

const schema = "bench_" + Math.random().toString(36).slice(2, 8);
await seed(DATABASE_URL, schema);

const cases: {
  name: string;
  kind: "hello" | "item";
  start: () => Promise<Running>;
}[] = [
  { name: "hello / node:http", kind: "hello", start: nodeHello },
  {
    name: "hello / @pavlus/backend",
    kind: "hello",
    start: () => pavlusHello(),
  },
  {
    name: "hello / @pavlus/backend (trace off)",
    kind: "hello",
    start: () => pavlusHello(false),
  },
  {
    name: "pg query / node:http + pg.Pool",
    kind: "item",
    start: () => nodePg(DATABASE_URL, schema),
  },
  {
    name: "pg query / @pavlus/backend",
    kind: "item",
    start: () => pavlusPg(DATABASE_URL, schema),
  },
  {
    name: "pg query / @pavlus/backend (trace off)",
    kind: "item",
    start: () => pavlusPg(DATABASE_URL, schema, false),
  },
];

const results: Record<string, unknown>[] = [];
try {
  for (const c of cases) {
    const samples: Sample[] = [];
    for (let i = 0; i < runs; i++) {
      const s = await c.start();
      try {
        samples.push(await load(s.port, c.kind));
      } finally {
        await s.stop();
      }
    }
    const row = {
      name: c.name,
      runs,
      rps: Math.round(median(samples.map((s) => s.rps))),
      rpsAll: samples.map((s) => Math.round(s.rps)),
      p50: +median(samples.map((s) => s.p50)).toFixed(2),
      p99: +median(samples.map((s) => s.p99)).toFixed(2),
      max: +Math.max(...samples.map((s) => s.max)).toFixed(1),
      errors: samples.reduce((a, s) => a + s.errors + s.non200, 0),
    };
    results.push(row);
    console.log(
      `${c.name.padEnd(40)} ${String(row.rps).padStart(7)} req/s  p50 ${row.p50} ms  p99 ${row.p99} ms  (runs: ${row.rpsAll.join(", ")})  errors ${row.errors}`,
    );
  }
} finally {
  await dropSchema(DATABASE_URL, schema);
}

const env = {
  node: process.version,
  cpus: `${cpus().length} x ${cpus()[0]?.model}`,
  memMB: Math.round(totalmem() / 1048576),
  connections,
  seconds,
  runs,
  date: new Date().toISOString(),
};
writeFileSync(
  new URL("./results.json", import.meta.url),
  JSON.stringify({ env, results }, null, 2) + "\n",
);
console.log("\n" + JSON.stringify(env));
