// The smallest example of the whole thing: a table of users, and the four things you do
// with it (list, create, update, remove). Four routes of a backend over one table, drawn as
// handlers, the SQL they run and the answers they send; and the browser side that asks
// them. It is the backend of the Visual Builder demo of the same name.
import { Draw, req } from "./draw.ts";
import type { Model } from "./model.ts";
import type { Db } from "./store.ts";

/** the starting table: three users */
export const USERS_DB: Db = {
  users: {
    unique: ["email"],
    rows: [
      { id: 1, name: "Ada Lovelace", email: "ada@example.test" },
      { id: 2, name: "Grace Hopper", email: "grace@example.test" },
      { id: 3, name: "Alan Turing", email: "alan@example.test" },
    ],
  },
};

export function usersDemo(): Model {
  const d = new Draw("Users CRUD");
  d.m = { ...d.m, db: USERS_DB };

  // ---- the backend: a route, a handler, the SQL, the answer ----

  d.n("rtList", "route", "GET /users", { detail: "users.list" })
    .n("hList", "handler", "users.list", { detail: "all the users" })
    .n("qList", "effect", "pg.query", {
      detail: "select * from users order by id",
    })
    .n("hListed", "handler", "users.listed")
    .n("rList", "effect", "http.respond", {
      status: 200,
      detail: '{"users":"{payload.rows}"}',
    })
    .n("eList", "error", "users.listFailed")
    .n("rListE", "effect", "http.respond", {
      status: 500,
      detail: '{"error":"The users could not be loaded"}',
    })
    .e("rtList", "hList", "users.list")
    .e("hList", "qList", "pg.query")
    .e("qList", "hListed", "users.listed")
    .err("qList", "eList")
    .e("hListed", "rList", "http.respond")
    .e("eList", "rListE", "http.respond");

  d.n("rtNew", "route", "POST /users", { detail: "users.create" })
    .n("hNew", "handler", "users.create", { detail: "a new user" })
    .n("qNew", "effect", "pg.query", {
      detail:
        "insert into users (name, email) values ({payload.body.name}, {payload.body.email}) returning *",
    })
    .n("hCreated", "handler", "users.created")
    .n("rNew", "effect", "http.respond", {
      status: 201,
      detail: '{"user":"{payload.rows.0}"}',
    })
    .n("eNew", "error", "users.createFailed")
    .n("rDup", "effect", "http.respond", {
      status: 409,
      detail: '{"error":"A user with this email already exists"}',
    })
    .n("rNewE", "effect", "http.respond", {
      status: 500,
      detail: '{"error":"The user could not be saved"}',
    })
    .e("rtNew", "hNew", "users.create")
    .e("hNew", "qNew", "pg.query")
    .e("qNew", "hCreated", "users.created")
    .err("qNew", "eNew")
    .e("hCreated", "rNew", "http.respond")
    .e("eNew", "rDup", "http.respond", { cond: "payload.code == '23505'" })
    .e("eNew", "rNewE", "http.respond", { cond: "payload.code != '23505'" });

  d.n("rtSet", "route", "PATCH /users/:id", { detail: "users.update" })
    .n("hSet", "handler", "users.update", { detail: "new name and email" })
    .n("qSet", "effect", "pg.query", {
      detail:
        "update users set name = {payload.body.name}, email = {payload.body.email} where id = {payload.params.id} returning *",
    })
    .n("hUpdated", "handler", "users.updated")
    .n("rSet", "effect", "http.respond", {
      status: 200,
      detail: '{"user":"{payload.rows.0}"}',
    })
    .n("rSetMiss", "effect", "http.respond", {
      status: 404,
      detail: '{"error":"No such user"}',
    })
    .n("eSet", "error", "users.updateFailed")
    .n("rSetE", "effect", "http.respond", {
      status: 500,
      detail: '{"error":"The user could not be saved"}',
    })
    .e("rtSet", "hSet", "users.update")
    .e("hSet", "qSet", "pg.query")
    .e("qSet", "hUpdated", "users.updated")
    .err("qSet", "eSet")
    .e("hUpdated", "rSet", "http.respond", { cond: "payload.rowCount > 0" })
    .e("hUpdated", "rSetMiss", "http.respond", {
      cond: "payload.rowCount == 0",
    })
    .e("eSet", "rSetE", "http.respond");

  d.n("rtDel", "route", "DELETE /users/:id", { detail: "users.remove" })
    .n("hDel", "handler", "users.remove", { detail: "take a user away" })
    .n("qDel", "effect", "pg.query", {
      detail: "delete from users where id = {payload.params.id} returning id",
    })
    .n("hRemoved", "handler", "users.removed")
    .n("rDel", "effect", "http.respond", {
      status: 200,
      detail: '{"deleted":"{payload.rows.0.id}"}',
    })
    .n("rDelMiss", "effect", "http.respond", {
      status: 404,
      detail: '{"error":"No such user"}',
    })
    .n("eDel", "error", "users.removeFailed")
    .n("rDelE", "effect", "http.respond", {
      status: 500,
      detail: '{"error":"The user could not be removed"}',
    })
    .e("rtDel", "hDel", "users.remove")
    .e("hDel", "qDel", "pg.query")
    .e("qDel", "hRemoved", "users.removed")
    .err("qDel", "eDel")
    .e("hRemoved", "rDel", "http.respond", { cond: "payload.rowCount > 0" })
    .e("hRemoved", "rDelMiss", "http.respond", {
      cond: "payload.rowCount == 0",
    })
    .e("eDel", "rDelE", "http.respond");

  d.n("xc", "external", "Client", { plugin: "http" }).n(
    "xpg",
    "external",
    "Postgres",
    { plugin: "pg" },
  );

  // ---- the browser: what the person does, and the state it fills ----

  d.n("uLoad", "ui-event", "open Users")
    .n("fLoad", "fe-handler", "loadUsers")
    .n("fUsers", "fe-handler", "onUsers")
    .n("sUsers", "fe-state", "users", { detail: "{payload.body.users}" })
    .e("uLoad", "fLoad", "ui.open")
    .e("fLoad", "rtList", "http.request", {
      payload: "method=GET; path=/users",
    })
    .e("rList", "fUsers", "onUsers", { kind: "reply" })
    .e("fUsers", "sUsers", "store.set");

  d.n("uNew", "ui-event", "submit New user")
    .n("fNew", "fe-handler", "createUser", {
      clientSet: { name: "{payload.name}", email: "{payload.email}" },
    })
    .n("fNewOk", "fe-handler", "onUserCreated")
    .n("fNewNo", "fe-handler", "onUserRejected", {
      clientSet: { formError: "{payload.body.error}" },
    })
    .e("uNew", "fNew", "ui.submit")
    .e("fNew", "rtNew", "http.request", {
      payload:
        "method=POST; path=/users; body.name={client.name}; body.email={client.email}",
    })
    .e("rNew", "fNewOk", "onUserCreated", { kind: "reply" })
    .e("rDup", "fNewNo", "onUserRejected", { kind: "reply" });

  d.n("uSave", "ui-event", "submit Edit user")
    .n("fSave", "fe-handler", "updateUser", {
      clientSet: {
        id: "{payload.id}",
        name: "{payload.name}",
        email: "{payload.email}",
      },
    })
    .n("fSaved", "fe-handler", "onUserUpdated")
    .e("uSave", "fSave", "ui.submit")
    .e("fSave", "rtSet", "http.request", {
      payload:
        "method=PATCH; path=/users/2; params.id={client.id}; body.name={client.name}; body.email={client.email}",
    })
    .e("rSet", "fSaved", "onUserUpdated", { kind: "reply" });

  d.n("uRemove", "ui-event", "click Delete user")
    .n("fRemove", "fe-handler", "removeUser", {
      clientSet: { id: "{payload.id}" },
    })
    .n("fRemoved", "fe-handler", "onUserRemoved")
    .e("uRemove", "fRemove", "ui.click")
    .e("fRemove", "rtDel", "http.request", {
      payload: "method=DELETE; path=/users/3; params.id={client.id}",
    })
    .e("rDel", "fRemoved", "onUserRemoved", { kind: "reply" });

  d.requests([
    req("r1", "uLoad", 0),
    req("r2", "uNew", 6, {
      name: "Edsger Dijkstra",
      email: "edsger@example.test",
    }),
    req("r3", "uSave", 14, {
      id: "2",
      name: "Grace B. Hopper",
      email: "grace@example.test",
    }),
    req("r4", "uRemove", 22, { id: "3" }),
  ]);
  return d.done();
}
