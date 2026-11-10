# shop-api

A shop with **categories, products, users and orders** in six files, written in
the class-controller style: one file per domain, a static service that builds
effects, a controller whose verb methods are routes and whose `"X.onSuccess"`
methods are the continuations.

```
api/users.ts      UserController  + UserService
api/shops.ts      ShopController  + ShopService
api/products.ts   ProductController + ProductService
api/orders.ts     OrderController + OrderService  (checkout = tx state machine)
main.ts           wiring, health, boot
schema.ts         migrations + seed (3 shops, 10 products, 3 users, 5 orders)
```

## Run

```sh
docker compose up -d     # postgres:16 on 127.0.0.1:54329 (OrbStack or any docker)
node main.ts             # http://localhost:3001
```

`TRANSPORT=raw node main.ts` serves the same API through the hand-rolled
`socket.write()` HTTP/1.1 transport instead of `node:http` — same routes, same
answers, no `node:http`.

## The style

```ts
export class UserService {
  static getUsers(p: HttpReq) {
    // pure: builds an effect
    const { limit, offset } = pageOf(p.query);
    return db.select({ id: "getUsers", query: sql`select ... limit ${limit}` });
  }
}

export class UserController extends HttpController {
  readonly path = "/users";

  get(message) {
    return UserService.getUsers(message.payload);
  } // GET /users

  "getUsers.onSuccess"(message) {
    // db replied
    return httpEffector.makeResponse(200, { users: rowsOf(message) });
  }
}
```

The request id rides on every message, so the reply of `db.select` lands in
the same request: the continuation answers with `httpEffector.makeResponse`
and the http plugin finds the socket by itself. Errors nobody claims
(`getUsers.onError`) get the default answer: one structured log line and a 500. Writes that can conflict claim their error and answer `writeConflict`
(unique / foreign key -> 409).

Checkout (`POST /orders`) is the interesting one — a transaction as a step
machine over continuations, with business refusals rolled back before the
client hears anything: `unknown_product` 404, `wrong_shop` 422,
`out_of_stock` 409 (with the product ids), `unknown_user` 404.

## Endpoints

```
GET    /healthz  /readyz
GET    /users            ?limit=&offset=
POST   /users            {email, name}
GET    /users/:id
PATCH  /users/:id        {name}
DELETE /users/:id
GET    /shops            ?limit=&offset=
POST   /shops            {name, slug, description?}
GET    /shops/:id
PATCH  /shops/:id        {name?, description?}
DELETE /shops/:id
GET    /products         ?shopId=&categoryId=&q=&limit=&offset=
POST   /products         {shopId, categoryId, name, priceCents, stock?, description?}
GET    /products/:id
PATCH  /products/:id     {name?, description?, priceCents?, stock?}
DELETE /products/:id
GET    /orders           ?userId=&shopId=&status=&limit=&offset=
POST   /orders           {userId, shopId, items: [{productId, quantity}]}
GET    /orders/:id
PATCH  /orders/:id       {status}   pending->paid->shipped, *->cancelled
DELETE /orders/:id
```
