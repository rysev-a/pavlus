// @pavlus/backend public surface. One factory per plugin, one runtime, one reply
// convention (ctx.ts), and one `<name>Effector` object of effect builders per
// plugin. Test helpers live in "@pavlus/backend/testing".

export type {
  Cancellable,
  Ctx,
  Dispatch,
  EffectCtx,
  ErrorPayload,
  ReplyFields,
  TraceBuffer,
  TraceEntry,
  TraceOptions,
} from "./ctx.ts";
export {
  createTraceBuffer,
  defaultTrace,
  deliver,
  fail,
  newRid,
  ok,
  reply,
  ridOf,
  toErrorPayload,
  traceOf,
} from "./ctx.ts";
export * from "./plugins/crypto/mod.ts";
export * from "./plugins/fetch/mod.ts";
export type {
  CookieOptions,
  HttpEffect,
  HttpEffector,
  HttpLimits,
  HttpServerOptions,
  HttpServerPlugin,
  HttpStats,
  RespondEffect,
} from "./plugins/http/mod.ts";
export {
  clearCookie,
  createHttpServerPlugin,
  HttpError,
  httpEffector,
  normalizeRespond,
  parseCookies,
  serializeCookie,
} from "./plugins/http/mod.ts";
export type { RawHttpServerPlugin, RawHttpStats } from "./plugins/http/raw.ts";
export { createRawHttpServerPlugin } from "./plugins/http/raw.ts";
export * from "./plugins/log/mod.ts";
export * from "./plugins/pages/mod.ts";
export * from "./plugins/postgres/mod.ts";
export * from "./plugins/redis/mod.ts";
export type {
  RequestsEffect,
  RequestsPlugin,
  ServerState,
} from "./plugins/requests/mod.ts";
// ---- plugins: createXPlugin + xEffector -----------------------------------
export {
  applyRequestsEffect,
  createRequestsPlugin,
  requestsEffector,
} from "./plugins/requests/mod.ts";
export * from "./plugins/time/mod.ts";
export type {
  WsEffect,
  WsEffector,
  WsOptions,
  WsServerPlugin,
  WsStats,
} from "./plugins/ws/mod.ts";
export {
  createFrameParser,
  createWsServerPlugin,
  encodeFrame,
  wsEffector,
} from "./plugins/ws/mod.ts";
export type {
  RouteResult,
  Router,
  RouterOptions,
  RouteTable,
} from "./routing.ts";
export { dispatchRoute, route, routed, toRouter } from "./routing.ts";
export type {
  CreateServerAppOptions,
  ErrorInfo,
  RuntimeStats,
  ServerApp,
  ServerLimits,
  ServerPlugin,
} from "./runtime.ts";
// ---- the runtime and the context that rides on every message -------------
export { createServerApp } from "./runtime.ts";
export type {
  ControllerMethod,
  ControllersApp,
  HttpReq,
} from "./utils/controller.ts";
// ---- the rapid-MVP kit: class controllers + the db effect factory ----------
export { controllersApp, HttpController } from "./utils/controller.ts";
export type { DbBegin, DbEnd, DbStep } from "./utils/database.ts";
export { db } from "./utils/database.ts";
export {
  answer,
  idOf,
  internal,
  intParam,
  invalid,
  notFound,
  oneOf,
  pageOf,
  problem,
  rowsOf,
  strParam,
  writeConflict,
} from "./utils/kit.ts";
// ---- route-helpers: PagesAPI, createFlowFetch -------------------------------
export * from "./helpers/mod.ts";
