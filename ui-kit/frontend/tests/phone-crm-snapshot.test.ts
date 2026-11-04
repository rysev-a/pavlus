import { expect, test } from "vitest";
import { emptyDb, TABLES, type Db } from "../templates/phone-retail-crm/schema.ts";
import {
  bytesOf,
  dbCounts,
  parseSnapshot,
  snapshotOf,
  snapshotText,
} from "../templates/phone-retail-crm/snapshot.ts";

function small(): Db {
  return {
    ...emptyDb(),
    permissions: [{ id: 1, code: "orders.refund", description: "Refund", module: "orders" }],
    roles: [{ id: 1, name: "Admin", description: "All", permissionIds: [1] }],
    users: [
      {
        id: 1,
        name: "Ann",
        email: "a@x.io",
        phone: "+1",
        roleId: 1,
        status: "active",
        createdAt: "2026-01-02",
      },
    ],
    sessions: [
      {
        id: 1,
        userId: 1,
        ip: "1.1.1.1",
        device: "Chrome",
        startedAt: "2026-03-14T09:30:00",
        expiresAt: "2026-03-15T09:30:00",
        active: true,
      },
    ],
    manufacturers: [{ id: 1, name: "Apple", country: "US" }],
    models: [{ id: 1, manufacturerId: 1, name: "iPhone 15", year: 2023 }],
    products: [
      {
        id: 1,
        modelId: 1,
        sku: "IP15-BK",
        color: "Black",
        price: 0.1,
        processor: "A16",
        ram: 6,
        storage: 128,
        display: '6.1" OLED',
        stock: 5,
      },
    ],
    shopCategories: [{ id: 1, name: "Flagship", description: "" }],
    shops: [
      {
        id: 1,
        name: "Main",
        categoryId: 1,
        city: "Oslo",
        address: "Street 1",
        lat: 59.9,
        lng: 10.7,
        phone: "+47",
      },
    ],
    orders: [
      {
        id: 1,
        userId: 1,
        shopId: 1,
        status: "paid",
        createdAt: "2026-03-14",
        items: [
          { productId: 1, qty: 1, price: 0.1 },
          { productId: 1, qty: 1, price: 0.2 },
        ],
        total: 0.3,
        note: "",
      },
    ],
    budget: [
      { id: 1, month: "2026-03", kind: "income", amount: 10, shopId: 0, note: "" },
      { id: 2, month: "2026-03", kind: "supply", amount: 5, shopId: 1, note: "" },
    ],
  };
}

/** Parses the snapshot of `small()` after `mutate` changed its plain-JSON copy. */
function corrupt(mutate: (data: Record<string, any[]>) => void) {
  const snap = JSON.parse(snapshotText(snapshotOf(small(), "2026-03-14T10:00:00")));
  mutate(snap.data);
  return parseSnapshot(JSON.stringify(snap));
}
const errorOf = (r: ReturnType<typeof parseSnapshot>) => (r.ok ? "" : r.error);

test("round trip: text out, same database back", () => {
  const db = small();
  const text = snapshotText(snapshotOf(db, "2026-03-14T10:00:00"));
  expect(text).toContain("\n  "); // pretty
  const r = parseSnapshot(text);
  expect(r).toEqual({ ok: true, db });
  expect(dbCounts(db).orders).toBe(1);
  expect(Object.keys(dbCounts(db))).toEqual(TABLES);
  expect(bytesOf("é")).toBe(2);
  expect(bytesOf(text)).toBeGreaterThan(text.length - 1);
});

test("an empty database round-trips", () => {
  const text = snapshotText(snapshotOf(emptyDb(), "now"));
  expect(parseSnapshot(text)).toEqual({ ok: true, db: emptyDb() });
});

test("not JSON", () => {
  expect(errorOf(parseSnapshot("{oops"))).toMatch(/^not valid JSON/);
});

test("not an object, wrong app, wrong version, no data", () => {
  expect(errorOf(parseSnapshot("[]"))).toBe("the file is not a JSON object");
  expect(errorOf(parseSnapshot('{"app":"other","version":1}'))).toContain('app is "other"');
  expect(errorOf(parseSnapshot('{"app":"phone-retail-crm","version":2}'))).toContain("version 2");
  expect(errorOf(parseSnapshot('{"app":"phone-retail-crm","version":1}'))).toContain('"data"');
});

test("a missing table and a table that is not an array", () => {
  expect(errorOf(corrupt((d) => delete d.shops))).toBe('table "shops" is missing');
  expect(errorOf(corrupt((d) => (d.shops = {} as never)))).toBe('table "shops" is not an array');
});

test("a row that is not an object", () => {
  expect(errorOf(corrupt((d) => (d.users[0] = 5)))).toBe("users[0] is not an object");
});

test("bad ids: missing, zero, fractional, duplicate", () => {
  expect(errorOf(corrupt((d) => delete d.users[0].id))).toContain("users[0].id undefined is not a positive integer");
  expect(errorOf(corrupt((d) => (d.users[0].id = 0)))).toContain("users[0].id 0 is not a positive integer");
  expect(errorOf(corrupt((d) => (d.users[0].id = 1.5)))).toContain("not a positive integer");
  expect(errorOf(corrupt((d) => d.budget.push({ ...d.budget[0] })))).toBe("budget: id 1 appears twice");
});

test("a required field missing, of the wrong type, or out of its enum", () => {
  expect(errorOf(corrupt((d) => delete d.users[0].email))).toBe("users[1].email is missing");
  expect(errorOf(corrupt((d) => (d.products[0].price = "9")))).toBe('products[1].price "9" is not a number');
  expect(errorOf(corrupt((d) => (d.sessions[0].active = "yes")))).toContain("sessions[1].active");
  expect(errorOf(corrupt((d) => (d.users[0].status = "gone")))).toBe(
    'users[1].status "gone" is not one of active, blocked, invited',
  );
  expect(errorOf(corrupt((d) => (d.models[0].year = 2023.5)))).toContain("models[1].year 2023.5 is not an integer");
  expect(errorOf(corrupt((d) => (d.roles[0].permissionIds = [1, "x"])))).toContain("roles[1].permissionIds[1]");
  expect(errorOf(corrupt((d) => (d.orders[0].items[0].qty = "2")))).toContain("orders[1].items[0].qty");
  expect(errorOf(corrupt((d) => (d.orders[0].items = null)))).toContain("orders[1].items null is not an array");
});

test("every foreign key must resolve", () => {
  expect(errorOf(corrupt((d) => (d.users[0].roleId = 9)))).toBe("users[1].roleId 9 is not a role");
  expect(errorOf(corrupt((d) => (d.sessions[0].userId = 9)))).toBe("sessions[1].userId 9 is not a user");
  expect(errorOf(corrupt((d) => (d.models[0].manufacturerId = 9)))).toBe("models[1].manufacturerId 9 is not a manufacturer");
  expect(errorOf(corrupt((d) => (d.products[0].modelId = 9)))).toBe("products[1].modelId 9 is not a model");
  expect(errorOf(corrupt((d) => (d.shops[0].categoryId = 9)))).toBe("shops[1].categoryId 9 is not a shop category");
  expect(errorOf(corrupt((d) => (d.orders[0].userId = 999)))).toBe("orders[1].userId 999 is not a user");
  expect(errorOf(corrupt((d) => (d.orders[0].shopId = 0)))).toBe("orders[1].shopId 0 is not a shop");
  expect(errorOf(corrupt((d) => (d.orders[0].items[1].productId = 9)))).toBe(
    "orders[1].items[1].productId 9 is not a product",
  );
  expect(errorOf(corrupt((d) => (d.roles[0].permissionIds = [1, 4])))).toBe(
    "roles[1].permissionIds[1] 4 is not a permission",
  );
  expect(errorOf(corrupt((d) => (d.budget[1].shopId = 3)))).toBe("budget[2].shopId 3 is not a shop");
});

test("budget.shopId 0 means the company and is accepted", () => {
  expect(corrupt((d) => (d.budget[1].shopId = 0)).ok).toBe(true);
});

test("an order total must equal the sum of its items", () => {
  const e = errorOf(corrupt((d) => (d.orders[0].total = 1)));
  expect(e).toBe("orders[1].total 1 does not match its items (they sum to 0.3)");
});

test("unknown extra fields are dropped", () => {
  const r = corrupt((d) => {
    d.users[0].secret = "x";
    d.orders[0].items[0].extra = 1;
  });
  expect(r).toEqual({ ok: true, db: small() });
});
