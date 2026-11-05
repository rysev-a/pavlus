// The simulation engine: `simulate(model, scenario, seed)` is a pure function that
// plays the designed flow in virtual time and returns the trace, a list of steps.
// The animation, the debugger, the timeline and the generated tests only read the
// trace; nothing here touches the DOM, the clock or Math.random (the seed makes the
// latencies, so the same inputs give the same trace).
//
// The rules follow pavlus-server (server/DESIGN.md):
//  - a token is a message with a context: the `rid` of the request rides on every
//    step and on every reply, so interleaved requests never mix;
//  - a handler writes to `state.requests[rid]` and `state.shared` when a message
//    reaches it, then emits the effects on its outgoing edges whose condition holds;
//  - a plugin effect takes time (latency of the plugin, or a fault), then replies
//    on its reply edge or its error edge (`onError`);
//  - when the client aborts, the request ends or the deadline passes, the runtime
//    cancels the in-flight effects of that `rid`, rolls back an open transaction
//    and drops what arrives for it later.
import {
  type EdgeKind,
  type Fault,
  type FlowEdge,
  type FlowNode,
  type Model,
  type PayloadField,
  type RequestSpec,
  type Scenario,
  DEFAULT_ERROR_CODE,
  DEFAULT_LATENCY,
  DEFAULT_TIMEOUT,
  condHolds,
  effectDef,
  exampleValue,
  findNode,
  getDeep,
  inEdges,
  laneOf,
  outEdges,
  payloadOf,
  setDeep,
} from "./model.ts";

export type StepType =
  | "start"
  | "message"
  | "effect"
  | "work"
  | "reply"
  | "error"
  | "cancel"
  | "abort"
  | "timeout"
  | "drop"
  | "rollback"
  | "retry"
  | "done"
  | "budget";

export type StepStatus =
  "ok" | "error" | "cancelled" | "timeout" | "dropped" | "retry";

export interface Step {
  i: number;
  /** virtual time (ms) when the step completes */
  t: number;
  /** virtual time when it started: `t - tStart` is how long the hop took */
  tStart: number;
  rid: string;
  type: StepType;
  /** the edge it travels (a generated `cancel:<node>` / `abort:<rid>` for the runtime's own) */
  edge: string;
  from: string;
  to: string;
  /** how it is drawn: the kind of the edge, `work` (a plugin busy) or `note` */
  kind: EdgeKind | "work" | "note";
  /** the message id or the effect type */
  label: string;
  payload: unknown;
  /** the effect emitted, as the plugin would receive it */
  effect: Record<string, unknown> | null;
  /** `state.requests[rid]` after the step (null: the request slice is gone) */
  req: Record<string, unknown> | null;
  shared: Record<string, unknown>;
  client: Record<string, unknown>;
  status: StepStatus;
  note: string;
  /** the id of the fault that changed this step, or "" */
  fault: string;
  /** the nodes where work of this request is in flight after the step */
  inflight: string[];
  /** the `rid` is in the context of this step */
  ctx: boolean;
}

export type Trace = Step[];

export type Result =
  "responded" | "aborted" | "timeout" | "failed" | "incomplete" | "completed";

export interface Outcome {
  rid: string;
  result: Result;
  /** the http status that was sent, 0 when none */
  status: number;
  startedAt: number;
  endedAt: number;
  ms: number;
  steps: number;
  cancelled: number;
  dropped: number;
}

// ---- helpers ----

/** mulberry32: a small seeded generator, so a trace can be replayed exactly */
export function rngOf(seed: number | string): () => number {
  let h = 1779033703 ^ String(seed).length;
  for (const c of String(seed)) {
    h = Math.imul(h ^ c.charCodeAt(0), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clone = <T>(v: T): T =>
  v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T);
const round = (n: number): number => Math.round(n * 100) / 100;

interface Scope {
  payload: unknown;
  req: Record<string, unknown> | null;
  shared: Record<string, unknown>;
  client: Record<string, unknown>;
  rid: string;
}

function lookup(scope: Scope, path: string): unknown {
  const [head, ...rest] = path.split(".");
  const tail = rest.join(".");
  const pick = (v: unknown): unknown => (tail ? getDeep(v, tail) : v);
  switch (head) {
    case "payload":
      return pick(scope.payload);
    case "req":
      return pick(scope.req ?? {});
    case "shared":
      return pick(scope.shared);
    case "client":
      return pick(scope.client);
    case "rid":
      return scope.rid;
  }
  for (const src of [scope.req, scope.payload, scope.shared, scope.client]) {
    const v = getDeep(src, path);
    if (v !== undefined) return v;
  }
  return undefined;
}

const REF = /\{([A-Za-z_][\w.]*)\}/g;

/** `{payload.body.email}` -> the value; text with references -> text; else a literal */
export function fill(template: string, scope: Scope): unknown {
  const whole = /^\{([A-Za-z_][\w.]*)\}$/.exec(template.trim());
  if (whole) {
    const v = lookup(scope, whole[1]);
    return v === undefined ? template : v;
  }
  if (REF.test(template)) {
    REF.lastIndex = 0;
    return template.replace(REF, (m, p: string) => {
      const v = lookup(scope, p);
      return v === undefined
        ? m
        : typeof v === "object"
          ? JSON.stringify(v)
          : String(v);
    });
  }
  REF.lastIndex = 0;
  return literal(template);
}

/** `12` -> 12, `true` -> true, `null` -> null, `{"a":1}` -> object; else the text */
export function literal(text: string): unknown {
  const t = text.trim();
  if (t === "") return "";
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  if (t === "true" || t === "false") return t === "true";
  if (t === "null") return null;
  if ((t.startsWith("{") || t.startsWith("[")) && t.length > 1) {
    try {
      return JSON.parse(t);
    } catch {
      return text;
    }
  }
  return text;
}

/**
 * A JSON text with `{refs}` (a response body): a reference that stands for a whole
 * value keeps its type, one inside a string is interpolated. Text that is not JSON
 * is read as a plain template.
 */
export function jsonFill(text: string, scope: Scope): unknown {
  const refs: string[] = [];
  let out = "";
  let inStr = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "\\" && inStr) {
      out += c + (text[++i] ?? "");
      continue;
    }
    if (c === '"') inStr = !inStr;
    if (c === "{") {
      const m = /^\{([A-Za-z_][\w.]*)\}/.exec(text.slice(i));
      if (m) {
        refs.push(m[1]);
        const tag = `\u00a7${refs.length - 1}\u00a7`;
        out += inStr ? tag : `"${tag}"`;
        i += m[0].length - 1;
        continue;
      }
    }
    out += c;
  }
  let value: unknown;
  try {
    value = JSON.parse(out);
  } catch {
    return fill(text, scope);
  }
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") {
      const whole = /^\u00a7(\d+)\u00a7$/.exec(v);
      if (whole) {
        const r = lookup(scope, refs[Number(whole[1])]);
        return r === undefined ? `{${refs[Number(whole[1])]}}` : r;
      }
      return v.replace(/\u00a7(\d+)\u00a7/g, (_, n: string) => {
        const r = lookup(scope, refs[Number(n)]);
        return r === undefined
          ? `{${refs[Number(n)]}}`
          : typeof r === "object"
            ? JSON.stringify(r)
            : String(r);
      });
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object")
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>).map(([k, x]) => [
          k,
          walk(x),
        ]),
      );
    return v;
  };
  return walk(value);
}

function payloadWith(fields: PayloadField[], scope: Scope): unknown {
  const o: Record<string, unknown> = {};
  for (const f of fields) {
    if (!f.name) continue;
    setDeep(
      o,
      f.name,
      f.type === "string" || !f.example.includes("{")
        ? f.example.includes("{")
          ? fill(f.example, scope)
          : exampleValue(f)
        : fill(f.example, scope),
    );
  }
  return o;
}

// ---- the scenario ----

/** One request per entry of the design when the scenario names none. */
export function defaultRequests(m: Model): RequestSpec[] {
  const starts = m.nodes.filter(
    (n) =>
      (n.kind === "ui-event" ||
        (n.kind === "external" && n.plugin === "http")) &&
      inEdges(m, n.id).length === 0 &&
      outEdges(m, n.id).length > 0,
  );
  return starts
    .slice(0, 1)
    .map((n) => ({ rid: "r1", entry: n.id, at: 0, payload: {} }));
}

export function requestsOf(m: Model, s: Scenario): RequestSpec[] {
  const valid = s.requests.filter((r) => findNode(m, r.entry));
  return valid.length ? valid : defaultRequests(m);
}

function startPayload(r: RequestSpec): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r.payload ?? {}))
    setDeep(o, k, literal(v));
  return o;
}

// ---- the simulation ----

type Arrival = {
  kind: "arrive";
  t: number;
  tStart: number;
  seq: number;
  rid: string;
  node: string;
  edge: FlowEdge | null;
  /** a synthetic edge of the runtime (cancel / abort / timeout) */
  synth?: { id: string; from: string; kind: EdgeKind; label: string };
  payload: unknown;
  late: boolean;
};
type Finish = {
  kind: "finish";
  t: number;
  seq: number;
  rid: string;
  flight: number;
};
type Signal = {
  kind: "abort" | "deadline";
  t: number;
  seq: number;
  rid: string;
  fault: string;
};
type Ev = Arrival | Finish | Signal;

interface Flight {
  id: number;
  node: FlowNode;
  edge: FlowEdge | null;
  tStart: number;
  tEnd: number;
  attempt: number;
  outcome: "ok" | "error" | "timeout";
  error: { code: string; message: string; constraint?: string } | null;
  fault: string;
  payload: unknown;
}

interface Ctx {
  rid: string;
  spec: RequestSpec;
  req: Record<string, unknown> | null;
  client: Record<string, unknown>;
  cancelled: boolean;
  responded: boolean;
  done: boolean;
  route: string;
  entered: boolean;
  inflight: Map<number, Flight>;
  tx: { node: string; id: string } | null;
  budget: number;
  startedAt: number;
  status: number;
  result: Result;
  /** the last time something happened to this request */
  lastT: number;
  /** a websocket frame was sent: the request is answered */
  sent: boolean;
}

export const MESSAGE_BUDGET = 80;
export const STEP_LIMIT = 4000;

export function simulate(
  model: Model,
  scenario: Scenario,
  seed: number | string = scenario.seed,
): Trace {
  const rng = rngOf(seed);
  const steps: Step[] = [];
  const queue: Ev[] = [];
  const shared: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(model.shared)) shared[k] = literal(v);
  const ctxs = new Map<string, Ctx>();
  let seq = 0;
  let flightSeq = 0;
  let clock = 0;

  const faults = scenario.faults.filter((f) => f.on);
  const hold = (c: string): boolean =>
    condHolds(c, model.conds, scenario.conds);

  const enqueue = (ev: Ev): void => {
    let i = queue.length;
    while (
      i > 0 &&
      (queue[i - 1].t > ev.t ||
        (queue[i - 1].t === ev.t && queue[i - 1].seq > ev.seq))
    )
      i--;
    queue.splice(i, 0, ev);
  };

  const scopeOf = (ctx: Ctx, payload: unknown): Scope => ({
    payload,
    req: ctx.req,
    shared,
    client: ctx.client,
    rid: ctx.rid,
  });

  const flightNodes = (ctx: Ctx): string[] => [
    ...new Set([...ctx.inflight.values()].map((f) => f.node.id)),
  ];

  const push = (
    ctx: Ctx,
    s: Partial<Step> & Pick<Step, "type" | "t" | "from" | "to" | "label">,
  ): Step => {
    const step: Step = {
      i: steps.length,
      tStart: s.t,
      rid: ctx.rid,
      edge: "",
      kind: "note",
      payload: undefined,
      effect: null,
      status: "ok",
      note: "",
      fault: "",
      ctx: true,
      ...s,
      req: ctx.req ? clone(ctx.req) : null,
      shared: clone(shared),
      client: clone(ctx.client),
      inflight: flightNodes(ctx),
    };
    steps.push(step);
    ctx.lastT = Math.max(ctx.lastT, step.t);
    clock = Math.max(clock, step.t);
    return step;
  };

  const latencyOf = (n: FlowNode): number => {
    if (n.latency > 0) return n.latency;
    if (n.kind === "effect" && n.plugin === "timer") {
      const ms = Number(n.detail.trim());
      return Number.isFinite(ms) && ms > 0 ? ms : 1000;
    }
    return model.latency[n.plugin] ?? DEFAULT_LATENCY[n.plugin] ?? 1;
  };

  /** the delay of a delivery along an edge */
  const hopDelay = (e: FlowEdge, from: FlowNode, to: FlowNode): number => {
    if (e.latency > 0) return e.latency;
    const net = model.latency.net ?? DEFAULT_LATENCY.net;
    const app = model.latency.app ?? DEFAULT_LATENCY.app;
    if (to.kind === "route") return net;
    if (laneOf(from) !== "browser" && laneOf(to) === "browser") return net;
    if (e.kind === "effect" || from.kind === "effect") return 0;
    if (laneOf(from) === "app" && laneOf(to) === "app") return app;
    return 0;
  };

  const replyEdge = (n: FlowNode): FlowEdge | undefined =>
    outEdges(model, n.id).find((e) => e.kind === "reply" && hold(e.cond));
  const errorEdge = (n: FlowNode): FlowEdge | undefined =>
    outEdges(model, n.id).find((e) => e.kind === "error" && hold(e.cond));

  /** the effect as the plugin receives it (a description, for the debugger) */
  const effectOf = (
    ctx: Ctx,
    n: FlowNode,
    payload: unknown,
  ): Record<string, unknown> => {
    const sc = scopeOf(ctx, payload);
    const replyTo = replyEdge(n)?.msg;
    const onError = errorEdge(n)?.msg;
    const detail = String(fill(n.detail, sc) ?? "");
    const base = {
      ...(replyTo ? { replyTo } : {}),
      ...(onError ? { onError } : {}),
      ctx: { rid: ctx.rid, conn: "http" },
    };
    const [plugin, ...rest] = n.title.split(".");
    const type = rest.join(".") || n.title;
    switch (n.title) {
      case "pg.query":
        return {
          plugin: "pg",
          type: "query",
          sql: detail,
          params: [],
          ...base,
        };
      case "redis.cmd":
        return {
          plugin: "redis",
          type: "cmd",
          args: detail.split(/\s+/).filter(Boolean),
          ...base,
        };
      case "redis.pipeline":
        return {
          plugin: "redis",
          type: "pipeline",
          cmds: detail
            .split(";")
            .map((c) => c.trim().split(/\s+/))
            .filter((c) => c[0]),
          ...base,
        };
      case "fetch.request": {
        const m = /^([A-Z]+)\s+(\S+)/.exec(detail);
        return {
          plugin: "fetch",
          type: "request",
          method: m?.[1] ?? "GET",
          url: m?.[2] ?? detail,
          ...(n.timeoutMs ? { timeoutMs: n.timeoutMs } : {}),
          ...base,
        };
      }
      case "timer.after":
        return {
          plugin: "time",
          type: "timer.after",
          ms: latencyOf(n),
          ...base,
        };
      case "http.respond": {
        const body = jsonFill(n.detail || "{}", sc);
        return {
          plugin: "http",
          type: "respond",
          status: n.status || 200,
          json: body,
          ctx: base.ctx,
        };
      }
      case "log":
        return { plugin: "log", type: "log", msg: detail, ctx: base.ctx };
    }
    return {
      plugin: plugin === "timer" ? "time" : plugin,
      type,
      ...(detail ? { detail } : {}),
      ...base,
    };
  };

  const ensureSlice = (ctx: Ctx, n: FlowNode, payload: unknown): void => {
    if (laneOf(n) === "browser" || n.kind === "external") return;
    if (!ctx.req) ctx.req = {};
    if (n.kind === "route" && ctx.req.route === undefined) {
      const m = /^(\w+)\s+(\S+)/.exec(n.title);
      ctx.req.route = n.detail || n.title;
      ctx.req.http = {
        method: m?.[1] ?? "GET",
        path: m?.[2] ?? n.title,
        ...(typeof payload === "object" && payload !== null ? payload : {}),
      };
      ctx.req.step = "";
      ctx.route = ctx.route || n.id;
    }
  };

  const applySets = (ctx: Ctx, n: FlowNode, payload: unknown): void => {
    const sc = () => scopeOf(ctx, payload);
    if (Object.keys(n.reqSet).length) {
      if (!ctx.req) ctx.req = {};
      for (const [k, v] of Object.entries(n.reqSet))
        setDeep(ctx.req, k, fill(v, sc()));
    }
    for (const [k, v] of Object.entries(n.sharedSet))
      setDeep(shared, k, fill(v, sc()));
    for (const [k, v] of Object.entries(n.clientSet))
      setDeep(ctx.client, k, fill(v, sc()));
    if (n.kind === "fe-state") {
      const key = n.title.trim();
      if (key)
        setDeep(
          ctx.client,
          key,
          n.detail ? fill(n.detail, sc()) : (payload ?? null),
        );
    }
  };

  // ---- cancellation ----

  /** cancels the in-flight work of the request, rolls back its open transaction */
  const cancelWork = (ctx: Ctx, t: number, why: string): void => {
    const origin = ctx.route || ctx.spec.entry;
    for (const f of [...ctx.inflight.values()]) {
      ctx.inflight.delete(f.id);
      push(ctx, {
        type: "cancel",
        t,
        tStart: f.tStart,
        edge: `cancel:${f.node.id}`,
        from: origin,
        to: f.node.id,
        kind: "cancel",
        label: `cancel ${f.node.title}`,
        status: "cancelled",
        note: `${f.node.title} was in flight for ${ctx.rid} (${why}): the plugin cancels it and its reply is discarded`,
      });
    }
    if (ctx.tx) {
      const tx = ctx.tx;
      ctx.tx = null;
      if (ctx.req) delete ctx.req.tx;
      push(ctx, {
        type: "rollback",
        t,
        edge: `cancel:${tx.node}`,
        from: origin,
        to: tx.node,
        kind: "cancel",
        label: "pg.tx.rollback (automatic)",
        note: `transaction ${tx.id} was open when the request ended: the pg plugin rolls it back`,
      });
    }
  };

  const finishRequest = (
    ctx: Ctx,
    t: number,
    result: Result,
    status: number,
    why: string,
  ): void => {
    if (ctx.done) return;
    ctx.done = true;
    ctx.result = result;
    ctx.status = status;
    cancelWork(ctx, t, why);
    ctx.req = null;
    push(ctx, {
      type: "done",
      t,
      from: ctx.route || ctx.spec.entry,
      to: ctx.route || ctx.spec.entry,
      label: "request.done",
      payload: { result, status },
      note: `request ${ctx.rid} is done (${result}${status ? ` ${status}` : ""}): its slice is dropped, later messages for it are dropped`,
    });
  };

  /** the runtime answers when the app did not (an unhandled error, a deadline) */
  const respondImplicit = (
    ctx: Ctx,
    t: number,
    status: number,
    result: Result,
    why: string,
  ): void => {
    if (ctx.responded || ctx.done) return;
    ctx.responded = true;
    finishRequest(ctx, t, result, status, why);
  };

  // ---- delivery ----

  const emit = (
    ctx: Ctx,
    n: FlowNode,
    t: number,
    payload: unknown,
    late: boolean,
    kinds?: EdgeKind[],
  ): void => {
    for (const e of outEdges(model, n.id)) {
      if (kinds && !kinds.includes(e.kind)) continue;
      if (!hold(e.cond)) continue;
      const to = findNode(model, e.to);
      if (!to) continue;
      const pl =
        e.payload.length === 0
          ? payload
          : payloadWith(e.payload, scopeOf(ctx, payload));
      enqueue({
        kind: "arrive",
        t: t + hopDelay(e, n, to),
        tStart: t,
        seq: seq++,
        rid: ctx.rid,
        node: to.id,
        edge: e,
        payload: pl,
        late,
      });
    }
  };

  // ---- plugin work ----

  const faultsFor = (n: FlowNode, rid: string): Fault[] =>
    faults.filter(
      (f) =>
        (f.kind === "error" || f.kind === "timeout" || f.kind === "slow") &&
        (f.rid === "" || f.rid === rid) &&
        (f.target === n.id || f.target === `plugin:${n.plugin}`),
    );

  const plan = (
    ctx: Ctx,
    n: FlowNode,
    edge: FlowEdge | null,
    payload: unknown,
    t: number,
    attempt: number,
  ): void => {
    const base0 = latencyOf(n);
    const base =
      n.plugin === "timer" ? base0 : round(base0 * (0.9 + 0.2 * rng()));
    const hits = faultsFor(n, ctx.rid);
    const slow = hits.find((f) => f.kind === "slow");
    const tmo = hits.find((f) => f.kind === "timeout");
    const err = hits.find(
      (f) => f.kind === "error" && (f.ms === 0 || attempt < f.ms),
    );
    const limit = n.timeoutMs || DEFAULT_TIMEOUT[n.plugin] || 0;
    let dur = base + (slow ? slow.ms || 1500 : 0);
    let outcome: Flight["outcome"] = "ok";
    let error: Flight["error"] = null;
    let fault = slow?.id ?? "";
    if (tmo) {
      dur = limit || tmo.ms || 1000;
      outcome = "timeout";
      error = {
        code: "ETIMEDOUT",
        message: `${n.title} timed out after ${dur}ms`,
      };
      fault = tmo.id;
    } else if (limit > 0 && dur > limit && n.plugin !== "timer") {
      dur = limit;
      outcome = "timeout";
      error = {
        code: "ETIMEDOUT",
        message: `${n.title} timed out after ${dur}ms`,
      };
    } else if (err) {
      outcome = "error";
      const code = err.code || DEFAULT_ERROR_CODE[n.plugin] || "ERR";
      error = {
        code,
        message:
          n.plugin === "pg"
            ? `postgres error ${code}`
            : `${n.title} failed (${code})`,
        ...(code === "23505" ? { constraint: "users_email_key" } : {}),
      };
      dur = base;
      fault = err.id;
    }
    const f: Flight = {
      id: ++flightSeq,
      node: n,
      edge,
      tStart: t,
      tEnd: round(t + dur),
      attempt,
      outcome,
      error,
      fault,
      payload,
    };
    ctx.inflight.set(f.id, f);
    enqueue({
      kind: "finish",
      t: f.tEnd,
      seq: seq++,
      rid: ctx.rid,
      flight: f.id,
    });
  };

  const finish = (ev: Finish): void => {
    const ctx = ctxs.get(ev.rid)!;
    const f = ctx.inflight.get(ev.flight);
    if (!f) return; // cancelled meanwhile
    ctx.inflight.delete(f.id);
    const n = f.node;
    const t = ev.t;
    const ok = f.outcome === "ok";
    // the failure policy: retry before the error reaches the app
    if (!ok && f.attempt < n.retries) {
      push(ctx, {
        type: "retry",
        t,
        tStart: f.tStart,
        from: n.id,
        to: n.id,
        kind: "work",
        label: `${n.title} failed, retry ${f.attempt + 1} of ${n.retries}`,
        payload: f.error,
        status: "retry",
        fault: f.fault,
        note: `${n.title} failed (${f.error?.code}); the plugin retries after ${n.backoffMs * 2 ** f.attempt}ms`,
      });
      plan(
        ctx,
        n,
        f.edge,
        f.payload,
        round(t + n.backoffMs * 2 ** f.attempt),
        f.attempt + 1,
      );
      return;
    }
    const def = effectDef(n.title);
    const sc = scopeOf(ctx, f.payload);
    // transactions
    if (ok && n.title === "pg.tx.begin") {
      ctx.tx = { node: n.id, id: `tx${ctx.rid}` };
      if (!ctx.req) ctx.req = {};
      ctx.req.tx = ctx.tx.id;
    }
    if (ok && (n.title === "pg.tx.commit" || n.title === "pg.tx.rollback")) {
      ctx.tx = null;
      if (ctx.req) delete ctx.req.tx;
    }
    if (!ok && n.title === "pg.tx.begin") ctx.tx = null;
    const res = (() => {
      const re = replyEdge(n);
      return re && re.payload.length
        ? payloadWith(re.payload, sc)
        : n.title === "pg.query"
          ? { rows: [], rowCount: 0 }
          : {};
    })();
    push(ctx, {
      type: "work",
      t,
      tStart: f.tStart,
      from: n.id,
      to: n.id,
      kind: "work",
      label: `${n.title} ${round(t - f.tStart)}ms`,
      payload: ok ? res : f.error,
      status: ok ? "ok" : f.outcome === "timeout" ? "timeout" : "error",
      fault: f.fault,
      note: ok
        ? `${n.title} finished in ${round(t - f.tStart)}ms`
        : `${n.title} failed after ${round(t - f.tStart)}ms: ${f.error?.code}`,
    });
    if (!ok) {
      const ee = errorEdge(n);
      if (!ee) {
        push(ctx, {
          type: "error",
          t,
          from: n.id,
          to: n.id,
          kind: "error",
          label: "no onError",
          payload: f.error,
          status: "error",
          ctx: true,
          note: `${n.title} failed and has no onError target: the runtime answers 500 and ends the request`,
        });
        respondImplicit(ctx, t, 500, "failed", "unhandled error");
        return;
      }
      // the error message carries the real error
      enqueue({
        kind: "arrive",
        t,
        tStart: t,
        seq: seq++,
        rid: ctx.rid,
        node: ee.to,
        edge: ee,
        payload: f.error,
        late: false,
      });
      return;
    }
    if (def?.responds) {
      respond(ctx, n, t, sc);
      return;
    }
    if (n.plugin === "ws" && !ctx.cancelled) ctx.sent = true;
    // fire-and-forget effects have no reply; the others reply with a payload
    for (const e of outEdges(model, n.id)) {
      if (e.kind !== "reply" || !hold(e.cond)) continue;
      const to = findNode(model, e.to);
      if (!to) continue;
      enqueue({
        kind: "arrive",
        t: t + hopDelay(e, n, to),
        tStart: t,
        seq: seq++,
        rid: ctx.rid,
        node: to.id,
        edge: e,
        payload: e.payload.length ? payloadWith(e.payload, sc) : res,
        late: false,
      });
    }
    // an effect that goes on to an external or the like
    emit(ctx, n, t, res, false, ["effect"]);
  };

  const respond = (ctx: Ctx, n: FlowNode, t: number, sc: Scope): void => {
    if (ctx.cancelled || ctx.responded) {
      push(ctx, {
        type: "drop",
        t,
        from: n.id,
        to: n.id,
        kind: "note",
        label: n.title,
        status: "dropped",
        note: ctx.cancelled
          ? "the client is gone: http.respond has no connection to write to"
          : "the request was already answered",
      });
      return;
    }
    ctx.responded = true;
    const status = n.status || 200;
    const body = jsonFill(n.detail || "{}", sc);
    // the response travels to the browser
    emit(ctx, n, t, { status, body }, false, ["reply"]);
    finishRequest(
      ctx,
      t,
      status >= 500 ? "failed" : "responded",
      status,
      "response sent",
    );
  };

  // ---- the main loop ----

  const arrive = (ev: Arrival): void => {
    const ctx = ctxs.get(ev.rid)!;
    const n = findNode(model, ev.node);
    if (!n) return;
    const t = ev.t;
    const e = ev.edge;
    const synth = ev.synth;
    const server = laneOf(n) === "app" || laneOf(n) === "plugins";
    if (server && (ctx.cancelled || ctx.done) && !ev.late) {
      push(ctx, {
        type: "drop",
        t,
        tStart: ev.tStart,
        edge: e?.id ?? synth?.id ?? "",
        from: e?.from ?? synth?.from ?? n.id,
        to: n.id,
        kind: e?.kind ?? "note",
        label: e?.msg ?? n.title,
        payload: ev.payload,
        status: "dropped",
        note: ctx.cancelled
          ? `${ctx.rid} is cancelled: the message ${e?.msg ?? n.title} is dropped and counted`
          : `${ctx.rid} is done: the message ${e?.msg ?? n.title} is dropped and counted`,
      });
      return;
    }
    if (server && ++ctx.budget > MESSAGE_BUDGET) {
      push(ctx, {
        type: "budget",
        t,
        from: e?.from ?? n.id,
        to: n.id,
        label: "message budget",
        status: "error",
        note: `${ctx.rid} used its message budget (${MESSAGE_BUDGET}): the runtime stops it. Is there a loop in the design?`,
      });
      respondImplicit(ctx, t, 500, "failed", "message budget");
      return;
    }
    if (server) ctx.entered = true;
    ensureSlice(ctx, n, ev.payload);
    applySets(ctx, n, ev.payload);
    const timedOut = synth?.id.startsWith("timeout:") ?? false;
    // an effect is in flight from the moment it arrives
    if (n.kind === "effect") plan(ctx, n, e, ev.payload, t, 0);
    const type: StepType = timedOut
      ? "timeout"
      : synth?.kind === "cancel"
        ? "abort"
        : n.kind === "effect"
          ? "effect"
          : e?.kind === "reply"
            ? "reply"
            : e?.kind === "error"
              ? "error"
              : "message";
    push(ctx, {
      type,
      t,
      tStart: ev.tStart,
      edge: e?.id ?? synth?.id ?? "",
      from: e?.from ?? synth?.from ?? n.id,
      to: n.id,
      kind: e?.kind ?? synth?.kind ?? "note",
      label: e?.msg ?? synth?.label ?? n.title,
      payload: ev.payload,
      effect: n.kind === "effect" ? effectOf(ctx, n, ev.payload) : null,
      status: timedOut ? "timeout" : "ok",
      ctx: e ? e.rid : true,
      note: timedOut
        ? `the deadline of ${ctx.rid} passed: the runtime delivers request.timeout to ${n.title}`
        : describe(n, e, ctx),
    });
    switch (n.kind) {
      case "effect":
      case "external":
        break;
      default:
        emit(ctx, n, t, ev.payload, ev.late);
    }
  };

  const describe = (n: FlowNode, e: FlowEdge | null, ctx: Ctx): string => {
    const via = e ? `${e.kind} ${e.msg}` : "start";
    switch (n.kind) {
      case "route":
        return `${via} reaches ${n.title}; the http plugin minted ${ctx.rid} and the context rides on it`;
      case "handler":
      case "reply":
      case "error":
        return `${via} is handled by ${n.title} (pure: message in, effects out)`;
      case "effect":
        return `${n.title} is emitted with ctx.rid=${ctx.rid}`;
      case "fe-state":
        return `state key ${n.title} is set in the browser`;
      case "fe-handler":
        return `${via} reaches the frontend handler ${n.title}`;
      case "ui-event":
        return `the user triggers ${n.title}`;
      default:
        return `${via} reaches ${n.title}`;
    }
  };

  // seed the requests
  const reqs = requestsOf(model, scenario);
  for (const r of reqs) {
    const entry = findNode(model, r.entry);
    if (!entry || ctxs.has(r.rid)) continue;
    const ctx: Ctx = {
      rid: r.rid,
      spec: r,
      req: null,
      client: {},
      cancelled: false,
      responded: false,
      done: false,
      route: "",
      entered: false,
      inflight: new Map(),
      tx: null,
      budget: 0,
      startedAt: r.at,
      status: 0,
      result: "incomplete",
      lastT: r.at,
      sent: false,
    };
    ctxs.set(r.rid, ctx);
    enqueue({
      kind: "arrive",
      t: r.at,
      tStart: r.at,
      seq: seq++,
      rid: r.rid,
      node: entry.id,
      edge: null,
      payload: startPayload(r),
      late: false,
    });
    for (const f of faults) {
      if (f.rid !== "" && f.rid !== r.rid) continue;
      if (f.kind === "abort")
        enqueue({
          kind: "abort",
          t: r.at + (f.ms || 30),
          seq: seq++,
          rid: r.rid,
          fault: f.id,
        });
      if (f.kind === "deadline")
        enqueue({
          kind: "deadline",
          t: r.at + (f.ms || 200),
          seq: seq++,
          rid: r.rid,
          fault: f.id,
        });
    }
  }

  while (queue.length && steps.length < STEP_LIMIT) {
    const ev = queue.shift()!;
    const ctx = ctxs.get(ev.rid);
    if (!ctx) continue;
    switch (ev.kind) {
      case "arrive": {
        // the very first arrival of a request is its start
        if (
          ev.edge === null &&
          !ev.synth &&
          steps.every((s) => s.rid !== ev.rid)
        ) {
          const n = findNode(model, ev.node)!;
          applySets(ctx, n, ev.payload);
          push(ctx, {
            type: "start",
            t: ev.t,
            from: n.id,
            to: n.id,
            label: n.title,
            note: `request ${ctx.rid} starts at ${n.title}`,
          });
          emit(ctx, n, ev.t, ev.payload, false);
        } else arrive(ev);
        break;
      }
      case "finish":
        finish(ev);
        break;
      case "abort": {
        if (ctx.done || ctx.cancelled) break;
        if (!ctx.entered && ctx.inflight.size === 0 && !ctx.route) {
          // the client gave up before the request reached the server
          ctx.cancelled = true;
          finishRequest(ctx, ev.t, "aborted", 0, "client aborted");
          break;
        }
        ctx.cancelled = true;
        push(ctx, {
          type: "abort",
          t: ev.t,
          edge: `abort:${ctx.rid}`,
          from: ctx.spec.entry,
          to: ctx.route || ctx.spec.entry,
          kind: "cancel",
          label: "http.aborted",
          fault: ev.fault,
          status: "cancelled",
          note: `the client of ${ctx.rid} went away before the response: the http plugin tells the runtime`,
        });
        cancelWork(ctx, ev.t, "client aborted");
        // the app may still hear about it (log, metrics)
        const h = model.nodes.find(
          (x) => x.kind === "handler" && x.title === "http.aborted",
        );
        if (h)
          enqueue({
            kind: "arrive",
            t: ev.t,
            tStart: ev.t,
            seq: seq++,
            rid: ctx.rid,
            node: h.id,
            edge: null,
            synth: {
              id: `abortmsg:${ctx.rid}`,
              from: ctx.route || ctx.spec.entry,
              kind: "request",
              label: "http.aborted",
            },
            payload: { rid: ctx.rid },
            late: true,
          });
        finishRequest(ctx, ev.t, "aborted", 0, "client aborted");
        break;
      }
      case "deadline": {
        if (ctx.done || ctx.responded || ctx.cancelled) break;
        const h = model.nodes.find(
          (x) => x.kind === "handler" && x.title === "request.timeout",
        );
        if (h) {
          enqueue({
            kind: "arrive",
            t: ev.t,
            tStart: ev.t,
            seq: seq++,
            rid: ctx.rid,
            node: h.id,
            edge: null,
            synth: {
              id: `timeout:${ctx.rid}`,
              from: ctx.route || ctx.spec.entry,
              kind: "error",
              label: "request.timeout",
            },
            payload: { deadline: true },
            late: false,
          });
        } else {
          push(ctx, {
            type: "timeout",
            t: ev.t,
            edge: `timeout:${ctx.rid}`,
            from: ctx.route || ctx.spec.entry,
            to: ctx.route || ctx.spec.entry,
            kind: "error",
            label: "request.timeout",
            fault: ev.fault,
            status: "timeout",
            note: `the deadline of ${ctx.rid} passed and no handler takes request.timeout: the runtime answers 504`,
          });
          respondImplicit(ctx, ev.t, 504, "timeout", "deadline");
        }
        break;
      }
    }
  }

  // requests that ended without a reply of the app
  for (const ctx of ctxs.values()) {
    if (ctx.done) continue;
    const t = ctx.lastT;
    if (!ctx.entered && ctx.inflight.size === 0)
      finishRequest(ctx, t, "completed", 0, "end of the flow");
    else if (ctx.sent) finishRequest(ctx, t, "responded", 0, "frames sent");
    else
      finishRequest(
        ctx,
        t,
        "incomplete",
        0,
        "the flow ended without http.respond",
      );
  }
  return steps;
}

// ---- reading a trace ----

export function outcomes(trace: Trace): Outcome[] {
  const rids = [...new Set(trace.map((s) => s.rid))];
  return rids.map((rid) => {
    const mine = trace.filter((s) => s.rid === rid);
    const done = mine.find((s) => s.type === "done");
    const p = (done?.payload ?? {}) as { result?: Result; status?: number };
    const startedAt = mine[0]?.tStart ?? 0;
    const endedAt = mine[mine.length - 1]?.t ?? 0;
    return {
      rid,
      result: p.result ?? "incomplete",
      status: p.status ?? 0,
      startedAt,
      endedAt,
      ms: round(endedAt - startedAt),
      steps: mine.length,
      cancelled: mine.filter((s) => s.status === "cancelled").length,
      dropped: mine.filter((s) => s.status === "dropped").length,
    };
  });
}

export const ridsOf = (trace: Trace): string[] => [
  ...new Set(trace.map((s) => s.rid)),
];

/** the steps of one request, in order */
export const stepsOf = (trace: Trace, rid: string): Step[] =>
  trace.filter((s) => s.rid === rid);

/** The newest step of each request up to (and including) `pos`. */
export function tokensAt(
  trace: Trace,
  pos: number,
): { rid: string; step: Step }[] {
  const last = new Map<string, Step>();
  for (let i = 0; i <= pos && i < trace.length; i++)
    last.set(trace[i].rid, trace[i]);
  return [...last].map(([rid, step]) => ({ rid, step }));
}

/** The trace as plain text, one line per step (tests, logs, the clipboard). */
export function traceText(trace: Trace): string {
  return trace
    .map(
      (s) =>
        `${String(s.i).padStart(3)} ${s.t.toFixed(1).padStart(8)}ms ${s.rid} ${s.type.padEnd(8)} ${s.label}${s.status === "ok" ? "" : ` [${s.status}]`}`,
    )
    .join("\n");
}

// ---- the variants of a design: the happy path and each fault path ----

export interface Variant {
  id: string;
  title: string;
  scenario: Scenario;
}

/**
 * The scenarios worth a test, for each request of the scenario that starts somewhere
 * new: the happy path; each effect of that path failing (when it has an `onError`);
 * each condition flipped that the path meets; the client aborting; the deadline.
 */
export function variantsOf(m: Model): Variant[] {
  const specs = requestsOf(m, m.scenario).filter(
    (r, i, all) => all.findIndex((o) => o.entry === r.entry) === i,
  );
  const out: Variant[] = [];
  const fid = (k: string) => `v-${k}`;
  for (const spec of specs) {
    const tag = specs.length > 1 ? `${spec.rid}-` : "";
    const entry = findNode(m, spec.entry)?.title ?? spec.rid;
    const pre = specs.length > 1 ? `${entry}: ` : "";
    const base: Scenario = {
      requests: [spec],
      faults: [],
      conds: { ...m.scenario.conds },
      seed: m.scenario.seed,
    };
    const happy = simulate(m, base, base.seed);
    const visited = new Set(happy.flatMap((s) => [s.from, s.to]));
    out.push({ id: `${tag}happy`, title: `${pre}happy path`, scenario: base });
    for (const n of m.nodes) {
      if (n.kind !== "effect" || !visited.has(n.id)) continue;
      const def = effectDef(n.title);
      if (def?.responds || n.title === "log") continue;
      if (!m.edges.some((e) => e.from === n.id && e.kind === "error")) continue;
      out.push({
        id: `${tag}fail-${n.id}`,
        title: `${pre}${n.title} fails (${n.detail.slice(0, 28) || n.id})`,
        scenario: {
          ...base,
          faults: [
            {
              id: fid(n.id),
              kind: n.plugin === "redis" ? "timeout" : "error",
              target: n.id,
              rid: "",
              code: n.plugin === "pg" ? "40001" : "",
              ms: 0,
              on: true,
            },
          ],
        },
      });
    }
    for (const c of Object.keys(m.conds)) {
      const used = m.edges.some(
        (e) =>
          visited.has(e.from) &&
          e.cond.trim() &&
          e.cond.replace(/^!\s*/, "") === c,
      );
      if (!used) continue;
      out.push({
        id: `${tag}cond-${c}`,
        title: `${pre}${c} is ${(base.conds[c] ?? m.conds[c]) ? "false" : "true"}`,
        scenario: {
          ...base,
          conds: { ...base.conds, [c]: !(base.conds[c] ?? m.conds[c]) },
        },
      });
    }
    out.push({
      id: `${tag}abort`,
      title: `${pre}client aborts mid-flight`,
      scenario: {
        ...base,
        faults: [
          {
            id: fid("abort"),
            kind: "abort",
            target: "",
            rid: "",
            code: "",
            ms: 20,
            on: true,
          },
        ],
      },
    });
    out.push({
      id: `${tag}deadline`,
      title: `${pre}request deadline passes`,
      scenario: {
        ...base,
        faults: [
          {
            id: fid("deadline"),
            kind: "deadline",
            target: "",
            rid: "",
            code: "",
            ms: 25,
            on: true,
          },
        ],
      },
    });
  }
  return out;
}

export { payloadOf };
