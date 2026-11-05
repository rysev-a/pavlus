// The request slice: `state.requests[rid]` lives from the first message of a
// request to its end, `state.shared` is global. Pure effects change them.
import type {
  Effect,
  Message,
  PluginContext,
  StatefulPlugin,
} from "@service-laboratory/pavlus";
import { applyChange } from "@service-laboratory/pavlus/plugins/store";

export type Path = string | readonly (string | number)[];

export type RequestsEffect =
  | { plugin: "requests"; type: "req.set"; path: Path; value: unknown }
  | {
      plugin: "requests";
      type: "req.merge";
      value: Record<string, unknown>;
      path?: Path;
    }
  | { plugin: "requests"; type: "req.clear" }
  | { plugin: "requests"; type: "shared.set"; path: Path; value: unknown }
  /** Deletes the key at `path` from `state.shared` (a real removal, not `undefined`). */
  | { plugin: "requests"; type: "shared.remove"; path: Path }
  | {
      plugin: "requests";
      type: "shared.merge";
      path?: Path;
      value: Record<string, unknown>;
    }
  /** Root-level write (escape hatch for app state next to the two slices). */
  | { plugin: "requests"; type: "state.set"; path: Path; value: unknown }
  /** Dispatch `message` with the effect's ctx (used by `routed`). */
  | { plugin: "requests"; type: "dispatch"; message: Message }
  /** Runtime-internal: delete the slice of `rid` (and notify plugins). */
  | { plugin: "requests"; type: "req.drop"; rid: string }
  /** Declare the request finished: dispatches `request.done` with its ctx. */
  | { plugin: "requests"; type: "done" };

export interface ServerState {
  requests: Record<string, Record<string, unknown>>;
  shared: Record<string, unknown>;
  [k: string]: unknown;
}

export interface RequestsPlugin<
  S extends ServerState = ServerState,
> extends StatefulPlugin<S, RequestsEffect> {
  /** Creates `state.requests[rid]` (idempotent). Called by the runtime. */
  open(rid: string): void;
  /** Deletes `state.requests[rid]`. Called by the runtime. */
  drop(rid: string): void;
  /** Rids that currently have a slice. */
  rids(): string[];
}

const segs = (p: Path): (string | number)[] =>
  typeof p === "string" ? (p === "" ? [] : p.split(".")) : [...p];

/**
 * Writes one request slice. The slice itself is replaced (never mutated), but
 * the `requests` map is updated IN PLACE and only the root is copied: with
 * hundreds of requests in flight, copying the map on every write costs more
 * than the rest of the request (measured: bench/). Nobody should hold on to
 * `state.requests` across messages; read `state.requests[rid]` when handling.
 */
function putSlice<S extends ServerState>(
  state: S,
  rid: string,
  slice: unknown,
): S {
  (state.requests as Record<string, unknown>)[rid] = slice;
  return { ...state };
}

/**
 * The state transition of an effect of this plugin (also used by the
 * `flow` test helper). Writes for a rid without a slice are ignored, so a
 * late effect of a finished request never resurrects it.
 */
export function applyRequestsEffect<S extends ServerState>(
  state: S,
  effect: Effect,
): S {
  if (effect.plugin !== "requests") return state;
  const e = effect as RequestsEffect;
  const rid = effect.ctx?.rid;
  switch (e.type) {
    case "req.set":
    case "req.merge": {
      if (typeof rid !== "string" || !(rid in state.requests)) return state;
      const path = segs(e.path ?? []);
      const slice =
        e.type === "req.set"
          ? applyChange(state.requests[rid], {
              plugin: "store",
              type: "set",
              path,
              value: e.value,
            })
          : applyChange(state.requests[rid], {
              plugin: "store",
              type: "merge",
              path,
              value: e.value,
            });
      return putSlice(state, rid, slice);
    }
    case "req.clear": {
      if (typeof rid !== "string" || !(rid in state.requests)) return state;
      return putSlice(state, rid, {});
    }
    case "shared.set":
      return applyChange(state, {
        plugin: "store",
        type: "set",
        path: ["shared", ...segs(e.path)],
        value: e.value,
      }) as S;
    case "shared.remove":
      return applyChange(state, {
        plugin: "store",
        type: "remove",
        path: ["shared", ...segs(e.path)],
      }) as S;
    case "shared.merge":
      return applyChange(state, {
        plugin: "store",
        type: "merge",
        path: ["shared", ...segs(e.path ?? [])],
        value: e.value,
      }) as S;
    case "state.set": {
      const p = segs(e.path);
      if (p[0] === "requests" && p.length === 1) return state;
      return applyChange(state, {
        plugin: "store",
        type: "set",
        path: p,
        value: e.value,
      }) as S;
    }
    default:
      return state;
  }
}

/** Builders for the pure effects (the handler never writes state itself). */
export const requestsEffector = {
  set: (path: Path, value: unknown): RequestsEffect => ({
    plugin: "requests",
    type: "req.set",
    path,
    value,
  }),
  merge: (value: Record<string, unknown>, path?: Path): RequestsEffect => ({
    plugin: "requests",
    type: "req.merge",
    value,
    ...(path !== undefined && { path }),
  }),
  clear: (): RequestsEffect => ({ plugin: "requests", type: "req.clear" }),
  sharedSet: (path: Path, value: unknown): RequestsEffect => ({
    plugin: "requests",
    type: "shared.set",
    path,
    value,
  }),
  sharedRemove: (path: Path): RequestsEffect => ({
    plugin: "requests",
    type: "shared.remove",
    path,
  }),
  sharedMerge: (
    value: Record<string, unknown>,
    path?: Path,
  ): RequestsEffect => ({
    plugin: "requests",
    type: "shared.merge",
    value,
    ...(path !== undefined && { path }),
  }),
  dispatch: (message: Message): RequestsEffect => ({
    plugin: "requests",
    type: "dispatch",
    message,
  }),
  done: (): RequestsEffect => ({ plugin: "requests", type: "done" }),
};

/** `initial` may carry extra top-level state; `requests` and `shared` are added. */
export function createRequestsPlugin<S extends ServerState = ServerState>(
  initial: Partial<S> = {},
): RequestsPlugin<S> {
  let state = {
    ...initial,
    requests: {},
    shared: (initial as ServerState).shared ?? {},
  } as S;
  return {
    name: "requests",
    getState: () => state,
    open(rid) {
      if (rid in state.requests) return;
      state.requests[rid] = {}; // in place, see `putSlice`
    },
    drop(rid) {
      delete state.requests[rid];
    },
    rids: () => Object.keys(state.requests),
    handle(effect: RequestsEffect, ctx: PluginContext<S>) {
      switch (effect.type) {
        case "req.drop":
          return this.drop(effect.rid);
        case "dispatch": {
          const m: Message = { ...effect.message };
          const c = (effect as Effect).ctx;
          if (c && !m.ctx) m.ctx = c;
          return ctx.dispatch(m);
        }
        case "done": {
          const c = (effect as Effect).ctx;
          if (c) ctx.dispatch({ id: "request.done", ctx: c });
          return;
        }
        default:
          state = applyRequestsEffect(state, effect as Effect);
      }
    },
  };
}
