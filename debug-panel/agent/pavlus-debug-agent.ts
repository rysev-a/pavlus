/**
 * The in-page half of the Pavlus debug panel (`debug-panel/extension`).
 *
 * Wiring an app in (see debug-panel/README.md):
 *
 * ```ts
 * import { createPavlusDebug } from "../debug-panel/agent/pavlus-debug-agent.ts";
 *
 * const debug = createPavlusDebug({ name: "admin-app", app: shell });
 * const plugins = [store, new DomPlugin(), /* … *\/ debug.plugin];
 * debug.watch(plugins);
 * const app = createApp({ app: shell, plugins, onStep: debug.onStep, mount: "#app" });
 * ```
 *
 * What the agent records, and how it reaches Chrome DevTools:
 *
 * - every message (`onStep`) with its effects; each effect carries how long
 *   the plugin took (`dur`, measured by wrapping the plugin's `handle`) and,
 *   for HTTP, how long the round trip to the answer message was (`wait`);
 * - the store state after every change, plus the store's own history as a
 *   timeline (which message caused which `set` / `merge` / `remove`);
 * - everything is streamed to the page as
 *   `{ source: "__pavlus_agent__", … }` via `postMessage`, where the
 *   extension's content script picks it up.
 *
 * A `step` is posted only after its last effect has been handled, so the
 * durations are already in the record when it crosses `postMessage` (the
 * browser clones the payload at that point — later mutations would be lost).
 * Commands from the panel (`{ source: "__pavlus_panel__", cmd: … }`) drive
 * the time travel: `undo` / `redo` / `restoreTo` are applied with
 * `ctx.dispatchEffect`, so the change goes through the real core and every
 * plugin (DOM!) hears about it, exactly like an app-produced effect.
 * Commands other than `hello` carry an `appId` and are ignored by agents
 * with a different id, so several apps can share one page.
 *
 * The environment is abstracted behind `DebugHost` (the browser `window` in
 * production, a fake in tests).
 */

import { routeName, setComponentTrace } from "@service-laboratory/pavlus";
import type {
  ChildSpec,
  ComponentLike,
  Effect,
  Message,
  Plugin,
  PluginContext,
  Routing,
} from "@service-laboratory/pavlus";
import type {
  HistoryEntry,
  StoreChange,
  StorePlugin,
} from "@service-laboratory/pavlus/plugins/store";

/** Everything the agent needs from its environment (fake-able in tests). */
export interface DebugHost {
  addEventListener(type: "message", fn: (ev: { data?: unknown }) => void): void;
  /** `"*"` is passed as `targetOrigin`: jsdom demands the second argument. */
  postMessage(data: unknown, targetOrigin?: string): void;
  setTimeout(fn: () => void, ms: number): unknown;
  performance?: { now(): number };
}

export interface DebugAppInfo {
  id: string;
  name: string;
  /** Plugin names, in registration order. */
  plugins: string[];
  hasStore: boolean;
  /**
   * The app's components as dotted paths (`"users"`, `"users.editor"`),
   * walked from the `app` option's `children` / `routing`. Empty when the
   * agent was created without `app`.
   */
  components: string[];
  /** Display tag per component path (`ChildSpec.tag` / the component's `tag`). */
  tags?: Record<string, string>;
}

/** One observed input or output line of a component. */
export interface DebugIOEntry {
  /** Input: the full message id. Output: `"plugin:type"`. */
  id: string;
  /** How many times it was seen. */
  n: number;
  /** When it was last seen (Date.now()). */
  at: number;
  /** Output only: one-line summary of the last effect. */
  summary?: string;
}

/** Observed input/output of a component at a dotted path. */
export interface DebugIO {
  input: DebugIOEntry[];
  output: DebugIOEntry[];
}

export interface DebugEffectRec {
  uid: string;
  time: number;
  plugin: string;
  type: string;
  /** One-line summary for the list view. */
  summary: string;
  /** The effect itself, minus `plugin` / `type`. */
  detail: Record<string, unknown>;
  /** How long the plugin took, synchronously (ms). */
  dur?: number;
  /** HTTP only: request → answer message (ms). */
  wait?: number;
}

export interface DebugTimelineEntry {
  time: number;
  type: string;
  path: string;
  /**
   * The change's value, cloned for the panel (a marker instead when too big
   * or unserializable; absent for `remove` and for old agents).
   */
  value?: unknown;
  /** The message that caused the change; `null` if the panel applied it. */
  msgId: string | null;
}

export interface DebugMessageInfo {
  id: string;
  payload?: unknown;
  event?: unknown;
}

type AgentEvent =
  | {
      type: "step";
      appId: string;
      seq: number;
      time: number;
      message: DebugMessageInfo;
      /** The plugin that dispatched the message; absent = the page. */
      from?: string;
      effects: DebugEffectRec[];
      /** Component paths that received the message (deepest last). */
      comps?: string[];
    }
  | {
      type: "state";
      appId: string;
      time: number;
      state: unknown;
      /** True if the state was too big to send. */
      truncated?: boolean;
    }
  | { type: "history+"; appId: string; entries: DebugTimelineEntry[] }
  | { type: "history-"; appId: string; length: number }
  | { type: "wait"; appId: string; uid: string; ms: number };

interface HelloMsg {
  source: typeof SOURCE_AGENT;
  type: "hello";
  v: typeof AGENT_VERSION;
  apps: DebugAppInfo[];
  /** Latest state per app id (omitted when too big). */
  state: Record<string, unknown>;
  /** Full store history per app id. */
  history: Record<string, DebugTimelineEntry[]>;
  /** How many changes can be redone, per app id. */
  redo: Record<string, number>;
  /** Everything the agent recorded so far (capped). */
  replay: AgentEvent[];
  /** How many replay events were dropped by the cap. */
  dropped: number;
  /** Observed per-component input/output, by dotted path. */
  io?: Record<string, DebugIO>;
}

interface BatchMsg {
  source: typeof SOURCE_AGENT;
  batch: AgentEvent[];
}

/** One in-flight step: its effect records and how many are left to run. */
interface StepCtx {
  seq: number;
  time: number;
  message: DebugMessageInfo;
  /** The plugin that dispatched this message; absent = the page (an event,
   * `app.dispatch`, SSR) or a pre-`from` agent recording. */
  from?: string;
  recs: DebugEffectRec[];
  /** Index of the next rec the watch wrapper hands to a plugin. */
  next: number;
  /** Effects whose `handle` has not returned yet. */
  left: number;
  /**
   * The `step` event is posted once every effect has run (so the durations
   * are part of the record when the browser clones it).
   */
  posted: boolean;
  /** Http waits for this step, posted right after it. */
  waits: AgentEvent[];
  /** Component paths that received the message (deepest last). */
  comps: string[];
}

interface PendingHttp {
  rec: DebugEffectRec;
  /** The step the request belongs to; its wait is held until it posts. */
  step: StepCtx;
  onSuccess: string;
  onError: string;
}

const SOURCE_AGENT = "__pavlus_agent__";
const SOURCE_PANEL = "__pavlus_panel__";
/** Ring buffer of everything recorded, replayed to a late-connecting panel. */
const MAX_EVENTS = 3000;
/** How many replay events a hello carries (the oldest are dropped). */
const MAX_REPLAY = 1500;
/** States bigger than this are not shipped, only their size. */
const MAX_STATE_CHARS = 300_000;
/** Change values bigger than this are not shipped, only a marker. */
const MAX_VALUE_CHARS = 50_000;
/** Default event-batching window; `opts.flushMs` overrides. */
const FLUSH_MS = 60;

const AGENT_VERSION = "pavlus-debug 0.1.0";

/** `createPavlusDebug({ name, app })` — one agent per `createApp`. */
export interface PavlusDebug {
  /** Add to the app's plugin list (last). */
  plugin: Plugin;
  /** Pass as `createApp`'s `onStep`. */
  onStep(message: Message, effects: Effect[]): void;
  /**
   * Call before `createApp` with the same plugin array: wraps every plugin's
   * `handle` to measure how long each effect took, and finds the store.
   */
  watch(plugins: Plugin<any, any>[]): void;
  /** For poking from the console. */
  agent: { id: string; recorded(): number };
}

const usedNames = new Map<string, number>();

/** One buffered component-trace event, drained by the next agent's `onStep`. */
type TraceEvt =
  | { k: "in"; path: string; id: string; at: number }
  | {
      k: "out";
      path: string;
      plugin: string;
      type: string;
      summary: string;
      at: number;
    };

/**
 * The framework's trace sink is global (one per page), so events land in this
 * shared buffer and each agent claims them at its next `onStep`: dispatch
 * loops are synchronous per app, so between steps the buffer holds exactly
 * the events of the step being recorded (nested dispatches drain at their
 * own `onStep`).
 */
const traceBuf: TraceEvt[] = [];
/** Bound on the buffer so a runaway app cannot grow memory without end. */
const MAX_TRACE = 500;
/** Per-component io maps stop growing at this many paths. */
const MAX_IO_PATHS = 300;
/** io lists shipped in a hello are capped per direction. */
const MAX_IO_LIST = 50;
let traceInstalled = false;

const traceJson = (v: unknown): string => {
  try {
    const s = JSON.stringify(v) ?? "undefined";
    return s.length > 60 ? `${s.slice(0, 59)}…` : s;
  } catch {
    return "(unserializable)";
  }
};

/** Installs the trace sink once per page (idempotent — several apps share it). */
const installTrace = (): void => {
  if (traceInstalled) return;
  traceInstalled = true;
  setComponentTrace({
    receive: (path, message) => {
      if (traceBuf.length < MAX_TRACE)
        traceBuf.push({ k: "in", path, id: message.id, at: Date.now() });
    },
    emit: (path, _message, effects) => {
      for (const e of effects) {
        if (traceBuf.length >= MAX_TRACE) return;
        const { plugin, type, ...rest } = e;
        traceBuf.push({
          k: "out",
          path,
          plugin,
          type,
          summary: traceJson(rest),
          at: Date.now(),
        });
      }
    },
  });
};

export function createPavlusDebug(
  opts: {
    name?: string;
    app?: ComponentLike<any>;
    /** Events batch for this long before crossing postMessage; `0` streams
     * each change as it happens (realtime timeline in the panel). */
    flushMs?: number;
  } = {},
  host: DebugHost = globalThis as unknown as DebugHost,
): PavlusDebug {
  const base = opts.name ?? "app";
  // several agents share one page: the first call wins, all of them drain
  installTrace();
  const n = usedNames.get(base) ?? 0;
  usedNames.set(base, n + 1);
  const appId = n === 0 ? base : `${base}#${n}`;
  const name = base;

  const wall = (): number => Date.now();
  const mono = (): number => (host.performance ? host.performance.now() : 0);
  const ms = (v: number): number => Math.round(v * 10) / 10;
  const flushMs = Math.max(0, opts.flushMs ?? FLUSH_MS);

  let ctx: PluginContext<any> | undefined;
  let store: StorePlugin<any> | undefined;
  const pluginNames: string[] = [];
  let lastHistLen = 0;
  let lastMsgId: string | null = null;
  let seq = 0;
  /** True while the agent itself applies an effect (undo/redo/restoreTo). */
  let applyingControl = false;
  const pendingHttp = new Map<string, PendingHttp>();
  const redoStack: StoreChange[] = [];
  /** Steps being nested (a `handle` dispatched a message). */
  const stack: StepCtx[] = [];
  /** The plugin whose `handle` is currently running — the sender of any
   * message dispatched from inside it. Async answers (http) are attributed
   * via `pendingHttp` instead, since their dispatch happens after the
   * `handle` returned. */
  let handling: string | undefined;
  /** Created but not yet posted steps. */
  const unposted: StepCtx[] = [];
  /** Set by `watch`; without it nothing marks a step complete. */
  let watched = false;
  /** Observed component inputs: path → (message id → count/last time). */
  const ioIn = new Map<string, Map<string, { n: number; at: number }>>();
  /** Observed component outputs: path → ("plugin:type" → count/summary). */
  const ioOut = new Map<
    string,
    Map<string, { n: number; at: number; summary: string }>
  >();

  const events: AgentEvent[] = [];
  let sent = 0;
  let flushScheduled = false;
  let stepsFlushScheduled = false;

  const push = (e: AgentEvent): void => {
    events.push(e);
    if (events.length > MAX_EVENTS) {
      events.shift();
      if (sent > 0) sent--;
    }
    if (!flushScheduled) {
      flushScheduled = true;
      host.setTimeout(() => {
        flushScheduled = false;
        flush();
      }, flushMs);
    }
  };

  const flush = (): void => {
    if (sent >= events.length) return;
    const batch = events.slice(sent);
    sent = events.length;
    const msg: BatchMsg = { source: SOURCE_AGENT, batch };
    host.postMessage(msg, "*");
  };

  const postStep = (s: StepCtx): void => {
    if (s.posted) return;
    s.posted = true;
    const inStack = stack.indexOf(s);
    if (inStack >= 0) stack.splice(inStack, 1);
    const inUnposted = unposted.indexOf(s);
    if (inUnposted >= 0) unposted.splice(inUnposted, 1);
    push({
      type: "step",
      appId,
      seq: s.seq,
      time: s.time,
      message: s.message,
      from: s.from,
      effects: s.recs,
      comps: s.comps,
    });
    for (const w of s.waits) push(w);
  };

  /**
   * Posts steps whose effects have all run. Runs right after a dispatch
   * tick, so it only matters when `watch` was not wired (nothing else
   * decrements `left`) — with `watch`, steps post as they complete.
   */
  const flushSteps = (): void => {
    for (const s of [...unposted]) if (s.left === 0 || !watched) postStep(s);
  };

  const shortJson = (v: unknown): string => {
    try {
      const s = JSON.stringify(v) ?? "undefined";
      return s.length > 60 ? `${s.slice(0, 59)}…` : s;
    } catch {
      return "(unserializable)";
    }
  };

  /**
   * Everything posted to the panel crosses `postMessage`, whose structured
   * clone throws on functions ("Function object could not be cloned"), DOM
   * nodes, symbols and promises — e.g. a `dom:mount` effect carries `view`,
   * a compiled template function. Deep-copies plain objects and arrays,
   * replacing anything uncloneable with a short marker; natively clonable
   * exotics (Date, Map, Set...) pass through untouched. Cycles in the copy
   * stay shared, which the clone preserves.
   */
  const cloneSafe = (
    v: unknown,
    depth = 0,
    seen = new Map<unknown, unknown>(),
  ): unknown => {
    if (v === null || typeof v !== "object") {
      if (typeof v === "function") return v.name ? `ƒ ${v.name}()` : "ƒ ()";
      if (typeof v === "symbol") return String(v);
      return v;
    }
    if (typeof Node !== "undefined" && v instanceof Node)
      return `<${v.nodeName.toLowerCase()}>`;
    if (v instanceof Promise) return "Promise";
    if (
      v instanceof Date ||
      v instanceof RegExp ||
      v instanceof Map ||
      v instanceof Set ||
      v instanceof Error ||
      v instanceof ArrayBuffer ||
      ArrayBuffer.isView(v)
    )
      return v;
    const cached = seen.get(v);
    if (cached !== undefined) return cached;
    if (depth >= 8) return shortJson(v);
    const out: Record<string, unknown> = Array.isArray(v)
      ? ([] as unknown as Record<string, unknown>)
      : {};
    seen.set(v, out);
    let entries: [string, unknown][];
    try {
      entries = Object.entries(v);
    } catch {
      return "(uninspectable)";
    }
    for (const [k, val] of entries) {
      try {
        out[k] = cloneSafe(val, depth + 1, seen);
      } catch {
        out[k] = "(uninspectable)";
      }
    }
    return out;
  };

  const summarize = (rest: Record<string, unknown>, key: string): string => {
    switch (key) {
      case "http:request":
        return `${String(rest.method ?? "GET")} ${String(rest.url ?? "")}`;
      case "http:cancel":
        return String(rest.id ?? "");
      case "store:set":
      case "store:merge":
        return `${String(rest.path ?? "")} = ${shortJson(rest.value)}`;
      case "store:remove":
        return String(rest.path ?? "");
      case "store:undo":
        return rest.steps === undefined ? "" : String(rest.steps);
      case "store:restoreTo":
        return String(rest.timestamp ?? "");
      case "dom:mount":
      case "dom:unmount":
        return String(rest.target ?? "");
      case "dom:focus":
      case "dom:blur":
        return String(rest.selector ?? "");
      default:
        return shortJson(rest);
    }
  };

  const effectRec = (uid: string, time: number, e: Effect): DebugEffectRec => {
    const { plugin, type, ...rest } = e;
    return {
      uid,
      time,
      plugin,
      type,
      summary: summarize(rest as Record<string, unknown>, `${plugin}:${type}`),
      detail: cloneSafe(rest) as Record<string, unknown>,
    };
  };

  const isStoreChange = (e: Effect): boolean =>
    e.plugin === "store" &&
    (e.type === "set" || e.type === "merge" || e.type === "remove");

  /** A change value for the panel: cloned, or a marker when too big. */
  const valueOf = (v: unknown): unknown => {
    if (v === undefined) return undefined;
    try {
      return (JSON.stringify(v) ?? "").length <= MAX_VALUE_CHARS
        ? cloneSafe(v)
        : { "(value)": "too big to display" };
    } catch {
      return { "(value)": "unserializable" };
    }
  };

  const entryOf = (h: HistoryEntry): DebugTimelineEntry => ({
    time: h.timestamp,
    type: h.effect.type,
    path: String(h.effect.path ?? ""),
    value: valueOf("value" in h.effect ? h.effect.value : undefined),
    msgId: applyingControl ? null : lastMsgId,
  });

  const onStep = (message: Message, effects: Effect[]): void => {
    seq++;
    const time = wall();
    // claim the component-trace events of this dispatch (see `traceBuf`),
    // merging them into the per-component io maps and the step's `comps`
    const received = new Set<string>();
    for (const t of traceBuf.splice(0)) {
      if (t.k === "in") {
        received.add(t.path);
        // the trace hands out ids relative to the path — store the full id
        const full = t.path ? `${t.path}.${t.id}` : t.id;
        let m = ioIn.get(t.path);
        if (!m) {
          if (ioIn.size >= MAX_IO_PATHS) continue;
          m = new Map();
          ioIn.set(t.path, m);
        }
        const cur = m.get(full);
        if (cur) {
          cur.n++;
          cur.at = t.at;
        } else m.set(full, { n: 1, at: t.at });
      } else {
        let m = ioOut.get(t.path);
        if (!m) {
          if (ioOut.size >= MAX_IO_PATHS) continue;
          m = new Map();
          ioOut.set(t.path, m);
        }
        const key = `${t.plugin}:${t.type}`;
        const cur = m.get(key);
        if (cur) {
          cur.n++;
          cur.at = t.at;
          cur.summary = t.summary;
        } else m.set(key, { n: 1, at: t.at, summary: t.summary });
      }
    }
    // fn-only apps dispatch without children: the root still reports itself,
    // but steps recorded before the trace was installed get a synthetic root
    if (!received.size) received.add("");
    const comps = [...received].sort(
      (a, b) => a.split(".").length - b.split(".").length || a.localeCompare(b),
    );
    lastMsgId = message.id;
    const recs = effects.map((e, i) =>
      effectRec(`${appId}:${seq}:${i}`, time, e),
    );
    const step: StepCtx = {
      seq,
      time,
      message: {
        id: message.id,
        payload: cloneSafe(message.payload),
        event: cloneSafe(message.event),
      },
      // who dispatched this message: the plugin whose `handle` is running
      // (a nested dispatch), else the http answer matched below, else the page
      from: handling,
      recs,
      next: 0,
      left: effects.length,
      posted: false,
      waits: [],
      comps,
    };
    stack.push(step);
    unposted.push(step);
    for (const [hid, p] of [...pendingHttp]) {
      if (message.id !== p.onSuccess && message.id !== p.onError) continue;
      pendingHttp.delete(hid);
      if (step.from === undefined) step.from = "http";
      const wait: AgentEvent = {
        type: "wait",
        appId,
        uid: p.rec.uid,
        ms: ms(time - p.rec.time),
      };
      // If the request's step has not posted yet (same tick round trip),
      // hold the wait so the panel sees the effect first.
      if (p.step.posted) push(wait);
      else p.step.waits.push(wait);
    }
    for (let i = 0; i < effects.length; i++) {
      const e = effects[i]!;
      if (e.plugin !== "http" || e.type !== "request") continue;
      const he = e as { id?: unknown; onSuccess?: unknown; onError?: unknown };
      const id = String(he.id ?? "");
      if (id && !pendingHttp.has(id))
        pendingHttp.set(id, {
          rec: recs[i]!,
          step,
          onSuccess: String(he.onSuccess ?? ""),
          onError: String(he.onError ?? ""),
        });
    }
    if (!applyingControl && effects.some(isStoreChange)) redoStack.length = 0;
    if (step.left === 0) postStep(step);
    else if (!stepsFlushScheduled) {
      stepsFlushScheduled = true;
      host.setTimeout(() => {
        stepsFlushScheduled = false;
        flushSteps();
      }, 0);
    }
  };

  const onStateChanged = (state: unknown): void => {
    if (store) {
      const hist = store.history;
      if (hist.length > lastHistLen) {
        const entries: DebugTimelineEntry[] = [];
        for (let i = lastHistLen; i < hist.length; i++)
          entries.push(entryOf(hist[i]!));
        push({ type: "history+", appId, entries });
      } else if (hist.length < lastHistLen) {
        push({ type: "history-", appId, length: hist.length });
      }
      lastHistLen = hist.length;
    }
    let snap: unknown;
    let truncated = false;
    try {
      if ((JSON.stringify(state) ?? "").length <= MAX_STATE_CHARS)
        snap = cloneSafe(state);
      else truncated = true;
    } catch {
      truncated = true;
    }
    push({ type: "state", appId, time: wall(), state: snap, truncated });
  };

  const control = (fn: () => void): void => {
    if (!ctx) return;
    applyingControl = true;
    try {
      fn();
    } finally {
      applyingControl = false;
    }
  };

  /** Dotted paths of the app's components, walked once from `opts.app`. */
  let components: string[] | undefined;
  /** Display tag per component path (`ChildSpec.tag` or the component's own). */
  let tags: Record<string, string> | undefined;
  const componentsOf = (): string[] => {
    if (components) return components;
    const out: string[] = [];
    const tagMap: Record<string, string> = {};
    const seen = new Set<object>();
    const walk = (comp: unknown, prefix: string): void => {
      if (!comp || typeof comp !== "object" || seen.has(comp)) return;
      seen.add(comp);
      const c = comp as {
        children?: Record<string, ChildSpec>;
        routing?: Routing;
      };
      for (const [name, spec] of Object.entries(c.children ?? {})) {
        const path = prefix ? `${prefix}.${name}` : name;
        out.push(path);
        walk(spec.component, path);
        const t =
          typeof spec.tag === "string" && spec.tag
            ? spec.tag
            : (spec.component as { tag?: unknown } | undefined)?.tag;
        if (typeof t === "string" && t) tagMap[path] = t;
      }
      for (const [pattern, spec] of Object.entries(c.routing ?? {})) {
        const child = routeName(pattern, spec);
        const path = prefix ? `${prefix}.${child}` : child;
        out.push(path);
        walk(spec.component, path);
        const t =
          typeof spec.tag === "string" && spec.tag
            ? spec.tag
            : (spec.component as { tag?: unknown } | undefined)?.tag;
        if (typeof t === "string" && t) tagMap[path] = t;
      }
    };
    walk(opts.app, "");
    tags = tagMap;
    return (components = out);
  };

  /** The io maps as a plain hello payload, capped per direction. */
  const ioPayload = (): Record<string, DebugIO> => {
    const io: Record<string, DebugIO> = {};
    const list = (
      m: Map<string, { n: number; at: number; summary?: string }>,
    ): DebugIOEntry[] =>
      [...m.entries()]
        .sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0]))
        .slice(0, MAX_IO_LIST)
        .map(([id, v]) => ({
          id,
          n: v.n,
          at: v.at,
          ...(v.summary === undefined ? {} : { summary: v.summary }),
        }));
    for (const [path, m] of ioIn) io[path] = { input: list(m), output: [] };
    for (const [path, m] of ioOut) {
      const cur = io[path] ?? { input: [], output: [] };
      cur.output = list(m);
      io[path] = cur;
    }
    return io;
  };

  const sendHello = (): void => {
    const state: Record<string, unknown> = {};
    const history: Record<string, DebugTimelineEntry[]> = {};
    const redo: Record<string, number> = {};
    if (store) {
      const s = store.getState();
      try {
        if ((JSON.stringify(s) ?? "").length <= MAX_STATE_CHARS)
          state[appId] = cloneSafe(s);
      } catch {
        /* state is not serializable; the panel shows nothing for it */
      }
      history[appId] = store.history.map(entryOf);
      redo[appId] = redoStack.length;
      lastHistLen = store.history.length;
    }
    const apps: DebugAppInfo[] = [
      {
        id: appId,
        name,
        plugins: [...pluginNames],
        hasStore: !!store,
        components: componentsOf(),
        ...(tags && Object.keys(tags).length ? { tags } : {}),
      },
    ];
    const from = Math.max(0, events.length - MAX_REPLAY);
    const hello: HelloMsg = {
      source: SOURCE_AGENT,
      type: "hello",
      v: AGENT_VERSION,
      apps,
      state,
      history,
      redo,
      replay: events.slice(from),
      dropped: from,
      io: ioPayload(),
    };
    // The replay carries everything; a pending flush would only duplicate it.
    sent = events.length;
    flushScheduled = false;
    host.postMessage(hello, "*");
  };

  host.addEventListener("message", (ev) => {
    const d = ev.data as
      | {
          source?: string;
          cmd?: string;
          appId?: string;
          steps?: number;
          timestamp?: number;
        }
      | undefined;
    if (!d || d.source !== SOURCE_PANEL) return;
    // `hello` is answered by every agent; commands target one app.
    if (d.cmd !== "hello" && d.appId !== undefined && d.appId !== appId) return;
    switch (d.cmd) {
      case "hello":
        sendHello();
        break;
      case "undo": {
        if (!ctx) break;
        const hist = store?.history ?? [];
        const n = Math.min(Math.max(1, d.steps ?? 1), hist.length);
        for (let i = 0; i < n; i++)
          redoStack.push(hist[hist.length - 1 - i]!.effect);
        control(() =>
          ctx!.dispatchEffect(
            n === 1
              ? { plugin: "store", type: "undo" }
              : { plugin: "store", type: "undo", steps: n },
          ),
        );
        break;
      }
      case "redo": {
        const change = redoStack.pop();
        if (change) control(() => ctx!.dispatchEffect(change));
        break;
      }
      case "restoreTo":
        redoStack.length = 0;
        control(() =>
          ctx!.dispatchEffect({
            plugin: "store",
            type: "restoreTo",
            timestamp: Number(d.timestamp),
          }),
        );
        break;
    }
  });

  const debugPlugin: Plugin = {
    name: "debug",
    // Nothing targets "debug"; the plugin exists for `init` and `onState`.
    handle() {},
    init(c) {
      ctx = c;
    },
    onState(state) {
      onStateChanged(state);
    },
  };

  const watch = (plugins: Plugin<any, any>[]): void => {
    watched = true;
    for (const p of plugins) {
      if (p === debugPlugin) continue;
      pluginNames.push(p.name);
      if (p.name === "store") store = p as StorePlugin<any>;
      const orig = p.handle.bind(p);
      p.handle = (effect: any, c: any): void => {
        const top = stack[stack.length - 1];
        const rec = top?.recs[top.next++];
        const t0 = mono();
        const prevHandling = handling;
        handling = p.name;
        try {
          orig(effect, c);
        } finally {
          handling = prevHandling;
          if (rec) rec.dur = ms(mono() - t0);
          if (top && top.left > 0 && --top.left === 0) postStep(top);
        }
      };
    }
  };

  try {
    const g = globalThis as { __pavlusDebug?: unknown[] };
    (g.__pavlusDebug ??= []).push({ id: appId, events });
  } catch {
    /* not a real environment */
  }

  return {
    plugin: debugPlugin,
    onStep,
    watch,
    agent: {
      id: appId,
      recorded: () => events.length,
    },
  };
}
