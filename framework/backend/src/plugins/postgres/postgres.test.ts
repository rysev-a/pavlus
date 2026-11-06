import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { collector } from "../../testing/collector.ts";
import { createPostgresPlugin, pgEffector as db, sql } from "./mod.ts";

const URL_ =
  process.env.DATABASE_URL ?? "postgres://admin@127.0.0.1:54329/postgres";

async function reachable(): Promise<boolean> {
  const c = new pg.Client({
    connectionString: URL_,
    connectionTimeoutMillis: 1500,
  });
  try {
    await c.connect();
    await c.end();
    return true;
  } catch {
    c.on("error", () => {});
    return false;
  }
}
const up = await reachable();

describe("sql tagged template (no database)", () => {
  it("turns values into parameters", () => {
    const evil = "x'; drop table users; --";
    const q = sql`select * from users where name = ${evil} and age > ${3}`;
    expect(q.sql).toBe("select * from users where name = $1 and age > $2");
    expect(q.params).toEqual([evil, 3]);
  });
  it("quotes identifiers", () => {
    const q = sql`select ${sql.id('a"b')} from ${sql.id("public.t")} where id = ${1}`;
    expect(q.sql).toBe('select "a""b" from "public"."t" where id = $1');
    expect(() => sql.id("")).not.toThrow(); // lazy
    expect(() => sql`select ${sql.id("")}`).toThrow();
  });
  it("nests fragments, renumbering", () => {
    const where = sql`a = ${1} and b = ${2}`;
    const q = sql`select ${3}::int where ${where} and c = ${4}`;
    expect(q.sql).toBe("select $1::int where a = $2 and b = $3 and c = $4");
    expect(q.params).toEqual([3, 1, 2, 4]);
  });
  it("lists and joins", () => {
    const q = sql`insert into t (${sql.join([sql.id("a"), sql.id("b")])}) values (${sql.list([1, 2])})`;
    expect(q.sql).toBe('insert into t ("a", "b") values ($1, $2)');
    expect(q.params).toEqual([1, 2]);
    expect(() => sql`${sql.list([])}`).toThrow();
    const conds = sql.join([sql`a = ${1}`, sql`b = ${2}`], " and ");
    const w = sql`where ${conds}`;
    expect(w.sql).toBe("where a = $1 and b = $2");
  });
});

describe.skipIf(!up)("postgres plugin (real database)", () => {
  const schema = "pavlus_t_" + Math.random().toString(36).slice(2, 10);
  let admin: pg.Pool;
  let plugin: ReturnType<typeof createPostgresPlugin>;
  const c = collector();
  const pc: any = {
    dispatch: c.dispatch,
    getState: () => undefined,
    dispatchEffect() {},
  };
  const run = async (effect: any, ctx: any = { rid: "r1" }, id = "ok") => {
    plugin.handle({ ...effect, ctx }, pc);
    return c.next([id, "err"]);
  };

  beforeAll(async () => {
    admin = new pg.Pool({ connectionString: URL_, max: 2 });
    await admin.query(`create schema ${schema}`);
    plugin = createPostgresPlugin({
      url: URL_,
      config: { max: 4, options: `-c search_path=${schema}` },
    });
    await admin.query(
      `create table ${schema}.items (id serial primary key, name text not null unique, qty int)`,
    );
  });
  afterAll(async () => {
    await plugin?.close();
    await admin?.query(`drop schema if exists ${schema} cascade`);
    await admin?.end();
  });

  it("query replies rows, rowCount, fields with the ctx", async () => {
    const m = await run(
      db.query(sql`select ${5}::int as n, ${"x"}::text as s`, {
        replyTo: "ok",
      }),
      { rid: "q1", connId: "c" },
    );
    expect(m.ctx).toEqual({ rid: "q1", connId: "c" });
    const p: any = m.payload;
    expect(p.rows).toEqual([{ n: 5, s: "x" }]);
    expect(p.rowCount).toBe(1);
    expect(p.fields.map((f: any) => f.name)).toEqual(["n", "s"]);
  });

  it("errors carry SQLSTATE, constraint, table, column, detail", async () => {
    await run(
      db.query(sql`insert into items (name, qty) values (${"a"}, ${1})`, {
        replyTo: "ok",
      }),
    );
    const dup: any = (
      await run(
        db.query(sql`insert into items (name) values (${"a"})`, {
          replyTo: "ok",
          onError: "err",
        }),
      )
    ).payload;
    expect(dup.code).toBe("23505");
    expect(dup.constraint).toBe("items_name_key");
    expect(dup.table).toBe("items");
    expect(dup.detail).toContain("already exists");
    const nn: any = (
      await run(
        db.query(sql`insert into items (name) values (${null})`, {
          replyTo: "ok",
          onError: "err",
        }),
      )
    ).payload;
    expect([nn.code, nn.column]).toEqual(["23502", "name"]);
    const syn: any = (
      await run(db.query("selec 1", { replyTo: "ok", onError: "err" }))
    ).payload;
    expect(syn.code).toBe("42601");
  });

  it("transaction flow: begin, query, commit, rollback", async () => {
    const { tx } = (await run(db.begin({ replyTo: "ok" }))).payload as any;
    expect(plugin.metrics().txOpen).toBe(1);
    await run(
      db.query(sql`insert into items (name) values (${"tx-commit"})`, {
        replyTo: "ok",
        tx,
      }),
    );
    // not visible outside before commit
    const outside: any = (
      await run(
        db.query(
          sql`select count(*)::int as n from items where name = ${"tx-commit"}`,
          { replyTo: "ok" },
        ),
      )
    ).payload;
    expect(outside.rows[0].n).toBe(0);
    await run(db.commit(tx, { replyTo: "ok" }));
    const after: any = (
      await run(
        db.query(
          sql`select count(*)::int as n from items where name = ${"tx-commit"}`,
          { replyTo: "ok" },
        ),
      )
    ).payload;
    expect(after.rows[0].n).toBe(1);

    const t2 = ((await run(db.begin({ replyTo: "ok" }))).payload as any).tx;
    await run(
      db.query(sql`insert into items (name) values (${"tx-rb"})`, {
        replyTo: "ok",
        tx: t2,
      }),
    );
    await run(db.rollback(t2, { replyTo: "ok" }));
    const rb: any = (
      await run(
        db.query(
          sql`select count(*)::int as n from items where name = ${"tx-rb"}`,
          { replyTo: "ok" },
        ),
      )
    ).payload;
    expect(rb.rows[0].n).toBe(0);
    expect(plugin.metrics().txOpen).toBe(0);

    const gone: any = (
      await run(db.query("select 1", { replyTo: "ok", onError: "err", tx: t2 }))
    ).payload;
    expect(gone.code).toBe("PAVLUS_NO_TX");
  });

  it("cancel(rid) rolls back open transactions and releases the client", async () => {
    const { tx } = (await run(db.begin({ replyTo: "ok" }), { rid: "leaky" }))
      .payload as any;
    await run(
      db.query(sql`insert into items (name) values (${"leak"})`, {
        replyTo: "ok",
        tx,
      }),
      { rid: "leaky" },
    );
    const idleBefore = plugin.metrics().idle;
    plugin.cancel("leaky");
    await new Promise((r) => setTimeout(r, 200));
    expect(plugin.metrics().txOpen).toBe(0);
    expect(plugin.metrics().idle).toBeGreaterThan(idleBefore);
    const n: any = (
      await run(
        db.query(
          sql`select count(*)::int as n from items where name = ${"leak"}`,
          { replyTo: "ok" },
        ),
      )
    ).payload;
    expect(n.rows[0].n).toBe(0);
  });

  it("cancel(rid) cancels a running query and discards its reply", async () => {
    plugin.handle(
      {
        ...db.query("select pg_sleep(5)", { replyTo: "ok", onError: "err" }),
        ctx: { rid: "slow" },
      },
      pc,
    );
    await new Promise((r) => setTimeout(r, 150));
    const t0 = Date.now();
    plugin.cancel("slow");
    await new Promise((r) => setTimeout(r, 300));
    expect(c.messages.filter((m) => m.ctx?.rid === "slow")).toEqual([]);
    expect(plugin.metrics().idle).toBeGreaterThan(0);
    expect(Date.now() - t0).toBeLessThan(2000);
    // pool still healthy
    expect(
      ((await run(db.query("select 1 as x", { replyTo: "ok" }))).payload as any)
        .rows[0].x,
    ).toBe(1);
  });

  it("statement timeout from timeoutMs and ctx.deadline", async () => {
    const a: any = (
      await run(
        db.query("select pg_sleep(5)", {
          replyTo: "ok",
          onError: "err",
          timeoutMs: 100,
        }),
      )
    ).payload;
    expect(a.code).toBe("57014");
    const b: any = (
      await run(
        db.query("select pg_sleep(5)", { replyTo: "ok", onError: "err" }),
        { rid: "dl", deadline: Date.now() + 100 },
      )
    ).payload;
    expect(b.code).toBe("57014");
    const past: any = (
      await run(db.query("select 1", { replyTo: "ok", onError: "err" }), {
        rid: "dl2",
        deadline: Date.now() - 1,
      })
    ).payload;
    expect(past.code).toBe("57014");
    expect(plugin.metrics().timeouts).toBeGreaterThanOrEqual(3);
  });

  it("migrate: applies in order once, skips applied, rolls back a failing step", async () => {
    const steps = [
      { name: "001_a", sql: "create table m_a (id int)" },
      {
        name: "002_b",
        sql: "create table m_b (id int); insert into m_b values (1)",
      },
    ];
    const first: any = (await run(db.migrate({ steps }, { replyTo: "ok" })))
      .payload;
    expect(first).toEqual({ applied: ["001_a", "002_b"], skipped: [] });
    const second: any = (await run(db.migrate({ steps }, { replyTo: "ok" })))
      .payload;
    expect(second).toEqual({ applied: [], skipped: ["001_a", "002_b"] });
    const bad: any = (
      await run(
        db.migrate(
          {
            steps: [
              ...steps,
              {
                name: "003_bad",
                sql: "create table m_c (id int); select boom()",
              },
            ],
          },
          { replyTo: "ok", onError: "err" },
        ),
      )
    ).payload;
    expect(bad.code).toBe("42883");
    const t: any = (
      await run(db.query("select to_regclass('m_c') as r", { replyTo: "ok" }))
    ).payload;
    expect(t.rows[0].r).toBeNull();
  });

  it("migrate from a directory, concurrently safe (advisory lock)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mig-"));
    await writeFile(
      join(dir, "002_second.sql"),
      "insert into dir_t values (2)",
    );
    await writeFile(join(dir, "001_first.sql"), "create table dir_t (id int)");
    await writeFile(join(dir, "notes.txt"), "ignored");
    const results = await Promise.all(
      [1, 2, 3].map((i) =>
        run(
          db.migrate({ dir }, { replyTo: "ok" + i }),
          { rid: "mig" + i },
          "ok" + i,
        ).then((m) => m.payload as any),
      ),
    );
    expect(results.flatMap((r) => r.applied)).toEqual([
      "001_first.sql",
      "002_second.sql",
    ]);
    const rows: any = (
      await run(db.query("select id from dir_t", { replyTo: "ok" }))
    ).payload;
    expect(rows.rows).toEqual([{ id: 2 }]);
  });

  it("pool metrics", () => {
    const m = plugin.metrics();
    expect(m.queries).toBeGreaterThan(5);
    expect(m.errors).toBeGreaterThan(0);
    expect(m.txBegun).toBeGreaterThanOrEqual(3);
    expect(m.total).toBeLessThanOrEqual(4);
  });
});
