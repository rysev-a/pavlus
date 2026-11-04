// @vitest-environment node
import { createServer } from "node:http";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sendStatic } from "../backend/server.ts";
import { handleApi } from "../backend/api.ts";
import { seedDb } from "../../ui-kit/frontend/templates/phone-retail-crm/seed.ts";
import { snapshotOf } from "../../ui-kit/frontend/templates/phone-retail-crm/snapshot.ts";
import type { Db } from "../../ui-kit/frontend/templates/phone-retail-crm/schema.ts";
import { databaseAvailable, startBackend, type Backend } from "./backend.ts";

const available = await databaseAvailable();

describe.skipIf(!available)("phone-crm backend (real Postgres)", () => {
  let be: Backend;
  const seed = seedDb();

  beforeAll(async () => {
    be = await startBackend();
  });
  afterAll(async () => {
    await be?.close();
  });
  beforeEach(async () => {
    await be.reseed();
  });

  const call = async (method: string, url: string, body?: unknown) => {
    const res = await be.fetch(url, {
      method,
      headers: body === undefined ? {} : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: (await res.json()) as any };
  };
  const post = (url: string, body?: unknown) => call("POST", url, body);

  it("health", async () => {
    expect(await call("GET", "/api/health")).toEqual({
      status: 200,
      body: { ok: true, db: true },
    });
  });

  it("sync/load reproduces seedDb() exactly", async () => {
    const r = await post("/api/sync/load", {});
    expect(r.status).toBe(200);
    expect(r.body.data).toEqual(seed);
  });

  it("sync/load of some tables only", async () => {
    const r = await post("/api/sync/load", { tables: ["shops", "budget"] });
    expect(Object.keys(r.body.data)).toEqual(["shops", "budget"]);
    expect(r.body.data.shops).toEqual(seed.shops);
    expect((await post("/api/sync/load", { tables: ["nope"] })).status).toBe(
      400,
    );
  });

  it("sync/put inserts and updates, children included", async () => {
    const order = {
      ...seed.orders[0],
      note: "changed",
      items: [
        { productId: 5, qty: 2, price: 10.5 },
        { productId: 3, qty: 1, price: 1 },
      ],
      total: 22,
    };
    const role = { ...seed.roles[1], permissionIds: [9, 3, 5] };
    const newUser = { ...seed.users[0], id: 9001, email: "new@example.com" };
    expect(
      (await post("/api/sync/put", { table: "orders", rows: [order] })).body,
    ).toEqual({ saved: 1 });
    await post("/api/sync/put", { table: "roles", rows: [role] });
    await post("/api/sync/put", { table: "users", rows: [newUser] });
    const { body } = await post("/api/sync/load", {
      tables: ["orders", "roles", "users"],
    });
    expect(body.data.orders[0]).toEqual(order);
    expect(body.data.roles[1].permissionIds).toEqual([9, 3, 5]);
    expect(body.data.users.at(-1)).toEqual(newUser);
    expect(body.data.users).toHaveLength(seed.users.length + 1);
  });

  it("sync/put is one transaction: a bad row rolls the batch back", async () => {
    // valid shape but a shop pointing to a missing category -> 409, nothing saved
    const shop = { ...seed.shops[0], id: 777, categoryId: 4242 };
    const r = await post("/api/sync/put", {
      table: "shops",
      rows: [{ ...seed.shops[0], name: "Renamed" }, shop],
    });
    expect(r.status).toBe(409);
    expect(
      (await call("GET", `/api/shops/${seed.shops[0].id}`)).body.name,
    ).toBe(seed.shops[0].name);
  });

  it("sync/remove: counts, cascades, guards", async () => {
    // a session disappears with its user once the user has no orders
    const free = seed.users.find(
      (u) => !seed.orders.some((o) => o.userId === u.id),
    );
    if (free) {
      const sessions = seed.sessions.filter((s) => s.userId === free.id).length;
      const r = await post("/api/sync/remove", {
        table: "users",
        ids: [free.id, 99999],
      });
      expect(r.body).toEqual({ removed: 1 });
      const after = (await post("/api/sync/load", { tables: ["sessions"] }))
        .body.data.sessions;
      expect(after).toHaveLength(seed.sessions.length - sessions);
    }
    // a user with orders is guarded
    const busy = seed.orders[0].userId;
    const guarded = await post("/api/sync/remove", {
      table: "users",
      ids: [busy],
    });
    expect(guarded.status).toBe(409);
    expect(guarded.body.error).toMatch(/orders/);
    // deleting a permission leaves every role that had it
    const perm = seed.permissions[0].id;
    await post("/api/sync/remove", { table: "permissions", ids: [perm] });
    const roles = (await post("/api/sync/load", { tables: ["roles"] })).body
      .data.roles;
    expect(roles.every((r: any) => !r.permissionIds.includes(perm))).toBe(true);
    expect(roles[0].permissionIds).toEqual(
      seed.roles[0].permissionIds.filter((p) => p !== perm),
    );
    // deleting an order removes its items; a shop with no orders sets budget.shopId to 0
    const shop = seed.shops.find(
      (s) =>
        !seed.orders.some((o) => o.shopId === s.id) &&
        seed.budget.some((b) => b.shopId === s.id),
    );
    if (shop) {
      await post("/api/sync/remove", { table: "shops", ids: [shop.id] });
      const budget = (await post("/api/sync/load", { tables: ["budget"] })).body
        .data.budget;
      const touched = seed.budget
        .filter((b) => b.shopId === shop.id)
        .map((b) => b.id);
      expect(
        budget
          .filter((b: any) => touched.includes(b.id))
          .every((b: any) => b.shopId === 0),
      ).toBe(true);
    }
    expect(
      (
        await post("/api/sync/remove", {
          table: "orders",
          ids: [seed.orders[0].id],
        })
      ).body,
    ).toEqual({ removed: 1 });
  });

  it("sync/replace clears and writes, then reset restores the seed", async () => {
    const small: Partial<Db> = {
      roles: [{ id: 1, name: "Only", description: "", permissionIds: [] }],
      users: [
        {
          id: 5,
          name: "A",
          email: "a@x.io",
          phone: "",
          roleId: 1,
          status: "active",
          createdAt: "2026-01-02",
        },
      ],
    };
    expect((await post("/api/sync/replace", { data: small })).body).toEqual({
      rows: 2,
    });
    const data = (await post("/api/sync/load", {})).body.data;
    expect(data.users).toEqual(small.users);
    expect(data.orders).toEqual([]);
    // the id sequence is past the largest id
    const created = await post("/api/users", {
      ...small.users![0],
      id: undefined,
      email: "b@x.io",
    });
    expect(created.status).toBe(201);
    expect(created.body.id).toBe(6);
    expect((await post("/api/sync/reset")).body).toEqual({
      rows: Object.values(seed).reduce((n, t) => n + t.length, 0),
    });
    expect((await post("/api/sync/load", {})).body.data).toEqual(seed);
  });

  it("validation: 400 names the field, 404, 405, 409", async () => {
    const bad = (rows: unknown) =>
      post("/api/sync/put", { table: "users", rows });
    let r = await bad([{ ...seed.users[0], status: "weird" }]);
    expect(r.status).toBe(400);
    expect(r.body.error).toContain("users[0].status");
    r = await bad([{ ...seed.users[0], email: 5 }]);
    expect(r.body.error).toContain("users[0].email");
    r = await bad([{ name: "no id" }]);
    expect(r.body.error).toContain("users[0].id");
    expect(
      (await post("/api/sync/put", { table: "nope", rows: [] })).status,
    ).toBe(400);
    expect((await post("/api/sync/put", { table: "users" })).status).toBe(400);
    const o = { ...seed.orders[0], total: 1 };
    expect(
      (await post("/api/sync/put", { table: "orders", rows: [o] })).body.error,
    ).toContain("orders[0].total");
    expect(
      (await post("/api/sync/replace", { data: { users: [{}] } })).status,
    ).toBe(400);
    expect(
      (await post("/api/sync/remove", { table: "users", ids: ["x"] })).status,
    ).toBe(400);
    // a bad date the shape check allows is the database's 400
    expect(
      (await bad([{ ...seed.users[0], createdAt: "2026-02-31" }])).status,
    ).toBe(400);
    // duplicate email -> 409
    expect(
      (await bad([{ ...seed.users[0], id: 9002, email: seed.users[1].email }]))
        .status,
    ).toBe(409);

    expect((await call("GET", "/api/nope")).status).toBe(404);
    expect((await call("GET", "/api/users/99999")).status).toBe(404);
    expect((await call("GET", "/api/users/abc")).status).toBe(404);
    expect((await call("GET", "/api/sync/load")).status).toBe(405);
    expect((await call("DELETE", "/api/users")).status).toBe(405);
    expect((await call("POST", "/api/users/1", {})).status).toBe(405);
    expect((await call("POST", "/api/health")).status).toBe(405);
    expect((await call("POST", "/api/export")).status).toBe(405);
    const raw = await be.fetch("/api/sync/put", {
      method: "POST",
      body: "{nope",
    });
    expect(raw.status).toBe(400);
    expect(
      (await call("DELETE", `/api/roles/${seed.users[0].roleId}`)).status,
    ).toBe(409);
    expect((await post("/api/users", { ...seed.users[0] })).status).toBe(409); // id exists
  });

  it("REST: create, read, update, delete one row", async () => {
    const blank = { ...seed.manufacturers[0] } as any;
    delete blank.id;
    const created = await post("/api/manufacturers", {
      ...blank,
      name: "Nokia",
    });
    expect(created.status).toBe(201);
    const id = created.body.id as number;
    expect((await call("GET", `/api/manufacturers/${id}`)).body.name).toBe(
      "Nokia",
    );
    const put = await call("PUT", `/api/manufacturers/${id}`, {
      ...blank,
      name: "Nokia 2",
    });
    expect(put.body).toEqual({ id, name: "Nokia 2", country: blank.country });
    expect(
      (await call("PUT", `/api/manufacturers/${id}`, { ...blank, id: id + 1 }))
        .status,
    ).toBe(400);
    expect((await call("DELETE", `/api/manufacturers/${id}`)).body).toEqual({
      removed: 1,
    });
    expect((await call("GET", `/api/manufacturers/${id}`)).status).toBe(404);
    // an order through REST keeps its items
    const o = { ...seed.orders[3] } as any;
    delete o.id;
    const co = await post("/api/orders", o);
    expect(co.body).toEqual({ ...o, id: co.body.id });
  });

  it("paged list: search, sort, paging", async () => {
    let r = await call("GET", "/api/users");
    expect(r.body).toMatchObject({
      total: seed.users.length,
      page: 1,
      size: 20,
    });
    expect(r.body.rows).toEqual(seed.users.slice(0, 20));

    r = await call("GET", "/api/users?page=2&size=50&sort=name&dir=desc");
    const names = [...seed.users].sort((a, b) =>
      b.name.toLowerCase().localeCompare(a.name.toLowerCase()),
    );
    expect(r.body.page).toBe(2);
    expect(r.body.rows).toHaveLength(50);
    expect(
      r.body.rows[0].name.toLowerCase() <= names[0].name.toLowerCase(),
    ).toBe(true);
    const asc = (await call("GET", "/api/products?sort=price&dir=asc&size=200"))
      .body.rows as any[];
    expect(asc.map((p) => p.price)).toEqual(
      [...seed.products.map((p) => p.price)].sort((a, b) => a - b),
    );

    const term = seed.users[0].email.split("@")[0];
    r = await call(
      "GET",
      `/api/users?q=${encodeURIComponent(term.toUpperCase())}`,
    );
    const expected = seed.users.filter((u) =>
      JSON.stringify(u).toLowerCase().includes(term.toLowerCase()),
    );
    expect(r.body.total).toBeGreaterThanOrEqual(1);
    expect(r.body.rows.map((u: any) => u.id)).toContain(seed.users[0].id);
    expect(r.body.total).toBeLessThanOrEqual(expected.length);
    expect((await call("GET", "/api/users?q=%25")).body.total).toBe(0);

    expect((await call("GET", "/api/users?sort=nope")).status).toBe(400);
    expect((await call("GET", "/api/users?dir=up")).status).toBe(400);
    expect((await call("GET", "/api/users?page=0")).status).toBe(400);
    expect((await call("GET", "/api/users?size=9999")).status).toBe(400);
    expect(
      (await call("GET", "/api/orders?q=refunded&size=5")).body.rows.every(
        (o: any) => o.status === "refunded",
      ),
    ).toBe(true);
  });

  it("stats/orders and stats/budget", async () => {
    const s = (await call("GET", "/api/stats/orders")).body;
    expect(s.months).toHaveLength(12);
    expect(s.months.at(-1).month).toBe("2026-10");
    expect(s.statuses.map((x: any) => x.status)).toEqual([
      "new",
      "paid",
      "shipped",
      "delivered",
      "cancelled",
      "refunded",
    ]);
    expect(s.topShops.length).toBeLessThanOrEqual(5);
    expect(s.totals.orders).toBe(
      s.months.reduce((n: number, m: any) => n + m.count, 0),
    );
    expect(s.statuses.reduce((n: number, x: any) => n + x.count, 0)).toBe(
      s.totals.orders,
    );
    const b = (await call("GET", "/api/stats/budget")).body;
    expect(b.months).toHaveLength(12);
    expect(b.totals.income).toBeCloseTo(
      b.months.reduce((n: number, m: any) => n + m.income, 0),
      2,
    );
    expect((await call("GET", "/api/stats/orders?today=zzz")).status).toBe(400);
    expect((await call("POST", "/api/stats/budget")).status).toBe(405);
  });

  it("export / import roundtrip", async () => {
    const exported = (await call("GET", "/api/export")).body;
    expect(exported).toMatchObject({ app: "phone-retail-crm", version: 1 });
    expect(exported.data).toEqual(seed);
    await post("/api/sync/replace", { data: {} });
    expect((await post("/api/sync/load", {})).body.data.orders).toEqual([]);
    expect((await post("/api/import", exported)).body).toEqual({
      rows: Object.values(seed).reduce((n, t) => n + t.length, 0),
    });
    expect((await post("/api/sync/load", {})).body.data).toEqual(seed);
    // invalid snapshots are 400 with the frontend's message
    const broken = snapshotOf(
      { ...seed, orders: [{ ...seed.orders[0], userId: 99999 }] },
      "now",
    );
    const r = await post("/api/import", broken);
    expect(r.status).toBe(400);
    expect(r.body.error).toContain("orders[1].userId");
    expect((await post("/api/import", { app: "other" })).status).toBe(400);
    expect((await post("/api/import")).status).toBe(400);
    // the failed import left the data alone
    expect((await post("/api/sync/load", {})).body.data).toEqual(seed);
  });

  it("handleApi is pure over a query function (no http)", async () => {
    const reply = await handleApi("GET", "/api/health", be.query, undefined);
    expect(reply.status).toBe(200);
    expect((await handleApi("GET", "/nope", be.query, undefined)).status).toBe(
      404,
    );
    expect(
      (await handleApi("GET", "/api/users/1", be.query, undefined)).body,
    ).toEqual(seed.users[0]);
  });

  it("static files with an SPA fallback for extension-less paths", async () => {
    const dist = (await mkdtemp(join(tmpdir(), "crm-dist-"))) + "/";
    await mkdir(join(dist, "assets"));
    await writeFile(join(dist, "index.html"), "<h1>app</h1>");
    await writeFile(join(dist, "assets", "a.js"), "export {}");
    const server = createServer(
      (req, res) => void sendStatic(req.url ?? "/", res, dist),
    );
    await new Promise<void>((r) => server.listen(0, r));
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    try {
      const deep = await fetch(base + "/orders/42");
      expect(deep.status).toBe(200);
      expect(await deep.text()).toBe("<h1>app</h1>");
      const js = await fetch(base + "/assets/a.js");
      expect(js.headers.get("content-type")).toContain("text/javascript");
      expect((await fetch(base + "/assets/missing.js")).status).toBe(404);
      expect((await fetch(base + "/../../etc/passwd")).status).toBe(200);
    } finally {
      server.closeAllConnections();
      server.close();
    }
  });
});
