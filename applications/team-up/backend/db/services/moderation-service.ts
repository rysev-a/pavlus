// The moderation service: the reports (the queue an administrator answers),
// the blocks (one-way: the blocked member cannot write to the blocker) and
// the suspensions (a suspended member is hidden from the directory).
//
// The original's rules live where the actions are (messages, friends,
// applications); this module owns the data of the three.

import { db, sql } from "@pavlus/backend";

/** What a report is about. */
export const REPORT_KINDS = ["person", "project", "message"] as const;
/** Why a member reports something. */
export const REPORT_REASONS = ["spam", "abuse", "fake", "other"] as const;
/** How many reports a member may send in a day. */
export const REPORTS_PER_DAY = 10;
/** The details of a report are at most this long. */
export const DETAILS_MAX = 500;
/** The excerpt of a reported message is at most this long. */
export const EXCERPT_MAX = 300;

export interface ReportRow {
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
  reporterSlug: string;
}

export interface ReportTargetRow {
  userId: number;
  name: string;
  slug: string;
}

export interface MessageTargetRow {
  threadId: number;
  messageId: number;
  authorId: number;
  authorName: string;
  body: string;
}

export class ReportService {
  /** How many reports this member sent since the moment (an ISO stamp). */
  static countSince(userId: number, since: string) {
    return db.select({
      id: "reports.count",
      errorId: "reports.failed",
      query: sql`SELECT count(*)::int AS n FROM reports
                 WHERE user_id = ${userId} AND created_at >= ${since}`,
    });
  }

  /** Has this member already reported this target? */
  static openExists(userId: number, kind: string, target: string) {
    return db.select({
      id: "reports.open",
      errorId: "reports.failed",
      query: sql`SELECT 1 AS n FROM reports
                 WHERE user_id = ${userId} AND kind = ${kind}
                   AND target = ${target} AND status = 'open'`,
    });
  }

  /** The member behind a slug — the subject of a "person" report. */
  static person(slug: string) {
    return db.select({
      id: "reports.person",
      errorId: "reports.failed",
      query: sql`SELECT p.user_id AS "userId", u.name, p.slug
                 FROM profiles p JOIN users u ON u.id = p.user_id
                 WHERE p.slug = ${slug}`,
    });
  }

  /** The same, with a step of the flow's own name. */
  static bySlug(slug: string, ns = "reports.person") {
    return db.select({
      id: ns,
      errorId: "reports.failed",
      query: sql`SELECT p.user_id AS "userId", u.name, p.slug
                 FROM profiles p JOIN users u ON u.id = p.user_id
                 WHERE p.slug = ${slug}`,
    });
  }

  /** One report of the queue. */
  static get(id: number, ns = "admin.reports.get") {
    return db.select({
      id: ns,
      errorId: "reports.failed",
      query: sql`SELECT id, kind, target, target_label AS "targetLabel",
                        reason, subject_id AS "subjectId", status
                 FROM reports WHERE id = ${id}`,
    });
  }

  /** The project behind a slug — the subject of a "project" report. */
  static project(slug: string) {
    return db.select({
      id: "reports.project",
      errorId: "reports.failed",
      query: sql`SELECT p.owner_id AS "userId", p.name, p.slug
                 FROM projects p WHERE p.slug = ${slug}`,
    });
  }

  /** The message behind `<thread id>:<message id>`. */
  static message(threadId: number, messageId: number) {
    return db.select({
      id: "reports.message",
      errorId: "reports.failed",
      query: sql`SELECT m.thread_id AS "threadId", m.id AS "messageId",
                        m.user_id AS "authorId", u.name AS "authorName", m.body
                 FROM messages m JOIN users u ON u.id = m.user_id
                 WHERE m.thread_id = ${threadId} AND m.id = ${messageId}`,
    });
  }

  /** The readers of a thread — only they may report a message of it. */
  static threadReaders(threadId: number) {
    return db.select({
      id: "reports.readers",
      errorId: "reports.failed",
      query: sql`SELECT user_id AS "userId" FROM thread_participants
                 WHERE thread_id = ${threadId}`,
    });
  }

  /** The new report. */
  static insert(
    userId: number,
    kind: string,
    target: string,
    reason: string,
    details: string,
    targetLabel: string,
    subjectId: number | null,
    excerpt: string,
  ) {
    return db.execute({
      id: "reports.inserted",
      errorId: "reports.failed",
      query: sql`INSERT INTO reports
                   (user_id, kind, target, reason, details, target_label,
                    subject_id, excerpt)
                 VALUES (${userId}, ${kind}, ${target}, ${reason}, ${details},
                         ${targetLabel}, ${subjectId}, ${excerpt})
                 RETURNING id`,
    });
  }

  /**
   * The queue: the reports of the filter, the newest first.
   *
   * `open` — the ones nobody answered; `actioned` — answered with an action;
   * `dismissed` — answered with a dismissal; `all` — everything.
   */
  static queue(status = "open") {
    return db.select({
      id: "reports.queue",
      errorId: "reports.failed",
      query: sql`SELECT r.id, r.kind, r.target, r.target_label AS "targetLabel",
                        r.reason, r.details, r.excerpt, r.status, r.action,
                        r.note, r.created_at AS "createdAt",
                        COALESCE(u.name, '') AS "reporterName",
                        COALESCE(ps.slug, '') AS "subjectSlug",
                        COALESCE(us.name, '') AS "subjectName",
                        EXISTS (SELECT 1 FROM suspensions s
                                WHERE s.user_id = r.subject_id
                                  AND (s.until IS NULL OR s.until > now()))
                          AS "subjectSuspended",
                        COALESCE(h.name, '') AS "handledByName"
                 FROM reports r
                 LEFT JOIN users u ON u.id = r.user_id
                 LEFT JOIN profiles ps ON ps.user_id = r.subject_id
                 LEFT JOIN users us ON us.id = r.subject_id
                 LEFT JOIN users h ON h.id = r.handled_by
                 WHERE (${status} = 'all' OR r.status = ${status})
                 ORDER BY r.created_at DESC`,
    });
  }

  /**
   * The answer of an administrator: a dismissal closes the report as
   * `dismissed`, every other action as `actioned` (the original's two
   * answered states).
   */
  static resolve(
    id: number,
    action: string,
    note: string,
    adminId: number | null,
  ) {
    const status = action === "dismiss" ? "dismissed" : "actioned";
    return db.execute({
      id: "reports.resolved",
      errorId: "reports.failed",
      query: sql`UPDATE reports SET status = ${status}, action = ${action},
                                    note = ${note}, handled_at = now(),
                                    handled_by = ${adminId}
                 WHERE id = ${id} AND status = 'open'`,
    });
  }
}

export interface BlockRow {
  slug: string;
  name: string;
  createdAt: string;
}

export class BlockService {
  /** Who this member blocks. */
  static list(userId: number) {
    return db.select({
      id: "blocks.list",
      errorId: "blocks.failed",
      query: sql`SELECT b.slug, COALESCE(u.name, '') AS name,
                        b.created_at AS "createdAt"
                 FROM blocks b
                 LEFT JOIN profiles p ON p.slug = b.slug
                 LEFT JOIN users u ON u.id = p.user_id
                 WHERE b.user_id = ${userId}
                 ORDER BY b.created_at DESC`,
    });
  }

  /** The block is one-way: the same block twice is still one. */
  static add(userId: number, slug: string) {
    return db.execute({
      id: "blocks.added",
      errorId: "blocks.failed",
      query: sql`INSERT INTO blocks (user_id, slug) VALUES (${userId}, ${slug})
                 ON CONFLICT (user_id, slug) DO NOTHING`,
    });
  }

  static remove(userId: number, slug: string) {
    return db.execute({
      id: "blocks.removed",
      errorId: "blocks.failed",
      query: sql`DELETE FROM blocks WHERE user_id = ${userId} AND slug = ${slug}`,
    });
  }

  /** Do two members block each other (in either direction)? */
  static between(aId: number, bSlug: string) {
    return db.select({
      id: "blocks.between",
      errorId: "blocks.failed",
      query: sql`SELECT 1 AS n FROM blocks b
                 JOIN profiles p ON p.slug = b.slug
                 WHERE (b.user_id = ${aId} AND p.user_id = ${bSlug})
                    OR (b.user_id = ${bSlug} AND p.slug =
                        (SELECT slug FROM profiles WHERE user_id = ${aId}))`,
    });
  }
}

export interface SuspensionRow {
  userId: number;
  slug: string;
  name: string;
  reason: string;
  until: string | null;
  createdAt: string;
}

export class SuspensionService {
  /** The suspended members. */
  static list() {
    return db.select({
      id: "suspensions.list",
      errorId: "suspensions.failed",
      query: sql`SELECT s.user_id AS "userId", COALESCE(p.slug, '') AS slug,
                        COALESCE(u.name, '') AS name, s.reason,
                        s.until, s.created_at AS "createdAt"
                 FROM suspensions s
                 LEFT JOIN users u ON u.id = s.user_id
                 LEFT JOIN profiles p ON p.user_id = s.user_id
                 ORDER BY s.created_at DESC`,
    });
  }

  /** Is this member suspended right now? */
  static active(userId: number) {
    return db.select({
      id: "suspensions.active",
      errorId: "suspensions.failed",
      query: sql`SELECT 1 AS n FROM suspensions
                 WHERE user_id = ${userId}
                   AND (until IS NULL OR until > now())`,
    });
  }

  static suspend(userId: number, reason: string, until: string | null) {
    return db.execute({
      id: "suspensions.suspended",
      errorId: "suspensions.failed",
      query: sql`INSERT INTO suspensions (user_id, reason, until)
                 VALUES (${userId}, ${reason}, ${until})
                 ON CONFLICT (user_id) DO UPDATE
                 SET reason = EXCLUDED.reason, until = EXCLUDED.until`,
    });
  }

  static unsuspend(userId: number) {
    return db.execute({
      id: "suspensions.lifted",
      errorId: "suspensions.failed",
      query: sql`DELETE FROM suspensions WHERE user_id = ${userId}`,
    });
  }
}
