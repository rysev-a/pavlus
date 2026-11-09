// The tasks of the system (the original's `system_tasks` package): the rows of
// the queue, the handlers the port registers and the actions the back office
// offers. A task is a row that points at a registered handler; running it
// sets the status, runs the handler and writes the result back.

import { db, sql } from "@pavlus/backend";

export interface TaskRow {
  id: number;
  kind: string;
  payload: Record<string, unknown>;
  status: string;
  attempts: number;
  lastError: string;
  runAt: string;
  createdAt: string;
  finishedAt: string | null;
}

/** The handlers the port registers (the original's `tasks.register`). */
export const TASK_HANDLERS: { name: string; description: string }[] = [
  {
    name: "cleanup.notifications",
    description: "Delete the notifications older than a week",
  },
  {
    name: "cleanup.sessions",
    description: "Delete the expired sessions",
  },
  {
    name: "cleanup.reports",
    description: "Delete the closed reports older than a month",
  },
];

/** The curated actions of the back office (the original's `register_action`). */
export const TASK_ACTIONS: { name: string; title: string; handler: string }[] =
  [
    {
      name: "cleanup.all",
      title: "Clean everything up",
      handler: "cleanup.notifications",
    },
  ];

export class TaskService {
  static list() {
    return db.select({
      id: "tasks.list",
      errorId: "tasks.failed",
      query: sql`SELECT id, kind, payload, status, attempts, last_error AS "lastError",
                        run_at AS "runAt", created_at AS "createdAt",
                        finished_at AS "finishedAt"
                 FROM system_tasks ORDER BY id DESC`,
    });
  }

  static byId(id: number, ns = "tasks.byId") {
    return db.select({
      id: ns,
      errorId: "tasks.failed",
      query: sql`SELECT id, kind, payload, status, attempts,
                        last_error AS "lastError", run_at AS "runAt",
                        created_at AS "createdAt", finished_at AS "finishedAt"
                 FROM system_tasks WHERE id = ${id}`,
    });
  }

  static create(
    kind: string,
    payload: Record<string, unknown>,
    runAt: string | null,
  ) {
    return db.execute({
      id: "tasks.created",
      errorId: "tasks.failed",
      query: sql`INSERT INTO system_tasks (kind, payload, run_at, status)
                 VALUES (${kind}, ${JSON.stringify(payload)}::jsonb,
                         ${runAt ?? new Date().toISOString()}, 'queued')
                 RETURNING id`,
    });
  }

  static update(
    id: number,
    kind: string,
    payload: Record<string, unknown>,
    runAt: string | null,
  ) {
    return db.execute({
      id: "tasks.updated",
      errorId: "tasks.failed",
      query: sql`UPDATE system_tasks SET kind = ${kind},
                 payload = ${JSON.stringify(payload)}::jsonb,
                 run_at = ${runAt ?? new Date().toISOString()}
                 WHERE id = ${id}`,
    });
  }

  static remove(id: number) {
    return db.execute({
      id: "tasks.deleted",
      errorId: "tasks.failed",
      query: sql`DELETE FROM system_tasks WHERE id = ${id}`,
    });
  }

  /** The task starts. */
  static start(id: number) {
    return db.execute({
      id: "tasks.started",
      errorId: "tasks.failed",
      query: sql`UPDATE system_tasks SET status = 'running',
                 attempts = attempts + 1, last_error = ''
                 WHERE id = ${id} AND status IN ('queued','failed')`,
    });
  }

  /** The handler of the task (the port's registered handlers). */
  static runHandler(kind: string) {
    const queries: Record<string, string> = {
      "cleanup.notifications":
        "DELETE FROM notifications WHERE created_at < now() - interval '7 days'",
      "cleanup.sessions": "DELETE FROM sessions WHERE expires_at < now()",
      "cleanup.reports":
        "DELETE FROM reports WHERE status <> 'open' AND created_at < now() - interval '30 days'",
    };
    const statement = queries[kind] ?? "SELECT 1";
    return db.execute({
      id: "tasks.handled",
      errorId: "tasks.failed",
      query: sql.unsafe(statement),
    });
  }

  /** The task is done. */
  static finish(id: number, error = "") {
    return db.execute({
      id: "tasks.finished",
      errorId: "tasks.failed",
      query: sql`UPDATE system_tasks SET status = ${error ? "failed" : "done"},
                 last_error = ${error}, finished_at = now()
                 WHERE id = ${id}`,
    });
  }

  /** The task is stopped. */
  static cancel(id: number) {
    return db.execute({
      id: "tasks.cancelled",
      errorId: "tasks.failed",
      query: sql`UPDATE system_tasks SET status = 'cancelled', finished_at = now()
                 WHERE id = ${id} AND status IN ('queued','running')`,
    });
  }
}
