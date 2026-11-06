import type { PgEffect } from "./mod.ts";
import { type SqlQuery, toQuery } from "./sql.ts";

type Of<T extends PgEffect["type"]> = Extract<PgEffect, { type: T }>;

export interface QueryOptions {
  replyTo: string;
  onError?: string;
  tx?: string;
  timeoutMs?: number;
}

export interface PgEffector {
  /** `pgEffector.query(sql\`select * from users where id = ${id}\`, { replyTo: "gotUser" })` */
  query(q: SqlQuery | string, o: QueryOptions, params?: unknown[]): Of<"query">;
  begin(o: {
    replyTo: string;
    onError?: string;
    isolation?: Of<"tx.begin">["isolation"];
    readOnly?: boolean;
  }): Of<"tx.begin">;
  commit(tx: string, o: { replyTo: string; onError?: string }): Of<"tx.commit">;
  rollback(
    tx: string,
    o?: { replyTo?: string; onError?: string },
  ): Of<"tx.rollback">;
  migrate(
    src: { dir: string } | { steps: { name: string; sql: string }[] },
    o: { replyTo: string; onError?: string; table?: string },
  ): Of<"migrate">;
}

const defined = <T extends object>(o: T) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

export const pgEffector: PgEffector = {
  query: (q, o, params) => {
    const { sql, params: p } = toQuery(q, params);
    return {
      plugin: "pg",
      type: "query",
      sql,
      params: p,
      ...defined(o),
    } as Of<"query">;
  },
  begin: (o) =>
    ({ plugin: "pg", type: "tx.begin", ...defined(o) }) as Of<"tx.begin">,
  commit: (tx, o) =>
    ({ plugin: "pg", type: "tx.commit", tx, ...defined(o) }) as Of<"tx.commit">,
  rollback: (tx, o = {}) =>
    ({
      plugin: "pg",
      type: "tx.rollback",
      tx,
      ...defined(o),
    }) as Of<"tx.rollback">,
  migrate: (src, o) =>
    ({ plugin: "pg", type: "migrate", ...src, ...defined(o) }) as Of<"migrate">,
};
