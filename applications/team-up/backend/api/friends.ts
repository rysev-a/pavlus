// Friends (api): the mirrored pairs — request, accept, decline, remove, list.

import {
  type HttpReq,
  httpEffector,
  oneOf,
  requestsEffector,
  rowsOf,
  type ServerState,
} from "@pavlus/backend";
import type { Effect, Message } from "@pavlus/core";
import { FriendService } from "../db/services/friend-service.ts";
import { sessionEffect, sessionUserOf, unauthorized } from "./session.ts";

const parked = (
  message: Message,
  state: ServerState,
): Record<string, unknown> => state.requests[message.ctx?.rid as string] ?? {};

/** The :slug param, or a 404 when the route had none. */
const slugOr404 = (message: Message): Effect[] | string => {
  const slug = String((message.payload as HttpReq).params.slug ?? "");
  if (!slug)
    return [httpEffector.makeResponse(404, { error: "no such member" })];
  return slug;
};

export class FriendsAPI {
  /** GET /api/friends */
  "friends.list"(message: Message): Effect[] {
    return sessionEffect(message.payload as HttpReq, "friends.list");
  }

  "friends.list.sessionUser.onSuccess"(message: Message): Effect[] {
    const user = sessionUserOf(message);
    if (!user) return [unauthorized()];
    return [FriendService.list(user.id)];
  }

  "friends.list.onSuccess"(message: Message): Effect[] {
    return [httpEffector.makeResponse(200, rowsOf(message))];
  }

  /** POST /api/friends/:slug — ask. */
  "friends.request"(message: Message): Effect[] {
    const slug = slugOr404(message);
    if (typeof slug !== "string") return slug;
    return [
      requestsEffector.set("slug", slug),
      ...sessionEffect(message.payload as HttpReq, "friends.request"),
    ];
  }

  "friends.request.sessionUser.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const user = sessionUserOf(message);
    if (!user) return [unauthorized()];
    const { slug } = parked(message, state) as { slug: string };
    return [
      requestsEffector.merge({ userId: user.id }),
      FriendService.bySlug(slug, "friends.request.user"),
    ];
  }

  "friends.request.user.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const other = oneOf<{ user_id: number }>(message);
    const { userId } = parked(message, state) as { userId: number };
    if (!other)
      return [httpEffector.makeResponse(404, { error: "no such member" })];
    if (other.user_id === userId)
      return [httpEffector.makeResponse(422, { error: "that is you" })];
    return [
      requestsEffector.merge({ otherId: other.user_id }),
      FriendService.pair(userId, other.user_id),
    ];
  }

  "friends.pair.onSuccess"(message: Message, state: ServerState): Effect[] {
    const { userId, otherId } = parked(message, state) as {
      userId: number;
      otherId: number;
    };
    const rows = rowsOf<{ status: string; user_id: number }>(message);
    const mine = rows.find((r) => r.user_id === userId);
    if (mine && (mine.status === "waiting" || mine.status === "friends"))
      return [
        httpEffector.makeResponse(409, { error: `already ${mine.status}` }),
      ];
    return [FriendService.request(userId, otherId)];
  }

  "friends.requested.onSuccess"(): Effect[] {
    return [httpEffector.makeResponse(200, { ok: true, status: "waiting" })];
  }

  /** POST /api/friends/:slug/accept — the addressee's yes. */
  "friends.accept"(message: Message): Effect[] {
    const slug = slugOr404(message);
    if (typeof slug !== "string") return slug;
    return [
      requestsEffector.set("slug", slug),
      ...sessionEffect(message.payload as HttpReq, "friends.accept"),
    ];
  }

  "friends.accept.sessionUser.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const user = sessionUserOf(message);
    if (!user) return [unauthorized()];
    const { slug } = parked(message, state) as { slug: string };
    return [
      requestsEffector.merge({ userId: user.id }),
      FriendService.bySlug(slug, "friends.accept.user"),
    ];
  }

  "friends.accept.user.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const other = oneOf<{ user_id: number }>(message);
    const { userId } = parked(message, state) as { userId: number };
    if (!other)
      return [httpEffector.makeResponse(404, { error: "no such member" })];
    return [FriendService.accept(userId, other.user_id)];
  }

  "friends.accepted.onSuccess"(): Effect[] {
    return [httpEffector.makeResponse(200, { ok: true, status: "friends" })];
  }

  /** POST /api/friends/:slug/decline */
  "friends.decline"(message: Message): Effect[] {
    const slug = slugOr404(message);
    if (typeof slug !== "string") return slug;
    return [
      requestsEffector.set("slug", slug),
      ...sessionEffect(message.payload as HttpReq, "friends.decline"),
    ];
  }

  "friends.decline.sessionUser.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const user = sessionUserOf(message);
    if (!user) return [unauthorized()];
    const { slug } = parked(message, state) as { slug: string };
    return [
      requestsEffector.merge({ userId: user.id }),
      FriendService.bySlug(slug, "friends.decline.user"),
    ];
  }

  "friends.decline.user.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const other = oneOf<{ user_id: number }>(message);
    const { userId } = parked(message, state) as { userId: number };
    if (!other)
      return [httpEffector.makeResponse(404, { error: "no such member" })];
    return [FriendService.remove(userId, other.user_id)];
  }

  "friends.removed.onSuccess"(): Effect[] {
    return [httpEffector.makeResponse(200, { ok: true, status: "removed" })];
  }

  /** DELETE /api/friends/:slug */
  "friends.remove"(message: Message): Effect[] {
    const slug = slugOr404(message);
    if (typeof slug !== "string") return slug;
    return [
      requestsEffector.set("slug", slug),
      ...sessionEffect(message.payload as HttpReq, "friends.remove"),
    ];
  }

  "friends.remove.sessionUser.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const user = sessionUserOf(message);
    if (!user) return [unauthorized()];
    const { slug } = parked(message, state) as { slug: string };
    return [
      requestsEffector.merge({ userId: user.id }),
      FriendService.bySlug(slug, "friends.remove.user"),
    ];
  }

  "friends.remove.user.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const other = oneOf<{ user_id: number }>(message);
    const { userId } = parked(message, state) as { userId: number };
    if (!other)
      return [httpEffector.makeResponse(404, { error: "no such member" })];
    return [FriendService.remove(userId, other.user_id)];
  }

  "friends.failed"(): Effect[] {
    return [httpEffector.makeResponse(500, { error: "internal error" })];
  }
}
