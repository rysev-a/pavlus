// The service of the cabinet (`/app/projects`): my projects, my invitations,
// my applications, and the writes of the owner — the slots, the invitations,
// the team. The invitation lives on the slot itself (the original's model):
// the slot holds the invitee (`user_id`), the inviter (`invited_by`) and the
// status `invited`.

import { db, sql } from "@pavlus/backend";

export interface MyProjectRow {
  id: number;
  slug: string;
  name: string;
  tagline: string;
  kind: string;
  status: string;
  city: string;
  deadline: string | null;
  tags: string[];
  ownerName: string;
  ownerSlug: string;
  /** The owner's profession in the team (the card's "Founder · role"). */
  ownerProfession: string | null;
  ownerBucket: string | null;
  openSlots: number;
  isOwner: boolean;
  isMember: boolean;
}

export interface MyInviteRow {
  slotId: number;
  projectSlug: string;
  projectName: string;
  professionName: string;
  bucket: string;
  invitedByName: string | null;
  invitedBySlug: string | null;
}

export interface MyApplicationRow {
  id: number;
  slotId: number;
  status: string;
  message: string;
  bucket: string | null;
  professionId: number | null;
  projectSlug: string;
  projectName: string;
  professionName: string;
  slotBucket: string;
  canEdit: boolean;
  canDelete: boolean;
}

export interface TeamRow {
  userId: number;
  slug: string;
  name: string;
  professionName: string | null;
  bucket: string | null;
  isOwner: boolean;
}

export class HubService {
  /** The projects I own or take part in (the "My projects" tab). */
  static mine(userId: number) {
    return db.select({
      id: "hub.mine",
      errorId: "hub.failed",
      query: sql`SELECT p.id, p.slug, p.name, p.tagline, p.kind, p.status,
                        p.city, p.deadline, p.tags,
                        u.name AS "ownerName", pf.slug AS "ownerSlug",
                        (SELECT pr.name FROM profiles_professions pp
                          JOIN professions pr ON pr.id = pp.profession_id
                          WHERE pp.user_id = p.owner_id
                          ORDER BY pp.profession_id LIMIT 1) AS "ownerProfession",
                        (SELECT pp.bucket FROM profiles_professions pp
                          WHERE pp.user_id = p.owner_id
                          ORDER BY pp.profession_id LIMIT 1) AS "ownerBucket",
                        (SELECT count(*) FROM slots s
                          WHERE s.project_id = p.id AND s.user_id IS NULL
                            AND s.status = 'open')::int AS "openSlots",
                        (p.owner_id = ${userId}) AS "isOwner",
                        EXISTS (SELECT 1 FROM slots s
                          WHERE s.project_id = p.id AND s.user_id = ${userId}
                            AND s.status = 'joined') AS "isMember"
                 FROM projects p
                 JOIN users u ON u.id = p.owner_id
                 JOIN profiles pf ON pf.user_id = p.owner_id
                 WHERE p.owner_id = ${userId}
                    OR EXISTS (SELECT 1 FROM slots s
                          WHERE s.project_id = p.id AND s.user_id = ${userId}
                            AND s.status = 'joined')
                 ORDER BY p.id DESC`,
    });
  }

  /** The invitations addressed to me (the slots waiting for my answer). */
  static invites(userId: number) {
    return db.select({
      id: "hub.invites",
      errorId: "hub.failed",
      query: sql`SELECT s.id AS "slotId", p.slug AS "projectSlug",
                        p.name AS "projectName", pr.name AS "professionName",
                        s.bucket, inv.name AS "invitedByName",
                        ip.slug AS "invitedBySlug"
                 FROM slots s
                 JOIN projects p ON p.id = s.project_id
                 JOIN professions pr ON pr.id = s.profession_id
                 LEFT JOIN users inv ON inv.id = s.invited_by
                 LEFT JOIN profiles ip ON ip.user_id = s.invited_by
                 WHERE s.status = 'invited' AND s.user_id = ${userId}
                 ORDER BY s.id DESC`,
    });
  }

  /** My applications: the ones I can still change and the ones I can delete. */
  static applications(userId: number) {
    return db.select({
      id: "hub.applications",
      errorId: "hub.failed",
      query: sql`SELECT a.id, a.slot_id AS "slotId", a.status, a.message,
                        a.bucket, a.profession_id AS "professionId",
                        p.slug AS "projectSlug", p.name AS "projectName",
                        pr.name AS "professionName", s.bucket AS "slotBucket",
                        (a.status = 'new') AS "canEdit",
                        (a.status IN ('new','declined')) AS "canDelete"
                 FROM applications a
                 JOIN slots s ON s.id = a.slot_id
                 JOIN projects p ON p.id = s.project_id
                 JOIN professions pr ON pr.id = s.profession_id
                 WHERE a.user_id = ${userId}
                 ORDER BY a.id DESC`,
    });
  }

  /** The invitation is accepted: the slot is taken by me. */
  static acceptInvite(slotId: number, userId: number) {
    return db.execute({
      id: "hub.inviteAccepted",
      errorId: "hub.failed",
      query: sql`UPDATE slots SET status = 'joined'
                 WHERE id = ${slotId} AND user_id = ${userId}
                   AND status = 'invited'
                 RETURNING project_id`,
    });
  }

  /** The invitation is declined (or taken back): the slot is open again. */
  static declineInvite(slotId: number, userId: number) {
    return db.execute({
      id: "hub.inviteDeclined",
      errorId: "hub.failed",
      query: sql`UPDATE slots SET user_id = NULL, status = 'open', invited_by = NULL
                 WHERE id = ${slotId} AND user_id = ${userId}
                   AND status = 'invited'`,
    });
  }

  /** The slot's project and its owner (the invitation checks both). */
  static slotContext(slotId: number, ns = "hub.slotContext") {
    return db.select({
      id: ns,
      errorId: "hub.failed",
      query: sql`SELECT s.id AS "slotId", s.status AS "slotStatus",
                        s.user_id AS "slotUserId",
                        p.id AS "projectId", p.slug AS "projectSlug",
                        p.owner_id AS "ownerId"
                 FROM slots s JOIN projects p ON p.id = s.project_id
                 WHERE s.id = ${slotId}`,
    });
  }

  /** The invitation is sent: the slot waits for the invitee's answer. */
  static invite(slotId: number, inviteeId: number, inviterId: number) {
    return db.execute({
      id: "hub.invited",
      errorId: "hub.failed",
      query: sql`UPDATE slots SET user_id = ${inviteeId}, status = 'invited',
                             invited_by = ${inviterId}
                 WHERE id = ${slotId} AND status = 'open' AND user_id IS NULL`,
    });
  }

  /** The invitation is taken back: the slot is open again. */
  static revokeInvite(slotId: number, userId: number) {
    return db.execute({
      id: "hub.inviteRevoked",
      errorId: "hub.failed",
      query: sql`UPDATE slots SET user_id = NULL, status = 'open', invited_by = NULL
                 WHERE id = ${slotId} AND status = 'invited'
                   AND (invited_by = ${userId}
                     OR ${userId} IN (SELECT p.owner_id FROM projects p
                        JOIN slots s2 ON s2.project_id = p.id
                        WHERE s2.id = ${slotId}))`,
    });
  }

  /** The team of a project: its founder and the members who joined. */
  static team(projectId: number) {
    return db.select({
      id: "hub.team",
      errorId: "hub.failed",
      query: sql`SELECT * FROM (
                   SELECT u.id AS "userId", pf.slug, u.name,
                          pr.name AS "professionName", pp.bucket,
                          TRUE AS "isOwner"
                   FROM projects p
                   JOIN users u ON u.id = p.owner_id
                   JOIN profiles pf ON pf.user_id = u.id
                   LEFT JOIN profiles_professions pp ON pp.user_id = u.id
                   LEFT JOIN professions pr ON pr.id = pp.profession_id
                   WHERE p.id = ${projectId}
                   UNION
                   SELECT u.id, pf.slug, u.name, pr.name, s.bucket, FALSE
                   FROM slots s
                   JOIN users u ON u.id = s.user_id
                   JOIN profiles pf ON pf.user_id = u.id
                   JOIN professions pr ON pr.id = s.profession_id
                   WHERE s.project_id = ${projectId} AND s.status = 'joined'
                 ) t ORDER BY "isOwner" DESC, "userId"`,
    });
  }

  /** Am I in the team of the project (the founder counts)? */
  static memberOf(projectId: number, userId: number, ns = "hub.memberOf") {
    return db.select({
      id: ns,
      errorId: "hub.failed",
      query: sql`SELECT p.id FROM projects p
                 WHERE p.id = ${projectId}
                   AND (p.owner_id = ${userId}
                     OR EXISTS (SELECT 1 FROM slots s
                          WHERE s.project_id = p.id AND s.user_id = ${userId}
                            AND s.status = 'joined'))`,
    });
  }

  /** I leave the team: my slots of this project are free again. */
  static leave(projectId: number, userId: number) {
    return db.execute({
      id: "hub.left",
      errorId: "hub.failed",
      query: sql`UPDATE slots SET user_id = NULL, status = 'left'
                 WHERE project_id = ${projectId} AND user_id = ${userId}
                   AND status = 'joined'`,
    });
  }

  /** The owner removes a member from the team. */
  static removeMember(projectId: number, userId: number) {
    return db.execute({
      id: "hub.memberRemoved",
      errorId: "hub.failed",
      query: sql`UPDATE slots SET user_id = NULL, status = 'left'
                 WHERE project_id = ${projectId} AND user_id = ${userId}
                   AND status = 'joined'`,
    });
  }

  /** The project's fields (the owner edits them). */
  static updateProject(
    projectId: number,
    fields: {
      name: string;
      tagline: string;
      description: string;
      kind: string;
      status: string;
      workMode: string;
      city: string;
      website: string;
      tags: string[];
      budget: number | null;
      budgetCurrency: string | null;
      deadline: string | null;
    },
  ) {
    return db.execute({
      id: "hub.projectUpdated",
      errorId: "hub.failed",
      query: sql`UPDATE projects SET name = ${fields.name},
                 tagline = ${fields.tagline}, description = ${fields.description},
                 kind = ${fields.kind}, status = ${fields.status},
                 work_mode = ${fields.workMode}, city = ${fields.city},
                 website = ${fields.website}, tags = ${fields.tags},
                 budget = ${fields.budget}, budget_currency = ${fields.budgetCurrency},
                 deadline = ${fields.deadline}
                 WHERE id = ${projectId}`,
    });
  }

  /** The slot's fields (the owner edits them). */
  static updateSlot(
    slotId: number,
    fields: {
      professionId: number;
      bucket: string;
      description: string;
      pay: string | null;
      payFrom: number | null;
      payTo: number | null;
      currency: string | null;
    },
  ) {
    return db.execute({
      id: "hub.slotUpdated",
      errorId: "hub.failed",
      query: sql`UPDATE slots SET profession_id = ${fields.professionId},
                 bucket = ${fields.bucket}, description = ${fields.description},
                 pay = ${fields.pay}, pay_from = ${fields.payFrom},
                 pay_to = ${fields.payTo}, currency = ${fields.currency}
                 WHERE id = ${slotId}`,
    });
  }

  /** The slot is deleted (with its skills). */
  static deleteSlot(slotId: number) {
    return db.execute({
      id: "hub.slotDeleted",
      errorId: "hub.failed",
      query: sql`DELETE FROM slots WHERE id = ${slotId}`,
    });
  }

  /** The accepted member joins the project's chat (idempotent). */
  static joinProjectChat(projectId: number, userId: number) {
    return db.execute({
      id: "hub.chatJoined",
      errorId: "hub.failed",
      query: sql`INSERT INTO thread_participants (thread_id, user_id)
                 SELECT t.id, ${userId} FROM threads t
                 WHERE t.project_id = ${projectId} AND t.type = 'project'
                 ON CONFLICT DO NOTHING`,
    });
  }
}
