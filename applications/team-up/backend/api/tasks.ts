// The tasks of the back office (`/app/admin/tasks`): the original's
// `admin_api` task routes. The guard is the panel's own — the `manage`
// permission (the `admin` role passes it).
//
// The original's realtime channel (`/tasks/ws`) is not ported: the port's
// tasks are few and the panel asks for them again after every action.

import {
  type HttpReq,
  httpEffector,
  invalid,
  oneOf,
  requestsEffector,
  rowsOf,
  type ServerState,
} from "@pavlus/backend";
import type { Effect, Message } from "@pavlus/core";
import { ADMIN_PERMISSION, RbacService } from "../db/services/rbac-service.ts";
import {
  TASK_ACTIONS,
  TASK_HANDLERS,
  TaskService,
} from "../db/services/task-service.ts";
import { localeOf, trOf } from "../i18n/mod.ts";
import { sessionEffect, sessionUserOf, unauthorized } from "./session.ts";

/** The request's parked slice. */
const parked = (
  message: Message,
  state: ServerState,
): Record<string, unknown> =>
  state.requests[(message.ctx?.rid as string) ?? ""] ?? {};

/** The body of a request. */
const bodyOf = (message: Message): Record<string, unknown> => {
  const body = (message.payload as HttpReq).body;
  return (body ?? {}) as Record<string, unknown>;
};

/** The texts of the tasks section. */
const taskStrings = (tr: ReturnType<typeof trOf>): Record<string, string> => ({
  tasksTitle: tr.tr("Tasks"),
  tasksDescription: tr.tr(
    "The background work of the service: the letters, the cleanups and the other jobs.",
  ),
  allTasks: tr.tr("All tasks"),
  newTask: tr.tr("New task"),
  handler: tr.tr("Handler"),
  status: tr.tr("Status"),
  schedule: tr.tr("Schedule"),
  attempts: tr.tr("Attempts"),
  lastError: tr.tr("Last error"),
  run: tr.tr("Run"),
  stop: tr.tr("Stop"),
  delete: tr.tr("Delete"),
  edit: tr.tr("Edit"),
  save: tr.tr("Save"),
  cancel: tr.tr("Cancel"),
  noTasks: tr.tr("No tasks yet."),
  queued: tr.tr("Pending"),
  running: tr.tr("Running"),
  done: tr.tr("Completed"),
  failed: tr.tr("Failed"),
  cancelled: tr.tr("Cancelled"),
  now: tr.tr("Now"),
  searchTasks: tr.tr("Search tasks…"),
  createTask: tr.tr("Create the task"),
  taskKind: tr.tr("The handler of the task"),
  runAt: tr.tr("When to run it"),
});

export class TasksAPI {
  /** GET /api/admin/tasks */
  "tasks.list"(message: Message): Effect[] {
    const req = message.payload as HttpReq;
    return [
      requestsEffector.merge({ locale: localeOf(req) }),
      ...sessionEffect(req, "tasks.list"),
    ];
  }

  "tasks.list.sessionUser.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const user = sessionUserOf(message);
    if (!user) return [unauthorized()];
    return [
      requestsEffector.merge({ userId: user.id }),
      RbacService.has(user.id, ADMIN_PERMISSION, "tasks.list.guard"),
    ];
  }

  "tasks.list.guard.onSuccess"(message: Message, state: ServerState): Effect[] {
    if (!oneOf(message)) return [this.forbidden(message)];
    return [TaskService.list()];
  }

  "tasks.list.onSuccess"(message: Message, state: ServerState): Effect[] {
    const locale =
      (parked(message, state) as { locale?: string }).locale ?? "en";
    const tr = trOf({ cookies: { lang: locale } });
    const rows = rowsOf<{
      id: number;
      kind: string;
      payload: Record<string, unknown>;
      status: string;
      attempts: number;
      lastError: string;
      runAt: string;
      createdAt: string;
      finishedAt: string | null;
    }>(message);
    const labels: Record<string, string> = {
      queued: tr.tr("Pending"),
      running: tr.tr("Running"),
      done: tr.tr("Completed"),
      failed: tr.tr("Failed"),
      cancelled: tr.tr("Cancelled"),
    };
    return [
      httpEffector.makeResponse(200, {
        total: rows.length,
        items: rows.map((r) => ({
          ...r,
          statusLabel: labels[r.status] ?? r.status,
          handlerLabel:
            TASK_HANDLERS.find((h) => h.name === r.kind)?.description ?? r.kind,
        })),
        handlers: TASK_HANDLERS.map((h) => ({
          ...h,
          label: tr.tr(h.description),
        })),
        actions: TASK_ACTIONS.map((a) => ({ ...a, label: tr.tr(a.title) })),
        strings: taskStrings(tr),
      }),
    ];
  }

  /** GET /api/admin/tasks/handlers */
  "tasks.handlers"(message: Message): Effect[] {
    const tr = trOf(message.payload as HttpReq);
    return [
      httpEffector.makeResponse(200, {
        total: TASK_HANDLERS.length,
        items: TASK_HANDLERS.map((h) => ({
          ...h,
          label: tr.tr(h.description),
        })),
      }),
    ];
  }

  /** GET /api/admin/tasks/actions */
  "tasks.actions"(message: Message): Effect[] {
    const tr = trOf(message.payload as HttpReq);
    return [
      httpEffector.makeResponse(200, {
        total: TASK_ACTIONS.length,
        items: TASK_ACTIONS.map((a) => ({ ...a, label: tr.tr(a.title) })),
      }),
    ];
  }

  /** POST /api/admin/tasks */
  "tasks.create"(message: Message): Effect[] {
    const req = message.payload as HttpReq;
    const body = bodyOf(message);
    const kind = typeof body.kind === "string" ? body.kind.trim() : "";
    if (!kind) return invalid("kind", "a handler");
    const payload =
      body.payload && typeof body.payload === "object"
        ? (body.payload as Record<string, unknown>)
        : {};
    const runAt =
      typeof body.runAt === "string" && body.runAt ? body.runAt : null;
    return [
      requestsEffector.merge({ kind, payload, runAt }),
      ...sessionEffect(req, "tasks.create"),
    ];
  }

  "tasks.create.sessionUser.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const user = sessionUserOf(message);
    if (!user) return [unauthorized()];
    return [
      requestsEffector.merge({ userId: user.id }),
      RbacService.has(user.id, ADMIN_PERMISSION, "tasks.create.guard"),
    ];
  }

  "tasks.create.guard.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    if (!oneOf(message)) return [this.forbidden(message)];
    const { kind, payload, runAt } = parked(message, state) as {
      kind: string;
      payload: Record<string, unknown>;
      runAt: string | null;
    };
    return [TaskService.create(kind, payload, runAt)];
  }

  "tasks.created.onSuccess"(message: Message): Effect[] {
    const task = oneOf<{ id: number }>(message);
    return [httpEffector.makeResponse(201, task)];
  }

  /** PUT /api/admin/tasks/:id */
  "tasks.update"(message: Message): Effect[] {
    const req = message.payload as HttpReq;
    const id = Number(req.params.id);
    const body = bodyOf(message);
    const kind = typeof body.kind === "string" ? body.kind.trim() : "";
    if (!Number.isInteger(id)) return invalid("id", "a task");
    if (!kind) return invalid("kind", "a handler");
    const payload =
      body.payload && typeof body.payload === "object"
        ? (body.payload as Record<string, unknown>)
        : {};
    const runAt =
      typeof body.runAt === "string" && body.runAt ? body.runAt : null;
    return [
      requestsEffector.merge({ id, kind, payload, runAt }),
      ...sessionEffect(req, "tasks.update"),
    ];
  }

  "tasks.update.sessionUser.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const user = sessionUserOf(message);
    if (!user) return [unauthorized()];
    return [
      requestsEffector.merge({ userId: user.id }),
      RbacService.has(user.id, ADMIN_PERMISSION, "tasks.update.guard"),
    ];
  }

  "tasks.update.guard.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    if (!oneOf(message)) return [this.forbidden(message)];
    const { id, kind, payload, runAt } = parked(message, state) as {
      id: number;
      kind: string;
      payload: Record<string, unknown>;
      runAt: string | null;
    };
    return [TaskService.update(id, kind, payload, runAt)];
  }

  "tasks.updated.onSuccess"(message: Message): Effect[] {
    return [httpEffector.makeResponse(200, { ok: true })];
  }

  /** DELETE /api/admin/tasks/:id */
  "tasks.remove"(message: Message): Effect[] {
    const req = message.payload as HttpReq;
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return invalid("id", "a task");
    return [
      requestsEffector.set("id", id),
      ...sessionEffect(req, "tasks.remove"),
    ];
  }

  "tasks.remove.sessionUser.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const user = sessionUserOf(message);
    if (!user) return [unauthorized()];
    return [
      requestsEffector.merge({ userId: user.id }),
      RbacService.has(user.id, ADMIN_PERMISSION, "tasks.remove.guard"),
    ];
  }

  "tasks.remove.guard.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    if (!oneOf(message)) return [this.forbidden(message)];
    const { id } = parked(message, state) as { id: number };
    return [TaskService.remove(id)];
  }

  "tasks.deleted.onSuccess"(): Effect[] {
    return [httpEffector.makeResponse(200, { ok: true })];
  }

  /** POST /api/admin/tasks/:id/run — the task runs now. */
  "tasks.run"(message: Message): Effect[] {
    const req = message.payload as HttpReq;
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return invalid("id", "a task");
    return [requestsEffector.set("id", id), ...sessionEffect(req, "tasks.run")];
  }

  "tasks.run.sessionUser.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const user = sessionUserOf(message);
    if (!user) return [unauthorized()];
    return [
      requestsEffector.merge({ userId: user.id }),
      RbacService.has(user.id, ADMIN_PERMISSION, "tasks.run.guard"),
    ];
  }

  "tasks.run.guard.onSuccess"(message: Message, state: ServerState): Effect[] {
    if (!oneOf(message)) return [this.forbidden(message)];
    const { id } = parked(message, state) as { id: number };
    return [TaskService.byId(id, "tasks.run.byId")];
  }

  "tasks.run.byId.onSuccess"(message: Message, state: ServerState): Effect[] {
    const task = oneOf<{ id: number; kind: string; status: string }>(message);
    if (!task)
      return [httpEffector.makeResponse(404, { error: "no such task" })];
    if (task.status === "running")
      return [httpEffector.makeResponse(409, { error: "the task is running" })];
    const { id } = parked(message, state) as { id: number };
    return [
      requestsEffector.merge({ kind: task.kind, id }),
      TaskService.start(id),
    ];
  }

  "tasks.started.onSuccess"(message: Message, state: ServerState): Effect[] {
    const { kind, id } = parked(message, state) as { kind: string; id: number };
    return [requestsEffector.merge({ kind, id }), TaskService.runHandler(kind)];
  }

  "tasks.handled.onSuccess"(message: Message, state: ServerState): Effect[] {
    const { id } = parked(message, state) as { id: number };
    return [TaskService.finish(id)];
  }

  "tasks.finished.onSuccess"(): Effect[] {
    return [httpEffector.makeResponse(200, { ok: true })];
  }

  /** POST /api/admin/tasks/:id/cancel — the task is stopped. */
  "tasks.cancel"(message: Message): Effect[] {
    const req = message.payload as HttpReq;
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return invalid("id", "a task");
    return [
      requestsEffector.set("id", id),
      ...sessionEffect(req, "tasks.cancel"),
    ];
  }

  "tasks.cancel.sessionUser.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const user = sessionUserOf(message);
    if (!user) return [unauthorized()];
    return [
      requestsEffector.merge({ userId: user.id }),
      RbacService.has(user.id, ADMIN_PERMISSION, "tasks.cancel.guard"),
    ];
  }

  "tasks.cancel.guard.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    if (!oneOf(message)) return [this.forbidden(message)];
    const { id } = parked(message, state) as { id: number };
    return [TaskService.cancel(id)];
  }

  "tasks.cancelled.onSuccess"(): Effect[] {
    return [httpEffector.makeResponse(200, { ok: true })];
  }

  /** The permission is missing: the section is closed. */
  private forbidden(message: Message): Effect {
    const tr = trOf(message.payload as HttpReq);
    return httpEffector.makeResponse(403, {
      error: tr.tr("Only the administrators of the site can open this page."),
    });
  }

  "tasks.failed"(): Effect[] {
    return [httpEffector.makeResponse(500, { error: "internal error" })];
  }
}
