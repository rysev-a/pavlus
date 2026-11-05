// pavlus-server public surface. One factory per plugin, one runtime, one reply
// convention (ctx.ts), and one `<name>Effector` object of effect builders per
// plugin. Test helpers live in "pavlus-server/testing".

// ---- the runtime and the context that rides on every message -------------
export { createServerApp } from "./runtime.ts";
export type {
  CreateServerAppOptions,
  ServerApp,
  ServerPlugin,
  ServerLimits,
  RuntimeStats,
  ErrorInfo,
} from "./runtime.ts";
export {
  newRid,
  ridOf,
  reply,
  ok,
  fail,
  deliver,
  toErrorPayload,
  traceOf,
  createTraceBuffer,
  defaultTrace,
} from "./ctx.ts";
export type {
  Ctx,
  EffectCtx,
  Dispatch,
  ReplyFields,
  Cancellable,
  ErrorPayload,
  TraceBuffer,
  TraceEntry,
  TraceOptions,
} from "./ctx.ts";
export { route, routed, dispatchRoute, toRouter } from "./routing.ts";
export type {
  RouteTable,
  RouteResult,
  Router,
  RouterOptions,
} from "./routing.ts";

// ---- plugins: createXPlugin + xEffector -----------------------------------
export {
  createRequestsPlugin,
  requestsEffector,
  applyRequestsEffect,
} from "./plugins/requests/mod.ts";
export type {
  RequestsEffect,
  RequestsPlugin,
  ServerState,
} from "./plugins/requests/mod.ts";
export {
  createHttpServerPlugin,
  httpEffector,
  parseCookies,
  serializeCookie,
  clearCookie,
  normalizeRespond,
  HttpError,
} from "./plugins/http/mod.ts";
export type {
  HttpEffect,
  HttpEffector,
  HttpServerOptions,
  HttpServerPlugin,
  HttpLimits,
  HttpStats,
  CookieOptions,
  RespondEffect,
} from "./plugins/http/mod.ts";
export {
  createWsServerPlugin,
  wsEffector,
  createFrameParser,
  encodeFrame,
} from "./plugins/ws/mod.ts";
export type {
  WsEffect,
  WsEffector,
  WsOptions,
  WsServerPlugin,
  WsStats,
} from "./plugins/ws/mod.ts";
export * from "./plugins/postgres/mod.ts";
export * from "./plugins/redis/mod.ts";
export * from "./plugins/fetch/mod.ts";
export * from "./plugins/time/mod.ts";
export * from "./plugins/log/mod.ts";
export * from "./plugins/crypto/mod.ts";
