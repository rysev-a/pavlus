// Shops: the same shape as users. The list carries a product count, so the
// frontend can render a shop card without a second round trip.
import type { Message } from "@service-laboratory/pavlus";
import {
  db,
  HttpController,
  type HttpReq,
  httpEffector,
  idOf,
  invalid,
  notFound,
  oneOf,
  pageOf,
  rowsOf,
  type SqlQuery,
  sql,
  writeConflict,
} from "../../../src/mod.ts";

const COLS = sql`id, name, slug, description, created_at as "createdAt"`;

export class ShopService {
  static getShops(p: HttpReq) {
    const { limit, offset } = pageOf(p.query);
    return db.select({
      id: "getShops",
      query: sql`select ${COLS},
                        (select count(*)::int from products p where p.shop_id = s.id) as "productsCount"
                 from shops s
                 order by id
                 limit ${limit} offset ${offset}`,
    });
  }

  static getShop(p: HttpReq) {
    const id = idOf(p.params);
    if (id === undefined) return invalid("id must be a positive integer");
    return db.select({
      id: "getShop",
      query: sql`select ${COLS},
                        (select count(*)::int from products p where p.shop_id = s.id) as "productsCount"
                 from shops s where s.id = ${id}`,
    });
  }

  static createShop(p: HttpReq) {
    const b = (p.body ?? {}) as Record<string, unknown>;
    const name = b.name;
    const slug = b.slug;
    if (typeof name !== "string" || name.trim() === "")
      return invalid("name must be a non-empty string");
    if (typeof slug !== "string" || !/^[a-z0-9-]+$/.test(slug))
      return invalid("slug must be lowercase letters, digits and dashes");
    const description = typeof b.description === "string" ? b.description : "";
    return db.execute({
      id: "createShop",
      query: sql`insert into shops (name, slug, description)
                 values (${name}, ${slug}, ${description})
                 returning ${COLS}`,
    });
  }

  static updateShop(p: HttpReq) {
    const id = idOf(p.params);
    if (id === undefined) return invalid("id must be a positive integer");
    const b = (p.body ?? {}) as Record<string, unknown>;
    if (
      (b.name !== undefined &&
        (typeof b.name !== "string" || b.name.trim() === "")) ||
      (b.description !== undefined && typeof b.description !== "string")
    )
      return invalid("name must be a non-empty string, description a string");
    // patch only what arrived: `set` is built from the keys present
    const sets: SqlQuery[] = [];
    if (b.name !== undefined) sets.push(sql`name = ${b.name}`);
    if (b.description !== undefined)
      sets.push(sql`description = ${b.description}`);
    if (sets.length === 0) return invalid("nothing to update");
    return db.execute({
      id: "updateShop",
      query: sql`update shops set ${sql.join(sets, ", ")}
                 where id = ${id}
                 returning ${COLS}`,
    });
  }

  static deleteShop(p: HttpReq) {
    const id = idOf(p.params);
    if (id === undefined) return invalid("id must be a positive integer");
    return db.execute({
      id: "deleteShop",
      query: sql`delete from shops where id = ${id} returning id`,
    });
  }
}

export class ShopController extends HttpController {
  readonly path = "/shops";

  get(message: Message) {
    return ShopService.getShops(message.payload as HttpReq);
  }

  getItem(message: Message) {
    return ShopService.getShop(message.payload as HttpReq);
  }

  post(message: Message) {
    return ShopService.createShop(message.payload as HttpReq);
  }

  patch(message: Message) {
    return ShopService.updateShop(message.payload as HttpReq);
  }

  delete(message: Message) {
    return ShopService.deleteShop(message.payload as HttpReq);
  }

  "getShops.onSuccess"(message: Message) {
    return httpEffector.makeResponse(200, { shops: rowsOf(message) });
  }

  "getShop.onSuccess"(message: Message) {
    const shop = oneOf(message);
    return shop
      ? httpEffector.makeResponse(200, { shop })
      : notFound("no such shop");
  }

  "createShop.onSuccess"(message: Message) {
    return httpEffector.makeResponse(201, { shop: oneOf(message) });
  }

  "updateShop.onSuccess"(message: Message) {
    const shop = oneOf(message);
    return shop
      ? httpEffector.makeResponse(200, { shop })
      : notFound("no such shop");
  }

  "deleteShop.onSuccess"(message: Message) {
    return oneOf(message)
      ? httpEffector.makeResponse(204)
      : notFound("no such shop");
  }

  "createShop.onError"(message: Message) {
    return writeConflict(message.payload); // duplicate slug -> 409
  }
}
