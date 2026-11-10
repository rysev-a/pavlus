// Products: list with filters (`?shopId=&categoryId=&q=`), plain CRUD beside.
// The slug is derived from the name when absent — one less thing to send.
import type { Message } from "@pavlus/core";
import {
  db,
  HttpController,
  type HttpReq,
  httpEffector,
  idOf,
  intParam,
  invalid,
  notFound,
  oneOf,
  pageOf,
  rowsOf,
  type SqlQuery,
  sql,
  strParam,
  writeConflict,
} from "../../../src/mod.ts";

// writes can only return their own row; the list/get add the category name
const OWN = sql`id, shop_id as "shopId", category_id as "categoryId", name, slug,
                description, price_cents as "priceCents", stock,
                created_at as "createdAt", updated_at as "updatedAt"`;

const slugOf = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "item";

const priceOk = (v: unknown) =>
  typeof v === "number" && Number.isInteger(v) && v >= 0;

const stockOk = (v: unknown) =>
  typeof v === "number" && Number.isInteger(v) && v >= 0;

export class ProductService {
  static getProducts(p: HttpReq) {
    const { limit, offset } = pageOf(p.query);
    // every filter is optional; the where clause is built from what arrived
    const conds: SqlQuery[] = [];
    const shopId = intParam(p.query, "shopId");
    if (shopId !== undefined) conds.push(sql`p.shop_id = ${shopId}`);
    const categoryId = intParam(p.query, "categoryId");
    if (categoryId !== undefined)
      conds.push(sql`p.category_id = ${categoryId}`);
    const q = strParam(p.query, "q");
    if (q !== undefined) {
      const like = `%${q}%`;
      conds.push(sql`(p.name ilike ${like} or p.description ilike ${like})`);
    }
    const where = conds.length ? sql`where ${sql.join(conds, " and ")}` : sql``;
    return db.select({
      id: "getProducts",
      query: sql`select p.id, p.shop_id as "shopId", p.category_id as "categoryId",
                        p.name, p.slug, p.description,
                        p.price_cents as "priceCents", p.stock,
                        p.created_at as "createdAt", p.updated_at as "updatedAt",
                        c.name as "categoryName"
                 from products p join categories c on c.id = p.category_id
                 ${where}
                 order by p.id
                 limit ${limit} offset ${offset}`,
    });
  }

  static getProduct(p: HttpReq) {
    const id = idOf(p.params);
    if (id === undefined) return invalid("id must be a positive integer");
    return db.select({
      id: "getProduct",
      query: sql`select p.id, p.shop_id as "shopId", p.category_id as "categoryId",
                        p.name, p.slug, p.description,
                        p.price_cents as "priceCents", p.stock,
                        p.created_at as "createdAt", p.updated_at as "updatedAt",
                        c.name as "categoryName"
                 from products p join categories c on c.id = p.category_id
                 where p.id = ${id}`,
    });
  }

  static createProduct(p: HttpReq) {
    const b = (p.body ?? {}) as Record<string, unknown>;
    const shopId = b.shopId;
    const categoryId = b.categoryId;
    const name = b.name;
    const priceCents = b.priceCents;
    if (!Number.isInteger(shopId) || (shopId as number) < 1)
      return invalid("shopId must be a positive integer");
    if (!Number.isInteger(categoryId) || (categoryId as number) < 1)
      return invalid("categoryId must be a positive integer");
    if (typeof name !== "string" || name.trim() === "")
      return invalid("name must be a non-empty string");
    if (!priceOk(priceCents))
      return invalid("priceCents must be a non-negative integer");
    if (b.stock !== undefined && !stockOk(b.stock))
      return invalid("stock must be a non-negative integer");
    const slug =
      typeof b.slug === "string" && b.slug !== "" ? b.slug : slugOf(name);
    const description = typeof b.description === "string" ? b.description : "";
    const stock = stockOk(b.stock) ? (b.stock as number) : 0;
    return db.execute({
      id: "createProduct",
      query: sql`insert into products
                   (shop_id, category_id, name, slug, description, price_cents, stock)
                 values (${shopId}, ${categoryId}, ${name}, ${slug}, ${description},
                         ${priceCents}, ${stock})
                 returning ${OWN}`,
    });
  }

  static updateProduct(p: HttpReq) {
    const id = idOf(p.params);
    if (id === undefined) return invalid("id must be a positive integer");
    const b = (p.body ?? {}) as Record<string, unknown>;
    if (
      (b.name !== undefined &&
        (typeof b.name !== "string" || b.name.trim() === "")) ||
      (b.description !== undefined && typeof b.description !== "string") ||
      (b.priceCents !== undefined && !priceOk(b.priceCents)) ||
      (b.stock !== undefined && !stockOk(b.stock))
    )
      return invalid(
        "name: non-empty string; description: string; priceCents, stock: non-negative integers",
      );
    // patch only what arrived: `set` is built from the keys present
    const sets: SqlQuery[] = [];
    if (b.name !== undefined) sets.push(sql`name = ${b.name}`);
    if (b.description !== undefined)
      sets.push(sql`description = ${b.description}`);
    if (b.priceCents !== undefined)
      sets.push(sql`price_cents = ${b.priceCents}`);
    if (b.stock !== undefined) sets.push(sql`stock = ${b.stock}`);
    if (sets.length === 0) return invalid("nothing to update");
    return db.execute({
      id: "updateProduct",
      query: sql`update products
                 set ${sql.join(sets, ", ")}, updated_at = now()
                 where id = ${id}
                 returning ${OWN}`,
    });
  }

  static deleteProduct(p: HttpReq) {
    const id = idOf(p.params);
    if (id === undefined) return invalid("id must be a positive integer");
    return db.execute({
      id: "deleteProduct",
      query: sql`delete from products where id = ${id} returning id`,
    });
  }
}

export class ProductController extends HttpController {
  readonly path = "/products";

  get(message: Message) {
    return ProductService.getProducts(message.payload as HttpReq);
  }

  getItem(message: Message) {
    return ProductService.getProduct(message.payload as HttpReq);
  }

  post(message: Message) {
    return ProductService.createProduct(message.payload as HttpReq);
  }

  patch(message: Message) {
    return ProductService.updateProduct(message.payload as HttpReq);
  }

  delete(message: Message) {
    return ProductService.deleteProduct(message.payload as HttpReq);
  }

  "getProducts.onSuccess"(message: Message) {
    return httpEffector.makeResponse(200, { products: rowsOf(message) });
  }

  "getProduct.onSuccess"(message: Message) {
    const product = oneOf(message);
    return product
      ? httpEffector.makeResponse(200, { product })
      : notFound("no such product");
  }

  "createProduct.onSuccess"(message: Message) {
    return httpEffector.makeResponse(201, { product: oneOf(message) });
  }

  "updateProduct.onSuccess"(message: Message) {
    const product = oneOf(message);
    return product
      ? httpEffector.makeResponse(200, { product })
      : notFound("no such product");
  }

  "deleteProduct.onSuccess"(message: Message) {
    return oneOf(message)
      ? httpEffector.makeResponse(204)
      : notFound("no such product");
  }

  "createProduct.onError"(message: Message) {
    return writeConflict(message.payload); // duplicate slug / bad shop or category
  }

  "updateProduct.onError"(message: Message) {
    return writeConflict(message.payload);
  }
}
