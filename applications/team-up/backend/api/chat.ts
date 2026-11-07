// Chat (api): threads over HTTP, messages over HTTP or ws, and the live side —
// identity parked in redis at ws.open (frames carry no cookie of their own),
// fanout through redis pub/sub so any worker's broadcast reaches every
// connection, and a notification queued for every member that was offline.
//
// The wire protocol (ws, JSON text frames, both directions):
//   client -> {type: "join", threadId}        <- {type: "joined", threadId}
//   client -> {type: "send", threadId, body}  <- {type: "message", message}
//   and every live {type: "message"} that arrives over pub/sub
//   server -> {type: "error", error} when a frame is refused

import {
  type HttpReq,
  httpEffector,
  invalid,
  oneOf,
  parseCookies,
  requestsEffector,
  rowsOf,
  type ServerState,
  wsEffector,
} from "@pavlus/backend";
import type { Effect, Message } from "@pavlus/core";
import { AuthService, type SessionUser } from "../db/services/auth-service.ts";
import {
  ChatRedis,
  ChatService,
  type NotifyJob,
} from "../db/services/chat-service.ts";
import { NotifyService } from "../db/services/directory-service.ts";
import { ProfileService } from "../db/services/profile-service.ts";
import {
  SESSION_COOKIE,
  sessionEffect,
  sessionUserOf,
  unauthorized,
} from "./session.ts";

const parked = (
  message: Message,
  state: ServerState,
): Record<string, unknown> => state.requests[message.ctx?.rid as string] ?? {};

const connIdOf = (message: Message): string =>
  (message.ctx?.connId as string | undefined) ?? "";

const roomOf = (threadId: number): string => `thread:${threadId}`;

interface MessageRow {
  id: number;
  threadId: number;
  userId: number;
  author: string;
  body: string;
  sentAt: string;
}

/** The last step of every send, http or ws alike: queue a notification for
 * each offline member, publish to every worker (each broadcasts to the
 * thread's room), and answer the sender — the ctx says which transport. */
const fanOut = (
  message: Message,
  offline: number[],
  row: MessageRow,
): Effect[] => {
  const base: NotifyJob = {
    userId: 0,
    threadId: row.threadId,
    messageId: row.id,
    author: row.author,
    body: row.body,
  };
  const enqueue = offline.map((userId) =>
    ChatRedis.enqueue({ ...base, userId }),
  );
  const publish = ChatRedis.publish({
    room: roomOf(row.threadId),
    data: { type: "message", message: row },
    // the sender already got its answer; skip it in the room echo
    except: message.ctx?.conn === "ws" ? connIdOf(message) : undefined,
  });
  const answer =
    message.ctx?.conn === "http"
      ? [httpEffector.makeResponse(201, row)]
      : [wsEffector.send({ type: "message", message: row })];
  return [...enqueue, publish, ...answer];
};

/** 403/404 in the right transport. */
const refused = (message: Message, status: number, error: string): Effect[] =>
  message.ctx?.conn === "http"
    ? [httpEffector.makeResponse(status, { error })]
    : [wsEffector.send({ type: "error", error })];

export class ChatAPI {
  // ------------------------------------------------------------- the rest --

  /** GET /api/chat/threads — my inbox: every thread, unread counts. */
  "chat.threads"(message: Message): Effect[] {
    return sessionEffect(message.payload as HttpReq, "chat.threads");
  }

  "chat.threads.sessionUser.onSuccess"(message: Message): Effect[] {
    const user = sessionUserOf(message);
    if (!user) return [unauthorized()];
    return [ChatService.myThreads(user.id)];
  }

  "chat.threads.onSuccess"(message: Message): Effect[] {
    return [httpEffector.makeResponse(200, rowsOf(message))];
  }

  /** GET /api/chat/threads/:id — one thread's messages (marks it read). */
  "chat.thread"(message: Message): Effect[] {
    const req = message.payload as HttpReq;
    const threadId = Number(req.params.id);
    if (!Number.isInteger(threadId)) return invalid("id", "a thread");
    return [
      requestsEffector.merge({ threadId }),
      ...sessionEffect(req, "chat.thread"),
    ];
  }

  "chat.thread.sessionUser.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const user = sessionUserOf(message);
    if (!user) return [unauthorized()];
    const { threadId } = parked(message, state) as { threadId: number };
    return [
      requestsEffector.merge({ userId: user.id }),
      ChatService.thread(threadId, user.id),
    ];
  }

  "chat.thread.onSuccess"(message: Message, state: ServerState): Effect[] {
    const thread = oneOf(message);
    if (!thread)
      return [httpEffector.makeResponse(404, { error: "no such thread" })];
    const { threadId, userId } = parked(message, state) as {
      threadId: number;
      userId: number;
    };
    return [
      ChatService.markRead(threadId, userId), // fire-and-forget write
      httpEffector.makeResponse(200, thread),
    ];
  }

  /** POST /api/chat/dm/:slug — the dm with someone: found or created. */
  "chat.dm"(message: Message): Effect[] {
    const req = message.payload as HttpReq;
    const slug = String(req.params.slug ?? "");
    if (!slug)
      return [httpEffector.makeResponse(404, { error: "no such member" })];
    return [requestsEffector.merge({ slug }), ...sessionEffect(req, "chat.dm")];
  }

  "chat.dm.sessionUser.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const user = sessionUserOf(message);
    if (!user) return [unauthorized()];
    const { slug } = parked(message, state) as { slug: string };
    return [
      requestsEffector.merge({ meId: user.id }),
      ProfileService.userIdBySlug(slug, "chat.dm.user"),
    ];
  }

  "chat.dm.user.onSuccess"(message: Message, state: ServerState): Effect[] {
    const other = oneOf<{ user_id: number }>(message);
    const { meId } = parked(message, state) as { meId: number };
    if (!other)
      return [httpEffector.makeResponse(404, { error: "no such member" })];
    if (other.user_id === meId)
      return [httpEffector.makeResponse(422, { error: "that is you" })];
    return [
      requestsEffector.merge({ otherId: other.user_id }),
      ChatService.dm(meId, other.user_id),
    ];
  }

  "chat.dmFound.onSuccess"(message: Message, state: ServerState): Effect[] {
    const found = oneOf<{ id: number }>(message);
    if (found) return [httpEffector.makeResponse(200, { threadId: found.id })];
    const { meId, otherId } = parked(message, state) as {
      meId: number;
      otherId: number;
    };
    return [ChatService.createDm(meId, otherId)];
  }

  "chat.dmCreated.onSuccess"(message: Message): Effect[] {
    const row = oneOf<{ id: number }>(message);
    return [httpEffector.makeResponse(201, { threadId: row?.id })];
  }

  /** POST /api/chat/threads/:id/send — the poller's send; joins the same
   * pipeline the ws frames use (members, insert, offline check, fan out). */
  "chat.send"(message: Message): Effect[] {
    const req = message.payload as HttpReq;
    const threadId = Number(req.params.id);
    const body = ((req.body ?? {}) as Record<string, unknown>).body;
    if (!Number.isInteger(threadId)) return invalid("id", "a thread");
    if (typeof body !== "string" || !body.trim())
      return invalid("body", "something to say");
    return [
      requestsEffector.merge({ threadId, body: body.trim().slice(0, 2000) }),
      ...sessionEffect(req, "chat.send"),
    ];
  }

  "chat.send.sessionUser.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const user = sessionUserOf(message);
    if (!user) return [unauthorized()];
    const { threadId } = parked(message, state) as { threadId: number };
    return [
      requestsEffector.merge({ userId: user.id }),
      ChatService.members(threadId, "chat.send.members"),
    ];
  }

  // --------------------------------------------------------------- the ws --

  /** The handshake: the upgrade request's cookie says who this is; the
   * identity moves to redis (the frames that follow carry only a connId).
   * A `welcome` frame follows once the identity is parked — the client waits
   * for it before its first join (frames that outrun the handshake are
   * refused with "not ready"). */
  "ws.open"(message: Message): Effect[] {
    const headers = ((message.payload as { headers?: Record<string, string> })
      .headers ?? {}) as Record<string, string | undefined>;
    const token = parseCookies(headers.cookie)[SESSION_COOKIE];
    if (!token) return [wsEffector.close(4401, "sign in first")];
    return [
      requestsEffector.merge({ token }),
      AuthService.sessionUser(token, "chat.open.sessionUser"),
    ];
  }

  "chat.open.sessionUser.onSuccess"(message: Message): Effect[] {
    const user = sessionUserOf(message);
    if (!user) return [wsEffector.close(4401, "sign in first")];
    return [
      requestsEffector.merge({ user }),
      ChatRedis.remember(connIdOf(message), user.id),
    ];
  }

  /** The identity is parked: mark the user online, open the protocol. */
  "chat.remembered"(message: Message, state: ServerState): Effect[] {
    const { user } = parked(message, state) as { user: SessionUser };
    return [
      ChatRedis.online(user.id),
      wsEffector.send({
        type: "welcome",
        user: { id: user.id, name: user.name, slug: user.slug },
      }),
    ];
  }

  "ws.message"(message: Message): Effect[] {
    const payload = message.payload as { data?: unknown };
    if (typeof payload.data !== "string") return [];
    let frame: { type?: unknown; threadId?: unknown; body?: unknown };
    try {
      frame = JSON.parse(payload.data) as typeof frame;
    } catch {
      return [wsEffector.send({ type: "error", error: "bad json" })];
    }
    const threadId = Number(frame.threadId);
    if (!Number.isInteger(threadId))
      return [wsEffector.send({ type: "error", error: "a threadId, please" })];
    if (frame.type === "join") {
      return [
        requestsEffector.merge({ threadId }),
        ChatRedis.who(connIdOf(message), "chat.join.whois"),
      ];
    }
    if (frame.type === "send") {
      if (typeof frame.body !== "string" || !frame.body.trim())
        return [wsEffector.send({ type: "error", error: "nothing to say" })];
      return [
        requestsEffector.merge({
          threadId,
          body: frame.body.trim().slice(0, 2000),
        }),
        ChatRedis.who(connIdOf(message), "chat.send.whois"),
      ];
    }
    return [wsEffector.send({ type: "error", error: "join or send" })];
  }

  "chat.join.whois"(message: Message, state: ServerState): Effect[] {
    const userId = message.payload as string | null;
    if (!userId) return [wsEffector.close(4401, "sign in first")];
    const { threadId } = parked(message, state) as { threadId: number };
    return [
      requestsEffector.merge({ userId: Number(userId) }),
      ChatService.members(threadId, "chat.join.members"),
    ];
  }

  "chat.join.members.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const { threadId, userId } = parked(message, state) as {
      threadId: number;
      userId: number;
    };
    const member = rowsOf<{ userId: number }>(message).some(
      (r) => r.userId === userId,
    );
    if (!member) return refused(message, 403, "not your thread");
    return [
      wsEffector.join(roomOf(threadId)),
      ChatService.markRead(threadId, userId), // fire-and-forget write
      wsEffector.send({ type: "joined", threadId }),
    ];
  }

  "chat.send.whois"(message: Message, state: ServerState): Effect[] {
    const userId = message.payload as string | null;
    if (!userId) return [wsEffector.close(4401, "sign in first")];
    return [
      requestsEffector.merge({ userId: Number(userId) }),
      ChatService.members(
        (parked(message, state) as { threadId: number }).threadId,
        "chat.send.members",
      ),
    ];
  }

  // Both transports land here: http after its session step, ws after the
  // whois — either way the frame parked threadId, body, and now userId.
  "chat.send.members.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const { threadId, body, userId } = parked(message, state) as {
      threadId: number;
      body: string;
      userId: number;
    };
    const members = rowsOf<{ userId: number }>(message);
    if (!members.some((r) => r.userId === userId))
      return refused(message, 403, "not your thread");
    return [
      requestsEffector.merge({
        others: members.map((r) => r.userId).filter((id) => id !== userId),
      }),
      ChatService.send(threadId, userId, body),
    ];
  }

  "chat.sent.onSuccess"(message: Message): Effect[] {
    const row = oneOf<{ id: number }>(message);
    if (!row) return refused(message, 500, "the message vanished");
    return [
      requestsEffector.merge({ messageId: row.id }),
      ChatService.messageRow(row.id),
    ];
  }

  "chat.messageRow.onSuccess"(message: Message, state: ServerState): Effect[] {
    const row = oneOf<MessageRow>(message);
    if (!row) return refused(message, 500, "the message vanished");
    const { others } = parked(message, state) as { others: number[] };
    return [
      requestsEffector.merge({ row }),
      ...(others.length
        ? [ChatRedis.offlineCheck(others, "chat.offlineCheck")]
        : fanOut(message, [], row)),
    ];
  }

  "chat.offlineCheck"(message: Message, state: ServerState): Effect[] {
    const bits = Array.isArray(message.payload) ? message.payload : [];
    const { others, row } = parked(message, state) as {
      others: number[];
      row: MessageRow;
    };
    const offline = others.filter((_, i) => Number(bits[i]) === 0);
    return [
      requestsEffector.merge({ offline }),
      ...fanOut(message, offline, row),
    ];
  }

  /** The connection is gone: drop the identity, leave the online set. */
  "ws.close"(message: Message): Effect[] {
    return [ChatRedis.who(connIdOf(message), "chat.close.whois")];
  }

  "chat.close.whois"(message: Message): Effect[] {
    const userId = message.payload as string | null;
    return userId
      ? [ChatRedis.offline(Number(userId)), ChatRedis.forget(connIdOf(message))]
      : [ChatRedis.forget(connIdOf(message))];
  }

  // ------------------------------------------------------- the live wiring --

  /** Dispatched once at boot (server.ts): every worker subscribes, so a
   * publish on any of them becomes a broadcast on all of them. */
  "chat.subscribe"(): Effect[] {
    return [ChatRedis.subscribe()];
  }

  /** A message from another worker (or this one): into the room's sockets. */
  "chat.fromRedis"(message: Message): Effect[] {
    try {
      const { room, data, except } = JSON.parse(
        (message.payload as { message: string }).message,
      ) as { room: string; data: unknown; except?: string };
      if (typeof room !== "string") return [];
      return [wsEffector.broadcast(room, data, except)];
    } catch {
      return [];
    }
  }

  // --------------------------------------------------- the notifications --

  /** Dispatched by the server's tick (server.ts) and by itself: pops until
   * the queue is empty — one chain, one job at a time, no ctx at all. */
  "notify.drain"(): Effect[] {
    return [ChatRedis.pop()];
  }

  "notify.popped"(message: Message): Effect[] {
    if (typeof message.payload !== "string") return []; // the queue is empty
    const job = JSON.parse(message.payload) as NotifyJob;
    const body = `${job.author}: ${job.body}`.slice(0, 300);
    return [NotifyService.insert(job.userId, "message", body)];
  }

  "notify.saved.onSuccess"(): Effect[] {
    return [requestsEffector.dispatch({ id: "notify.drain" })]; // the next job
  }

  /** GET /api/notifications — the last 20, newest first. */
  "notify.list"(message: Message): Effect[] {
    return sessionEffect(message.payload as HttpReq, "notify.list");
  }

  "notify.list.sessionUser.onSuccess"(message: Message): Effect[] {
    const user = sessionUserOf(message);
    if (!user) return [unauthorized()];
    return [NotifyService.list(user.id)];
  }

  "notify.list.onSuccess"(message: Message): Effect[] {
    return [httpEffector.makeResponse(200, rowsOf(message))];
  }

  "chat.failed"(message: Message): Effect[] {
    console.error(
      "[dbg] chat.failed:",
      JSON.stringify(message.payload),
      "ctx:",
      JSON.stringify(message.ctx),
    );
    return message.ctx?.conn === "http"
      ? [httpEffector.makeResponse(500, { error: "internal error" })]
      : [];
  }

  "notify.failed"(): Effect[] {
    return []; // the job is lost; the next tick drains the rest
  }
}
