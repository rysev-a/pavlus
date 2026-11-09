// The avatar api: the picture of a member — the upload, the removal and the
// address the site shows.
//
// The upload comes as a JSON body (`{mime, data}` — the picture in base64),
// so the port needs no multipart parser; the answer of the picture is the
// bytes themselves.

import {
  type HttpReq,
  httpEffector,
  oneOf,
  requestsEffector,
  type ServerState,
} from "@pavlus/backend";
import type { Effect, Message } from "@pavlus/core";
import {
  AvatarService,
  AVATAR_MAX_BYTES,
  AVATAR_MIMES,
} from "../db/services/avatar-service.ts";
import { sessionEffect, sessionUserOf, unauthorized } from "./session.ts";

const parked = (
  message: Message,
  state: ServerState,
): Record<string, unknown> => state.requests[message.ctx?.rid as string] ?? {};

const bodyOf = (message: Message): Record<string, unknown> =>
  ((message.payload as HttpReq).body ?? {}) as Record<string, unknown>;

export class AvatarAPI {
  /** POST /api/profile/avatar — the picture of the member. */
  "profile.avatarUpload"(message: Message): Effect[] {
    const req = message.payload as HttpReq;
    const body = bodyOf(message);
    const mime = String(body.mime ?? "")
      .trim()
      .toLowerCase();
    const data = String(body.data ?? "");
    if (!AVATAR_MIMES.includes(mime))
      return [
        httpEffector.makeResponse(422, {
          error: "the picture must be a png, a jpeg, a webp or a gif",
        }),
      ];
    let bytes: Buffer;
    try {
      bytes = Buffer.from(data, "base64");
    } catch {
      return [
        httpEffector.makeResponse(422, { error: "the picture is broken" }),
      ];
    }
    if (bytes.length === 0)
      return [
        httpEffector.makeResponse(422, { error: "the picture is empty" }),
      ];
    if (bytes.length > AVATAR_MAX_BYTES)
      return [
        httpEffector.makeResponse(422, {
          error: "the picture is too big (2 MB at most)",
        }),
      ];
    return [
      requestsEffector.merge({ mime, bytes }),
      ...sessionEffect(req, "profile.avatarUpload"),
    ];
  }

  "profile.avatarUpload.sessionUser.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const user = sessionUserOf(message);
    if (!user) return [unauthorized()];
    const slice = parked(message, state) as {
      mime: string;
      bytes: Buffer;
    };
    return [
      requestsEffector.merge({ slug: user.slug }),
      AvatarService.save(user.id, slice.mime, slice.bytes),
    ];
  }

  "avatar.saved.onSuccess"(message: Message, state: ServerState): Effect[] {
    const slice = parked(message, state) as { slug: string };
    return [
      httpEffector.makeResponse(200, {
        avatar_url: `/api/avatars/${slice.slug}`,
      }),
    ];
  }

  /** DELETE /api/profile/avatar — the picture is gone. */
  "profile.avatarDelete"(message: Message): Effect[] {
    return sessionEffect(message.payload as HttpReq, "profile.avatarDelete");
  }

  "profile.avatarDelete.sessionUser.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const user = sessionUserOf(message);
    if (!user) return [unauthorized()];
    return [AvatarService.remove(user.id)];
  }

  "avatar.removed.onSuccess"(message: Message): Effect[] {
    return [httpEffector.makeResponse(204, null)];
  }

  /** GET /api/avatars/:slug — the picture itself. */
  "avatar.get"(message: Message): Effect[] {
    const slug = String((message.payload as HttpReq).params.slug ?? "");
    if (!slug)
      return [httpEffector.makeResponse(404, { error: "no such member" })];
    return [AvatarService.bySlug(slug)];
  }

  "avatar.bySlug.onSuccess"(message: Message): Effect[] {
    const row = oneOf<{ mime: string; data: Buffer }>(message);
    if (!row)
      return [httpEffector.makeResponse(404, { error: "no such picture" })];
    return [
      httpEffector.respond({
        status: 200,
        body: new Uint8Array(row.data),
        headers: {
          "content-type": row.mime,
          "cache-control": "public, max-age=60",
        },
      }),
    ];
  }

  "avatar.failed"(): Effect[] {
    return [httpEffector.makeResponse(500, { error: "database error" })];
  }
}
