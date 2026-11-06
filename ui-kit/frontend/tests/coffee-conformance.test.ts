// The design and the app made from it must be the same thing. This runs one day of
// the coffee shop twice, once through the simulation of Flow Studio and once through
// the generated server on pavlus-server and a real Postgres, and compares every
// answer and, at the end, every table.
//
// It needs a server and its database, so it is skipped unless they are given:
//   (cd coffee-shop-app && docker compose up -d)
//   (cd coffee-shop-app && DATABASE_URL=postgres://app:app@127.0.0.1:54330/coffee_shop_app PORT=3020 node server/main.ts) &
//   COFFEE_API=http://127.0.0.1:3020 DATABASE_URL=postgres://app:app@127.0.0.1:54330/coffee_shop_app \
//     npx vitest run frontend/tests/coffee-conformance.test.ts
import { describe, expect, test } from "vitest";
import pg from "pg";
import { ensureDatabase } from "../../../coffee-shop-app/server/db.ts";
import { coffeeDemo } from "../templates/flow-studio/demo-coffee.ts";
import { callFlow } from "../templates/flow-studio/flowlink.ts";
import type { Db } from "../templates/flow-studio/store.ts";

const API = process.env.COFFEE_API;
const DATABASE_URL = process.env.DATABASE_URL;

/** the timestamps are the clock of the machine on one side, of the simulation on the other */
const calm = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(calm)
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.entries(v).map(([k, x]) => [
            k,
            k === "created_at" ? "<time>" : calm(x),
          ]),
        )
      : v;

const DAY: { method: string; url: string; body?: unknown }[] = [
  { method: "GET", url: "/dashboard" },
  { method: "GET", url: "/customers" },
  { method: "GET", url: "/customers?q=PARK" },
  { method: "GET", url: "/customers?q=zzz" },
  {
    method: "POST",
    url: "/customers",
    body: { name: "Dan Fox", email: "dan@beans.test", phone: "555-0105" },
  },
  {
    method: "POST",
    url: "/customers",
    body: { name: "Dan Again", email: "dan@beans.test", phone: "1" },
  },
  { method: "GET", url: "/menu" },
  { method: "GET", url: "/orders" },
  { method: "GET", url: "/orders?status=preparing" },
  { method: "GET", url: "/orders?status=" },
  {
    method: "POST",
    url: "/orders",
    body: {
      customerId: 1,
      customerName: "Maya Chen",
      items: [
        { productId: 3, name: "Latte", qty: 2, price: 3.8 },
        { productId: 7, name: "Croissant", qty: 1, price: 2.9 },
      ],
      total: 10.5,
    },
  },
  {
    method: "POST",
    url: "/orders",
    body: { customerId: 0, customerName: "x", items: [], total: 0 },
  },
  {
    method: "POST",
    url: "/orders",
    body: { customerId: 2, customerName: "Leo Park", items: [], total: 4 },
  },
  {
    method: "POST",
    url: "/orders",
    body: {
      customerId: 2,
      customerName: "Leo Park",
      items: [{ productId: 1 }],
      total: 0,
    },
  },
  { method: "PATCH", url: "/orders/3", body: { status: "ready" } },
  { method: "PATCH", url: "/orders/99", body: { status: "ready" } },
  { method: "PATCH", url: "/orders/4", body: { status: "done" } },
  { method: "GET", url: "/orders?status=done" },
  { method: "GET", url: "/dashboard" },
];

describe.skipIf(!API || !DATABASE_URL)(
  "the generated server answers as the design does",
  () => {
    const flow = coffeeDemo();
    let sim: Db = flow.db;
    const real = async (c: (typeof DAY)[number]) => {
      const res = await fetch(`${API}${c.url}`, {
        method: c.method,
        headers:
          c.body === undefined ? {} : { "content-type": "application/json" },
        body: c.body === undefined ? undefined : JSON.stringify(c.body),
      });
      return { status: res.status, data: (await res.json()) as unknown };
    };

    test("one day, call by call", async () => {
      // a fresh database: the same tables and rows the design starts with
      const reset = new pg.Client({ connectionString: DATABASE_URL });
      await reset.connect();
      await reset.query("drop table if exists orders, customers, products");
      await reset.end();
      await ensureDatabase(DATABASE_URL!);

      for (const c of DAY) {
        const want = callFlow(flow, sim, {
          method: c.method,
          url: c.url,
          body: c.body,
        });
        sim = want.db;
        const got = await real(c);
        expect(
          { status: got.status, data: calm(got.data) },
          `${c.method} ${c.url}${c.body ? ` ${JSON.stringify(c.body)}` : ""}`,
        ).toEqual({ status: want.status, data: calm(want.data) });
      }
    });

    test("and the tables are the same at the end", async () => {
      const client = new pg.Client({ connectionString: DATABASE_URL });
      await client.connect();
      try {
        for (const [table, t] of Object.entries(sim)) {
          const rows = (
            await client.query(`select * from ${table} order by id`)
          ).rows;
          expect(calm(rows), table).toEqual(calm(t.rows));
        }
      } finally {
        await client.end();
      }
    });
  },
);
