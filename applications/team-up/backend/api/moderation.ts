// The moderation api: a member reports a person, a project or a message, and
// blocks a person; an administrator answers the queue (dismiss, cancel the
// project, remove the message, suspend the member) and lets members back.
//
// The flow of a report is long (the count of the day, the target, the
// duplicate check, the insert), so every step parks what the next one needs
// in the request's slice.

import {
  type HttpReq,
  httpEffector,
  oneOf,
  requestsEffector,
  rowsOf,
  type ServerState,
} from "@pavlus/backend";
import type { Effect, Message } from "@pavlus/core";
import {
  BlockService,
  DETAILS_MAX,
  EXCERPT_MAX,
  REPORT_KINDS,
  REPORT_REASONS,
  REPORTS_PER_DAY,
  ReportService,
  SuspensionService,
} from "../db/services/moderation-service.ts";
import { localeOf, trOf, type Tr } from "../i18n/mod.ts";
import { sessionEffect, sessionUserOf, unauthorized } from "./session.ts";

/** What the report flow parks between its steps. */
interface ReportSlice {
  since?: string;
  userId?: number;
  kind?: string;
  target?: string;
  reason?: string;
  details?: string;
  targetLabel?: string;
  subjectId?: number | null;
  excerpt?: string;
  threadId?: number;
}

const parked = (
  message: Message,
  state: ServerState,
): Record<string, unknown> => state.requests[message.ctx?.rid as string] ?? {};

/** The body of a request, as a plain object. */
const bodyOf = (message: Message): Record<string, unknown> => {
  const body = (message.payload as HttpReq).body;
  return (body ?? {}) as Record<string, unknown>;
};

/** `<thread id>:<message id>` — the address of a message in a report. */
const messageTarget = (
  target: string,
): { threadId: number; messageId: number } | undefined => {
  const [thread, message] = target.split(":");
  const threadId = Number(thread);
  const messageId = Number(message);
  if (!Number.isInteger(threadId) || !Number.isInteger(messageId))
    return undefined;
  if (threadId <= 0 || messageId <= 0) return undefined;
  return { threadId, messageId };
};

/** The reasons the dialog offers (the original's list). */
export const REPORT_REASON_LIST = REPORT_REASONS;

/** The filters of the queue (the original's select). */
const STATUS_FILTERS = ["open", "actioned", "dismissed", "all"] as const;

/** The text of a filter. */
const statusText = (value: string): string =>
  value === "open"
    ? "Open"
    : value === "actioned"
      ? "Acted on"
      : value === "dismissed"
        ? "Dismissed"
        : "All";

/** What a report is about. */
const kindLabel = (tr: Tr, kind: string): string =>
  tr.tr(
    kind === "person" ? "Member" : kind === "project" ? "Project" : "Message",
  );

/** Why it was reported. */
const reasonLabel = (tr: Tr, reason: string): string =>
  tr.tr(
    reason === "spam"
      ? "Spam or advertising"
      : reason === "abuse"
        ? "Abuse or harassment"
        : reason === "fake"
          ? "Fake or misleading"
          : "Something else",
  );

/** What was done with the report. */
const actionLabel = (tr: Tr, action: string): string =>
  tr.tr(
    action === "dismiss"
      ? "Dismissed"
      : action === "cancel_project"
        ? "The project was cancelled"
        : action === "remove_message"
          ? "The message was removed"
          : action === "suspend_user" || action === "suspend"
            ? "The member was suspended"
            : "",
  );

/** The texts of the moderation page. */
const moderationStrings = (tr: Tr): Record<string, string> => ({
  title: tr.tr("Moderation"),
  reports: tr.tr("Reports"),
  show: tr.tr("Show"),
  suspended: tr.tr("Suspended members"),
  loading: tr.tr("Loading…"),
  empty: tr.tr("No reports here."),
  nobody: tr.tr("Nobody is suspended."),
  letBack: tr.tr("Let back"),
  from: tr.tr("from"),
  answers: tr.tr("Answers for it:"),
  suspendedShort: tr.tr("suspended"),
  note: tr.tr("A note (optional)"),
  dismiss: tr.tr("Dismiss"),
  cancelProject: tr.tr("Cancel the project"),
  removeMessage: tr.tr("Remove the message"),
  suspendMember: tr.tr("Suspend the member"),
  onlyModerators: tr.tr("Only the moderators of the site can open this page."),
});

/** The language the request parked (the db reply carries the rows). */
const parkedLocale = (message: Message, state: ServerState): string => {
  const slice = parked(message, state) as { locale?: string };
  return slice.locale ?? "en";
};

export class ModerationAPI {
  /** POST /api/reports — a member reports something. */
  "reports.create"(message: Message): Effect[] {
    const req = message.payload as HttpReq;
    const body = bodyOf(message);
    const tr = trOf(req);
    const kind = String(body.kind ?? "");
    const target = String(body.target ?? "").trim();
    const reason = String(body.reason ?? "");
    const details = String(body.details ?? "").trim();
    if (!REPORT_KINDS.includes(kind as (typeof REPORT_KINDS)[number]))
      return [
        httpEffector.makeResponse(422, {
          error: tr.tr("Choose what you report"),
        }),
      ];
    if (!REPORT_REASONS.includes(reason as (typeof REPORT_REASONS)[number]))
      return [
        httpEffector.makeResponse(422, { error: tr.tr("Choose a reason") }),
      ];
    if (details.length > DETAILS_MAX)
      return [
        httpEffector.makeResponse(422, {
          error: tr.trArgs("The details must be at most {max} characters", {
            max: DETAILS_MAX,
          }),
        }),
      ];
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    return [
      requestsEffector.merge({ kind, target, reason, details, since }),
      ...sessionEffect(req, "reports.create"),
    ];
  }

  "reports.create.sessionUser.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const user = sessionUserOf(message);
    if (!user) return [unauthorized()];
    const slice = parked(message, state) as ReportSlice;
    return [
      requestsEffector.merge({ userId: user.id }),
      ReportService.countSince(user.id, String(slice.since ?? "")),
    ];
  }

  /** The count of the day is fine — the same target is not reported twice. */
  "reports.count.onSuccess"(message: Message, state: ServerState): Effect[] {
    const row = oneOf<{ n: number }>(message);
    const tr = trOf(message.payload as HttpReq);
    const slice = parked(message, state) as ReportSlice;
    if ((row?.n ?? 0) >= REPORTS_PER_DAY)
      return [
        httpEffector.makeResponse(429, {
          error: tr.tr("Too many reports today, try again tomorrow"),
        }),
      ];
    return [
      ReportService.openExists(
        Number(slice.userId),
        String(slice.kind ?? ""),
        String(slice.target ?? ""),
      ),
    ];
  }

  /** Not reported yet — now the target is looked up. */
  "reports.open.onSuccess"(message: Message, state: ServerState): Effect[] {
    const row = oneOf<{ n: number }>(message);
    const tr = trOf(message.payload as HttpReq);
    const slice = parked(message, state) as ReportSlice;
    if (row)
      return [
        httpEffector.makeResponse(409, {
          error: tr.tr("You have already reported this"),
        }),
      ];
    const kind = String(slice.kind ?? "");
    const target = String(slice.target ?? "");
    if (kind === "person") return [ReportService.person(target)];
    if (kind === "project") return [ReportService.project(target)];
    const at = messageTarget(target);
    if (!at)
      return [
        httpEffector.makeResponse(404, { error: tr.tr("Message not found") }),
      ];
    return [
      requestsEffector.merge({ threadId: at.threadId }),
      ReportService.message(at.threadId, at.messageId),
    ];
  }

  /** The member of the report. */
  "reports.person.onSuccess"(message: Message, state: ServerState): Effect[] {
    const row = oneOf<{ userId: number; name: string }>(message);
    const tr = trOf(message.payload as HttpReq);
    if (!row)
      return [
        httpEffector.makeResponse(404, { error: tr.tr("Member not found") }),
      ];
    const slice = parked(message, state) as ReportSlice;
    if (row.userId === Number(slice.userId))
      return [
        httpEffector.makeResponse(422, {
          error: tr.tr("You cannot report yourself"),
        }),
      ];
    return [
      requestsEffector.merge({ targetLabel: row.name, subjectId: row.userId }),
      ReportService.insert(
        Number(slice.userId),
        "person",
        String(slice.target ?? ""),
        String(slice.reason ?? ""),
        String(slice.details ?? ""),
        row.name,
        row.userId,
        "",
      ),
    ];
  }

  /** The project of the report. */
  "reports.project.onSuccess"(message: Message, state: ServerState): Effect[] {
    const row = oneOf<{ userId: number; name: string }>(message);
    const tr = trOf(message.payload as HttpReq);
    if (!row)
      return [
        httpEffector.makeResponse(404, { error: tr.tr("Project not found") }),
      ];
    const slice = parked(message, state) as ReportSlice;
    if (row.userId === Number(slice.userId))
      return [
        httpEffector.makeResponse(422, {
          error: tr.tr("You cannot report your own project"),
        }),
      ];
    return [
      requestsEffector.merge({ targetLabel: row.name, subjectId: row.userId }),
      ReportService.insert(
        Number(slice.userId),
        "project",
        String(slice.target ?? ""),
        String(slice.reason ?? ""),
        String(slice.details ?? ""),
        row.name,
        row.userId,
        "",
      ),
    ];
  }

  /** The message of the report: only a reader of the thread may report it. */
  "reports.message.onSuccess"(message: Message, state: ServerState): Effect[] {
    const row = oneOf<{
      authorId: number;
      authorName: string;
      body: string;
    }>(message);
    const tr = trOf(message.payload as HttpReq);
    if (!row)
      return [
        httpEffector.makeResponse(404, { error: tr.tr("Message not found") }),
      ];
    const slice = parked(message, state) as ReportSlice;
    if (row.authorId === Number(slice.userId))
      return [
        httpEffector.makeResponse(422, {
          error: tr.tr("You cannot report your own message"),
        }),
      ];
    return [
      requestsEffector.merge({
        targetLabel: row.authorName,
        subjectId: row.authorId,
        excerpt: row.body.slice(0, EXCERPT_MAX),
      }),
      ReportService.threadReaders(Number(slice.threadId)),
    ];
  }

  "reports.readers.onSuccess"(message: Message, state: ServerState): Effect[] {
    const readers = rowsOf<{ userId: number }>(message);
    const tr = trOf(message.payload as HttpReq);
    const slice = parked(message, state) as ReportSlice;
    if (!readers.some((r) => r.userId === Number(slice.userId)))
      return [
        httpEffector.makeResponse(404, { error: tr.tr("Message not found") }),
      ];
    return [
      ReportService.insert(
        Number(slice.userId),
        "message",
        String(slice.target ?? ""),
        String(slice.reason ?? ""),
        String(slice.details ?? ""),
        String(slice.targetLabel ?? ""),
        (slice.subjectId as number | undefined) ?? null,
        String(slice.excerpt ?? ""),
      ),
    ];
  }

  "reports.inserted.onSuccess"(message: Message): Effect[] {
    const row = oneOf<{ id: number }>(message);
    return [httpEffector.makeResponse(201, { id: row?.id ?? null })];
  }

  "reports.failed"(): Effect[] {
    return [httpEffector.makeResponse(500, { error: "database error" })];
  }

  // ----- the blocks -----

  /** GET /api/blocks */
  "blocks.list"(message: Message): Effect[] {
    return sessionEffect(message.payload as HttpReq, "blocks.list");
  }

  "blocks.list.sessionUser.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const user = sessionUserOf(message);
    if (!user) return [unauthorized()];
    return [BlockService.list(user.id)];
  }

  "blocks.list.onSuccess"(message: Message): Effect[] {
    return [httpEffector.makeResponse(200, { blocks: rowsOf(message) })];
  }

  /** POST /api/blocks/:slug */
  "blocks.add"(message: Message): Effect[] {
    const req = message.payload as HttpReq;
    const slug = String(req.params.slug ?? "");
    if (!slug)
      return [httpEffector.makeResponse(404, { error: "no such member" })];
    return [
      requestsEffector.set("slug", slug),
      ...sessionEffect(req, "blocks.add"),
    ];
  }

  "blocks.add.sessionUser.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const user = sessionUserOf(message);
    if (!user) return [unauthorized()];
    const { slug } = parked(message, state) as { slug: string };
    return [BlockService.add(user.id, slug)];
  }

  "blocks.added.onSuccess"(message: Message): Effect[] {
    return [httpEffector.makeResponse(204, null)];
  }

  /** DELETE /api/blocks/:slug */
  "blocks.remove"(message: Message): Effect[] {
    const req = message.payload as HttpReq;
    const slug = String(req.params.slug ?? "");
    if (!slug)
      return [httpEffector.makeResponse(404, { error: "no such member" })];
    return [
      requestsEffector.set("slug", slug),
      ...sessionEffect(req, "blocks.remove"),
    ];
  }

  "blocks.remove.sessionUser.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const user = sessionUserOf(message);
    if (!user) return [unauthorized()];
    const { slug } = parked(message, state) as { slug: string };
    return [BlockService.remove(user.id, slug)];
  }

  "blocks.removed.onSuccess"(message: Message): Effect[] {
    return [httpEffector.makeResponse(204, null)];
  }

  "blocks.failed"(): Effect[] {
    return [httpEffector.makeResponse(500, { error: "database error" })];
  }

  // ----- the back office -----

  /** GET /api/admin/reports — the queue. */
  "admin.reports"(message: Message): Effect[] {
    const req = message.payload as HttpReq;
    const status = String(req.query?.status ?? "open");
    return [
      requestsEffector.merge({ status, locale: localeOf(req) }),
      ...sessionEffect(req, "admin.reports"),
    ];
  }

  "admin.reports.sessionUser.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const user = sessionUserOf(message);
    if (!user) return [unauthorized()];
    if (!user.isAdmin)
      return [
        httpEffector.makeResponse(403, { error: "not an administrator" }),
      ];
    const slice = parked(message, state) as { status?: string };
    return [ReportService.queue(String(slice.status ?? "open"))];
  }

  "reports.queue.onSuccess"(message: Message, state: ServerState): Effect[] {
    // the db reply carries the rows: the translator comes from the parked
    // language of the request
    const tr = trOf({ cookies: { lang: parkedLocale(message, state) } });
    const reports = rowsOf<{
      id: number;
      kind: string;
      target: string;
      targetLabel: string;
      reason: string;
      details: string;
      excerpt: string;
      status: string;
      action: string;
      note: string;
      createdAt: string;
      reporterName: string;
      subjectSlug: string;
      subjectName: string;
      subjectSuspended: boolean;
      handledByName: string;
    }>(message).map((r) => ({
      ...r,
      kindLabel: kindLabel(tr, r.kind),
      reasonLabel: reasonLabel(tr, r.reason),
      actionLabel: actionLabel(tr, r.action),
    }));
    return [
      httpEffector.makeResponse(200, {
        reports,
        statuses: STATUS_FILTERS.map((value) => ({
          value,
          label: tr.tr(statusText(value)),
        })),
        strings: moderationStrings(tr),
      }),
    ];
  }

  /** POST /api/admin/reports/:id/resolve — the answer. */
  "admin.resolve"(message: Message): Effect[] {
    const req = message.payload as HttpReq;
    const id = Number(req.params.id);
    if (!Number.isInteger(id))
      return [httpEffector.makeResponse(404, { error: "no such report" })];
    const body = bodyOf(message);
    const action = String(body.action ?? "dismiss");
    const note = String(body.note ?? "")
      .trim()
      .slice(0, 500);
    return [
      requestsEffector.merge({ id, action, note }),
      ...sessionEffect(req, "admin.resolve"),
    ];
  }

  "admin.resolve.sessionUser.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const user = sessionUserOf(message);
    if (!user) return [unauthorized()];
    if (!user.isAdmin)
      return [
        httpEffector.makeResponse(403, { error: "not an administrator" }),
      ];
    const { id, action, note } = parked(message, state) as {
      id: number;
      action: string;
      note: string;
    };
    if (action === "suspend") {
      // the member of the report is suspended first, the report is answered
      // after that
      return [
        requestsEffector.merge({ adminId: user.id }),
        ReportService.get(id),
      ];
    }
    return [
      requestsEffector.merge({ adminId: user.id }),
      ReportService.resolve(id, action, note, user.id),
    ];
  }

  "admin.reports.get.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const row = oneOf<{ subjectId: number | null }>(message);
    const slice = parked(message, state) as {
      id: number;
      action: string;
      note: string;
      adminId: number;
    };
    if (!row?.subjectId)
      return [httpEffector.makeResponse(404, { error: "no such report" })];
    return [SuspensionService.suspend(row.subjectId, slice.note, null)];
  }

  "suspensions.suspended.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const slice = parked(message, state) as {
      id: number;
      action: string;
      note: string;
      adminId: number;
    };
    return [
      ReportService.resolve(slice.id, slice.action, slice.note, slice.adminId),
    ];
  }

  "reports.resolved.onSuccess"(message: Message): Effect[] {
    return [httpEffector.makeResponse(200, { ok: true })];
  }

  /** GET /api/admin/suspensions */
  "admin.suspensions"(message: Message): Effect[] {
    const req = message.payload as HttpReq;
    return [
      requestsEffector.merge({ locale: localeOf(req) }),
      ...sessionEffect(req, "admin.suspensions"),
    ];
  }

  "admin.suspensions.sessionUser.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const user = sessionUserOf(message);
    if (!user) return [unauthorized()];
    if (!user.isAdmin)
      return [
        httpEffector.makeResponse(403, { error: "not an administrator" }),
      ];
    return [SuspensionService.list()];
  }

  "suspensions.list.onSuccess"(message: Message, state: ServerState): Effect[] {
    const tr = trOf({ cookies: { lang: parkedLocale(message, state) } });
    const suspended = rowsOf<{
      userId: number;
      slug: string;
      name: string;
      reason: string;
      createdAt: string;
    }>(message).map((s) => ({
      slug: s.slug,
      name: s.name,
      at: s.createdAt.slice(0, 16).replace("T", " "),
      reason: s.reason,
    }));
    return [
      httpEffector.makeResponse(200, {
        suspended,
        strings: moderationStrings(tr),
      }),
    ];
  }

  /** DELETE /api/admin/suspensions/:slug — the member is let back. */
  "admin.unsuspend"(message: Message): Effect[] {
    const req = message.payload as HttpReq;
    const slug = String(req.params.slug ?? "");
    if (!slug)
      return [httpEffector.makeResponse(404, { error: "no such member" })];
    return [
      requestsEffector.set("slug", slug),
      ...sessionEffect(req, "admin.unsuspend"),
    ];
  }

  "admin.unsuspend.sessionUser.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const user = sessionUserOf(message);
    if (!user) return [unauthorized()];
    if (!user.isAdmin)
      return [
        httpEffector.makeResponse(403, { error: "not an administrator" }),
      ];
    const { slug } = parked(message, state) as { slug: string };
    return [ReportService.bySlug(slug, "admin.unsuspend.person")];
  }

  "admin.unsuspend.person.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const row = oneOf<{ userId: number }>(message);
    if (!row)
      return [httpEffector.makeResponse(404, { error: "no such member" })];
    return [SuspensionService.unsuspend(row.userId)];
  }

  "suspensions.lifted.onSuccess"(message: Message): Effect[] {
    return [httpEffector.makeResponse(204, null)];
  }

  "suspensions.failed"(): Effect[] {
    return [httpEffector.makeResponse(500, { error: "database error" })];
  }

  "admin.failed"(): Effect[] {
    return [httpEffector.makeResponse(500, { error: "database error" })];
  }
}
