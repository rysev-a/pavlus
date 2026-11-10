// GET /events: a Server-Sent Events stream of this user's todo changes.
// The events come from Redis pub/sub (`todos:<userId>`), so a write handled
// by ANY server instance reaches clients connected to THIS one.
//
//   stream.open -> sse.start + redis.subscribe -> stream.subscribed -> "ready"
//   ... redis delivers -> stream.event -> sse.send ...
//   client leaves -> http.aborted -> the runtime cancels the subscription
import {
  K,
  at,
  http,
  internal,
  log,
  redis,
  reqOf,
  rq,
  sharedOf,
  type Handler,
  type RouteFn,
} from "./kit.ts";

const open: RouteFn = (call) => [
  rq.set("step", "subscribe"),
  // remember the response so a graceful shutdown can end it (see boot.ts)
  rq.sharedSet(["sse", call.ctx.rid], call.ctx),
  http.sseStart({ heartbeatMs: 15_000 }),
  redis.subscribe(K.todosChannel(call.user!.id), {
    onMessage: "stream.event",
    replyTo: "stream.subscribed",
    onError: "stream.failed",
  }),
];

export const routes: Record<string, RouteFn> = { "stream.open": open };

export const stream: Handler = (msg, state) => {
  switch (msg.id) {
    case "stream.subscribed": {
      const r = at(state, msg, "subscribe");
      if (!r) return [];
      return [
        rq.set("step", "streaming"),
        http.sseSend({ userId: r.user!.id }, { event: "ready" }),
        log.info("sse open", { userId: r.user!.id }),
      ];
    }
    case "stream.event": {
      const { message } = msg.payload as { message: string };
      let event: { type?: string } = {};
      try {
        event = JSON.parse(message);
      } catch {
        return [log.warn("bad event on channel", { message })];
      }
      return [http.sseSend(event, { event: event.type ?? "message" })];
    }
    case "stream.failed": {
      const r = reqOf(state, msg);
      return [
        rq.sharedRemove(["sse", msg.ctx!.rid as string]),
        http.sseEnd(),
        ...internal(r?.route ?? "stream.open", "subscribe", msg.payload),
      ];
    }
  }
  return undefined;
};

/** Effects that end every open stream (graceful shutdown). */
export const endAll = (state: Parameters<Handler>[1]) =>
  Object.values(sharedOf(state).sse ?? {}).map((ctx) => ({
    ...http.sseEnd(),
    ctx,
  }));
