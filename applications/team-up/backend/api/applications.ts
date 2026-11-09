// Applications (api): apply to a slot, my list, the owner's inbox, and the
// decisions. Accept is the multi-step write: status, slot filled, the other
// pending declined, the member in the project chat.

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
import { ProjectService } from "../db/services/project-service.ts";
import { localeOf, trOf } from "../i18n/mod.ts";
import { sessionEffect, sessionUserOf, unauthorized } from "./session.ts";

const parked = (
  message: Message,
  state: ServerState,
): Record<string, unknown> => state.requests[message.ctx?.rid as string] ?? {};

export class ApplicationsAPI {
  /** POST /api/slots/:slotId/apply */
  "apps.apply"(message: Message): Effect[] {
    const req = message.payload as HttpReq;
    const slotId = Number(req.params.slotId);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const note =
      typeof body.message === "string" ? body.message.trim().slice(0, 500) : "";
    // the profession the member applies with (the apply dialog's choice)
    const professionId =
      body.professionId === null || body.professionId === undefined
        ? null
        : Number(body.professionId);
    const bucket =
      typeof body.bucket === "string" && body.bucket ? body.bucket : null;
    if (!Number.isInteger(slotId)) return invalid("slotId", "a slot");
    return [
      requestsEffector.merge({ slotId, note, professionId, bucket }),
      ...sessionEffect(req, "apps.apply"),
    ];
  }

  "apps.apply.sessionUser.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const user = sessionUserOf(message);
    if (!user) return [unauthorized()];
    const { slotId, note, professionId, bucket } = parked(message, state) as {
      slotId: number;
      note: string;
      professionId: number | null;
      bucket: string | null;
    };
    return [
      ApplicationService.apply(slotId, user.id, note, professionId, bucket),
    ];
  }

  "apps.applied.onSuccess"(message: Message): Effect[] {
    const app = oneOf<{ id: number }>(message);
    return [httpEffector.makeResponse(201, app)];
  }

  /** GET /api/applications/mine */
  "apps.mine"(message: Message): Effect[] {
    return sessionEffect(message.payload as HttpReq, "apps.mine");
  }

  "apps.mine.sessionUser.onSuccess"(message: Message): Effect[] {
    const user = sessionUserOf(message);
    if (!user) return [unauthorized()];
    return [ApplicationService.mine(user.id)];
  }

  "apps.mine.onSuccess"(message: Message): Effect[] {
    return [httpEffector.makeResponse(200, rowsOf(message))];
  }

  /** GET /api/projects/:slug/applications — the owner's inbox. */
  "apps.byProject"(message: Message): Effect[] {
    const req = message.payload as HttpReq;
    const slug = req.params.slug ?? "";
    return [
      requestsEffector.set("slug", slug),
      requestsEffector.merge({ locale: localeOf(req) }),
      ...sessionEffect(req, "apps.byProject"),
    ];
  }

  "apps.byProject.sessionUser.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const user = sessionUserOf(message);
    if (!user) return [unauthorized()];
    const { slug } = parked(message, state) as { slug: string };
    return [
      requestsEffector.merge({ userId: user.id }),
      ProjectService.bySlug(slug, "apps.project"),
    ];
  }

  "apps.project.onSuccess"(message: Message, state: ServerState): Effect[] {
    const project = oneOf<{ id: number; ownerId: number }>(message);
    const { userId } = parked(message, state) as { userId: number };
    if (!project)
      return [httpEffector.makeResponse(404, { error: "no such project" })];
    if (project.ownerId !== userId)
      return [httpEffector.makeResponse(403, { error: "not your project" })];
    return [ApplicationService.byProject(project.id)];
  }

  "apps.byProject.onSuccess"(message: Message, state: ServerState): Effect[] {
    const tr = trOf({
      cookies: {
        lang: (parked(message, state) as { locale?: string }).locale ?? "en",
      },
    });
    const rows = rowsOf<{
      id: number;
      slotId: number;
      userId: number;
      userName: string;
      userSlug: string;
      message: string;
      bucket: string | null;
      status: string;
      profession: string;
      appliedProfession: string | null;
    }>(message);
    const grade = (bucket: string | null, name: string | null): string => {
      if (!name) return "";
      const g = tr.tr(bucket ?? "");
      return `${g ? `${g.charAt(0).toUpperCase()}${g.slice(1)} ` : ""}${tr.tr(name)}`;
    };
    return [
      httpEffector.makeResponse(
        200,
        rows.map((r) => {
          const asProfession = grade(r.bucket, r.appliedProfession);
          const slotTitle = `${tr.tr(r.profession)} · ${tr.tr(r.bucket ?? "")}`;
          return {
            ...r,
            slotTitle,
            asProfession,
            forTheSlot: tr.trArgs("For the slot: {title}", {
              title: slotTitle,
            }),
            appliedAs: asProfession
              ? tr.trArgs("Applied as: {profession}", {
                  profession: asProfession,
                })
              : "",
          };
        }),
      ),
    ];
  }

  /** POST /api/applications/:id/accept — the owner's yes. */
  "apps.accept"(message: Message): Effect[] {
    const req = message.payload as HttpReq;
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return invalid("id", "an application");
    return [
      requestsEffector.set("appId", id),
      ...sessionEffect(req, "apps.accept"),
    ];
  }

  "apps.accept.sessionUser.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const user = sessionUserOf(message);
    if (!user) return [unauthorized()];
    const { appId } = parked(message, state) as { appId: number };
    return [
      requestsEffector.merge({ userId: user.id }),
      ApplicationService.byId(appId),
    ];
  }

  "apps.byId.onSuccess"(message: Message, state: ServerState): Effect[] {
    const app = oneOf<{
      id: number;
      slotId: number;
      userId: number;
      status: string;
    }>(message);
    if (!app)
      return [httpEffector.makeResponse(404, { error: "no such application" })];
    if (app.status !== "new")
      return [httpEffector.makeResponse(409, { error: "already decided" })];
    return [
      requestsEffector.merge({ appUserId: app.userId, slotId: app.slotId }),
      ProjectService.slotOwner(app.slotId, "apps.accept.slotOwner"),
    ];
  }

  "apps.accept.slotOwner.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const slot = oneOf<{
      slotId: number;
      slotUserId: number | null;
      projectId: number;
      ownerId: number;
    }>(message);
    const { userId, appId } = parked(message, state) as {
      userId: number;
      appId: number;
    };
    if (!slot)
      return [httpEffector.makeResponse(404, { error: "no such slot" })];
    if (slot.ownerId !== userId)
      return [httpEffector.makeResponse(403, { error: "not your project" })];
    if (slot.slotUserId !== null)
      return [httpEffector.makeResponse(409, { error: "the slot is taken" })];
    return [
      requestsEffector.merge({ projectId: slot.projectId }),
      ApplicationService.setStatus(appId, "accepted"),
    ];
  }

  "apps.statusSet.onSuccess"(message: Message, state: ServerState): Effect[] {
    const { slotId, appUserId } = parked(message, state) as {
      slotId: number;
      appUserId: number;
    };
    return [ApplicationService.fillSlot(slotId, appUserId)];
  }

  "apps.slotFilled.onSuccess"(message: Message, state: ServerState): Effect[] {
    const { appId, slotId } = parked(message, state) as {
      appId: number;
      slotId: number;
    };
    return [ApplicationService.declineOthers(slotId, appId)];
  }

  "apps.othersDeclined.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const { projectId, appUserId } = parked(message, state) as {
      projectId: number;
      appUserId: number;
    };
    return [ApplicationService.joinProjectChat(projectId, appUserId)];
  }

  "apps.chatJoined.onSuccess"(): Effect[] {
    return [httpEffector.makeResponse(200, { ok: true, accepted: true })];
  }

  /** POST /api/applications/:id/decline */
  "apps.decline"(message: Message): Effect[] {
    const req = message.payload as HttpReq;
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return invalid("id", "an application");
    return [
      requestsEffector.set("appId", id),
      ...sessionEffect(req, "apps.decline"),
    ];
  }

  "apps.decline.sessionUser.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const user = sessionUserOf(message);
    if (!user) return [unauthorized()];
    const { appId } = parked(message, state) as { appId: number };
    return [
      requestsEffector.merge({ userId: user.id }),
      ApplicationService.byId(appId, "apps.decline.byId"),
    ];
  }

  "apps.decline.byId.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const app = oneOf<{ slotId: number }>(message);
    if (!app)
      return [httpEffector.makeResponse(404, { error: "no such application" })];
    return [ProjectService.slotOwner(app.slotId, "apps.decline.slotOwner")];
  }

  "apps.decline.slotOwner.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const slot = oneOf<{ ownerId: number }>(message);
    const { userId, appId } = parked(message, state) as {
      userId: number;
      appId: number;
    };
    if (!slot)
      return [httpEffector.makeResponse(404, { error: "no such slot" })];
    if (slot.ownerId !== userId)
      return [httpEffector.makeResponse(403, { error: "not your project" })];
    return [ApplicationService.setStatus(appId, "declined", "apps.declined")];
  }

  "apps.declined.onSuccess"(): Effect[] {
    return [httpEffector.makeResponse(200, { ok: true, declined: true })];
  }

  /** DELETE /api/applications/:id — take it back. */
  "apps.withdraw"(message: Message): Effect[] {
    const req = message.payload as HttpReq;
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return invalid("id", "an application");
    return [
      requestsEffector.set("appId", id),
      ...sessionEffect(req, "apps.withdraw"),
    ];
  }

  "apps.withdraw.sessionUser.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const user = sessionUserOf(message);
    if (!user) return [unauthorized()];
    const { appId } = parked(message, state) as { appId: number };
    return [ApplicationService.setStatus(appId, "withdrawn", "apps.withdrawn")];
  }

  "apps.withdrawn.onSuccess"(): Effect[] {
    return [httpEffector.makeResponse(200, { ok: true, withdrawn: true })];
  }

  "apps.failed"(): Effect[] {
    return [httpEffector.makeResponse(500, { error: "internal error" })];
  }
}
