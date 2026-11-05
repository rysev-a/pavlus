// The model of a Flow Studio project: a design of the frontend and the backend of
// one application, as a graph of nodes in four swimlanes (Browser, App, Plugins,
// Externals) joined by edges that are messages or effects. Plain JSON-able data:
// it is saved, exported and undone as one value. Everything here is pure.
//
// The vocabulary is the one of pavlus-server (server/DESIGN.md): the app is a pure
// function `(message, state) => effects`; `http.request` carries a context with a
// request id (`rid`); an effect names its `replyTo` and `onError`; plugins do the
// work; `state.requests[rid]` is the memory of one request, `state.shared` the
// process-wide one.

export type Lane = "browser" | "app" | "plugins" | "externals";
export const LANES: Lane[] = ["browser", "app", "plugins", "externals"];
export const LANE_LABEL: Record<Lane, string> = {
  browser: "Browser",
  app: "App",
  plugins: "Plugins",
  externals: "Externals",
};
export const LANE_HINT: Record<Lane, string> = {
  browser: "pavlus frontend: pages, UI events, handlers, state",
  app: "the pure server function: routes and handlers",
  plugins: "http, ws, postgres, redis, fetch, timer, log, crypto",
  externals: "Postgres, Redis, third-party API, the client",
};

export type NodeKind =
  | "ui-event"
  | "fe-handler"
  | "fe-state"
  | "route"
  | "handler"
  | "reply"
  | "error"
  | "effect"
  | "external";

export const NODE_KINDS: NodeKind[] = [
  "ui-event",
  "fe-handler",
  "fe-state",
  "route",
  "handler",
  "reply",
  "error",
  "effect",
  "external",
];

export const KIND_LANE: Record<NodeKind, Lane> = {
  "ui-event": "browser",
  "fe-handler": "browser",
  "fe-state": "browser",
  route: "app",
  handler: "app",
  reply: "app",
  error: "app",
  effect: "plugins",
  external: "externals",
};

export const KIND_LABEL: Record<NodeKind, string> = {
  "ui-event": "UI event",
  "fe-handler": "Frontend handler",
  "fe-state": "State key",
  route: "HTTP route",
  handler: "Pure handler",
  reply: "Reply message",
  error: "Error message",
  effect: "Plugin effect",
  external: "External",
};

export type EdgeKind = "request" | "effect" | "reply" | "error" | "cancel";
export const EDGE_KINDS: EdgeKind[] = [
  "request",
  "effect",
  "reply",
  "error",
  "cancel",
];
export const EDGE_LABEL: Record<EdgeKind, string> = {
  request: "request message",
  effect: "effect",
  reply: "reply message",
  error: "error message",
  cancel: "cancel",
};

export type FieldType =
  "string" | "number" | "boolean" | "object" | "array" | "any";
export const FIELD_TYPES: FieldType[] = [
  "string",
  "number",
  "boolean",
  "object",
  "array",
  "any",
];

/** One field of a message payload; a dotted name (`body.email`) nests. */
export interface PayloadField {
  name: string;
  type: FieldType;
  /** the value shown in the simulation (JSON, or a bare string) */
  example: string;
}

export interface FlowNode {
  id: string;
  kind: NodeKind;
  /** left edge in world units; `y` is relative to the top of the node's lane */
  x: number;
  y: number;
  /**
   * What the node is called: the UI event (`click #login`), the handler name, the
   * state key, the route (`POST /login`), the message id a handler / reply / error
   * node receives, the effect type (`pg.query`), the external's name.
   */
  title: string;
  /**
   * route: the message id the router rewrites `http.request` into;
   * handler: a one-line description; effect: the sql / redis command / url / ms;
   * http.respond: the JSON body; fe-state: the value written; external: its plugin.
   */
  detail: string;
  /** the plugin an effect uses (`pg`) or an external stands behind */
  plugin: string;
  /** http.respond: the status */
  status: number;
  /** ms; 0 = the default of the plugin */
  latency: number;
  /** ms; 0 = the default of the plugin */
  timeoutMs: number;
  /** failure policy: how many times a failed effect is retried before onError */
  retries: number;
  backoffMs: number;
  /** writes into `state.requests[rid]` when the node is reached (rq.merge) */
  reqSet: Record<string, string>;
  /** writes into `state.shared` when the node is reached */
  sharedSet: Record<string, string>;
  /** frontend handlers: writes into the browser state */
  clientSet: Record<string, string>;
  /** free text for the designer */
  note: string;
}

export interface FlowEdge {
  id: string;
  from: string;
  to: string;
  kind: EdgeKind;
  /** the message id (request, reply, error, cancel) or the effect type (effect) */
  msg: string;
  /** a condition name (`limited`, `!cacheHit`): the edge is taken when it holds */
  cond: string;
  /** the request context (`rid`) rides on this edge */
  rid: boolean;
  payload: PayloadField[];
  /** ms to deliver; 0 = the default */
  latency: number;
}

export type FaultKind = "error" | "timeout" | "slow" | "abort" | "deadline";
export const FAULT_KINDS: FaultKind[] = [
  "error",
  "timeout",
  "slow",
  "abort",
  "deadline",
];
export const FAULT_LABEL: Record<FaultKind, string> = {
  error: "Error (Postgres SQLSTATE, fetch, ...)",
  timeout: "Redis / plugin timeout",
  slow: "Slow query",
  abort: "Client aborts mid-flight",
  deadline: "Request timeout",
};

export interface Fault {
  id: string;
  kind: FaultKind;
  /** a node id, `plugin:pg` for every effect of a plugin, or "" for the whole request */
  target: string;
  /** only this request ("" = all) */
  rid: string;
  /** error: the SQLSTATE or error code */
  code: string;
  /** slow: extra ms; abort: when (ms after the start); deadline: the limit */
  ms: number;
  on: boolean;
}

export interface RequestSpec {
  rid: string;
  /** the node where the token starts: a UI event or the client */
  entry: string;
  /** start time, ms */
  at: number;
  /** what the user brings to the first node (dotted paths -> text), e.g. `email` */
  payload: Record<string, string>;
}

export interface Scenario {
  requests: RequestSpec[];
  faults: Fault[];
  /** overrides of the conditions of the model, by name */
  conds: Record<string, boolean>;
  seed: number;
}

export interface Model {
  name: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  /** the value each condition has on the happy path */
  conds: Record<string, boolean>;
  /** the initial `state.shared` (values are JSON or text) */
  shared: Record<string, string>;
  /** ms per plugin (`pg`, `redis`, ..., `net`, `app`) that replaces the default */
  latency: Record<string, number>;
  scenario: Scenario;
  /** the counter that makes ids */
  seq: number;
}

// ---- the catalogue of plugins and effects ----

export const PLUGIN_NAMES = [
  "http",
  "ws",
  "pg",
  "redis",
  "fetch",
  "timer",
  "log",
  "crypto",
] as const;
export type PluginName = (typeof PLUGIN_NAMES)[number];

export interface EffectDef {
  type: string;
  plugin: PluginName;
  hint: string;
  /** an example of `detail` */
  detail: string;
  /** the effect answers with a message */
  replies: boolean;
  /** the reply is optional (a redis command can be fire-and-forget) */
  optionalReply?: boolean;
  /** the effect cannot fail (a timer): no onError is needed */
  noFail?: boolean;
  /** the effect ends the request */
  responds?: boolean;
}

export const EFFECTS: EffectDef[] = [
  {
    type: "pg.query",
    plugin: "pg",
    hint: "sql with parameters",
    detail: "select id, email from users where email = $1",
    replies: true,
  },
  {
    type: "pg.tx.begin",
    plugin: "pg",
    hint: "start a transaction",
    detail: "",
    replies: true,
  },
  {
    type: "pg.tx.commit",
    plugin: "pg",
    hint: "commit it",
    detail: "",
    replies: true,
  },
  {
    type: "pg.tx.rollback",
    plugin: "pg",
    hint: "roll it back",
    detail: "",
    replies: false,
  },
  {
    type: "redis.cmd",
    plugin: "redis",
    hint: "any command: GET / SET / INCR / EXPIRE / DEL ...",
    detail: "GET cache:todos:{userId}",
    replies: true,
    optionalReply: true,
  },
  {
    type: "redis.pipeline",
    plugin: "redis",
    hint: "several commands in one round trip",
    detail: "DEL cache:todos:{userId}; PUBLISH todos:{userId} changed",
    replies: true,
    optionalReply: true,
  },
  {
    type: "fetch.request",
    plugin: "fetch",
    hint: "call a third-party API",
    detail: "POST https://api.example.com/charges",
    replies: true,
  },
  {
    type: "timer.after",
    plugin: "timer",
    hint: "reply after N ms (detail = ms)",
    detail: "5000",
    replies: true,
    noFail: true,
  },
  {
    type: "ws.send",
    plugin: "ws",
    hint: "send a frame to the connection",
    detail: "",
    replies: false,
  },
  {
    type: "ws.broadcast",
    plugin: "ws",
    hint: "send to a room",
    detail: "room",
    replies: false,
  },
  {
    type: "log",
    plugin: "log",
    hint: "a structured log line",
    detail: "info login {userId}",
    replies: false,
  },
  {
    type: "crypto.hash",
    plugin: "crypto",
    hint: "scrypt hash",
    detail: "",
    replies: true,
  },
  {
    type: "crypto.verify",
    plugin: "crypto",
    hint: "scrypt verify",
    detail: "",
    replies: true,
  },
  {
    type: "crypto.randomToken",
    plugin: "crypto",
    hint: "a random token",
    detail: "",
    replies: true,
  },
  {
    type: "http.respond",
    plugin: "http",
    hint: "answer the request (json body in detail)",
    detail: "{}",
    replies: false,
    responds: true,
  },
  {
    type: "http.sse",
    plugin: "http",
    hint: "open an event stream",
    detail: "",
    replies: false,
    responds: true,
  },
];

export const effectDef = (type: string): EffectDef | undefined =>
  EFFECTS.find((e) => e.type === type);

export const pluginOfType = (type: string): string => type.split(".")[0];

/** The external a plugin talks to. */
export const EXTERNAL_OF: Record<string, { title: string; id: string }> = {
  pg: { title: "Postgres", id: "x-postgres" },
  redis: { title: "Redis", id: "x-redis" },
  fetch: { title: "Third-party API", id: "x-api" },
  http: { title: "Client", id: "x-client" },
  ws: { title: "Client", id: "x-client" },
};

/** milliseconds a hop takes when nothing else says so */
export const DEFAULT_LATENCY: Record<string, number> = {
  net: 18,
  app: 0.3,
  http: 0.8,
  ws: 0.8,
  pg: 12,
  redis: 2,
  fetch: 120,
  timer: 0,
  log: 0.2,
  crypto: 55,
};
export const DEFAULT_TIMEOUT: Record<string, number> = {
  pg: 5000,
  redis: 1000,
  fetch: 3000,
  crypto: 5000,
  timer: 0,
  http: 0,
  ws: 0,
  log: 0,
};
/** the SQLSTATE or code an injected error has when none is given */
export const DEFAULT_ERROR_CODE: Record<string, string> = {
  pg: "40001",
  redis: "ECONNRESET",
  fetch: "ECONNREFUSED",
  crypto: "ERR_CRYPTO",
  http: "EPIPE",
  ws: "EPIPE",
  timer: "ERR_TIMER",
  log: "ERR_LOG",
};

export const SQLSTATES: { code: string; label: string }[] = [
  { code: "23505", label: "unique_violation" },
  { code: "23503", label: "foreign_key_violation" },
  { code: "40001", label: "serialization_failure" },
  { code: "40P01", label: "deadlock_detected" },
  { code: "57014", label: "query_canceled" },
  { code: "53300", label: "too_many_connections" },
  { code: "08006", label: "connection_failure" },
];

// ---- building ----

export function emptyScenario(): Scenario {
  return { requests: [], faults: [], conds: {}, seed: 1 };
}

export function emptyModel(): Model {
  return {
    name: "Untitled flow",
    nodes: [],
    edges: [],
    conds: {},
    shared: {},
    latency: {},
    scenario: emptyScenario(),
    seq: 0,
  };
}

export function newId(m: Model, prefix: string): { model: Model; id: string } {
  return { model: { ...m, seq: m.seq + 1 }, id: `${prefix}${m.seq + 1}` };
}

export function blankNode(
  id: string,
  kind: NodeKind,
  title: string,
  patch: Partial<FlowNode> = {},
): FlowNode {
  return {
    id,
    kind,
    x: 0,
    y: 0,
    title,
    detail: "",
    plugin: kind === "effect" ? pluginOfType(title) : "",
    status: 0,
    latency: 0,
    timeoutMs: 0,
    retries: 0,
    backoffMs: 0,
    reqSet: {},
    sharedSet: {},
    clientSet: {},
    note: "",
    ...patch,
  };
}

export function blankEdge(
  id: string,
  from: string,
  to: string,
  kind: EdgeKind,
  msg: string,
  patch: Partial<FlowEdge> = {},
): FlowEdge {
  return {
    id,
    from,
    to,
    kind,
    msg,
    cond: "",
    rid: true,
    payload: [],
    latency: 0,
    ...patch,
  };
}

export const findNode = (m: Model, id: string): FlowNode | undefined =>
  m.nodes.find((n) => n.id === id);
export const findEdge = (m: Model, id: string): FlowEdge | undefined =>
  m.edges.find((e) => e.id === id);
export const laneOf = (n: FlowNode): Lane => KIND_LANE[n.kind];
export const outEdges = (m: Model, id: string): FlowEdge[] =>
  m.edges.filter((e) => e.from === id);
export const inEdges = (m: Model, id: string): FlowEdge[] =>
  m.edges.filter((e) => e.to === id);

/** The title a new node of a kind starts with. */
export const DEFAULT_TITLE: Record<NodeKind, string> = {
  "ui-event": "click #button",
  "fe-handler": "onClick",
  "fe-state": "session",
  route: "GET /items",
  handler: "items.list",
  reply: "items.loaded",
  error: "items.failed",
  effect: "pg.query",
  external: "Postgres",
};

/** Adds a node (the id is made for it unless one is given). */
export function addNode(
  m: Model,
  kind: NodeKind,
  title = "",
  patch: Partial<FlowNode> = {},
): { model: Model; id: string } {
  const made = patch.id ? { model: m, id: patch.id } : newId(m, "n");
  const t = title || DEFAULT_TITLE[kind];
  const def = kind === "effect" ? effectDef(t) : undefined;
  let node = blankNode(made.id, kind, t, {
    detail: def?.detail ?? "",
    status: def?.responds ? 200 : 0,
    ...(kind === "external"
      ? { plugin: patch.plugin ?? guessExternal(t) }
      : {}),
    ...patch,
  });
  if (kind === "route" && !node.detail)
    node = { ...node, detail: msgOfRoute(t) };
  // a new node goes to the right of the others in its lane
  if (patch.x === undefined) {
    const lane = KIND_LANE[kind];
    const right = made.model.nodes
      .filter((n) => laneOf(n) === lane)
      .reduce((mx, n) => Math.max(mx, n.x + NODE_W + 28), 0);
    node = { ...node, x: Math.max(right, 0) };
  }
  return {
    model: { ...made.model, nodes: [...made.model.nodes, node] },
    id: made.id,
  };
}

export const NODE_W = 140;
export const NODE_H = 46;

function guessExternal(title: string): string {
  const t = title.toLowerCase();
  if (t.includes("postgres") || t.includes("sql")) return "pg";
  if (t.includes("redis")) return "redis";
  if (t.includes("client") || t.includes("browser")) return "http";
  return "fetch";
}

/** `POST /login` -> `login.post`: the message id a route gets by default. */
export function msgOfRoute(title: string): string {
  const m = /^(\w+)\s+(\S+)/.exec(title.trim());
  if (!m) return "";
  const segs = m[2]
    .split("/")
    .filter(Boolean)
    .map((s) => (s.startsWith(":") ? "" : s.replace(/[^\w]+/g, "-")))
    .filter(Boolean);
  const base = segs.join(".") || "root";
  return `${base}.${m[1].toLowerCase()}`;
}

export function updateNode(
  m: Model,
  id: string,
  patch: Partial<FlowNode>,
): Model {
  return {
    ...m,
    nodes: m.nodes.map((n) => {
      if (n.id !== id) return n;
      const next = { ...n, ...patch };
      if (next.kind === "effect" && patch.title !== undefined)
        next.plugin = pluginOfType(next.title);
      return next;
    }),
  };
}

export function removeNode(m: Model, id: string): Model {
  return {
    ...m,
    nodes: m.nodes.filter((n) => n.id !== id),
    edges: m.edges.filter((e) => e.from !== id && e.to !== id),
    scenario: {
      ...m.scenario,
      requests: m.scenario.requests.filter((r) => r.entry !== id),
      faults: m.scenario.faults.filter((f) => f.target !== id),
    },
  };
}

/** The kind an edge between two nodes has unless the designer says otherwise. */
export function inferKind(
  from: FlowNode,
  to: FlowNode,
  port: "out" | "ok" | "err" = "out",
): EdgeKind {
  if (port === "err") return "error";
  if (to.kind === "route") return "request";
  if (from.kind === "effect") {
    if (to.kind === "external") return "effect";
    return to.kind === "error" ? "error" : "reply";
  }
  if (to.kind === "effect" || to.kind === "fe-state" || to.kind === "external")
    return "effect";
  return "request";
}

/** The message id (or effect type) a new edge starts with. */
export function defaultMsg(
  m: Model,
  from: FlowNode,
  to: FlowNode,
  kind: EdgeKind,
): string {
  if (kind === "effect") return to.kind === "effect" ? to.title : "store.set";
  if (to.kind === "route") return "http.request";
  if (kind === "request") {
    if (to.kind === "fe-handler") return to.title;
    if (from.kind === "route") return from.detail || msgOfRoute(from.title);
    return to.title;
  }
  if (kind === "error")
    return to.kind === "handler" || to.kind === "error" || to.kind === "reply"
      ? to.title
      : `${from.title}.failed`;
  if (kind === "reply")
    return to.kind === "handler" ||
      to.kind === "reply" ||
      to.kind === "fe-handler"
      ? to.title
      : `${from.title}.done`;
  return `${from.title}.cancel`;
}

/** The context rides on every edge of the server; the request edge mints it. */
export function carriesRid(a: FlowNode, b: FlowNode): boolean {
  if (b.kind === "route") return true;
  return laneOf(a) !== "browser" && laneOf(b) !== "browser";
}

export function addEdge(
  m: Model,
  from: string,
  to: string,
  opts: {
    kind?: EdgeKind;
    msg?: string;
    port?: "out" | "ok" | "err";
  } & Partial<FlowEdge> = {},
): { model: Model; id: string } | null {
  const a = findNode(m, from);
  const b = findNode(m, to);
  if (!a || !b || from === to) return null;
  const { kind: k, msg: mm, port, ...rest } = opts;
  const kind = k ?? inferKind(a, b, port);
  const msg = mm ?? defaultMsg(m, a, b, kind);
  const dup = m.edges.find(
    (e) => e.from === from && e.to === to && e.kind === kind && e.msg === msg,
  );
  if (dup) return null;
  const made = rest.id ? { model: m, id: rest.id } : newId(m, "e");
  const edge = blankEdge(made.id, from, to, kind, msg, {
    rid: carriesRid(a, b),
    ...rest,
  });
  return {
    model: { ...made.model, edges: [...made.model.edges, edge] },
    id: made.id,
  };
}

export function updateEdge(
  m: Model,
  id: string,
  patch: Partial<FlowEdge>,
): Model {
  return {
    ...m,
    edges: m.edges.map((e) => (e.id === id ? { ...e, ...patch } : e)),
  };
}

export function removeEdge(m: Model, id: string): Model {
  return { ...m, edges: m.edges.filter((e) => e.id !== id) };
}

export function moveNode(m: Model, id: string, x: number, y: number): Model {
  return updateNode(m, id, { x: Math.round(x), y: Math.round(y) });
}

/**
 * The failure policy: the node that gets the error of an effect (`onError`). It
 * replaces the error edge of the effect node, or adds one; "" removes it.
 */
export function setOnError(m: Model, effectId: string, target: string): Model {
  const node = findNode(m, effectId);
  if (!node) return m;
  const kept = m.edges.filter(
    (e) => !(e.from === effectId && e.kind === "error"),
  );
  const prev = m.edges.find((e) => e.from === effectId && e.kind === "error");
  if (!target) return { ...m, edges: kept };
  const to = findNode(m, target);
  if (!to || to.id === effectId) return m;
  const made = prev ? { model: m, id: prev.id } : newId(m, "e");
  const edge = blankEdge(
    made.id,
    effectId,
    target,
    "error",
    prev?.msg && prev.to === target ? prev.msg : to.title,
    { payload: prev?.payload ?? errorPayload(node) },
  );
  return { ...made.model, edges: [...kept, edge] };
}

export function errorPayload(n: FlowNode): PayloadField[] {
  return [
    {
      name: "code",
      type: "string",
      example: DEFAULT_ERROR_CODE[n.plugin] ?? "ERR",
    },
    { name: "message", type: "string", example: `${n.title} failed` },
  ];
}

export const onErrorOf = (m: Model, effectId: string): string =>
  m.edges.find((e) => e.from === effectId && e.kind === "error")?.to ?? "";

// ---- payloads ----

/** `a.b` = 1 -> { a: { b: 1 } } */
export function setDeep(
  o: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  const keys = path.split(".").filter(Boolean);
  if (keys.length === 0) return;
  let cur = o;
  for (const k of keys.slice(0, -1)) {
    if (typeof cur[k] !== "object" || cur[k] === null || Array.isArray(cur[k]))
      cur[k] = {};
    cur = cur[k] as Record<string, unknown>;
  }
  cur[keys[keys.length - 1]] = value;
}

export function getDeep(o: unknown, path: string): unknown {
  let cur: unknown = o;
  for (const k of path.split(".").filter(Boolean)) {
    if (typeof cur !== "object" || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

/** The value an example text stands for, by the type of its field. */
export function exampleValue(f: PayloadField): unknown {
  const t = f.example.trim();
  if (f.type === "string") return f.example;
  if (f.type === "number") {
    const n = Number(t);
    return t !== "" && Number.isFinite(n) ? n : 0;
  }
  if (f.type === "boolean") return t === "true";
  if (t === "")
    return f.type === "array" ? [] : f.type === "object" ? {} : null;
  try {
    return JSON.parse(t);
  } catch {
    return f.example;
  }
}

export function payloadOf(fields: PayloadField[]): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const f of fields) if (f.name) setDeep(o, f.name, exampleValue(f));
  return o;
}

/** `email:string=ann@example.com, count:number=3` -> fields (for demos and tests). */
export function fieldsOf(spec: string): PayloadField[] {
  return spec
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const m = /^([\w.$-]+)(?::(\w+))?(?:=(.*))?$/.exec(s);
      if (!m) return { name: s, type: "any" as const, example: "" };
      const type = (FIELD_TYPES as string[]).includes(m[2] ?? "")
        ? (m[2] as FieldType)
        : "string";
      return { name: m[1], type, example: m[3] ?? "" };
    });
}

export const specOf = (fields: PayloadField[]): string =>
  fields
    .map((f) => `${f.name}:${f.type}${f.example ? `=${f.example}` : ""}`)
    .join("; ");

/** The condition names an edge list uses (`!x` and `x` are the same name). */
export const condName = (c: string): string => c.trim().replace(/^!\s*/, "");
export function condNames(m: Model): string[] {
  const set = new Set<string>(Object.keys(m.conds));
  for (const e of m.edges) if (e.cond.trim()) set.add(condName(e.cond));
  return [...set].filter(Boolean).sort();
}

/** Does `cond` hold, with the model's values overridden by the scenario's? */
export function condHolds(
  cond: string,
  base: Record<string, boolean>,
  over: Record<string, boolean>,
): boolean {
  const c = cond.trim();
  if (!c) return true;
  const neg = c.startsWith("!");
  const name = condName(c);
  const v = name in over ? over[name] : (base[name] ?? false);
  return neg ? !v : v;
}

// ---- reading a project from text (import, the saved copy) ----

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, d = ""): string => (typeof v === "string" ? v : d);
const num = (v: unknown, d: number): number =>
  typeof v === "number" && Number.isFinite(v) ? v : d;
const strMap = (v: unknown): Record<string, string> =>
  isObj(v)
    ? Object.fromEntries(
        Object.entries(v)
          .filter(([, x]) => typeof x === "string" || typeof x === "number")
          .map(([k, x]) => [k, String(x)]),
      )
    : {};
const boolMap = (v: unknown): Record<string, boolean> =>
  isObj(v)
    ? Object.fromEntries(
        Object.entries(v)
          .filter(([, x]) => typeof x === "boolean")
          .map(([k, x]) => [k, x as boolean]),
      )
    : {};

function fieldList(v: unknown): PayloadField[] {
  return Array.isArray(v)
    ? v.filter(isObj).map((f) => ({
        name: str(f.name),
        type: (FIELD_TYPES as string[]).includes(str(f.type))
          ? (f.type as FieldType)
          : "any",
        example: typeof f.example === "string" ? f.example : "",
      }))
    : [];
}

function nodeFrom(v: unknown): FlowNode | null {
  if (!isObj(v) || typeof v.id !== "string" || v.id === "") return null;
  const kind = str(v.kind) as NodeKind;
  if (!NODE_KINDS.includes(kind)) return null;
  const title = str(v.title, DEFAULT_TITLE[kind]);
  return blankNode(v.id, kind, title, {
    x: num(v.x, 0),
    y: num(v.y, 0),
    detail: str(v.detail),
    plugin: str(v.plugin, kind === "effect" ? pluginOfType(title) : ""),
    status: num(v.status, 0),
    latency: Math.max(0, num(v.latency, 0)),
    timeoutMs: Math.max(0, num(v.timeoutMs, 0)),
    retries: Math.min(10, Math.max(0, Math.round(num(v.retries, 0)))),
    backoffMs: Math.max(0, num(v.backoffMs, 0)),
    reqSet: strMap(v.reqSet),
    sharedSet: strMap(v.sharedSet),
    clientSet: strMap(v.clientSet),
    note: str(v.note),
  });
}

function edgeFrom(v: unknown, ids: Set<string>): FlowEdge | null {
  if (!isObj(v) || typeof v.id !== "string") return null;
  const from = str(v.from);
  const to = str(v.to);
  if (!ids.has(from) || !ids.has(to) || from === to) return null;
  const kind = str(v.kind) as EdgeKind;
  return blankEdge(
    v.id,
    from,
    to,
    EDGE_KINDS.includes(kind) ? kind : "request",
    str(v.msg),
    {
      cond: str(v.cond),
      rid: v.rid !== false,
      payload: fieldList(v.payload),
      latency: Math.max(0, num(v.latency, 0)),
    },
  );
}

function scenarioFrom(v: unknown, ids: Set<string>): Scenario {
  if (!isObj(v)) return emptyScenario();
  return {
    requests: Array.isArray(v.requests)
      ? v.requests
          .filter(isObj)
          .map((r) => ({
            rid: str(r.rid),
            entry: str(r.entry),
            at: Math.max(0, num(r.at, 0)),
            payload: strMap(r.payload),
          }))
          .filter((r) => r.rid !== "" && ids.has(r.entry))
      : [],
    faults: Array.isArray(v.faults)
      ? v.faults
          .filter(isObj)
          .filter((f) => FAULT_KINDS.includes(str(f.kind) as FaultKind))
          .map((f, i) => ({
            id: str(f.id, `f${i + 1}`),
            kind: str(f.kind) as FaultKind,
            target: str(f.target),
            rid: str(f.rid),
            code: str(f.code),
            ms: Math.max(0, num(f.ms, 0)),
            on: f.on === true,
          }))
      : [],
    conds: boolMap(v.conds),
    seed: Math.round(num(v.seed, 1)),
  };
}

export function readModel(value: unknown): Model | string {
  if (
    !isObj(value) ||
    !Array.isArray(value.nodes) ||
    !Array.isArray(value.edges)
  )
    return "This is not a Flow Studio project (it needs nodes and edges).";
  const nodes = value.nodes
    .map(nodeFrom)
    .filter((n): n is FlowNode => !!n)
    .filter((n, i, all) => all.findIndex((o) => o.id === n.id) === i);
  const ids = new Set(nodes.map((n) => n.id));
  const edges = value.edges
    .map((e) => edgeFrom(e, ids))
    .filter((e): e is FlowEdge => !!e)
    .filter((e, i, all) => all.findIndex((o) => o.id === e.id) === i);
  const top = [...nodes.map((n) => n.id), ...edges.map((e) => e.id)].reduce(
    (mx, id) => Math.max(mx, Number(/^[ne](\d+)$/.exec(id)?.[1] ?? 0)),
    0,
  );
  return {
    name: str(value.name, "Imported flow"),
    nodes,
    edges,
    conds: boolMap(value.conds),
    shared: strMap(value.shared),
    latency: Object.fromEntries(
      Object.entries(isObj(value.latency) ? value.latency : {})
        .filter(([, x]) => typeof x === "number" && x >= 0)
        .map(([k, x]) => [k, x as number]),
    ),
    scenario: scenarioFrom(value.scenario, ids),
    seq: Math.max(num(value.seq, 0), top),
  };
}

export function parseProject(text: string): Model | string {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch (e) {
    return `Not valid JSON: ${e instanceof Error ? e.message : String(e)}`;
  }
  return readModel(v);
}

export const projectText = (m: Model): string => JSON.stringify(m, null, 2);

/** A short name made from free text: `Login: rate limit` -> `login-rate-limit`. */
export const slugify = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "flow";
