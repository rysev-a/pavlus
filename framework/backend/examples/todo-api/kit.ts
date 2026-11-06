// Shared vocabulary of the example: effect builders, the shapes that ride in
// the state, and tiny pure helpers. Nothing here performs I/O.
import type { Effect, Message } from "@pavlus/core";
import {
  type Ctx,
  cryptoEffector,
  httpEffector,
  logEffector,
  pgEffector,
  redisEffector,
  requestsEffector,
  type ServerState,
  sql,
  wsEffector,
} from "../../src/mod.ts";

export const http = httpEffector;
export const log = logEffector;
export const pg = pgEffector;
export const redis = redisEffector;
export const rq = requestsEffector;
export const crypto = cryptoEffector;
export const ws = wsEffector;
export { sql };

// ------------------------------------------------------------------ state --

export interface Config {
  /** Fixed-window rate limit per client IP. */
  rateLimit: { limit: number; windowSec: number };
  sessionTtlSec: number;
  cacheTtlSec: number;
  /** How many chat messages a joining client receives. */
  chatHistory: number;
}

export const defaultConfig: Config = {
  rateLimit: { limit: 100, windowSec: 60 },
  sessionTtlSec: 3600,
  cacheTtlSec: 30,
  chatHistory: 20,
};

export interface User {
  id: number;
  email: string;
}

/** The `http.request` payload as the router leaves it. */
export interface HttpReq {
  method: string;
  path: string;
  query: Record<string, string | string[]>;
  headers: Record<string, string | string[] | undefined>;
  cookies: Record<string, string>;
  params: Record<string, string>;
  body: unknown;
  ip: string;
  route: string;
}

/** `state.requests[rid]`: the memory of one request while its flow runs. */
export interface Req {
  /** Route id, e.g. `todos.list`. */
  route: string;
  /** Where the flow is, for flows that are state machines. */
  step: string;
  http: HttpReq;
  user?: User;
  [k: string]: unknown;
}

/** Process-wide slice (`state.shared`). */
export interface Shared {
  /** Migrations ran and the dummy hash exists. */
  ready?: boolean;
  /** SIGTERM received: readiness is 503, streams are ended. */
  draining?: boolean;
  /** A valid hash used to equalise timing for unknown emails. */
  dummyHash?: string;
  /** Open SSE responses by rid -> ctx (so the app can end them on drain). */
  sse?: Record<string, Ctx>;
  /** Websocket connections by connId. */
  chat?: Record<string, { user: User; room: string }>;
}

export interface AppState extends ServerState {
  config: Config;
}

export const sharedOf = (state: AppState): Shared => state.shared as Shared;

export const reqOf = (state: AppState, msg: Message): Req | undefined =>
  msg.ctx
    ? (state.requests[msg.ctx.rid as string] as Req | undefined)
    : undefined;

/**
 * The slice of the request only if its flow is at `step`. A reply that
 * arrives out of turn (a retry, a second error after a rollback) finds
 * nothing and the handler drops it.
 */
export const at = (
  state: AppState,
  msg: Message,
  step: string,
): Req | undefined => {
  const r = reqOf(state, msg);
  return r && r.step === step ? r : undefined;
};

/** What a route function receives when it is its turn to run. */
export interface Call {
  ctx: Ctx;
  route: string;
  http: HttpReq;
  user?: User;
}

export type RouteFn = (call: Call, state: AppState) => Effect[];
/** `undefined` means "not mine", so features compose with `??`. */
export type Handler = (msg: Message, state: AppState) => Effect[] | undefined;

// ------------------------------------------------------------------- keys --

export const K = {
  session: (token: string) => `sess:${token}`,
  rate: (ip: string) => `rl:${ip}`,
  todosCache: (uid: number) => `cache:todos:${uid}`,
  todosChannel: (uid: number) => `todos:${uid}`,
  chatRoom: (room: string) => `chat:${room}`,
};

export const tokenOf = (h: HttpReq): string | undefined => {
  const auth = h.headers.authorization;
  const bearer = typeof auth === "string" ? /^Bearer (\S+)$/.exec(auth) : null;
  return bearer?.[1] ?? h.cookies.sid;
};

// -------------------------------------------------------------- responses --

/** Respond as JSON and write one structured log line with the rid. */
export function answer(
  route: string,
  status: number,
  body?: unknown,
  extra: Omit<Parameters<typeof http.respond>[0], "status" | "json"> = {},
): Effect[] {
  return [
    body === undefined
      ? http.respond({ status, ...extra })
      : http.respond({ status, json: body, ...extra }),
    log.info("response", { route, status }),
  ];
}

export const problem = (
  route: string,
  status: number,
  code: string,
  message: string,
  details?: unknown,
  extra: Omit<Parameters<typeof http.respond>[0], "status" | "json"> = {},
): Effect[] =>
  answer(
    route,
    status,
    { error: { code, message, ...(details !== undefined && { details }) } },
    extra,
  );

export const invalid = (route: string, details: Record<string, string>) =>
  problem(route, 422, "validation", "invalid request", details);

/** An infrastructure error: log it with the rid, tell the client nothing. */
export const internal = (
  route: string,
  where: string,
  error: unknown,
): Effect[] => [
  log.error("internal error", { route, where, error }),
  ...problem(route, 500, "internal", "internal error"),
];
