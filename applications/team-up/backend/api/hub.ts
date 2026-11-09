// The cabinet (`/app/projects`): my projects, the applications and the
// invitations (the "Activity" tab), and the writes of the owner — the
// project's fields, its slots, the invitations to the team.
//
// The translation lives on the server: the db reply carries the rows, so the
// translator is rebuilt from the language the request parked.

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
import { ApplicationService } from "../db/services/application-service.ts";
import { HubService } from "../db/services/hub-service.ts";
import { ProfileService } from "../db/services/profile-service.ts";
import { ProjectService } from "../db/services/project-service.ts";
import { localeOf, trOf, type Tr } from "../i18n/mod.ts";
import {
  deadlineLabel,
  initialsOf,
  kindLabel,
  statusLabel,
} from "../lib/views.ts";
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

/** The language the request parked (the db reply carries the rows). */
const parkedLocale = (message: Message, state: ServerState): string =>
  (parked(message, state) as { locale?: string }).locale ?? "en";

const translator = (message: Message, state: ServerState): Tr =>
  trOf({ cookies: { lang: parkedLocale(message, state) } });

/** "Senior Backend developer" — the grade and the name of the profession. */
const gradeTitle = (tr: Tr, bucket: string | null, name: string | null) => {
  if (!name) return "";
  const grade = tr.tr(bucket ?? "");
  return `${grade ? `${grade.charAt(0).toUpperCase()}${grade.slice(1)} ` : ""}${tr.tr(name)}`;
};

/** The texts of the cabinet (the translation lives in the backend). */
const hubStrings = (tr: Tr): Record<string, string> => ({
  title: tr.tr("My projects"),
  catalog: tr.tr("Projects catalog"),
  create: tr.tr("Create a project"),
  tabMine: tr.tr("My projects"),
  tabActivity: tr.tr("Applications and invitations"),
  tabMatch: tr.tr("Recommended"),
  loading: tr.tr("Loading…"),
  emptyMine: tr.tr(
    "You are not in any project yet. Create your own or find one in the catalog.",
  ),
  invitations: tr.tr("Invitations"),
  noInvites: tr.tr("No invitations."),
  myApplications: tr.tr("My applications"),
  noApplications: tr.tr("You have not applied anywhere yet."),
  accept: tr.tr("Accept"),
  decline: tr.tr("Decline"),
  edit: tr.tr("Edit"),
  delete: tr.tr("Delete"),
  cancel: tr.tr("Cancel"),
  appliedAs: tr.tr("You applied as: {profession}"),
  underReview: tr.tr("Under review"),
  accepted: tr.tr("Accepted"),
  declined: tr.tr("Declined"),
  withdrawn: tr.tr("Withdrawn"),
  acceptedFinal: tr.tr(
    "The application is accepted: it can no longer be changed or deleted.",
  ),
  invitedBy: tr.tr("Invited by:"),
  looking: tr.tr("looking for people · {n}"),
  founder: tr.tr("Founder:"),
  deleteTitle: tr.tr("Delete the application?"),
  deleteText: tr.tr(
    'The application to "{name}" will be deleted. This cannot be undone.',
  ),
  editTitle: tr.tr("Edit the application: {name}"),
  save: tr.tr("Save"),
  send: tr.tr("Send the application"),
  yourProfession: tr.tr("Your profession"),
  noProfession: tr.tr(
    "Your profile has no professions yet: add them in the Professions section; you can apply without one.",
  ),
  message: tr.tr("Message"),
  opening: tr.tr("Opening"),
  tellWhy: tr.tr("Tell them why you want to join"),
  noSlots: tr.tr("No slots yet."),
  emptyFeed: tr.tr("No matching projects yet."),
  error: tr.tr("The list could not be loaded."),
});

/** The label of an application's status. */
const applicationLabel = (tr: Tr, status: string): string => {
  switch (status) {
    case "accepted":
      return tr.tr("Accepted");
    case "declined":
      return tr.tr("Declined");
    case "withdrawn":
      return tr.tr("Withdrawn");
    default:
      return tr.tr("Under review");
  }
};

export class HubAPI {
  /** GET /api/hub — everything the cabinet's frame needs. */
  "hub.get"(message: Message): Effect[] {
    const req = message.payload as HttpReq;
    return [
      requestsEffector.merge({ locale: localeOf(req) }),
      ...sessionEffect(req, "hub.get"),
    ];
  }

  "hub.get.sessionUser.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const user = sessionUserOf(message);
    if (!user) return [unauthorized()];
    return [
      requestsEffector.merge({ userId: user.id }),
      HubService.mine(user.id),
    ];
  }

  "hub.mine.onSuccess"(message: Message, state: ServerState): Effect[] {
    const { userId } = parked(message, state) as { userId: number };
    return [
      requestsEffector.set("mine", rowsOf(message)),
      HubService.invites(userId),
    ];
  }

  "hub.invites.onSuccess"(message: Message, state: ServerState): Effect[] {
    const { userId } = parked(message, state) as { userId: number };
    return [
      requestsEffector.set("invites", rowsOf(message)),
      HubService.applications(userId),
    ];
  }

  "hub.applications.onSuccess"(message: Message, state: ServerState): Effect[] {
    const tr = translator(message, state);
    const slice = parked(message, state) as {
      mine: Record<string, unknown>[];
      invites: Record<string, unknown>[];
    };
    const applications = rowsOf<{
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
    }>(message);

    const mine = (slice.mine ?? []).map((r) => {
      const row = r as {
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
        ownerProfession: string | null;
        ownerBucket: string | null;
        openSlots: number;
        isOwner: boolean;
        isMember: boolean;
      };
      const role = gradeTitle(tr, row.ownerBucket, row.ownerProfession);
      return {
        ...row,
        kindLabel: kindLabel(tr, row.kind),
        statusLabel: statusLabel(tr, row.status),
        deadlineLabel: deadlineLabel(tr, row.deadline),
        ownerRole: role,
        lookingLabel: tr.trArgs("looking for people · {n}", {
          n: row.openSlots,
        }),
        founderLabel: tr.tr("Founder:"),
      };
    });

    const invites = (slice.invites ?? []).map((r) => {
      const row = r as {
        slotId: number;
        projectSlug: string;
        projectName: string;
        professionName: string;
        bucket: string;
        invitedByName: string | null;
        invitedBySlug: string | null;
      };
      return {
        ...row,
        slotLabel: `${tr.tr(row.professionName)} · ${tr.tr(row.bucket)}`,
        invitedByLabel: tr.tr("Invited by:"),
      };
    });

    const myApplications = applications.map((a) => ({
      ...a,
      statusLabel: applicationLabel(tr, a.status),
      asProfession: gradeTitle(tr, a.bucket, a.professionName),
      appliedAsLabel: tr.trArgs("You applied as: {profession}", {
        profession: gradeTitle(tr, a.bucket, a.professionName),
      }),
      slotLabel: `${tr.tr(a.professionName)} · ${tr.tr(a.slotBucket)}`,
    }));

    return [
      httpEffector.makeResponse(200, {
        mine,
        invites,
        applications: myApplications,
        strings: hubStrings(tr),
      }),
    ];
  }

  /** GET /api/apply/options — the professions of the member and the texts. */
  "hub.applyOptions"(message: Message): Effect[] {
    const req = message.payload as HttpReq;
    return [
      requestsEffector.merge({ locale: localeOf(req) }),
      ...sessionEffect(req, "hub.applyOptions"),
    ];
  }

  "hub.applyOptions.sessionUser.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const user = sessionUserOf(message);
    if (!user) return [unauthorized()];
    return [
      requestsEffector.merge({ userId: user.id }),
      ProfileService.myProfessionsWithNames(user.id),
    ];
  }

  "hub.applyOptions.onSuccess"(message: Message, state: ServerState): Effect[] {
    const tr = translator(message, state);
    const rows = rowsOf<{
      professionId: number;
      slug: string;
      name: string;
      bucket: string;
    }>(message);
    const title = (bucket: string, name: string): string => {
      const grade = tr.tr(bucket);
      return `${grade ? `${grade.charAt(0).toUpperCase()}${grade.slice(1)} ` : ""}${tr.tr(name)}`;
    };
    return [
      httpEffector.makeResponse(200, {
        professions: rows.map((r) => ({
          professionId: r.professionId,
          slug: r.slug,
          title: title(r.bucket, r.name),
        })),
        strings: {
          opening: tr.tr("Opening"),
          yourProfession: tr.tr("Your profession"),
          noProfession: tr.tr(
            "Your profile has no professions yet: add them in the Professions section; you can apply without one.",
          ),
          message: tr.tr("Message"),
          tellWhy: tr.tr("Tell them why you want to join"),
          cancel: tr.tr("Cancel"),
          save: tr.tr("Save"),
          send: tr.tr("Send the application"),
          loading: tr.tr("Loading…"),
        },
      }),
    ];
  }

  /** POST /api/invites/:slotId/accept */
  "invites.accept"(message: Message): Effect[] {
    const req = message.payload as HttpReq;
    const slotId = Number(req.params.slotId);
    if (!Number.isInteger(slotId)) return invalid("slotId", "an invitation");
    return [
      requestsEffector.set("slotId", slotId),
      ...sessionEffect(req, "invites.accept"),
    ];
  }

  "invites.accept.sessionUser.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const user = sessionUserOf(message);
    if (!user) return [unauthorized()];
    const { slotId } = parked(message, state) as { slotId: number };
    return [
      requestsEffector.merge({ userId: user.id }),
      HubService.acceptInvite(slotId, user.id),
    ];
  }

  "hub.inviteAccepted.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const row = oneOf<{ project_id: number }>(message);
    const { userId } = parked(message, state) as { userId: number };
    if (!row)
      return [httpEffector.makeResponse(404, { error: "no such invitation" })];
    return [HubService.joinProjectChat(row.project_id, userId)];
  }

  /** The accepted member joined the project's chat. */
  "hub.chatJoined.onSuccess"(): Effect[] {
    return [httpEffector.makeResponse(200, { ok: true, accepted: true })];
  }

  /** POST /api/invites/:slotId/decline */
  "invites.decline"(message: Message): Effect[] {
    const req = message.payload as HttpReq;
    const slotId = Number(req.params.slotId);
    if (!Number.isInteger(slotId)) return invalid("slotId", "an invitation");
    return [
      requestsEffector.set("slotId", slotId),
      ...sessionEffect(req, "invites.decline"),
    ];
  }

  "invites.decline.sessionUser.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const user = sessionUserOf(message);
    if (!user) return [unauthorized()];
    const { slotId } = parked(message, state) as { slotId: number };
    return [HubService.declineInvite(slotId, user.id)];
  }

  "hub.inviteDeclined.onSuccess"(): Effect[] {
    return [httpEffector.makeResponse(200, { ok: true })];
  }

  /** POST /api/projects/:slug/slots/:slotId/invite — the team invitation. */
  "hub.invite"(message: Message): Effect[] {
    const req = message.payload as HttpReq;
    const slug = req.params.slug ?? "";
    const slotId = Number(req.params.slotId);
    const body = bodyOf(message);
    const who = typeof body.slug === "string" ? body.slug.trim() : "";
    if (!Number.isInteger(slotId)) return invalid("slotId", "a slot");
    if (!who) return invalid("slug", "a member");
    return [
      requestsEffector.merge({ projectSlug: slug, slotId, who }),
      ...sessionEffect(req, "hub.invite"),
    ];
  }

  "hub.invite.sessionUser.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const user = sessionUserOf(message);
    if (!user) return [unauthorized()];
    const { slotId, who } = parked(message, state) as {
      slotId: number;
      who: string;
    };
    return [
      requestsEffector.merge({ userId: user.id }),
      ProfileService.userIdBySlug(who, "hub.invite.user"),
    ];
  }

  "hub.invite.user.onSuccess"(message: Message, state: ServerState): Effect[] {
    const other = oneOf<{ user_id: number }>(message);
    if (!other)
      return [httpEffector.makeResponse(404, { error: "no such member" })];
    const { slotId, userId } = parked(message, state) as {
      slotId: number;
      userId: number;
    };
    if (other.user_id === userId)
      return [httpEffector.makeResponse(422, { error: "that is you" })];
    return [
      requestsEffector.merge({ inviteeId: other.user_id }),
      HubService.slotContext(slotId, "hub.invite.slot"),
    ];
  }

  "hub.invite.slot.onSuccess"(message: Message, state: ServerState): Effect[] {
    const slot = oneOf<{
      slotId: number;
      slotStatus: string;
      projectId: number;
      ownerId: number;
    }>(message);
    const { userId, inviteeId } = parked(message, state) as {
      userId: number;
      inviteeId: number;
    };
    if (!slot)
      return [httpEffector.makeResponse(404, { error: "no such slot" })];
    if (slot.slotStatus !== "open")
      return [
        httpEffector.makeResponse(409, { error: "the slot is not open" }),
      ];
    if (slot.ownerId !== userId)
      return [HubService.memberOf(slot.projectId, userId, "hub.invite.member")];
    return [HubService.invite(slot.slotId, inviteeId, userId)];
  }

  "hub.invite.member.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    if (!oneOf(message))
      return [httpEffector.makeResponse(403, { error: "not your project" })];
    const { slotId, inviteeId, userId } = parked(message, state) as {
      slotId: number;
      inviteeId: number;
      userId: number;
    };
    return [HubService.invite(slotId, inviteeId, userId)];
  }

  "hub.invited.onSuccess"(): Effect[] {
    return [httpEffector.makeResponse(200, { ok: true })];
  }

  /** DELETE /api/projects/:slug/slots/:slotId/invite — take it back. */
  "hub.revoke"(message: Message): Effect[] {
    const req = message.payload as HttpReq;
    const slotId = Number(req.params.slotId);
    if (!Number.isInteger(slotId)) return invalid("slotId", "a slot");
    return [
      requestsEffector.set("slotId", slotId),
      ...sessionEffect(req, "hub.revoke"),
    ];
  }

  "hub.revoke.sessionUser.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const user = sessionUserOf(message);
    if (!user) return [unauthorized()];
    const { slotId } = parked(message, state) as { slotId: number };
    return [HubService.revokeInvite(slotId, user.id)];
  }

  "hub.inviteRevoked.onSuccess"(): Effect[] {
    return [httpEffector.makeResponse(200, { ok: true })];
  }

  /** PUT /api/applications/:id — the pending application is changed. */
  "apps.edit"(message: Message): Effect[] {
    const req = message.payload as HttpReq;
    const id = Number(req.params.id);
    const body = bodyOf(message);
    const note =
      typeof body.message === "string"
        ? body.message.trim().slice(0, 1000)
        : "";
    const professionId =
      body.professionId === null || body.professionId === undefined
        ? null
        : Number(body.professionId);
    if (!Number.isInteger(id)) return invalid("id", "an application");
    return [
      requestsEffector.merge({ appId: id, note, professionId }),
      ...sessionEffect(req, "apps.edit"),
    ];
  }

  "apps.edit.sessionUser.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const user = sessionUserOf(message);
    if (!user) return [unauthorized()];
    const { appId } = parked(message, state) as { appId: number };
    return [
      requestsEffector.merge({ userId: user.id }),
      ApplicationService.byId(appId, "apps.edit.app"),
    ];
  }

  "apps.edit.app.onSuccess"(message: Message, state: ServerState): Effect[] {
    const app = oneOf<{ id: number; userId: number; status: string }>(message);
    const { userId, note, professionId } = parked(message, state) as {
      userId: number;
      note: string;
      professionId: number | null;
    };
    if (!app)
      return [httpEffector.makeResponse(404, { error: "no such application" })];
    if (app.userId !== userId)
      return [
        httpEffector.makeResponse(403, { error: "not your application" }),
      ];
    if (app.status !== "new")
      return [httpEffector.makeResponse(409, { error: "already decided" })];
    return [ApplicationService.edit(app.id, note, professionId)];
  }

  "apps.edited.onSuccess"(): Effect[] {
    return [httpEffector.makeResponse(200, { ok: true })];
  }

  /** POST /api/projects/:slug/leave — I leave the team. */
  "hub.leave"(message: Message): Effect[] {
    const req = message.payload as HttpReq;
    const slug = req.params.slug ?? "";
    return [
      requestsEffector.set("slug", slug),
      ...sessionEffect(req, "hub.leave"),
    ];
  }

  "hub.leave.sessionUser.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const user = sessionUserOf(message);
    if (!user) return [unauthorized()];
    const { slug } = parked(message, state) as { slug: string };
    return [
      requestsEffector.merge({ userId: user.id }),
      ProjectService.bySlug(slug, "hub.leave.project"),
    ];
  }

  "hub.leave.project.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const project = oneOf<{ id: number; ownerId: number }>(message);
    const { userId } = parked(message, state) as { userId: number };
    if (!project)
      return [httpEffector.makeResponse(404, { error: "no such project" })];
    if (project.ownerId === userId)
      return [
        httpEffector.makeResponse(403, { error: "the founder cannot leave" }),
      ];
    return [HubService.leave(project.id, userId)];
  }

  "hub.left.onSuccess"(): Effect[] {
    return [httpEffector.makeResponse(200, { ok: true })];
  }

  /** DELETE /api/projects/:slug/members/:userSlug — the owner removes one. */
  "hub.removeMember"(message: Message): Effect[] {
    const req = message.payload as HttpReq;
    const slug = req.params.slug ?? "";
    const userSlug = req.params.userSlug ?? "";
    if (!userSlug) return invalid("userSlug", "a member");
    return [
      requestsEffector.merge({ slug, userSlug }),
      ...sessionEffect(req, "hub.removeMember"),
    ];
  }

  "hub.removeMember.sessionUser.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const user = sessionUserOf(message);
    if (!user) return [unauthorized()];
    const { slug, userSlug } = parked(message, state) as {
      slug: string;
      userSlug: string;
    };
    return [
      requestsEffector.merge({ userId: user.id }),
      ProjectService.ownedBy(user.id, slug, "hub.removeMember.owner"),
    ];
  }

  "hub.removeMember.owner.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const owned = oneOf<{ id: number }>(message);
    if (!owned)
      return [httpEffector.makeResponse(403, { error: "not your project" })];
    const { userSlug } = parked(message, state) as { userSlug: string };
    return [ProfileService.userIdBySlug(userSlug, "hub.removeMember.user")];
  }

  "hub.removeMember.user.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const other = oneOf<{ user_id: number }>(message);
    const { slug } = parked(message, state) as { slug: string };
    if (!other)
      return [httpEffector.makeResponse(404, { error: "no such member" })];
    return [
      requestsEffector.merge({ userId: other.user_id }),
      ProjectService.bySlug(slug, "hub.removeMember.project"),
    ];
  }

  "hub.removeMember.project.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const project = oneOf<{ id: number }>(message);
    const { userId } = parked(message, state) as { userId: number };
    if (!project)
      return [httpEffector.makeResponse(404, { error: "no such project" })];
    return [HubService.removeMember(project.id, userId)];
  }

  "hub.memberRemoved.onSuccess"(): Effect[] {
    return [httpEffector.makeResponse(200, { ok: true })];
  }

  /** PUT /api/projects/:slug — the owner edits the project. */
  "hub.updateProject"(message: Message): Effect[] {
    const req = message.payload as HttpReq;
    const slug = req.params.slug ?? "";
    const body = bodyOf(message);
    const text = (key: string, max: number): string =>
      typeof body[key] === "string"
        ? (body[key] as string).trim().slice(0, max)
        : "";
    const kind = ["startup", "company", "part-time"].includes(String(body.kind))
      ? String(body.kind)
      : "startup";
    const status = ["active", "paused", "done", "cancelled"].includes(
      String(body.status),
    )
      ? String(body.status)
      : "active";
    const workMode = ["remote", "office", "hybrid"].includes(
      String(body.workMode),
    )
      ? String(body.workMode)
      : "remote";
    const tags = Array.isArray(body.tags)
      ? (body.tags as unknown[])
          .filter((t): t is string => typeof t === "string")
          .map((t) => t.trim().slice(0, 40))
          .filter(Boolean)
          .slice(0, 12)
      : [];
    const budget =
      body.budget === null || body.budget === undefined || body.budget === ""
        ? null
        : Number(body.budget);
    const budgetCurrency =
      typeof body.budgetCurrency === "string" && body.budgetCurrency
        ? body.budgetCurrency.slice(0, 8)
        : null;
    const deadline =
      typeof body.deadline === "string" && body.deadline ? body.deadline : null;
    return [
      requestsEffector.merge({
        slug,
        fields: {
          name: text("name", 80),
          tagline: text("tagline", 140),
          description: text("description", 2000),
          kind,
          status,
          workMode,
          city: text("city", 80),
          website: text("website", 200),
          tags,
          budget:
            budget !== null && Number.isFinite(budget)
              ? Math.round(budget)
              : null,
          budgetCurrency,
          deadline,
        },
      }),
      ...sessionEffect(req, "hub.updateProject"),
    ];
  }

  "hub.updateProject.sessionUser.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const user = sessionUserOf(message);
    if (!user) return [unauthorized()];
    const { slug } = parked(message, state) as { slug: string };
    return [
      requestsEffector.merge({ userId: user.id }),
      ProjectService.ownedBy(user.id, slug, "hub.updateProject.owner"),
    ];
  }

  "hub.updateProject.owner.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const owned = oneOf<{ id: number }>(message);
    if (!owned)
      return [httpEffector.makeResponse(403, { error: "not your project" })];
    const { fields } = parked(message, state) as {
      fields: Parameters<typeof HubService.updateProject>[1];
    };
    return [HubService.updateProject(owned.id, fields)];
  }

  "hub.projectUpdated.onSuccess"(): Effect[] {
    return [httpEffector.makeResponse(200, { ok: true })];
  }

  /** PUT /api/projects/:slug/slots/:slotId — the owner edits the slot. */
  "hub.updateSlot"(message: Message): Effect[] {
    const req = message.payload as HttpReq;
    const slug = req.params.slug ?? "";
    const slotId = Number(req.params.slotId);
    const body = bodyOf(message);
    const professionId = Number(body.professionId);
    const bucket = ["junior", "middle", "senior", "lead"].includes(
      String(body.bucket),
    )
      ? String(body.bucket)
      : "middle";
    if (!Number.isInteger(slotId)) return invalid("slotId", "a slot");
    if (!Number.isInteger(professionId))
      return invalid("professionId", "a profession");
    const pay = ["unpaid", "equity", "paid"].includes(String(body.pay))
      ? String(body.pay)
      : null;
    const number = (key: string): number | null => {
      const value = Number(body[key]);
      return Number.isFinite(value) && value > 0 ? Math.round(value) : null;
    };
    // the skills of the opening (the leaves the owner rated)
    const skills: [number, number][] = Array.isArray(body.skills)
      ? (body.skills as { skillId?: unknown; level?: unknown }[])
          .map(
            (row) =>
              [Number(row?.skillId), Number(row?.level)] as [number, number],
          )
          .filter(
            (row) =>
              Number.isInteger(row[0]) &&
              Number.isInteger(row[1]) &&
              row[1] >= 1 &&
              row[1] <= 10,
          )
      : [];
    return [
      requestsEffector.merge({
        slug,
        slotId,
        skills,
        fields: {
          professionId,
          bucket,
          description:
            typeof body.description === "string"
              ? body.description.trim().slice(0, 500)
              : "",
          pay,
          payFrom: number("payFrom"),
          payTo: number("payTo"),
          currency:
            typeof body.currency === "string" && body.currency
              ? body.currency.slice(0, 8)
              : null,
        },
      }),
      ...sessionEffect(req, "hub.updateSlot"),
    ];
  }

  "hub.updateSlot.sessionUser.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const user = sessionUserOf(message);
    if (!user) return [unauthorized()];
    const { slug, slotId } = parked(message, state) as {
      slug: string;
      slotId: number;
    };
    return [
      requestsEffector.merge({ userId: user.id }),
      ProjectService.ownedBy(user.id, slug, "hub.updateSlot.owner"),
    ];
  }

  "hub.updateSlot.owner.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const owned = oneOf<{ id: number }>(message);
    if (!owned)
      return [httpEffector.makeResponse(403, { error: "not your project" })];
    const { slotId, fields } = parked(message, state) as {
      slotId: number;
      fields: Parameters<typeof HubService.updateSlot>[1];
    };
    return [
      HubService.updateSlot(slotId, fields),
      requestsEffector.merge({
        skills:
          (parked(message, state) as { skills: [number, number][] }).skills ??
          [],
      }),
    ];
  }

  "hub.slotUpdated.onSuccess"(message: Message, state: ServerState): Effect[] {
    const { slotId, skills } = parked(message, state) as {
      slotId: number;
      skills: [number, number][];
    };
    // the skills of the opening travel in their own step
    return [
      ProjectService.setSlotSkills(slotId, skills ?? [], "hub.slotSkills"),
    ];
  }

  "hub.slotSkills.onSuccess"(): Effect[] {
    return [httpEffector.makeResponse(200, { ok: true })];
  }

  /** DELETE /api/projects/:slug/slots/:slotId — the owner deletes the slot. */
  "hub.deleteSlot"(message: Message): Effect[] {
    const req = message.payload as HttpReq;
    const slug = req.params.slug ?? "";
    const slotId = Number(req.params.slotId);
    if (!Number.isInteger(slotId)) return invalid("slotId", "a slot");
    return [
      requestsEffector.merge({ slug, slotId }),
      ...sessionEffect(req, "hub.deleteSlot"),
    ];
  }

  "hub.deleteSlot.sessionUser.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const user = sessionUserOf(message);
    if (!user) return [unauthorized()];
    const { slug } = parked(message, state) as { slug: string };
    return [
      requestsEffector.merge({ userId: user.id }),
      ProjectService.ownedBy(user.id, slug, "hub.deleteSlot.owner"),
    ];
  }

  "hub.deleteSlot.owner.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const owned = oneOf<{ id: number }>(message);
    if (!owned)
      return [httpEffector.makeResponse(403, { error: "not your project" })];
    const { slotId } = parked(message, state) as { slotId: number };
    return [HubService.deleteSlot(slotId)];
  }

  "hub.slotDeleted.onSuccess"(): Effect[] {
    return [httpEffector.makeResponse(200, { ok: true })];
  }

  "hub.failed"(): Effect[] {
    return [httpEffector.makeResponse(500, { error: "internal error" })];
  }
}
