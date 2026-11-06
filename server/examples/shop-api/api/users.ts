// Users, one vertical slice: a static service (pure — builds effects) and a
// controller (routes + continuations). The service methods never touch a
// socket; the controller's verb methods never build SQL.
//
//   GET    /users        -> UserController.get        -> UserService.getUsers
//   GET    /users/:id    -> UserController.getItem    -> UserService.getUser
//   POST   /users        -> UserController.post       -> UserService.createUser
//   PATCH  /users/:id    -> UserController.patch      -> UserService.updateUser
//   DELETE /users/:id    -> UserController.delete     -> UserService.deleteUser
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
  sql,
  writeConflict,
} from "../../../src/mod.ts";

const COLS = sql`id, email, name, created_at as "createdAt"`;

export class UserService {
  /** `?limit=&offset=`; the camelCase aliases skip any row mapping. */
  static getUsers(p: HttpReq) {
    const { limit, offset } = pageOf(p.query);
    return db.select({
      id: "getUsers",
      query: sql`select ${COLS} from users order by id limit ${limit} offset ${offset}`,
    });
  }

  static getUser(p: HttpReq) {
    const id = idOf(p.params);
    if (id === undefined) return invalid("id must be a positive integer");
    return db.select({
      id: "getUser",
      query: sql`select ${COLS} from users where id = ${id}`,
    });
  }

  static createUser(p: HttpReq) {
    const b = (p.body ?? {}) as Record<string, unknown>;
    const email = b.email;
    const name = b.name;
    if (typeof email !== "string" || !email.includes("@"))
      return invalid("email must be a string with an @");
    if (typeof name !== "string" || name.trim() === "")
      return invalid("name must be a non-empty string");
    return db.execute({
      id: "createUser",
      query: sql`insert into users (email, name)
                 values (${email}, ${name})
                 returning ${COLS}`,
    });
  }

  static updateUser(p: HttpReq) {
    const id = idOf(p.params);
    if (id === undefined) return invalid("id must be a positive integer");
    const name = (p.body as Record<string, unknown> | null)?.name;
    if (typeof name !== "string" || name.trim() === "")
      return invalid("name must be a non-empty string");
    return db.execute({
      id: "updateUser",
      query: sql`update users set name = ${name}
                 where id = ${id}
                 returning ${COLS}`,
    });
  }

  static deleteUser(p: HttpReq) {
    const id = idOf(p.params);
    if (id === undefined) return invalid("id must be a positive integer");
    return db.execute({
      id: "deleteUser",
      query: sql`delete from users where id = ${id} returning id`,
    });
  }
}

export class UserController extends HttpController {
  readonly path = "/users";

  get(message: Message) {
    return UserService.getUsers(message.payload as HttpReq);
  }

  getItem(message: Message) {
    return UserService.getUser(message.payload as HttpReq);
  }

  post(message: Message) {
    return UserService.createUser(message.payload as HttpReq);
  }

  patch(message: Message) {
    return UserService.updateUser(message.payload as HttpReq);
  }

  delete(message: Message) {
    return UserService.deleteUser(message.payload as HttpReq);
  }

  // continuations: the db effect came back (same rid, so same request)

  "getUsers.onSuccess"(message: Message) {
    return httpEffector.makeResponse(200, { users: rowsOf(message) });
  }

  "getUser.onSuccess"(message: Message) {
    const user = oneOf(message);
    return user
      ? httpEffector.makeResponse(200, { user })
      : notFound("no such user");
  }

  "createUser.onSuccess"(message: Message) {
    return httpEffector.makeResponse(201, { user: oneOf(message) });
  }

  "updateUser.onSuccess"(message: Message) {
    const user = oneOf(message);
    return user
      ? httpEffector.makeResponse(200, { user })
      : notFound("no such user");
  }

  "deleteUser.onSuccess"(message: Message) {
    return oneOf(message)
      ? httpEffector.makeResponse(204)
      : notFound("no such user");
  }

  // only the errors we can answer better than the default 500

  "createUser.onError"(message: Message) {
    return writeConflict(message.payload); // duplicate email -> 409
  }

  "updateUser.onError"(message: Message) {
    return writeConflict(message.payload);
  }
}
