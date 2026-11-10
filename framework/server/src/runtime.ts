// The server runtime: wraps pavlus `createApp` and adds what a server needs
// around a pure `(message, state) -> effects` function: per-rid tracking and
// cancellation, request deadlines, discarding of late replies, error
// isolation, a message budget per rid and a graceful shutdown.
import {
  type App,
  type ComponentLike,
  createApp,
  type Effect,
  type Message,
  type Plugin,
  type PluginContext,
  toHandler,
} from "@pavlus/core";
import {
  type Ctx,
  defaultTrace,
  type ErrorPayload,
  fail,
  ridOf,
  type TraceBuffer,
  toErrorPayload,
} from "./ctx.ts";
import {
  createRequestsPlugin,
  type RequestsPlugin,
  type ServerState,
} from "./plugins/requests/mod.ts";
import {
  dispatchRoute,
  type Router,
  type RouterOptions,
  type RouteTable,
  toRouter,
} from "./routing.ts";

/** Optional capabilities a plugin may have besides `handle`. */
export interface ServerPlugin extends Plugin<any, any> {
  /** Abandon everything in flight for `rid` (abort queries, clear timers...). */
  cancel?(rid: string): void;
  /** Stop accepting new work (close the listener). Must not block. */
  stop?(): void;
  /** Resolves when the plugin has released its resources after `dispose`. */
  closed?(): Promise<void>;
}

export interface ServerLimits {
  /** Deadline for a rid without `ctx.deadline`. Default 30000. */
  requestTimeoutMs?: number;
  /** Messages one rid may produce before it is cut off. Default 1000. */
  maxMessagesPerRid?: number;
  /** How long `shutdown()` waits for in-flight work. Default 10000. */
  shutdownTimeoutMs?: number;
  /** Finished rids remembered to discard late replies. Default 10000. */
  finishedMemory?: number;
}

export type ErrorInfo = {
  rid?: string;
  /** `app`, a plugin name, `dispatch` or `plugin.cancel`. */
  source: string;
  messageId?: string;
};

export interface CreateServerAppOptions<S extends ServerState = ServerState> {
  app: ComponentLike<S>;
  plugins: Plugin<any, any>[];
  /** Initial application state; `requests` and `shared` are added. */
  state?: Partial<S>;
  /** Route table used for `http.request` (see routing.ts). */
  routes?: RouteTable | Router;
  routerOptions?: RouterOptions;
  onStep?: (message: Message, effects: Effect[]) => void;
  /** Called for every isolated exception. Defaults to `console.error`. */
  onError?: (error: unknown, info: ErrorInfo) => void;
  /**
   * Effects sent when the handler fails (`error`) or the deadline passes
   * (`timeout`) and the app's own `request.error` / `request.timeout`
   * handler returned nothing. Default: 500 / 504 JSON for `http`, none
   * otherwise. `false` disables.
   */
  defaultResponder?:
    | false
    | ((kind: "error" | "timeout", ctx: Ctx, error?: ErrorPayload) => Effect[]);
  /** Rids that settle once nothing they wait for is outstanding. Default: not http. */
  autoSettle?: (ctx: Ctx) => boolean;
  limits?: ServerLimits;
  trace?: TraceBuffer | false;
  now?: () => number;
}

export interface RuntimeStats {
  /** Rids currently tracked. */
  active: number;
  /** Live deadline timers. */
  timers: number;
  messages: number;
  effects: number;
  /** Messages of finished rids that were discarded (late replies...). */
  discarded: number;
  errors: number;
  timeouts: number;
  budgetExceeded: number;
  /** Calls of `plugin.cancel`. */
  cancels: number;
  finished: number;
  /** Rids cut off by shutdown after its timeout. */
  forced: number;
}

export interface ServerApp<S extends ServerState = ServerState> {
  dispatch(message: Message): void;
  getState(): S;
  stats(): RuntimeStats;
  /** Rids in flight. */
  activeRids(): string[];
  readonly closing: boolean;
  /** Stop accepting, drain in-flight rids, dispose plugins in reverse. */
  shutdown(opts?: { timeoutMs?: number }): Promise<void>;
}

interface Rec {
  rid: string;
  ctx: Ctx;
  touched: Set<string>;
  waits: string[][];
  count: number;
  timer?: ReturnType<typeof setTimeout>;
  terminating: boolean;
  fatal: boolean;
  longLived: boolean;
}

const LONG_LIVED = new Set(["stream.start", "sse.start"]);

const defaultResponder: NonNullable<
  CreateServerAppOptions["defaultResponder"]
> = (kind, ctx, error) =>
  ctx.conn === "http"
    ? [
        {
          plugin: "http",
          type: "respond",
          status: kind === "timeout" ? 504 : 500,
          json: {
            error: kind === "timeout" ? "timeout" : "internal_error",
            ...(error?.code === "message_budget" && { reason: error.code }),
          },
        },
      ]
    : [];

export function createServerApp<S extends ServerState = ServerState>(
  opts: CreateServerAppOptions<S>,
): ServerApp<S> {
  const limits = {
    requestTimeoutMs: opts.limits?.requestTimeoutMs ?? 30_000,
    maxMessagesPerRid: opts.limits?.maxMessagesPerRid ?? 1000,
    shutdownTimeoutMs: opts.limits?.shutdownTimeoutMs ?? 10_000,
    finishedMemory: opts.limits?.finishedMemory ?? 10_000,
  };
  const now = opts.now ?? Date.now;
  const trace = opts.trace === false ? undefined : (opts.trace ?? defaultTrace);
  const responder =
    opts.defaultResponder === undefined
      ? defaultResponder
      : opts.defaultResponder;
  const autoSettle = opts.autoSettle ?? ((ctx: Ctx) => ctx.conn !== "http");
  const onError =
    opts.onError ??
    ((e, info) => console.error(`@pavlus/server: ${info.source}:`, e));
  const handler = toHandler(opts.app as ComponentLike<S>);
  const router: Router | undefined = opts.routes
    ? toRouter(opts.routes, opts.routerOptions)
    : undefined;

  const requests =
    (opts.plugins.find((p) => p.name === "requests") as
      | RequestsPlugin<S>
      | undefined) ?? createRequestsPlugin<S>(opts.state);
  const plugins = opts.plugins.includes(requests)
    ? opts.plugins
    : [requests, ...opts.plugins];
  const byName = new Map<string, ServerPlugin>(
    plugins.map((p) => [p.name, p as ServerPlugin]),
  );

  const stats: RuntimeStats = {
    active: 0,
    timers: 0,
    messages: 0,
    effects: 0,
    discarded: 0,
    errors: 0,
    timeouts: 0,
    budgetExceeded: 0,
    cancels: 0,
    finished: 0,
    forced: 0,
  };
  const recs = new Map<string, Rec>();
  const finished = new Set<string>();
  const byConn = new Map<string, Set<string>>();
  let coreCtx: PluginContext<S> | undefined;
  let core: App | undefined;
  let closing = false;
  let shutdownPromise: Promise<void> | undefined;
  let drainWaiter: (() => void) | undefined;

  const report = (e: unknown, info: ErrorInfo): void => {
    stats.errors++;
    try {
      onError(e, info);
    } catch {
      /* the error reporter must not break the server either */
    }
  };

  // ------------------------------------------------------------ lifecycle --

  function begin(ctx: Ctx): Rec {
    const rec: Rec = {
      rid: ctx.rid,
      ctx,
      touched: new Set([ctx.conn]),
      waits: [],
      count: 0,
      terminating: false,
      fatal: false,
      longLived: false,
    };
    recs.set(rec.rid, rec);
    if (ctx.connId !== undefined) {
      let set = byConn.get(ctx.connId);
      if (!set) byConn.set(ctx.connId, (set = new Set()));
      set.add(rec.rid);
    }
    const deadline =
      typeof ctx.deadline === "number"
        ? ctx.deadline
        : now() + limits.requestTimeoutMs;
    if (Number.isFinite(deadline)) {
      rec.timer = setTimeout(
        () => onDeadline(rec),
        Math.max(0, deadline - now()),
      );
      rec.timer.unref?.();
      stats.timers++;
    }
    requests.open(rec.rid);
    stats.active = recs.size;
    return rec;
  }

  function clearTimer(rec: Rec): void {
    if (rec.timer !== undefined) {
      clearTimeout(rec.timer);
      rec.timer = undefined;
      stats.timers--;
    }
  }

  function finalize(rec: Rec, reason: string, forced = false): void {
    if (recs.get(rec.rid) !== rec) return;
    recs.delete(rec.rid);
    clearTimer(rec);
    if (rec.ctx.connId !== undefined) {
      const set = byConn.get(rec.ctx.connId);
      set?.delete(rec.rid);
      if (set?.size === 0) byConn.delete(rec.ctx.connId);
    }
    finished.add(rec.rid);
    if (finished.size > limits.finishedMemory)
      finished.delete(finished.values().next().value!);
    trace?.add(rec.rid, { kind: "note", name: `finished:${reason}` });
    for (const name of rec.touched) {
      const p = byName.get(name);
      if (!p?.cancel) continue;
      stats.cancels++;
      try {
        p.cancel(rec.rid);
      } catch (e) {
        report(e, { rid: rec.rid, source: `${name}.cancel` });
      }
    }
    try {
      coreCtx?.dispatchEffect({
        plugin: "requests",
        type: "req.drop",
        rid: rec.rid,
      });
    } catch (e) {
      report(e, { rid: rec.rid, source: "requests" });
    }
    stats.finished++;
    if (forced) stats.forced++;
    stats.active = recs.size;
    if (recs.size === 0) drainWaiter?.();
  }

  /** The rid is over: no more messages are accepted; cleanup is deferred. */
  function terminate(rec: Rec, reason: string): void {
    if (rec.terminating) return;
    rec.terminating = true;
    clearTimer(rec);
    queueMicrotask(() => finalize(rec, reason));
  }

  function onDeadline(rec: Rec): void {
    rec.timer = undefined;
    stats.timers--;
    if (recs.get(rec.rid) !== rec || rec.terminating) return;
    stats.timeouts++;
    try {
      coreCtx!.dispatch({
        id: "request.timeout",
        ctx: rec.ctx,
        payload: { deadline: rec.ctx.deadline },
      });
    } catch (e) {
      report(e, {
        rid: rec.rid,
        source: "dispatch",
        messageId: "request.timeout",
      });
    }
    // whatever happened above, a rid past its deadline is over
    terminate(rec, "timeout");
  }

  function release(rec: Rec, id: string): void {
    const i = rec.waits.findIndex((w) => w.includes(id));
    if (i >= 0) rec.waits.splice(i, 1);
  }

  // ------------------------------------------------------------- the app ---

  function fallbackEffects(
    kind: "error" | "timeout",
    ctx: Ctx,
    error?: ErrorPayload,
  ): Effect[] {
    if (responder === false) return [];
    try {
      return responder(kind, ctx, error);
    } catch (e) {
      report(e, { rid: ctx.rid, source: "defaultResponder" });
      return [];
    }
  }

  function handlerFailed(e: unknown, msg: Message, source = "app"): Effect[] {
    report(e, { rid: ridOf(msg), source, messageId: msg.id });
    if (!msg.ctx) return [];
    const error = toErrorPayload(e, "handler_error");
    if (msg.id === "request.error")
      return fallbackEffects("error", msg.ctx as Ctx, error);
    coreCtx?.dispatch({
      id: "request.error",
      ctx: msg.ctx,
      payload: { ...error, source, messageId: msg.id },
    });
    return [];
  }

  function appFn(message: Message): Effect[] {
    let msg = message;
    stats.messages++;
    const rid = ridOf(msg);
    let rec: Rec | undefined;
    if (rid !== undefined) {
      if (finished.has(rid) || recs.get(rid)?.terminating) {
        if (msg.id !== "request.done") stats.discarded++;
        return [];
      }
      rec = recs.get(rid) ?? begin(msg.ctx as Ctx);
      rec.count++;
      if (rec.count > limits.maxMessagesPerRid && !rec.fatal) {
        rec.fatal = true;
        stats.budgetExceeded++;
        trace?.add(rid, { kind: "note", name: "message_budget" });
        coreCtx?.dispatch({
          id: "request.error",
          ctx: rec.ctx,
          payload: {
            code: "message_budget",
            message: `more than ${limits.maxMessagesPerRid} messages for one request`,
            source: "runtime",
          },
        });
        stats.discarded++;
        return [];
      }
      if (rec.fatal && msg.id !== "request.error") {
        stats.discarded++;
        return [];
      }
      release(rec, msg.id);
      trace?.add(rid, { kind: "message", name: msg.id });
    }

    let effects: Effect[] | undefined;
    try {
      if (router && msg.id === "http.request") {
        const r = dispatchRoute(router, msg);
        if ("effects" in r) effects = r.effects;
        else {
          msg = r.message;
          if (rid !== undefined)
            trace?.add(rid, { kind: "note", name: `route:${msg.id}` });
        }
      }
      effects ??= handler(msg, requests.getState() as S);
      if (!Array.isArray(effects)) effects = [];
    } catch (e) {
      effects = handlerFailed(e, msg);
    }

    if (effects.length === 0 && rec) {
      if (msg.id === "request.timeout")
        effects = fallbackEffects("timeout", rec.ctx);
      else if (msg.id === "request.error")
        effects = fallbackEffects(
          "error",
          rec.ctx,
          msg.payload as ErrorPayload,
        );
    }

    const out: Effect[] = [];
    for (const raw of effects) {
      let e = raw;
      if (msg.ctx && !e.ctx) e = { ...e, ctx: msg.ctx };
      if (!byName.has(e.plugin)) {
        report(new Error(`no plugin "${e.plugin}" for effect "${e.type}"`), {
          rid,
          source: "app",
          messageId: msg.id,
        });
        if (msg.ctx && msg.id !== "request.error")
          coreCtx?.dispatch({
            id: "request.error",
            ctx: msg.ctx,
            payload: {
              code: "unknown_plugin",
              message: `no plugin "${e.plugin}" for effect "${e.type}"`,
              source: "runtime",
            },
          });
        continue;
      }
      out.push(e);
      stats.effects++;
      const erid = ridOf(e);
      if (erid !== undefined) {
        trace?.add(erid, { kind: "effect", name: `${e.plugin}.${e.type}` });
        const target = recs.get(erid);
        if (target) {
          target.touched.add(e.plugin);
          const ids = [e.replyTo, e.onError].filter(
            (x): x is string => typeof x === "string",
          );
          if (ids.length) target.waits.push(ids);
          if (
            e.longLived === true ||
            (e.plugin === "http" && LONG_LIVED.has(e.type))
          ) {
            target.longLived = true;
            clearTimer(target);
          }
        }
      }
    }

    if (rec) after(rec, msg);
    return out;
  }

  /** What a message means for the life of its rid. */
  function after(rec: Rec, msg: Message): void {
    switch (msg.id) {
      case "request.done":
      case "http.aborted":
      case "request.timeout":
        return terminate(rec, msg.id);
      case "request.error":
        if (rec.fatal) return terminate(rec, "message_budget");
        break;
      case "ws.close": {
        const connId = rec.ctx.connId;
        if (connId !== undefined)
          for (const other of [...(byConn.get(connId) ?? [])]) {
            const o = recs.get(other);
            if (o && o !== rec) terminate(o, "ws.close");
          }
        break;
      }
    }
    if (autoSettle(rec.ctx) && !rec.terminating) {
      queueMicrotask(() => {
        if (
          recs.get(rec.rid) === rec &&
          !rec.terminating &&
          rec.waits.length === 0 &&
          !rec.longLived
        )
          finalize(rec, "settled");
      });
    }
  }

  // -------------------------------------------------------------- plugins --

  const safeDispatch = (ctx: PluginContext<S>) => (m: Message) => {
    try {
      ctx.dispatch(m);
    } catch (e) {
      report(e, { rid: ridOf(m), source: "dispatch", messageId: m.id });
    }
  };

  function wrap(p: ServerPlugin): ServerPlugin {
    let wctx: PluginContext<S> | undefined;
    const mk = (ctx: PluginContext<S>): PluginContext<S> =>
      (wctx ??= { ...ctx, dispatch: safeDispatch(ctx) });
    const w: ServerPlugin & { getState?: () => unknown } = {
      name: p.name,
      init(ctx) {
        coreCtx ??= ctx as PluginContext<S>;
        try {
          p.init?.(mk(ctx as PluginContext<S>));
        } catch (e) {
          report(e, { source: p.name });
        }
      },
      handle(effect, ctx) {
        try {
          p.handle(effect, mk(ctx as PluginContext<S>));
        } catch (e) {
          report(e, {
            rid: ridOf(effect),
            source: p.name,
            messageId: `${p.name}.${effect.type}`,
          });
          const failed = fail(effect, e);
          if (failed) safeDispatch(ctx as PluginContext<S>)(failed);
          else if (effect.ctx)
            safeDispatch(ctx as PluginContext<S>)({
              id: "request.error",
              ctx: effect.ctx,
              payload: {
                ...toErrorPayload(e, "plugin_error"),
                source: p.name,
                effect: `${p.name}.${effect.type}`,
              },
            });
        }
      },
      dispose() {
        try {
          p.dispose?.();
        } catch (e) {
          report(e, { source: `${p.name}.dispose` });
        }
      },
    };
    if (p.onState)
      w.onState = (s, ctx) => {
        try {
          p.onState!(s, mk(ctx as PluginContext<S>));
        } catch (e) {
          report(e, { source: `${p.name}.onState` });
        }
      };
    if (typeof (p as { getState?: unknown }).getState === "function")
      w.getState = () => (p as unknown as { getState(): unknown }).getState();
    return w;
  }

  core = createApp<S>({
    app: ((m: Message) => appFn(m)) as unknown as ComponentLike<S>,
    plugins: plugins.map((p) => wrap(p as ServerPlugin)),
    getState: () => requests.getState() as S,
    maxMessagesPerTick: 100_000,
    onStep: opts.onStep,
  });

  // ------------------------------------------------------------- public ----

  function drain(timeoutMs: number): Promise<void> {
    if (recs.size === 0) return Promise.resolve();
    return new Promise((resolve) => {
      const t = setTimeout(() => {
        drainWaiter = undefined;
        resolve();
      }, timeoutMs);
      drainWaiter = () => {
        clearTimeout(t);
        drainWaiter = undefined;
        resolve();
      };
    });
  }

  async function runShutdown(timeoutMs: number): Promise<void> {
    closing = true;
    for (const p of [...plugins].reverse()) {
      try {
        (p as ServerPlugin).stop?.();
      } catch (e) {
        report(e, { source: `${p.name}.stop` });
      }
    }
    await drain(timeoutMs);
    for (const rec of [...recs.values()]) {
      terminate(rec, "shutdown");
      finalize(rec, "shutdown", true);
    }
    core!.dispose();
    const waits = plugins
      .map((p) => (p as ServerPlugin).closed?.())
      .filter((x): x is Promise<void> => !!x);
    let t: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      Promise.all(waits).catch(() => {}),
      new Promise<void>((r) => {
        t = setTimeout(r, 2000);
        t.unref?.();
      }),
    ]);
    clearTimeout(t);
  }

  return {
    dispatch(message) {
      try {
        core!.dispatch(message);
      } catch (e) {
        report(e, {
          rid: ridOf(message),
          source: "dispatch",
          messageId: message.id,
        });
      }
    },
    getState: () => requests.getState() as S,
    stats: () => ({ ...stats, active: recs.size }),
    activeRids: () => [...recs.keys()],
    get closing() {
      return closing;
    },
    shutdown(o) {
      return (shutdownPromise ??= runShutdown(
        o?.timeoutMs ?? limits.shutdownTimeoutMs,
      ));
    },
  };
}
