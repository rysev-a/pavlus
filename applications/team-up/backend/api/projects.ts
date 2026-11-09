// Projects (api): the catalog, one project with its slots, creating one,
// adding a slot. Owners only; the session step is namespaced per flow.

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
import { ProjectService } from "../db/services/project-service.ts";
import { localeOf, trOf, type Tr } from "../i18n/mod.ts";
import {
  budgetLabel,
  deadlineLabel,
  initialsOf,
  kindLabel,
  payLabel,
  statusLabel,
  workModeLabel,
} from "../lib/views.ts";
import {
  SESSION_COOKIE,
  sessionEffect,
  sessionUserOf,
  unauthorized,
} from "./session.ts";

const KINDS = ["startup", "company", "part-time"];
const parked = (
  message: Message,
  state: ServerState,
): Record<string, unknown> => state.requests[message.ctx?.rid as string] ?? {};

/** "Senior Backend developer" — the grade and the name of the profession. */
const gradeTitle = (tr: Tr, bucket: string | null, name: string | null) => {
  if (!name) return "";
  const grade = tr.tr(bucket ?? "");
  return `${grade ? `${grade.charAt(0).toUpperCase()}${grade.slice(1)} ` : ""}${tr.tr(name)}`;
};

/** The texts of the project page (the translation lives in the backend). */
const projectStrings = (tr: Tr): Record<string, string> => ({
  loading: tr.tr("Loading…"),
  missing: tr.tr("Project not found"),
  backToProjects: tr.tr("Back to the projects"),
  error: tr.tr("The list could not be loaded."),
  editProject: tr.tr("Edit the project"),
  editing: tr.tr("Editing"),
  teamChat: tr.tr("Team chat"),
  leaveTeam: tr.tr("Leave the team"),
  reportProject: tr.tr("Report the project"),
  applications: tr.tr("Applications"),
  accept: tr.tr("Accept"),
  decline: tr.tr("Decline"),
  team: tr.tr("Team"),
  removeMember: tr.tr("Remove from the team"),
  slots: tr.tr("Openings and slots"),
  addSlot: tr.tr("+ Add a slot"),
  noSlots: tr.tr("No slots yet."),
  skillsOfOpening: tr.tr(
    "Required skills (minimum level: mark it on the scale)",
  ),
  noSkills: tr.tr("No skills found for this profession."),
  candidates: tr.tr("Candidates"),
  invite: tr.tr("Invite"),
  edit: tr.tr("Edit"),
  delete: tr.tr("Delete"),
  revokeInvite: tr.tr("Withdraw the invitation"),
  open: tr.tr("Open"),
  taken: tr.tr("Taken"),
  invitationSent: tr.tr("Invitation sent"),
  takenBy: tr.tr("Taken by:"),
  invited: tr.tr("Invited:"),
  apply: tr.tr("Apply"),
  viewApplication: tr.tr("View the application"),
  acceptInvite: tr.tr("Accept the invitation"),
  ownerRole: tr.tr("Your role in the project"),
  save: tr.tr("Save"),
  cancel: tr.tr("Cancel"),
  addOpening: tr.tr("Add the opening"),
  saveOpening: tr.tr("Save the opening"),
  description: tr.tr("Description"),
  grade: tr.tr("Grade"),
  profession: tr.tr("Profession"),
  pay: tr.tr("Pay"),
  from: tr.tr("From"),
  to: tr.tr("To"),
  currency: tr.tr("Currency"),
  tagline: tr.tr("Tagline"),
  website: tr.tr("Website"),
  city: tr.tr("City"),
  deadline: tr.tr("Deadline"),
  budget: tr.tr("Budget"),
  tags: tr.tr("Tags"),
  projectType: tr.tr("Project type"),
  workMode: tr.tr("Where the work is done"),
  notStated: tr.tr("Not stated"),
  inviteSearch: tr.tr("Search for a friend by name or nickname…"),
  nobodyFound: tr.tr("Nobody found."),
  noFriends: tr.tr(
    "Your friends will appear here: add someone as a friend first.",
  ),
  noCandidates: tr.tr("No candidates."),
  forTheSlot: tr.tr("For the slot: {title}"),
  appliedAs: tr.tr("Applied as: {profession}"),
  reportTitle: tr.tr("Report {name}"),
  saved: tr.tr("The project was saved."),
  slotSaved: tr.tr("The opening was saved."),
  slotDeleted: tr.tr("The opening was deleted."),
  invited2: tr.tr("The invitation was sent."),
  revoked: tr.tr("The invitation was taken back."),
  left: tr.tr("You left the team."),
  removed: tr.tr("The member was removed from the team."),
  startup: tr.tr("Startup"),
  company: tr.tr("Organization"),
  partTime: tr.tr("Part-time work"),
  remote: tr.tr("Remote"),
  office: tr.tr("In the office"),
  hybrid: tr.tr("Hybrid"),
  status: tr.tr("Status"),
  active: tr.tr("Active"),
  paused: tr.tr("Archived"),
  done: tr.tr("Closed"),
  cancelled: tr.tr("Cancelled"),
  unpaid: tr.tr("Unpaid"),
  equity: tr.tr("Equity"),
  paid: tr.tr("Paid"),
  applyTitle: tr.tr("Apply: {name}"),
});

const slugify = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "project";

export class ProjectsAPI {
  /** GET /api/projects?kind=company&kind=startup */
  "projects.list"(message: Message): Effect[] {
    const query = (message.payload as HttpReq).query;
    const kinds = (
      Array.isArray(query.kind) ? query.kind : [query.kind]
    ).filter((k): k is string => typeof k === "string" && KINDS.includes(k));
    return [requestsEffector.set("kinds", kinds), ProjectService.list(kinds)];
  }

  "projects.list.onSuccess"(message: Message): Effect[] {
    return [httpEffector.makeResponse(200, rowsOf(message))];
  }

  /** GET /api/projects/:slug — the project as the app's page sees it. */
  "projects.get"(message: Message): Effect[] {
    const req = message.payload as HttpReq;
    const slug = req.params.slug ?? "";
    const token = req.cookies[SESSION_COOKIE];
    const base = [requestsEffector.merge({ slug, locale: localeOf(req) })];
    if (!token) {
      return [
        ...base,
        requestsEffector.merge({ viewerId: 0 }),
        ProjectService.view(slug, 0, "projects.view"),
      ];
    }
    return [...base, ...sessionEffect(req, "projects.get")];
  }

  "projects.get.sessionUser.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const user = sessionUserOf(message);
    const { slug } = parked(message, state) as { slug: string };
    const viewerId = user?.id ?? 0;
    return [
      requestsEffector.merge({ viewerId }),
      ProjectService.view(slug, viewerId, "projects.view"),
    ];
  }

  "projects.view.onSuccess"(message: Message, state: ServerState): Effect[] {
    const project = oneOf<{
      id: number;
      slug: string;
      name: string;
      tagline: string;
      description: string;
      kind: string;
      tags: string[];
      status: string;
      workMode: string;
      city: string;
      website: string;
      budget: number | null;
      budgetCurrency: string | null;
      deadline: string | null;
      owner: string;
      ownerId: number;
      ownerSlug: string;
      ownerProfession: string | null;
      ownerBucket: string | null;
      isOwner: boolean;
      isMember: boolean;
      teamChatId: number | null;
      openCount: number;
      slots: Record<string, unknown>[];
      team: Record<string, unknown>[];
    }>(message);
    const locale =
      (parked(message, state) as { locale?: string }).locale ?? "en";
    const tr = trOf({ cookies: { lang: locale } });
    if (!project)
      return [httpEffector.makeResponse(404, { error: "no such project" })];
    const ownerRole = gradeTitle(
      tr,
      project.ownerBucket,
      project.ownerProfession,
    );
    return [
      httpEffector.makeResponse(200, {
        ...project,
        kindLabel: kindLabel(tr, project.kind),
        statusLabel: statusLabel(tr, project.status),
        workModeLabel: workModeLabel(tr, project.workMode),
        budgetLabel: budgetLabel(tr, project.budget, project.budgetCurrency),
        deadlineLabel: deadlineLabel(tr, project.deadline),
        ownerRole,
        lookingLabel: tr.trArgs("looking for people · {n}", {
          n: project.openCount,
        }),
        founderLabel: tr.tr("Founder:"),
        team: (project.team ?? []).map((m) => {
          const row = m as {
            userId: number;
            slug: string;
            name: string;
            professionName: string | null;
            bucket: string | null;
            isOwner: boolean;
          };
          return {
            ...row,
            initials: initialsOf(row.name),
            role: row.isOwner
              ? tr.tr("Founder")
              : `${tr.tr(row.professionName ?? "")} · ${tr.tr(row.bucket ?? "")}`,
            roleLabel: row.isOwner
              ? tr.tr("Founder")
              : gradeTitle(tr, row.bucket, row.professionName),
          };
        }),
        slots: (project.slots ?? []).map((s) => {
          const slot = s as {
            id: number;
            profession: string;
            professionId: number;
            professionSlug: string;
            bucket: string;
            description: string;
            pay: string | null;
            payFrom: number | null;
            payTo: number | null;
            currency: string | null;
            userId: number | null;
            userName: string | null;
            userSlug: string | null;
            status: string;
            invitedMe: boolean;
            invitedByMe: boolean;
            myApplication: { id: number; status: string } | null;
            skills: { name: string; level: number }[];
          };
          return {
            ...slot,
            label: `${tr.tr(slot.profession)} · ${tr.tr(slot.bucket)}`,
            payLabel: payLabel(
              tr,
              slot.pay,
              slot.payFrom,
              slot.payTo,
              slot.currency,
            ),
            statusLabel:
              slot.status === "open"
                ? tr.tr("Open")
                : slot.status === "invited"
                  ? tr.tr("Invitation sent")
                  : tr.tr("Taken"),
            skillsLabel: slot.skills.map(
              (sk) => `${tr.tr(sk.name)} ${sk.level}+`,
            ),
          };
        }),
        strings: projectStrings(tr),
      }),
    ];
  }

  /** POST /api/projects */
  "projects.create"(message: Message): Effect[] {
    const req = message.payload as HttpReq;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const name =
      typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
    const kind = KINDS.includes(String(body.kind))
      ? String(body.kind)
      : "startup";
    const tagline =
      typeof body.tagline === "string" ? body.tagline.trim().slice(0, 140) : "";
    const description =
      typeof body.description === "string"
        ? body.description.trim().slice(0, 2000)
        : "";
    if (!name) return invalid("name", "the project's name");
    return [
      requestsEffector.merge({ name, kind, tagline, description }),
      ...sessionEffect(req, "projects.create"),
    ];
  }

  "projects.create.sessionUser.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const user = sessionUserOf(message);
    if (!user) return [unauthorized()];
    const { name, kind, tagline, description } = parked(message, state) as {
      name: string;
      kind: string;
      tagline: string;
      description: string;
    };
    return [
      ProjectService.create(
        user.id,
        `${slugify(name)}-${Date.now().toString(36).slice(-4)}`,
        name,
        tagline,
        description,
        kind,
      ),
    ];
  }

  "projects.created.onSuccess"(message: Message): Effect[] {
    const project = oneOf<{ id: number; slug: string }>(message);
    return [httpEffector.makeResponse(201, project)];
  }

  /** POST /api/projects/:slug/slots */
  "projects.addSlot"(message: Message): Effect[] {
    const req = message.payload as HttpReq;
    const slug = req.params.slug ?? "";
    const body = (req.body ?? {}) as Record<string, unknown>;
    const professionId = Number(body.professionId);
    const bucket = ["junior", "middle", "senior", "lead"].includes(
      String(body.bucket),
    )
      ? String(body.bucket)
      : "";
    const description =
      typeof body.description === "string"
        ? body.description.trim().slice(0, 300)
        : "";
    if (!Number.isInteger(professionId) || !bucket)
      return invalid("professionId/bucket", "a profession and a bucket");
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
        professionId,
        bucket,
        description,
        pay,
        payFrom: number("payFrom"),
        payTo: number("payTo"),
        currency:
          typeof body.currency === "string" && body.currency
            ? body.currency.slice(0, 8)
            : null,
        skills,
      }),
      ...sessionEffect(req, "projects.addSlot"),
    ];
  }

  "projects.addSlot.sessionUser.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const user = sessionUserOf(message);
    if (!user) return [unauthorized()];
    const { slug } = parked(message, state) as { slug: string };
    return [
      requestsEffector.merge({ userId: user.id }),
      ProjectService.ownedBy(user.id, slug),
    ];
  }

  "projects.owned.onSuccess"(message: Message, state: ServerState): Effect[] {
    const owned = oneOf<{ id: number }>(message);
    if (!owned)
      return [httpEffector.makeResponse(403, { error: "not your project" })];
    const {
      professionId,
      bucket,
      description,
      pay,
      payFrom,
      payTo,
      currency,
      skills,
    } = parked(message, state) as {
      professionId: number;
      bucket: string;
      description: string;
      pay: string | null;
      payFrom: number | null;
      payTo: number | null;
      currency: string | null;
      skills: [number, number][];
    };
    return [
      ProjectService.addSlot(
        owned.id,
        professionId,
        bucket,
        description,
        pay,
        payFrom,
        payTo,
        currency,
      ),
      requestsEffector.merge({ skills }),
    ];
  }

  "projects.slotAdded.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const slot = oneOf<{ id: number }>(message);
    const { skills } = parked(message, state) as { skills: [number, number][] };
    // the skills of the opening travel in their own step (the slot has its id)
    return [
      requestsEffector.merge({ slotId: slot?.id ?? 0 }),
      ProjectService.setSlotSkills(slot?.id ?? 0, skills ?? []),
    ];
  }

  "projects.slotSkills.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const { slotId } = parked(message, state) as { slotId: number };
    return [httpEffector.makeResponse(201, { id: slotId })];
  }

  "projects.failed"(): Effect[] {
    return [httpEffector.makeResponse(500, { error: "internal error" })];
  }
}
