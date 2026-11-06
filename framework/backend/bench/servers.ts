// The four servers measured: hello world and a Postgres lookup, each as plain
// node:http (baseline) and as a @pavlus/backend pure handler.
import { createServer } from "node:http";
import type { Effect, Message } from "@pavlus/core";
import pg from "pg";
import {
  createHttpServerPlugin,
  createPostgresPlugin,
  createServerApp,
  pgEffector as db,
  httpEffector as http,
  sql,
} from "../src/mod.ts";

export interface Running {
  port: number;
  stop(): Promise<void>;
  /** Extra numbers worth printing next to the result. */
  info?(): Record<string, unknown>;
}

export const POOL_MAX = 10;

/** Seeds `bench_items` (1000 rows) in the given schema. */
export async function seed(databaseUrl: string, schema: string) {
  const c = new pg.Client({ connectionString: databaseUrl });
  await c.connect();
  await c.query(`create schema ${schema}`);
  await c.query(
    `create table ${schema}.bench_items (id int primary key, title text not null)`,
  );
  await c.query(
    `insert into ${schema}.bench_items select i, 'item ' || i from generate_series(1, 1000) i`,
  );
  await c.end();
}

export async function dropSchema(databaseUrl: string, schema: string) {
  const c = new pg.Client({ connectionString: databaseUrl });
  await c.connect();
  await c.query(`drop schema ${schema} cascade`);
  await c.end();
}

// ---------------------------------------------------------------- baseline --

export async function nodeHello(): Promise<Running> {
  const server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("hello");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return {
    port: (server.address() as { port: number }).port,
    stop: () =>
      new Promise((r) => {
        server.closeAllConnections();
        server.close(() => r());
      }),
  };
}

export async function nodePg(
  databaseUrl: string,
  schema: string,
): Promise<Running> {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: POOL_MAX,
    options: `-c search_path=${schema}`,
  });
  const server = createServer(async (req, res) => {
    try {
      const id = Number(new URL(req.url!, "http://x").searchParams.get("id"));
      const { rows } = await pool.query(
        "select id, title from bench_items where id = $1",
        [id],
      );
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(rows[0] ?? null));
    } catch {
      res.writeHead(500).end();
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return {
    port: (server.address() as { port: number }).port,
    stop: async () => {
      server.closeAllConnections();
      await new Promise<void>((r) => server.close(() => r()));
      await pool.end();
    },
  };
}

// ----------------------------------------------------------------- pavlus --

const benchApp = (msg: Message): Effect[] => {
  switch (msg.id) {
    case "bench.hello":
      return [http.text("hello")];
    case "bench.item": {
      const q = (msg.payload as { query: { id?: string } }).query;
      return [
        db.query(
          sql`select id, title from bench_items where id = ${Number(q.id)}`,
          { replyTo: "bench.item.row", onError: "bench.item.failed" },
        ),
      ];
    }
    case "bench.item.row":
      return [http.json((msg.payload as { rows: unknown[] }).rows[0] ?? null)];
    case "bench.item.failed":
      return [http.json({ error: "db" }, 500)];
  }
  return [];
};

async function pavlus(
  routes: Record<string, string>,
  databaseUrl?: string,
  schema?: string,
  trace = true,
): Promise<Running> {
  const httpPlugin = createHttpServerPlugin({ port: 0, host: "127.0.0.1" });
  const plugins: Parameters<typeof createServerApp>[0]["plugins"] = [
    httpPlugin,
  ];
  if (databaseUrl)
    plugins.unshift(
      createPostgresPlugin({
        url: databaseUrl,
        config: { max: POOL_MAX, options: `-c search_path=${schema}` },
      }),
    );
  const server = createServerApp({
    app: benchApp,
    plugins,
    routes,
    trace: trace ? undefined : false,
    onError: () => {},
  });
  const { port } = await httpPlugin.listening();
  return {
    port,
    stop: () => server.shutdown({ timeoutMs: 2000 }),
    info: () => ({ runtime: server.stats(), http: httpPlugin.stats() }),
  };
}

export const pavlusHello = (trace = true) =>
  pavlus({ "GET /": "bench.hello" }, undefined, undefined, trace);
export const pavlusPg = (databaseUrl: string, schema: string, trace = true) =>
  pavlus({ "GET /item": "bench.item" }, databaseUrl, schema, trace);
