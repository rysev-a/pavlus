// The saved api: the starred projects of the catalog and the saved searches.

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
  cleanQuery,
  FavoriteService,
  NAME_MAX,
  SAVED_MAX,
  SavedSearchService,
} from "../db/services/saved-service.ts";
import { trOf } from "../i18n/mod.ts";
import { sessionEffect, sessionUserOf, unauthorized } from "./session.ts";

const parked = (
  message: Message,
  state: ServerState,
): Record<string, unknown> => state.requests[message.ctx?.rid as string] ?? {};

export class SavedAPI {
  // ----- the starred projects -----

  /** GET /api/favorites */
  "favorites.list"(message: Message): Effect[] {
    return sessionEffect(message.payload as HttpReq, "favorites.list");
  }

  "favorites.list.sessionUser.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const user = sessionUserOf(message);
    if (!user) return [unauthorized()];
    return [FavoriteService.list(user.id)];
  }

  "favorites.list.onSuccess"(message: Message): Effect[] {
    const slugs = rowsOf<{ slug: string }>(message).map((r) => r.slug);
    return [httpEffector.makeResponse(200, { slugs })];
  }

  /** POST /api/favorites/:slug — the star. */
  "favorites.add"(message: Message): Effect[] {
    const req = message.payload as HttpReq;
    const slug = String(req.params.slug ?? "");
    if (!slug)
      return [httpEffector.makeResponse(404, { error: "no such project" })];
    return [
      requestsEffector.set("slug", slug),
      ...sessionEffect(req, "favorites.add"),
    ];
  }

  "favorites.add.sessionUser.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const user = sessionUserOf(message);
    if (!user) return [unauthorized()];
    const { slug } = parked(message, state) as { slug: string };
    return [FavoriteService.add(user.id, slug)];
  }

  "favorites.added.onSuccess"(message: Message): Effect[] {
    return [httpEffector.makeResponse(204, null)];
  }

  /** DELETE /api/favorites/:slug — the star is off. */
  "favorites.remove"(message: Message): Effect[] {
    const req = message.payload as HttpReq;
    const slug = String(req.params.slug ?? "");
    if (!slug)
      return [httpEffector.makeResponse(404, { error: "no such project" })];
    return [
      requestsEffector.set("slug", slug),
      ...sessionEffect(req, "favorites.remove"),
    ];
  }

  "favorites.remove.sessionUser.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const user = sessionUserOf(message);
    if (!user) return [unauthorized()];
    const { slug } = parked(message, state) as { slug: string };
    return [FavoriteService.remove(user.id, slug)];
  }

  "favorites.removed.onSuccess"(message: Message): Effect[] {
    return [httpEffector.makeResponse(204, null)];
  }

  "favorites.failed"(): Effect[] {
    return [httpEffector.makeResponse(500, { error: "database error" })];
  }

  // ----- the saved searches -----

  /** GET /api/saved-searches */
  "saved.list"(message: Message): Effect[] {
    return sessionEffect(message.payload as HttpReq, "saved.list");
  }

  "saved.list.sessionUser.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const user = sessionUserOf(message);
    if (!user) return [unauthorized()];
    return [SavedSearchService.list(user.id)];
  }

  "saved.list.onSuccess"(message: Message): Effect[] {
    return [httpEffector.makeResponse(200, { searches: rowsOf(message) })];
  }

  /** POST /api/saved-searches — the search is kept. */
  "saved.add"(message: Message): Effect[] {
    const req = message.payload as HttpReq;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const tr = trOf(req);
    const query = cleanQuery(String(body.query ?? ""));
    if (!query)
      return [
        httpEffector.makeResponse(422, {
          error: tr.tr("Choose some filters or type a search first"),
        }),
      ];
    const name = String(body.name ?? "")
      .trim()
      .slice(0, NAME_MAX + 1);
    if (name.length > NAME_MAX)
      return [
        httpEffector.makeResponse(422, {
          error: tr.trArgs("The name must be at most {max} characters", {
            max: NAME_MAX,
          }),
        }),
      ];
    return [
      requestsEffector.merge({ name, query }),
      ...sessionEffect(req, "saved.add"),
    ];
  }

  "saved.add.sessionUser.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const user = sessionUserOf(message);
    if (!user) return [unauthorized()];
    const { name, query } = parked(message, state) as {
      name: string;
      query: string;
    };
    return [
      requestsEffector.merge({ userId: user.id }),
      SavedSearchService.list(user.id, "saved.add.list"),
    ];
  }

  "saved.add.list.onSuccess"(message: Message, state: ServerState): Effect[] {
    const kept = rowsOf<{ id: number; query: string }>(message);
    const slice = parked(message, state) as {
      name: string;
      query: string;
      userId: number;
    };
    const tr = trOf(message.payload as HttpReq);
    if (kept.some((s) => s.query === slice.query))
      return [
        httpEffector.makeResponse(409, {
          error: tr.tr("You have already saved this search"),
        }),
      ];
    if (kept.length >= SAVED_MAX)
      return [
        httpEffector.makeResponse(422, {
          error: tr.trArgs("At most {max} searches can be saved: delete some", {
            max: SAVED_MAX,
          }),
        }),
      ];
    const name = slice.name || tr.tr("Saved search");
    return [SavedSearchService.insert(slice.userId, name, slice.query)];
  }

  "saved.inserted.onSuccess"(message: Message): Effect[] {
    const row = oneOf<{ id: number; name: string }>(message);
    return [
      httpEffector.makeResponse(201, {
        id: row?.id ?? null,
        name: row?.name ?? "",
      }),
    ];
  }

  /** DELETE /api/saved-searches/:id */
  "saved.remove"(message: Message): Effect[] {
    const req = message.payload as HttpReq;
    const id = Number(req.params.id);
    if (!Number.isInteger(id))
      return [httpEffector.makeResponse(404, { error: "no such search" })];
    return [
      requestsEffector.set("id", id),
      ...sessionEffect(req, "saved.remove"),
    ];
  }

  "saved.remove.sessionUser.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const user = sessionUserOf(message);
    if (!user) return [unauthorized()];
    const { id } = parked(message, state) as { id: number };
    return [SavedSearchService.remove(user.id, id)];
  }

  "saved.removed.onSuccess"(message: Message): Effect[] {
    return [httpEffector.makeResponse(204, null)];
  }

  "saved.failed"(): Effect[] {
    return [httpEffector.makeResponse(500, { error: "database error" })];
  }
}
