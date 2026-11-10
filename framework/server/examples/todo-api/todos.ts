// Todos CRUD in Postgres, with
//  * a Redis read-through cache for the list (get -> miss -> query -> set),
//  * invalidation + a pub/sub event after every write (`syncThenRespond`),
//  * a transaction for `reorder`, written as a step machine.
import type { Effect, Message } from "@pavlus/core";
import {
  type AppState,
  answer,
  at,
  type Call,
  type Handler,
  internal,
  invalid,
  K,
  log,
  pg,
  problem,
  type RouteFn,
  redis,
  reqOf,
  rq,
  sql,
} from "./kit.ts";
import {
  validateId,
  validateReorder,
  validateTodoCreate,
  validateTodoPatch,
} from "./validate.ts";

const COLS = sql`id, title, done, position`;

const rowsOf = (msg: Message) =>
  (msg.payload as { rows: Record<string, unknown>[] }).rows;

/**
 * After a write: drop the list cache, publish the change for every server
 * instance (SSE listens on this channel), then answer with `pending`.
 * The response is parked in the slice so the continuation stays one message.
 */
function syncThenRespond(
  call: Pick<Call, "route" | "user">,
  event: Record<string, unknown>,
  status: number,
  body?: unknown,
): Effect[] {
  const uid = call.user!.id;
  return [
    rq.merge({ step: "sync", pending: { status, body } }),
    redis.pipeline(
      [
        ["DEL", K.todosCache(uid)],
        ["PUBLISH", K.todosChannel(uid), JSON.stringify(event)],
      ],
      { replyTo: "todos.synced", onError: "todos.syncFailed" },
    ),
  ];
}

// ------------------------------------------------------------------ routes --

const list: RouteFn = (call) => [
  rq.set("step", "cache"),
  redis.get(K.todosCache(call.user!.id), {
    replyTo: "todos.list.cached",
    onError: "todos.list.cacheFailed", // a broken cache must not break reads
  }),
];

const create: RouteFn = (call) => {
  const v = validateTodoCreate(call.http.body);
  if (!v.ok) return invalid(call.route, v.errors);
  const uid = call.user!.id;
  return [
    rq.set("step", "insert"),
    pg.query(
      sql`insert into todos (user_id, title, position)
          select ${uid}, ${v.value.title}, coalesce(max(position), 0) + 1
          from todos where user_id = ${uid}
          returning ${COLS}`,
      { replyTo: "todos.create.inserted", onError: "todos.failed" },
    ),
  ];
};

const get: RouteFn = (call) => {
  const id = validateId(call.http.params.id);
  if (!id.ok) return invalid(call.route, id.errors);
  return [
    rq.set("step", "get"),
    pg.query(
      sql`select ${COLS} from todos where id = ${id.value} and user_id = ${call.user!.id}`,
      { replyTo: "todos.get.found", onError: "todos.failed" },
    ),
  ];
};

const update: RouteFn = (call) => {
  const id = validateId(call.http.params.id);
  if (!id.ok) return invalid(call.route, id.errors);
  const v = validateTodoPatch(call.http.body);
  if (!v.ok) return invalid(call.route, v.errors);
  return [
    rq.set("step", "update"),
    pg.query(
      sql`update todos
          set title = coalesce(${v.value.title ?? null}, title),
              done = coalesce(${v.value.done ?? null}, done),
              updated_at = now()
          where id = ${id.value} and user_id = ${call.user!.id}
          returning ${COLS}`,
      { replyTo: "todos.update.done", onError: "todos.failed" },
    ),
  ];
};

const remove: RouteFn = (call) => {
  const id = validateId(call.http.params.id);
  if (!id.ok) return invalid(call.route, id.errors);
  return [
    rq.set("step", "delete"),
    pg.query(
      sql`delete from todos where id = ${id.value} and user_id = ${call.user!.id} returning id`,
      { replyTo: "todos.remove.done", onError: "todos.failed" },
    ),
  ];
};

/**
 * reorder: begin -> lock the rows -> (all mine?) -> renumber -> commit -> sync.
 * Any error, or ids that are not all mine, rolls the transaction back first
 * and only then answers (`pending` holds the answer while rolling back).
 */
const reorder: RouteFn = (call) => {
  const v = validateReorder(call.http.body);
  if (!v.ok) return invalid(call.route, v.errors);
  return [
    rq.merge({ step: "begin", ids: v.value.ids }),
    pg.begin({
      replyTo: "todos.reorder.began",
      onError: "todos.reorder.failed",
    }),
  ];
};

export const routes: Record<string, RouteFn> = {
  "todos.list": list,
  "todos.create": create,
  "todos.get": get,
  "todos.update": update,
  "todos.remove": remove,
  "todos.reorder": reorder,
};

// ------------------------------------------------------------ continuations --

export const todos: Handler = (msg: Message, state: AppState) => {
  switch (msg.id) {
    // ---- list (read-through cache)
    case "todos.list.cached": {
      const r = at(state, msg, "cache");
      if (!r) return [];
      const hit = msg.payload as string | null;
      if (hit !== null)
        return answer(
          r.route,
          200,
          { todos: JSON.parse(hit) },
          {
            headers: { "x-cache": "hit" },
          },
        );
      return [rq.set("step", "load"), ...loadList(r.user!.id)];
    }
    case "todos.list.cacheFailed": {
      const r = at(state, msg, "cache");
      if (!r) return [];
      return [
        log.warn("cache unavailable, reading through", { error: msg.payload }),
        rq.set("step", "load"),
        ...loadList(r.user!.id),
      ];
    }
    case "todos.list.loaded": {
      const r = at(state, msg, "load");
      if (!r) return [];
      const items = rowsOf(msg);
      return [
        // fill the cache and answer in parallel; a failed fill is only logged
        redis.set(K.todosCache(r.user!.id), JSON.stringify(items), {
          ex: state.config.cacheTtlSec,
          onError: "noop",
        }),
        ...answer(
          r.route,
          200,
          { todos: items },
          {
            headers: { "x-cache": "miss" },
          },
        ),
      ];
    }

    // ---- single-statement writes
    case "todos.create.inserted": {
      const r = at(state, msg, "insert");
      if (!r) return [];
      const todo = rowsOf(msg)[0];
      return syncThenRespond(
        { route: r.route, user: r.user },
        { type: "todo.created", todo },
        201,
        { todo },
      );
    }
    case "todos.get.found": {
      const r = at(state, msg, "get");
      if (!r) return [];
      const todo = rowsOf(msg)[0];
      return todo
        ? answer(r.route, 200, { todo })
        : problem(r.route, 404, "not_found", "no such todo");
    }
    case "todos.update.done": {
      const r = at(state, msg, "update");
      if (!r) return [];
      const todo = rowsOf(msg)[0];
      return todo
        ? syncThenRespond(
            { route: r.route, user: r.user },
            { type: "todo.updated", todo },
            200,
            { todo },
          )
        : problem(r.route, 404, "not_found", "no such todo");
    }
    case "todos.remove.done": {
      const r = at(state, msg, "delete");
      if (!r) return [];
      const gone = rowsOf(msg)[0] as { id: number } | undefined;
      return gone
        ? syncThenRespond(
            { route: r.route, user: r.user },
            { type: "todo.deleted", id: gone.id },
            204,
          )
        : problem(r.route, 404, "not_found", "no such todo");
    }
    case "todos.synced":
    case "todos.syncFailed": {
      const r = at(state, msg, "sync");
      if (!r) return [];
      const { status, body } = r.pending as { status: number; body?: unknown };
      return [
        // the write is committed: a failed cache/pubsub step is logged, not an error
        ...(msg.id === "todos.syncFailed"
          ? [log.warn("sync after write failed", { error: msg.payload })]
          : []),
        ...answer(r.route, status, body),
      ];
    }
    case "todos.failed": {
      const r = reqOf(state, msg);
      return internal(r?.route ?? "todos", "todos", msg.payload);
    }

    // ---- reorder: the transaction
    case "todos.reorder.began": {
      const r = at(state, msg, "begin");
      if (!r) return [];
      const tx = (msg.payload as { tx: string }).tx;
      const ids = r.ids as number[];
      return [
        rq.merge({ step: "lock", tx }),
        pg.query(
          sql`select id from todos
              where user_id = ${r.user!.id} and id = any(${ids}::int[])
              for update`,
          {
            tx,
            replyTo: "todos.reorder.locked",
            onError: "todos.reorder.failed",
          },
        ),
      ];
    }
    case "todos.reorder.locked": {
      const r = at(state, msg, "lock");
      if (!r) return [];
      const ids = r.ids as number[];
      const tx = r.tx as string;
      if (rowsOf(msg).length !== ids.length)
        return abort(
          tx,
          404,
          "unknown_todo",
          "some ids do not exist or are not yours",
        );
      return [
        rq.set("step", "renumber"),
        pg.query(
          sql`update todos t set position = o.ord, updated_at = now()
              from unnest(${ids}::int[]) with ordinality as o(id, ord)
              where t.id = o.id and t.user_id = ${r.user!.id}`,
          {
            tx,
            replyTo: "todos.reorder.renumbered",
            onError: "todos.reorder.failed",
          },
        ),
      ];
    }
    case "todos.reorder.renumbered": {
      const r = at(state, msg, "renumber");
      if (!r) return [];
      return [
        rq.set("step", "commit"),
        pg.commit(r.tx as string, {
          replyTo: "todos.reorder.committed",
          onError: "todos.reorder.failed",
        }),
      ];
    }
    case "todos.reorder.committed": {
      const r = at(state, msg, "commit");
      if (!r) return [];
      const ids = r.ids as number[];
      return syncThenRespond(
        { route: r.route, user: r.user },
        { type: "todo.reordered", ids },
        200,
        { ids },
      );
    }
    case "todos.reorder.failed": {
      const r = reqOf(state, msg);
      if (!r || r.step === "rollback") return []; // already unwinding
      const e = msg.payload as { code: string; message: string };
      // 40001 serialization failure / 40P01 deadlock: the client may retry
      const retry = e.code === "40001" || e.code === "40P01";
      const effects = [log.error("reorder failed", { error: e, step: r.step })];
      return typeof r.tx === "string"
        ? [
            ...effects,
            ...abort(
              r.tx,
              retry ? 409 : 500,
              retry ? "conflict" : "internal",
              retry ? "try again" : "internal error",
            ),
          ]
        : [...effects, ...problem(r.route, 500, "internal", "internal error")];
    }
    case "todos.reorder.rolledback": {
      const r = at(state, msg, "rollback");
      if (!r) return [];
      const { status, body } = r.pending as { status: number; body: unknown };
      return answer(r.route, status, body);
    }
  }
  return undefined;
};

const loadList = (uid: number): Effect[] => [
  pg.query(
    sql`select ${COLS} from todos where user_id = ${uid} order by position, id`,
    { replyTo: "todos.list.loaded", onError: "todos.failed" },
  ),
];

/** Roll back, then answer with the parked problem. */
function abort(
  tx: string,
  status: number,
  code: string,
  message: string,
): Effect[] {
  return [
    rq.merge({
      step: "rollback",
      pending: { status, body: { error: { code, message } } },
    }),
    pg.rollback(tx, {
      replyTo: "todos.reorder.rolledback",
      onError: "todos.reorder.rolledback",
    }),
  ];
}
