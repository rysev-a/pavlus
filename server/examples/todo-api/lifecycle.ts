// What the runtime and the plugins say about the life of a request:
// deadline, client abort, errors, stray failures of fire-and-forget effects.
import type { Effect, Message } from "@service-laboratory/pavlus";
import {
  log,
  problem,
  reqOf,
  rq,
  sharedOf,
  type AppState,
  type Handler,
} from "./kit.ts";

/** An event stream that ended is no longer in `shared.sse`. */
const forgetStream = (state: AppState, msg: Message): Effect[] =>
  sharedOf(state).sse?.[msg.ctx!.rid as string]
    ? [rq.sharedRemove(["sse", msg.ctx!.rid as string])]
    : [];

export const lifecycle: Handler = (msg, state) => {
  const route = reqOf(state, msg)?.route ?? "?";
  const isHttp = msg.ctx?.conn === "http";
  switch (msg.id) {
    case "request.timeout":
      // the runtime cancels whatever is still running for this rid
      return [
        log.warn("request timed out", { route }),
        ...(isHttp
          ? problem(route, 504, "timeout", "the request took too long")
          : []),
      ];
    case "http.aborted":
      return [
        log.info("client went away", { route }),
        ...forgetStream(state, msg),
      ];
    case "request.done":
      return forgetStream(state, msg);
    case "request.error":
      return [
        log.error("request error", { route, error: msg.payload }),
        ...(isHttp ? problem(route, 500, "internal", "internal error") : []),
      ];
    case "http.listening":
      return [log.info("listening", msg.payload as Record<string, unknown>)];
    // an effect without `onError` failed: its plugin reported to a fallback id
    case "pg.error":
    case "redis.error":
    case "crypto.error":
    case "fetch.error":
      return [
        log.error("unhandled plugin error", {
          source: msg.id,
          error: msg.payload,
        }),
        ...(isHttp ? problem(route, 500, "internal", "internal error") : []),
      ];
  }
  return undefined;
};
