import { describe, expect, test } from "vitest";
import { type Db, dbFrom, runSql } from "../templates/flow-studio/store.ts";

const seed = (): Db => ({
  customers: {
    unique: ["email"],
    rows: [
      { id: 1, name: "Ann Lee", email: "ann@x.test", points: 10 },
      { id: 2, name: "Bob Stone", email: "bob@x.test", points: 0 },
      { id: 3, name: "Cleo Ann", email: "cleo@x.test", points: 25 },
    ],
  },
  orders: {
    unique: [],
    rows: [
      { id: 1, customer_id: 1, total: 7.5, status: "done" },
      { id: 2, customer_id: 1, total: 4, status: "new" },
      { id: 3, customer_id: 2, total: 12, status: "new" },
    ],
  },
});
const q = (sql: string, params: unknown[] = [], db = seed()) =>
  runSql(db, sql, params);

describe("select", () => {
  test("columns, where, order by, limit, offset", () => {
    expect(
      q("select id, name from customers where points > 5 order by points desc")
        .rows,
    ).toEqual([
      { id: 3, name: "Cleo Ann" },
      { id: 1, name: "Ann Lee" },
    ]);
    expect(
      q("select * from customers order by id limit 1 offset 1").rows[0].name,
    ).toBe("Bob Stone");
    expect(
      q("select name as who from customers where id = $1", [2]).rows,
    ).toEqual([{ who: "Bob Stone" }]);
  });

  test("search: ilike and like, and / or / not, in, is null", () => {
    expect(
      q("select id from customers where name ilike $1 order by id", [
        "%ann%",
      ]).rows.map((r) => r.id),
    ).toEqual([1, 3]);
    expect(
      q("select id from customers where name like 'Ann%'").rows.map(
        (r) => r.id,
      ),
    ).toEqual([1]);
    expect(
      q(
        "select id from customers where (name ilike '%ann%' or email = 'bob@x.test') and points >= 10 order by id",
      ).rows.map((r) => r.id),
    ).toEqual([1, 3]);
    expect(
      q(
        "select id from customers where id in (1, 3) and not points = 10",
      ).rows.map((r) => r.id),
    ).toEqual([3]);
    expect(q("select id from customers where phone is null").rowCount).toBe(3);
    expect(q("select id from customers where name is not null").rowCount).toBe(
      3,
    );
  });

  test("aggregates, with and without group by", () => {
    expect(q("select count(*) as n from orders").rows).toEqual([{ n: 3 }]);
    expect(
      q(
        "select count(*) as n, sum(total) as revenue from orders where status = 'new'",
      ).rows,
    ).toEqual([{ n: 2, revenue: 16 }]);
    expect(
      q("select coalesce(sum(total), 0) as s from orders where status = 'nope'")
        .rows,
    ).toEqual([{ s: 0 }]);
    expect(
      q(
        "select status, count(*) as n from orders group by status order by status",
      ).rows,
    ).toEqual([
      { status: "done", n: 1 },
      { status: "new", n: 2 },
    ]);
    expect(
      q(
        "select max(points) as top, min(points) as low, avg(points) as mean from customers",
      ).rows,
    ).toEqual([{ top: 25, low: 0, mean: 35 / 3 }]);
  });

  test("expressions: arithmetic, text, functions", () => {
    expect(
      q("select points + 5 as p, points * 2 as d from customers where id = 1")
        .rows,
    ).toEqual([{ p: 15, d: 20 }]);
    expect(
      q("select upper(name) || '!' as shout from customers where id = 2").rows,
    ).toEqual([{ shout: "BOB STONE!" }]);
    expect(
      q("select round(total / 3, 2) as r from orders where id = 1").rows,
    ).toEqual([{ r: 2.5 }]);
  });
});

describe("insert", () => {
  test("gives the next id and returns the row", () => {
    const r = q(
      "insert into customers (name, email) values ($1, $2) returning *",
      ["Dan", "dan@x.test"],
    );
    expect(r.rows).toEqual([{ id: 4, name: "Dan", email: "dan@x.test" }]);
    expect(r.rowCount).toBe(1);
    expect(r.db.customers.rows).toHaveLength(4);
  });

  test("keeps JSON values, and now()", () => {
    const r = runSql(
      seed(),
      "insert into orders (customer_id, items, created_at) values ($1, $2, now()) returning id, items, created_at",
      [2, [{ sku: "latte", qty: 2 }]],
      { now: "2026-02-02T10:00:00.000Z" },
    );
    expect(r.rows[0]).toEqual({
      id: 4,
      items: [{ sku: "latte", qty: 2 }],
      created_at: "2026-02-02T10:00:00.000Z",
    });
  });

  test("a repeated unique value fails with 23505 and changes nothing", () => {
    const db = seed();
    const r = runSql(
      db,
      "insert into customers (name, email) values ('X', 'ann@x.test')",
    );
    expect(r.error).toMatchObject({
      code: "23505",
      constraint: "customers_email_key",
    });
    expect(r.db).toBe(db);
    expect(db.customers.rows).toHaveLength(3);
  });
});

describe("update and delete", () => {
  test("set with arithmetic on the row, where, returning", () => {
    const r = q(
      "update customers set points = points + $1 where id = $2 returning id, points",
      [5, 2],
    );
    expect(r.rows).toEqual([{ id: 2, points: 5 }]);
    expect(r.db.customers.rows.find((x) => x.id === 2)!.points).toBe(5);
    expect(r.db.customers.rows.find((x) => x.id === 1)!.points).toBe(10);
  });

  test("an update that finds nothing says so", () => {
    const r = q("update orders set status = 'done' where id = 99 returning *");
    expect(r.rowCount).toBe(0);
    expect(r.rows).toEqual([]);
  });

  test("an update may not repeat a unique value", () => {
    expect(
      q("update customers set email = 'ann@x.test' where id = 2").error?.code,
    ).toBe("23505");
  });

  test("delete", () => {
    const r = q("delete from orders where status = 'done' returning id");
    expect(r.rows).toEqual([{ id: 1 }]);
    expect(r.db.orders.rows.map((x) => x.id)).toEqual([2, 3]);
  });
});

describe("errors are values, the input is not touched", () => {
  test("syntax, no table, bad function, missing parameter", () => {
    expect(q("selec * from customers").error?.code).toBe("42601");
    expect(q("select * from nope").error).toMatchObject({ code: "42P01" });
    expect(q("select frobnicate(1) from customers").error?.code).toBe("42883");
    expect(q("select * from customers where id = $2", [1]).error?.code).toBe(
      "42P02",
    );
    expect(q("select * from customers where").error?.code).toBe("42601");
    expect(q("select 'x from customers").error?.code).toBe("42601");
  });

  test("a trailing semicolon, comments and a cast are fine", () => {
    expect(
      q("select id::int from customers where id = 1; -- done").rows,
    ).toEqual([{ id: 1 }]);
  });

  test("the tables given are never changed", () => {
    const db = seed();
    const before = JSON.stringify(db);
    runSql(db, "update customers set points = 0");
    runSql(db, "delete from orders");
    runSql(db, "insert into orders (customer_id) values (1)");
    expect(JSON.stringify(db)).toBe(before);
  });
});

describe("dbFrom", () => {
  test("keeps tables and rows, drops what is not one", () => {
    expect(
      dbFrom({
        customers: { unique: ["email", 5], rows: [{ id: 1 }, 7, null] },
        "bad name": { rows: [] },
        flat: 3,
      }),
    ).toEqual({ customers: { unique: ["email"], rows: [{ id: 1 }] } });
    expect(dbFrom(null)).toEqual({});
    expect(dbFrom([])).toEqual({});
  });
});
