// The database effect factory: services build effects as plain JS objects and
// return them; the pg plugin executes. Every step answers to `${id}.onSuccess`
// and (unless `errorId` redirects it) `${id}.onError`, so a controller method
// and its continuations share one vocabulary:
//
//   get(message) { return UserService.getUsers(message.payload) }
//   "getUsers.onSuccess"(message) { return httpEffector.makeResponse(200, ...) }
//
// `errorId` lets a whole transaction fail into one shared handler.

import { pgEffector } from "../plugins/postgres/helpers.ts";
import type { PgEffect } from "../plugins/postgres/mod.ts";
import type { SqlQuery } from "../plugins/postgres/sql.ts";

type QueryEffect = Extract<PgEffect, { type: "query" }>;
type BeginEffect = Extract<PgEffect, { type: "tx.begin" }>;
type CommitEffect = Extract<PgEffect, { type: "tx.commit" }>;
type RollbackEffect = Extract<PgEffect, { type: "tx.rollback" }>;

export interface DbStep {
  /** Reply continuation: `${id}.onSuccess` (and `.onError` unless errorId). */
  id: string;
  query: SqlQuery;
  /** Run inside this transaction (from a previous begin's reply). */
  tx?: string;
  timeoutMs?: number;
  /** One shared error handler for every step of a flow. */
  errorId?: string;
}

export interface DbBegin {
  id: string;
  isolation?: BeginEffect["isolation"];
  readOnly?: boolean;
  errorId?: string;
}

export interface DbEnd {
  id: string;
  tx: string;
  errorId?: string;
}

const errorOf = (o: { errorId?: string; id: string }) =>
  o.errorId ?? `${o.id}.onError`;

/** `db.select(...)`, `db.execute(...)`: one query, as an effect. */
export const db = {
  select(o: DbStep): QueryEffect {
    return pgEffector.query(o.query, {
      replyTo: `${o.id}.onSuccess`,
      onError: errorOf(o),
      tx: o.tx,
      timeoutMs: o.timeoutMs,
    });
  },
  /** Same effect as `select`; the name says "this writes". */
  execute(o: DbStep): QueryEffect {
    return pgEffector.query(o.query, {
      replyTo: `${o.id}.onSuccess`,
      onError: errorOf(o),
      tx: o.tx,
      timeoutMs: o.timeoutMs,
    });
  },
  begin(o: DbBegin): BeginEffect {
    return pgEffector.begin({
      replyTo: `${o.id}.onSuccess`,
      onError: errorOf(o),
      isolation: o.isolation,
      readOnly: o.readOnly,
    });
  },
  commit(o: DbEnd): CommitEffect {
    return pgEffector.commit(o.tx, {
      replyTo: `${o.id}.onSuccess`,
      onError: errorOf(o),
    });
  },
  rollback(o: DbEnd): RollbackEffect {
    return pgEffector.rollback(o.tx, {
      replyTo: `${o.id}.onSuccess`,
      onError: errorOf(o),
    });
  },
};
