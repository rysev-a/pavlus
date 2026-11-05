// A websocket chat room at /ws/chat?room=general&token=<session token>.
// Every inbound frame has its own rid; what belongs to the CONNECTION
// (who it is, which room) lives in `state.shared.chat[connId]`.
//
//   ws.open    -> redis GET session -> join room -> pg history -> send history
//   ws.message -> validate -> pg INSERT -> broadcast to the room
//   ws.close   -> forget the connection, tell the room
import type { Effect, Message } from "@service-laboratory/pavlus";
import {
  K,
  log,
  pg,
  redis,
  rq,
  sharedOf,
  sql,
  ws,
  type AppState,
  type Handler,
  type User,
} from "./kit.ts";
import { validateChat, validateRoom } from "./validate.ts";

const CLOSE_UNAUTHENTICATED = 4401;
const CLOSE_BAD_REQUEST = 4400;

const connOf = (state: AppState, msg: Message) =>
  sharedOf(state).chat?.[msg.ctx!.connId as string];

export const chat: Handler = (msg, state) => {
  switch (msg.id) {
    case "ws.open": {
      const p = msg.payload as {
        path: string;
        query: Record<string, string | undefined>;
      };
      if (p.path !== "/ws/chat") return [ws.close(1008, "unknown path")];
      const room = validateRoom(p.query.room);
      if (!room.ok) return [ws.close(CLOSE_BAD_REQUEST, "bad room")];
      if (!p.query.token)
        return [ws.close(CLOSE_UNAUTHENTICATED, "token required")];
      return [
        rq.set("room", room.value),
        redis.get(K.session(p.query.token), {
          replyTo: "chat.session",
          onError: "chat.failed",
        }),
      ];
    }
    case "chat.session": {
      const raw = msg.payload as string | null;
      const room = reqRoom(state, msg);
      let user: User | undefined;
      try {
        user = raw ? (JSON.parse(raw) as User) : undefined;
      } catch {
        user = undefined;
      }
      if (!user || !room)
        return [ws.close(CLOSE_UNAUTHENTICATED, "bad session")];
      const connId = msg.ctx!.connId as string;
      return [
        rq.sharedSet(["chat", connId], { user, room }),
        ws.join(K.chatRoom(room)),
        pg.query(
          sql`select id, email, text, created_at as at from chat_messages
              where room = ${room} order by id desc limit ${state.config.chatHistory}`,
          { replyTo: "chat.history", onError: "chat.failed" },
        ),
      ];
    }
    case "chat.history": {
      const c = connOf(state, msg);
      if (!c) return [];
      const rows = (msg.payload as { rows: unknown[] }).rows;
      return [
        ws.send({ type: "history", messages: [...rows].reverse() }),
        ws.broadcast(
          K.chatRoom(c.room),
          { type: "joined", user: c.user.email },
          msg.ctx!.connId as string,
        ),
        log.info("chat join", { room: c.room, userId: c.user.id }),
      ];
    }
    case "ws.message": {
      const c = connOf(state, msg);
      if (!c) return [ws.close(CLOSE_UNAUTHENTICATED, "not logged in")];
      const v = validateChat((msg.payload as { data: unknown }).data);
      if (!v.ok) return [ws.send({ type: "error", errors: v.errors })];
      return [
        pg.query(
          sql`insert into chat_messages (room, user_id, email, text)
              values (${c.room}, ${c.user.id}, ${c.user.email}, ${v.value.text})
              returning id, email, text, created_at as at`,
          { replyTo: "chat.saved", onError: "chat.failed" },
        ),
      ];
    }
    case "chat.saved": {
      const c = connOf(state, msg);
      if (!c) return []; // the sender left while we were saving
      const m = (msg.payload as { rows: unknown[] }).rows[0];
      return [
        ws.broadcast(K.chatRoom(c.room), { type: "message", message: m }),
      ];
    }
    case "chat.failed":
      return [
        log.error("chat error", { error: msg.payload }),
        ws.send({ type: "error", errors: { server: "try again" } }),
      ];
    case "ws.close": {
      const c = connOf(state, msg);
      const connId = msg.ctx!.connId as string;
      return c
        ? [
            rq.sharedRemove(["chat", connId]),
            ws.broadcast(
              K.chatRoom(c.room),
              { type: "left", user: c.user.email },
              connId,
            ),
            log.info("chat leave", { room: c.room, userId: c.user.id }),
          ]
        : [];
    }
  }
  return undefined;
};

const reqRoom = (state: AppState, msg: Message): string | undefined =>
  (state.requests[msg.ctx!.rid as string] as { room?: string } | undefined)
    ?.room;

export type { Effect };
