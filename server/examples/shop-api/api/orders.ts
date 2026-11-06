// Orders: reads are one query (the detail folds its items in with json_agg);
// checkout is a transaction written as a step machine over continuations:
//
//   post -> begin -> lock the products (for update) -> check the user (for share)
//         -> insert order -> insert items -> take stock -> commit -> 201
//
// Every business refusal (unknown product, product of another shop, out of
// stock, unknown user) parks the answer in the request slice, rolls the
// transaction back FIRST, and only then answers. Mid-transaction infrastructure
// failures land in one shared "orderTxError". The status PATCH is a two-step
// flow so 404 (no such order) and 409 (illegal transition) stay distinct.
import type { Effect, Message } from "@service-laboratory/pavlus";
import {
  db,
  HttpController,
  type HttpReq,
  httpEffector,
  idOf,
  intParam,
  invalid,
  logEffector,
  notFound,
  oneOf,
  pageOf,
  problem,
  requestsEffector,
  rowsOf,
  type ServerState,
  type SqlQuery,
  sql,
  strParam,
} from "../../../src/mod.ts";

type Status = "pending" | "paid" | "shipped" | "cancelled";
const STATUSES: readonly Status[] = ["pending", "paid", "shipped", "cancelled"];
const TRANSITIONS: Record<Status, readonly Status[]> = {
  pending: ["paid", "cancelled"],
  paid: ["shipped", "cancelled"],
  shipped: [],
  cancelled: [],
};

interface ItemIn {
  productId: number;
  quantity: number;
}

interface Draft {
  userId: number;
  shopId: number;
  items: ItemIn[];
}

interface Locked {
  id: number;
  shop_id: number;
  price_cents: number;
  stock: number;
}

const ORDER_COLS = sql`id, user_id as "userId", shop_id as "shopId", status,
                       total_cents as "totalCents",
                       created_at as "createdAt", updated_at as "updatedAt"`;

function parseDraft(
  body: unknown,
): { ok: true; value: Draft } | { ok: false; error: string } {
  const b = body as Record<string, unknown> | null;
  if (typeof b !== "object" || b === null)
    return { ok: false, error: "body must be a JSON object" };
  if (!Number.isInteger(b.userId) || (b.userId as number) < 1)
    return { ok: false, error: "userId must be a positive integer" };
  if (!Number.isInteger(b.shopId) || (b.shopId as number) < 1)
    return { ok: false, error: "shopId must be a positive integer" };
  if (!Array.isArray(b.items) || b.items.length < 1 || b.items.length > 50)
    return { ok: false, error: "items must be an array of 1..50" };
  const seen = new Set<number>();
  for (const it of b.items as unknown[]) {
    const i = it as Record<string, unknown>;
    if (!Number.isInteger(i.productId) || (i.productId as number) < 1)
      return {
        ok: false,
        error: "each item needs productId: positive integer",
      };
    if (
      !Number.isInteger(i.quantity) ||
      (i.quantity as number) < 1 ||
      (i.quantity as number) > 100
    )
      return { ok: false, error: "each item needs quantity: 1..100" };
    if (seen.has(i.productId as number))
      return { ok: false, error: "duplicate productId in items" };
    seen.add(i.productId as number);
  }
  return {
    ok: true,
    value: {
      userId: b.userId as number,
      shopId: b.shopId as number,
      items: b.items as ItemIn[],
    },
  };
}

// ------------------------------------------------------------- the service --

export class OrderService {
  static listOrders(p: HttpReq) {
    const { limit, offset } = pageOf(p.query);
    const conds: SqlQuery[] = [];
    const userId = intParam(p.query, "userId");
    if (userId !== undefined) conds.push(sql`o.user_id = ${userId}`);
    const shopId = intParam(p.query, "shopId");
    if (shopId !== undefined) conds.push(sql`o.shop_id = ${shopId}`);
    const status = strParam(p.query, "status");
    if (status !== undefined && STATUSES.includes(status as Status))
      conds.push(sql`o.status = ${status}`);
    const where = conds.length ? sql`where ${sql.join(conds, " and ")}` : sql``;
    return db.select({
      id: "listOrders",
      query: sql`select o.id, o.user_id as "userId", o.shop_id as "shopId", o.status,
                        o.total_cents as "totalCents",
                        o.created_at as "createdAt", o.updated_at as "updatedAt",
                        (select count(*)::int from order_items oi where oi.order_id = o.id) as "itemsCount"
                 from orders o ${where}
                 order by o.id desc
                 limit ${limit} offset ${offset}`,
    });
  }

  static getOrder(p: HttpReq) {
    const id = idOf(p.params);
    if (id === undefined) return invalid("id must be a positive integer");
    return db.select({
      id: "getOrder",
      query: sql`select o.id, o.user_id as "userId", o.shop_id as "shopId", o.status,
                        o.total_cents as "totalCents",
                        o.created_at as "createdAt", o.updated_at as "updatedAt",
                        coalesce((
                          select json_agg(json_build_object(
                                   'productId', oi.product_id,
                                   'quantity', oi.quantity,
                                   'unitPriceCents', oi.unit_price_cents) order by oi.id)
                          from order_items oi where oi.order_id = o.id
                        ), '[]'::json) as items
                 from orders o where o.id = ${id}`,
    });
  }

  // ---- checkout: every step shares the tx and the error continuation

  static beginOrderTx() {
    return db.begin({ id: "orderTx" }); // onError -> default 500
  }

  static lockProducts(draft: Draft, tx: string) {
    const ids = draft.items.map((i) => i.productId);
    return db.select({
      id: "lockProducts",
      tx,
      errorId: "orderTxError",
      query: sql`select id, shop_id, price_cents, stock from products
                 where id = any(${ids}::int[])
                 order by id
                 for update`,
    });
  }

  static checkUser(userId: number, tx: string) {
    return db.select({
      id: "userCheck",
      tx,
      errorId: "orderTxError",
      query: sql`select id from users where id = ${userId} for share`,
    });
  }

  static insertOrder(draft: Draft, total: number, tx: string) {
    return db.execute({
      id: "orderInsert",
      tx,
      errorId: "orderTxError",
      query: sql`insert into orders (user_id, shop_id, status, total_cents)
                 values (${draft.userId}, ${draft.shopId}, 'pending', ${total})
                 returning ${ORDER_COLS}`,
    });
  }

  static insertItems(orderId: number, draft: Draft, tx: string) {
    const ids = draft.items.map((i) => i.productId);
    const qtys = draft.items.map((i) => i.quantity);
    return db.execute({
      id: "orderItems",
      tx,
      errorId: "orderTxError",
      query: sql`insert into order_items (order_id, product_id, quantity, unit_price_cents)
                 select ${orderId}, p.id, o.qty, p.price_cents
                 from products p
                 join unnest(${ids}::int[], ${qtys}::int[]) as o(pid, qty) on p.id = o.pid
                 returning product_id as "productId", quantity,
                           unit_price_cents as "unitPriceCents"`,
    });
  }

  static takeStock(draft: Draft, tx: string) {
    const ids = draft.items.map((i) => i.productId);
    const qtys = draft.items.map((i) => i.quantity);
    return db.execute({
      id: "stockTaken",
      tx,
      errorId: "orderTxError",
      query: sql`update products p
                 set stock = p.stock - o.qty, updated_at = now()
                 from unnest(${ids}::int[], ${qtys}::int[]) as o(pid, qty)
                 where p.id = o.pid`,
    });
  }

  static commitOrder(tx: string) {
    return db.commit({ id: "orderCommit", tx, errorId: "orderTxError" });
  }

  // ---- status PATCH: load, then save

  static findOrder(id: number) {
    return db.select({
      id: "findOrder",
      query: sql`select id, status from orders where id = ${id}`,
    });
  }

  static saveStatus(id: number, status: Status) {
    return db.execute({
      id: "saveOrderStatus",
      query: sql`update orders set status = ${status}, updated_at = now()
                 where id = ${id}
                 returning ${ORDER_COLS}`,
    });
  }

  static deleteOrder(id: number) {
    return db.execute({
      id: "deleteOrder",
      query: sql`delete from orders where id = ${id} returning id`,
    });
  }
}

// ------------------------------------------------------------ the controller --

/**
 * Park the answer in the request slice, roll the transaction back, then answer
 * (the rollback's own error path answers the same parked body, with a warning).
 */
function abort(
  tx: string,
  status: number,
  code: string,
  message: string,
  details?: unknown,
): Effect[] {
  return [
    requestsEffector.merge({
      step: "rollback",
      pending: {
        status,
        body: {
          error: { code, message, ...(details !== undefined && { details }) },
        },
      },
    }),
    logEffector.warn("order rolled back", { code }),
    db.rollback({ id: "orderRollback", tx }),
  ];
}

export class OrderController extends HttpController {
  readonly path = "/orders";

  get(message: Message) {
    return OrderService.listOrders(message.payload as HttpReq);
  }

  getItem(message: Message) {
    return OrderService.getOrder(message.payload as HttpReq);
  }

  post(message: Message) {
    const v = parseDraft((message.payload as HttpReq).body);
    if (!v.ok) return invalid(v.error);
    // park the draft in this request's slice: the continuations read it
    return [
      requestsEffector.merge({ step: "begin", draft: v.value }),
      OrderService.beginOrderTx(),
    ];
  }

  patch(message: Message) {
    const p = message.payload as HttpReq;
    const id = idOf(p.params);
    if (id === undefined) return invalid("id must be a positive integer");
    const target = (p.body as Record<string, unknown> | null)?.status;
    if (!STATUSES.includes(target as Status))
      return invalid(`status must be one of ${STATUSES.join(", ")}`);
    return [
      requestsEffector.merge({ step: "load", id, target }),
      OrderService.findOrder(id),
    ];
  }

  delete(message: Message) {
    const id = idOf((message.payload as HttpReq).params);
    if (id === undefined) return invalid("id must be a positive integer");
    return OrderService.deleteOrder(id);
  }

  // ---- read continuations

  "listOrders.onSuccess"(message: Message) {
    return httpEffector.makeResponse(200, { orders: rowsOf(message) });
  }

  "getOrder.onSuccess"(message: Message) {
    const order = oneOf(message);
    return order
      ? httpEffector.makeResponse(200, { order })
      : notFound("no such order");
  }

  // ---- checkout: begin -> lock -> user -> insert -> items -> stock -> commit

  "orderTx.onSuccess"(message: Message, state: ServerState) {
    const r = this.at(state, message, "begin");
    if (!r) return [];
    const tx = (message.payload as { tx: string }).tx;
    return [
      requestsEffector.merge({ step: "lock", tx }),
      OrderService.lockProducts(r.draft as Draft, tx),
    ];
  }

  "lockProducts.onSuccess"(message: Message, state: ServerState) {
    const r = this.at(state, message, "lock");
    if (!r) return [];
    const draft = r.draft as Draft;
    const tx = r.tx as string;
    const rows = rowsOf<Locked>(message);
    if (rows.length !== draft.items.length)
      return abort(tx, 404, "unknown_product", "some products do not exist");
    if (rows.some((p) => p.shop_id !== draft.shopId))
      return abort(
        tx,
        422,
        "wrong_shop",
        "some products belong to another shop",
      );
    const byId = new Map(rows.map((p) => [p.id, p]));
    const short = draft.items.filter(
      (i) => (byId.get(i.productId)?.stock ?? 0) < i.quantity,
    );
    if (short.length)
      return abort(tx, 409, "out_of_stock", "not enough stock", {
        products: short.map((i) => i.productId),
      });
    // the total is computed here, from the locked rows: pure
    const total = draft.items.reduce(
      (s, i) => s + (byId.get(i.productId)?.price_cents ?? 0) * i.quantity,
      0,
    );
    return [
      requestsEffector.merge({ step: "user", total }),
      OrderService.checkUser(draft.userId, tx),
    ];
  }

  "userCheck.onSuccess"(message: Message, state: ServerState) {
    const r = this.at(state, message, "user");
    if (!r) return [];
    if (rowsOf(message).length === 0)
      return abort(r.tx as string, 404, "unknown_user", "no such user");
    return [
      requestsEffector.set("step", "insert"),
      OrderService.insertOrder(
        r.draft as Draft,
        r.total as number,
        r.tx as string,
      ),
    ];
  }

  "orderInsert.onSuccess"(message: Message, state: ServerState) {
    const r = this.at(state, message, "insert");
    if (!r) return [];
    const order = oneOf<{ id: number }>(message)!;
    return [
      requestsEffector.merge({ step: "items", order }),
      OrderService.insertItems(order.id, r.draft as Draft, r.tx as string),
    ];
  }

  "orderItems.onSuccess"(message: Message, state: ServerState) {
    const r = this.at(state, message, "items");
    if (!r) return [];
    return [
      requestsEffector.merge({ step: "stock", items: rowsOf(message) }),
      OrderService.takeStock(r.draft as Draft, r.tx as string),
    ];
  }

  "stockTaken.onSuccess"(message: Message, state: ServerState) {
    const r = this.at(state, message, "stock");
    if (!r) return [];
    return [
      requestsEffector.set("step", "commit"),
      OrderService.commitOrder(r.tx as string),
    ];
  }

  "orderCommit.onSuccess"(message: Message, state: ServerState) {
    const r = this.at(state, message, "commit");
    if (!r) return [];
    return httpEffector.makeResponse(201, {
      order: { ...(r.order as object), items: r.items },
    });
  }

  "orderRollback.onSuccess"(message: Message, state: ServerState) {
    const r = this.at(state, message, "rollback");
    if (!r) return [];
    const pending = r.pending as { status: number; body: unknown };
    return httpEffector.makeResponse(pending.status, pending.body);
  }

  "orderRollback.onError"(message: Message, state: ServerState) {
    const r = this.at(state, message, "rollback");
    if (!r) return [];
    // the write failed either way; the parked answer still goes out
    return [
      logEffector.warn("rollback failed", { error: message.payload }),
      httpEffector.makeResponse(
        (r.pending as { status: number }).status,
        (r.pending as { body: unknown }).body,
      ),
    ];
  }

  orderTxError(message: Message, state: ServerState) {
    const r = this.slice(state, message);
    if (!r || r.step === "rollback" || r.tx === undefined) return [];
    return [
      logEffector.error("order transaction failed", {
        step: r.step,
        error: message.payload,
      }),
      ...abort(r.tx as string, 500, "internal", "internal error"),
    ];
  }

  // ---- status PATCH continuations

  "findOrder.onSuccess"(message: Message, state: ServerState) {
    const r = this.at(state, message, "load");
    if (!r) return [];
    const row = oneOf<{ id: number; status: Status }>(message);
    if (!row) return notFound("no such order");
    const target = r.target as Status;
    if (!TRANSITIONS[row.status].includes(target))
      return problem(
        409,
        "invalid_transition",
        `an order cannot go from ${row.status} to ${target}`,
      );
    return [
      requestsEffector.set("step", "save"),
      OrderService.saveStatus(row.id, target),
    ];
  }

  "saveOrderStatus.onSuccess"(message: Message) {
    return httpEffector.makeResponse(200, { order: oneOf(message) });
  }

  "deleteOrder.onSuccess"(message: Message) {
    return oneOf(message)
      ? httpEffector.makeResponse(204)
      : notFound("no such order");
  }
}
