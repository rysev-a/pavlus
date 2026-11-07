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
import { sessionEffect, sessionUserOf, unauthorized } from "./session.ts";

const KINDS = ["startup", "company", "part-time"];
const parked = (
  message: Message,
  state: ServerState,
): Record<string, unknown> => state.requests[message.ctx?.rid as string] ?? {};

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

  /** GET /api/projects/:slug */
  "projects.get"(message: Message): Effect[] {
    const slug = (message.payload as HttpReq).params.slug ?? "";
    return [requestsEffector.set("slug", slug), ProjectService.bySlug(slug)];
  }

  "projects.bySlug.onSuccess"(message: Message): Effect[] {
    const project = oneOf(message);
    return [
      project
        ? httpEffector.makeResponse(200, project)
        : httpEffector.makeResponse(404, { error: "no such project" }),
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
    return [
      requestsEffector.merge({ slug, professionId, bucket, description }),
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
    const { professionId, bucket, description } = parked(message, state) as {
      professionId: number;
      bucket: string;
      description: string;
    };
    return [
      ProjectService.addSlot(owned.id, professionId, bucket, description),
    ];
  }

  "projects.slotAdded.onSuccess"(message: Message): Effect[] {
    const slot = oneOf<{ id: number }>(message);
    return [httpEffector.makeResponse(201, slot)];
  }

  "projects.failed"(): Effect[] {
    return [httpEffector.makeResponse(500, { error: "internal error" })];
  }
}
