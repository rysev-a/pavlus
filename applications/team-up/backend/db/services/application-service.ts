// The application service: "I want this slot". Accepting is the interesting
// write: the application is accepted, the slot filled, the other pending
// applications of that slot declined, and the member lands in the project's
// chat — four steps, run in order (each its own effect: pg's extended
// protocol takes one statement per query).

import { db, sql } from "@pavlus/backend";

export interface ApplicationRow {
  id: number;
  slotId: number;
  userId: number;
  userName: string;
  userSlug: string;
  message: string;
  bucket: string | null;
  status: string;
}

export class ApplicationService {
  static apply(
    slotId: number,
    userId: number,
    message: string,
    professionId: number | null,
    bucket: string | null,
  ) {
    return db.execute({
      id: "apps.applied",
      errorId: "apps.failed",
      query: sql`INSERT INTO applications (slot_id, user_id, message, profession_id, bucket)
                 VALUES (${slotId}, ${userId}, ${message}, ${professionId},
                         COALESCE(${bucket}, (SELECT pp.bucket FROM profiles_professions pp
                           WHERE pp.user_id = ${userId} AND pp.profession_id = ${professionId})))
                 ON CONFLICT (slot_id, user_id)
                 DO UPDATE SET status = 'new', message = ${message},
                               profession_id = ${professionId},
                               bucket = COALESCE(${bucket}, (SELECT pp.bucket
                                 FROM profiles_professions pp
                                 WHERE pp.user_id = ${userId}
                                   AND pp.profession_id = ${professionId}))
                 RETURNING id`,
    });
  }

  static mine(userId: number) {
    return db.select({
      id: "apps.mine",
      errorId: "apps.failed",
      query: sql`SELECT a.id, a.slot_id AS "slotId", a.user_id AS "userId",
                        u.name AS "userName", pf.slug AS "userSlug",
                        a.message, a.bucket, a.status, p.name AS "projectName",
                        p.slug AS "projectSlug", pr2.name AS "profession"
                 FROM applications a
                 JOIN users u ON u.id = a.user_id
                 JOIN profiles pf ON pf.user_id = a.user_id
                 JOIN slots s ON s.id = a.slot_id
                 JOIN professions pr2 ON pr2.id = s.profession_id
                 JOIN projects p ON p.id = s.project_id
                 WHERE a.user_id = ${userId} AND a.status <> 'withdrawn'
                 ORDER BY a.id DESC`,
    });
  }

  static byProject(projectId: number) {
    return db.select({
      id: "apps.byProject",
      errorId: "apps.failed",
      query: sql`SELECT a.id, a.slot_id AS "slotId", a.user_id AS "userId",
                        u.name AS "userName", pf.slug AS "userSlug",
                        a.message, a.bucket, a.status, pr2.name AS "profession",
                        ap.name AS "appliedProfession"
                 FROM applications a
                 JOIN users u ON u.id = a.user_id
                 JOIN profiles pf ON pf.user_id = a.user_id
                 JOIN slots s ON s.id = a.slot_id
                 JOIN professions pr2 ON pr2.id = s.profession_id
                 LEFT JOIN professions ap ON ap.id = a.profession_id
                 WHERE s.project_id = ${projectId} AND a.status = 'new'
                 ORDER BY a.id`,
    });
  }

  static byId(id: number, ns = "apps.byId") {
    return db.select({
      id: ns,
      errorId: "apps.failed",
      query: sql`SELECT a.id, a.slot_id AS "slotId", a.user_id AS "userId", a.status
                 FROM applications a WHERE a.id = ${id}`,
    });
  }

  static setStatus(id: number, status: string, ns = "apps.statusSet") {
    return db.execute({
      id: ns,
      errorId: "apps.failed",
      query: sql`UPDATE applications SET status = ${status} WHERE id = ${id}`,
    });
  }

  /** The pending application is changed (the profession and the message). */
  static edit(
    id: number,
    message: string,
    professionId: number | null,
    ns = "apps.edited",
  ) {
    return db.execute({
      id: ns,
      errorId: "apps.failed",
      query: sql`UPDATE applications SET message = ${message},
                 profession_id = ${professionId}
                 WHERE id = ${id} AND status = 'new'`,
    });
  }

  /** Everything pending on the slot except the winner (declined on accept). */
  static declineOthers(slotId: number, keepId: number) {
    return db.execute({
      id: "apps.othersDeclined",
      errorId: "apps.failed",
      query: sql`UPDATE applications SET status = 'declined'
                 WHERE slot_id = ${slotId} AND id <> ${keepId} AND status = 'new'`,
    });
  }

  static fillSlot(slotId: number, userId: number) {
    return db.execute({
      id: "apps.slotFilled",
      errorId: "apps.failed",
      query: sql`UPDATE slots SET user_id = ${userId}, status = 'joined'
                 WHERE id = ${slotId}`,
    });
  }

  /** The accepted member joins the project's chat (idempotent). */
  static joinProjectChat(projectId: number, userId: number) {
    return db.execute({
      id: "apps.chatJoined",
      errorId: "apps.failed",
      query: sql`INSERT INTO thread_participants (thread_id, user_id)
                 SELECT t.id, ${userId} FROM threads t
                 WHERE t.project_id = ${projectId} AND t.type = 'project'
                 ON CONFLICT DO NOTHING`,
    });
  }
}
