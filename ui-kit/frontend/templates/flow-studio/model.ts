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

import { type Db, dbFrom } from "./store.ts";

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

/**
 * A lane of the board. The four of the start (Browser, App, Plugins, Externals) are
 * lanes like any other: they can be renamed, removed and resized, and new ones added.
 * A lane has a role, which is what the simulation and the checks know it by: a node in
 * a lane with the role `browser` runs in the browser, in `app` on the server, in
 * `plugins` it is an effect, in `externals` it is the world.
 */
export interface LaneDef {
  /** the four of the start are `browser`, `app`, `plugins`, `externals` */
  id: string;
  name: string;
  role: Lane;
  /** the height set by hand; a lane is never shorter than its nodes */
  h?: number;
}

/** the lanes of a project that has not changed them */
export const DEFAULT_LANES: LaneDef[] = LANES.map((id) => ({
  id,
  name: LANE_LABEL[id],
  role: id,
}));

/**
 * A frame: a rectangle on the plot, like a frame in Figma. It has a name, a place and a size
 * and nothing else is required of it: components are placed on the plot freely, and
 * dropped on a frame they are attached to it and go where it goes. A frame can also
 * say what its components run as (`role`), which is how lanes come back: a frame the width
 * of the board with the role `app` is the App lane. Absent a role, a component keeps the
 * one of its kind.
 */
export interface Frame {
  id: string;
  name: string;
  /** the corner, and the size, in world units (the plot has no end, and no origin that matters) */
  x: number;
  y: number;
  w: number;
  h: number;
  /** what the components attached to it run as ("" = what their kind says) */
  role: "" | Lane;
}

export const FRAME_MIN_W = 120;
export const FRAME_MIN_H = 80;
export const FRAME_W = 380;
export const FRAME_H = 240;

export type NodeKind =
  | "ui-event"
  | "fe-handler"
  | "fe-state"
  | "route"
  | "handler"
  | "reply"
  | "error"
  | "effect"
  | "external"
  | "module";

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
  "module",
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
  // the default; a module instance has its own lane (the side of its module)
  module: "app",
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
  module: "Module",
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
  | "string"
  | "number"
  | "boolean"
  | "object"
  | "array"
  | "any";
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
  /** module: the id of the module (`modules`) this node is an instance of */
  ref: string;
  /** the role the node has, when it is not the one of its kind ("" = the kind's); a module: the side of its module */
  lane: "" | Lane;
  /** an older design: the lane the node sits in (a design that has `frames` has none) */
  band?: string;
  /** the frame the node is attached to: it goes where the frame goes (absent: free on the plot) */
  frame?: string;
  /**
   * Only in a flattened model, never saved: this node stands for a module with a
   * code body. The engine runs the code when a message reaches it.
   */
  code?: CodeBody;
}

/** What the engine needs of a module with a code body. */
export interface CodeBody {
  source: string;
  side: "frontend" | "backend";
  inputs: ModulePort[];
  outputs: ModulePort[];
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
  /** when `from` is a module: the id of its output port the edge leaves by */
  fromPort: string;
  /** when `to` is a module: the id of its input port the edge arrives at */
  toPort: string;
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
  /** a payload as data (a request made by the Visual Builder): used instead of `payload` */
  data?: Record<string, unknown>;
}

export interface Scenario {
  requests: RequestSpec[];
  faults: Fault[];
  /** overrides of the conditions of the model, by name */
  conds: Record<string, boolean>;
  seed: number;
}

/**
 * One port of a module: how the outside talks to it. An input port is a message
 * the module accepts, an output port a message (or an effect) it emits; both are
 * bound to a node inside, which is where an arriving message goes to and where a
 * leaving edge starts.
 */
export interface ModulePort {
  id: string;
  /** the message id (an effect type for an output that is an effect) */
  name: string;
  /** the payload that crosses the port */
  fields: PayloadField[];
  /** the node inside the module the port is bound to ("" = not bound yet) */
  node: string;
  /** the bound node is an instance of a module: the id of that module's port */
  via: string;
  /** an output that carries the message on down a pipe (middleware `next`) */
  pass: boolean;
}

/**
 * A module: a named piece of the design with an interface (ports, the state it
 * touches, the plugins it needs) and a body, a graph of its own. An instance of it
 * is a node of kind `module` that points here by `ref`; instances share the body.
 */
export interface ModuleDef {
  id: string;
  name: string;
  /** which side it runs on: the browser (pavlus frontend) or the server */
  side: "frontend" | "backend";
  about: string;
  inputs: ModulePort[];
  outputs: ModulePort[];
  /** the state keys it reads and writes (`requests.user`, `shared.limits`) */
  reads: string[];
  writes: string[];
  /** the plugins it needs from the world (`pg`, `redis`) */
  plugins: string[];
  /**
   * What the body is: a graph (nodes and edges), code (`source`, a pure function
   * body `(msg, state) => effects`) or a pipe (`stages`, a chain of modules).
   */
  body: "graph" | "code" | "pipe";
  /** body = code: the function body */
  source: string;
  /** code that came in with an import and is not run until it is enabled */
  held: string;
  /** body = pipe: the ids of the instance nodes, in the order of the chain */
  stages: string[];
  nodes: FlowNode[];
  edges: FlowEdge[];
  /** the frames of the body of a graph module (see Model.frames) */
  frames?: Frame[];
}

export interface Model {
  name: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  /** the library of modules; instances in any graph point to them */
  modules: ModuleDef[];
  /** the plugins of the project beside the built-in ones */
  plugins: PluginManifest[];
  /** the tables the `pg.query` nodes run against in the simulation (see store.ts) */
  db: Db;
  /** the value each condition has on the happy path */
  conds: Record<string, boolean>;
  /** the initial `state.shared` (values are JSON or text) */
  shared: Record<string, string>;
  /** ms per plugin (`pg`, `redis`, ..., `net`, `app`) that replaces the default */
  latency: Record<string, number>;
  scenario: Scenario;
  /**
   * The frames of the plot. Absent, the design is an older one with lanes (`lanes`, `laneW`,
   * or the four of the start), and its nodes are placed in them: `toFrames` (layout.ts) turns
   * it into frames, the same drawing, the first time it is edited.
   */
  frames?: Frame[];
  /** an older design: the lanes of the board, top to bottom (absent: the four of the start) */
  lanes?: LaneDef[];
  /** the width of every lane, set by hand; never narrower than the design (absent: as wide as the design) */
  laneW?: number;
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
  plugin: string;
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

/**
 * A plugin of the project, beside the built-in ones: what the design needs to know
 * about it (its effects, how long they take, what it talks to), and what the code
 * generator needs to stub it. Plain data, saved with the project.
 */
export interface PluginManifest {
  name: string;
  about: string;
  /** the external it talks to (a node in the Externals lane); "" = none */
  external: string;
  /** ms an effect of it takes unless a node or the project says otherwise */
  latency: number;
  /** ms before an effect of it times out; 0 = never */
  timeout: number;
  /** the code an injected error of it has */
  errorCode: string;
  effects: EffectDef[];
}

export const customOf = (
  custom: PluginManifest[],
  plugin: string,
): PluginManifest | undefined => custom.find((p) => p.name === plugin);

/** every effect the design can use: the built-in ones and those of the project */
export const effectsIn = (custom: PluginManifest[]): EffectDef[] => [
  ...EFFECTS,
  ...custom.flatMap((p) => p.effects),
];
export const effectDefIn = (
  custom: PluginManifest[],
  type: string,
): EffectDef | undefined =>
  effectDef(type) ??
  custom.flatMap((p) => p.effects).find((e) => e.type === type);
export const latencyIn = (custom: PluginManifest[], plugin: string): number =>
  DEFAULT_LATENCY[plugin] ?? customOf(custom, plugin)?.latency ?? 1;
export const timeoutIn = (custom: PluginManifest[], plugin: string): number =>
  DEFAULT_TIMEOUT[plugin] ?? customOf(custom, plugin)?.timeout ?? 0;
export const errorCodeIn = (custom: PluginManifest[], plugin: string): string =>
  DEFAULT_ERROR_CODE[plugin] ?? customOf(custom, plugin)?.errorCode ?? "ERR";
export const externalIn = (
  custom: PluginManifest[],
  plugin: string,
): { title: string; id: string } | undefined => {
  const p = customOf(custom, plugin);
  return (
    EXTERNAL_OF[plugin] ??
    (p?.external ? { title: p.external, id: `x-${p.name}` } : undefined)
  );
};

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

export function blankPort(
  id: string,
  name: string,
  node = "",
  patch: Partial<ModulePort> = {},
): ModulePort {
  return { id, name, fields: [], node, via: "", pass: false, ...patch };
}

export function blankDef(
  id: string,
  name: string,
  side: ModuleDef["side"] = "backend",
  patch: Partial<ModuleDef> = {},
): ModuleDef {
  return {
    id,
    name,
    side,
    about: "",
    inputs: [],
    outputs: [],
    reads: [],
    writes: [],
    plugins: [],
    body: "graph",
    source: "",
    held: "",
    stages: [],
    nodes: [],
    edges: [],
    ...patch,
  };
}

export function emptyScenario(): Scenario {
  return { requests: [], faults: [], conds: {}, seed: 1 };
}

export function emptyModel(): Model {
  return {
    name: "Untitled flow",
    nodes: [],
    edges: [],
    modules: [],
    plugins: [],
    db: {},
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
    ref: "",
    lane: "",
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
    fromPort: "",
    toPort: "",
    ...patch,
  };
}

export const findNode = (m: Model, id: string): FlowNode | undefined =>
  m.nodes.find((n) => n.id === id);
export const findEdge = (m: Model, id: string): FlowEdge | undefined =>
  m.edges.find((e) => e.id === id);
export const findDef = (m: Model, id: string): ModuleDef | undefined =>
  m.modules.find((d) => d.id === id);
/** The module an instance node stands for. */
export const defOf = (m: Model, n: FlowNode): ModuleDef | undefined =>
  n.kind === "module" ? findDef(m, n.ref) : undefined;
/** The role of a node: what it runs as (its lane's role, else the one of its kind). */
export const laneOf = (n: FlowNode): Lane =>
  n.lane ? n.lane : KIND_LANE[n.kind];

/** The lanes of the board. */
export const lanesOf = (m: Pick<Model, "lanes">): LaneDef[] =>
  m.lanes && m.lanes.length > 0 ? m.lanes : DEFAULT_LANES;

/** The id of the lane a node sits in: its own, else the first lane with its role, else the first. */
export function bandOf(m: Pick<Model, "lanes">, n: FlowNode): string {
  const lanes = lanesOf(m);
  if (n.band && lanes.some((l) => l.id === n.band)) return n.band;
  const role = laneOf(n);
  return (lanes.find((l) => l.role === role) ?? lanes[0]).id;
}

const mapNodes = (m: Model, fn: (n: FlowNode) => FlowNode): Model => ({
  ...m,
  nodes: m.nodes.map(fn),
});

// ---- frames: rectangles on the plot, and the nodes attached to them ----
// These work on a design that has frames (`toFrames` in layout.ts makes one of an older one).

export const framesOf = (m: Pick<Model, "frames">): Frame[] => m.frames ?? [];
export const findFrame = (
  m: Pick<Model, "frames">,
  id: string,
): Frame | undefined => framesOf(m).find((f) => f.id === id);

const setFrames = (m: Model, frames: Frame[]): Model => ({ ...m, frames });
const updateFrame = (m: Model, id: string, patch: Partial<Frame>): Model =>
  setFrames(
    m,
    framesOf(m).map((f) => (f.id === id ? { ...f, ...patch } : f)),
  );

/** What a node runs as once it is attached to a frame with a role (a module keeps its side). */
const stamp = (n: FlowNode, role: "" | Lane): FlowNode =>
  n.kind === "module"
    ? n
    : { ...n, lane: role && role !== KIND_LANE[n.kind] ? role : "" };

/** A new frame, on top of the others; `at` is its corner. */
export function addFrame(
  m: Model,
  at: { x: number; y: number; w?: number; h?: number },
  name = "Frame",
): { model: Model; id: string } {
  const made = newId(m, "f");
  const frame: Frame = {
    id: made.id,
    name: name.trim() || "Frame",
    x: Math.round(at.x),
    y: Math.round(at.y),
    w: Math.max(FRAME_MIN_W, Math.round(at.w ?? FRAME_W)),
    h: Math.max(FRAME_MIN_H, Math.round(at.h ?? FRAME_H)),
    role: "",
  };
  return { model: setFrames(made.model, [...framesOf(m), frame]), id: made.id };
}

export const renameFrame = (m: Model, id: string, name: string): Model =>
  updateFrame(m, id, { name });

/** A frame's place and size (never smaller than the least). */
export function setFrameRect(
  m: Model,
  id: string,
  r: { x: number; y: number; w: number; h: number },
): Model {
  return updateFrame(m, id, {
    x: Math.round(r.x),
    y: Math.round(r.y),
    w: Math.max(FRAME_MIN_W, Math.round(r.w)),
    h: Math.max(FRAME_MIN_H, Math.round(r.h)),
  });
}

/** A frame moved by (dx, dy), and the nodes attached to it with it. */
export function moveFrame(m: Model, id: string, dx: number, dy: number): Model {
  const f = findFrame(m, id);
  if (!f || (dx === 0 && dy === 0)) return m;
  const moved = updateFrame(m, id, {
    x: Math.round(f.x + dx),
    y: Math.round(f.y + dy),
  });
  return mapNodes(moved, (n) =>
    n.frame === id
      ? { ...n, x: Math.round(n.x + dx), y: Math.round(n.y + dy) }
      : n,
  );
}

/** What the attached nodes of a frame run as: the nodes take the role with it. */
export function setFrameRole(m: Model, id: string, role: "" | Lane): Model {
  return mapNodes(updateFrame(m, id, { role }), (n) =>
    n.frame === id ? stamp(n, role) : n,
  );
}

/**
 * A node attached to a frame (it goes where the frame goes, and runs as its role), or
 * free on the plot when `frameId` is null.
 */
export function attachNode(
  m: Model,
  id: string,
  frameId: string | null,
): Model {
  const node = findNode(m, id);
  if (!node) return m;
  const frame = frameId ? findFrame(m, frameId) : undefined;
  const { frame: _old, ...rest } = node;
  const next: FlowNode = frame
    ? stamp({ ...rest, frame: frame.id }, frame.role)
    : stamp(rest, "");
  // `frame` is set to undefined, not left out, when the node is let go
  return updateNode(m, id, { ...next, frame: next.frame });
}

/** A frame taken away: its nodes stay where they are, free on the plot. */
export function removeFrame(m: Model, id: string): Model {
  if (!findFrame(m, id)) return m;
  const cleared = mapNodes(m, (n) => {
    if (n.frame !== id) return n;
    const { frame: _f, ...rest } = n;
    return stamp(rest, "");
  });
  return setFrames(
    cleared,
    framesOf(m).filter((f) => f.id !== id),
  );
}

/** One place down (the frame is above the next one) or up the stack of frames. */
export function raiseFrame(m: Model, id: string): Model {
  const frames = framesOf(m);
  const f = frames.find((x) => x.id === id);
  return f ? setFrames(m, [...frames.filter((x) => x.id !== id), f]) : m;
}

/** The frame a point of the plot is in: the one on top. */
export function frameAt(
  m: Pick<Model, "frames">,
  x: number,
  y: number,
): Frame | undefined {
  const frames = framesOf(m);
  for (let i = frames.length - 1; i >= 0; i--) {
    const f = frames[i];
    if (x >= f.x && x <= f.x + f.w && y >= f.y && y <= f.y + f.h) return f;
  }
  return undefined;
}

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
  module: "module",
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
  const def = kind === "effect" ? effectDefIn(m.plugins, t) : undefined;
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
  let model = made.model;
  if (patch.x === undefined && model.frames) {
    // a new node goes into the frame that runs as its kind (the lanes of an older design
    // are such frames), to the right of what is there; with none, to the right of the others
    const role = laneOf(node);
    const home = framesOf(model).find((f) => f.role === role);
    if (home) {
      const mine = model.nodes.filter((n) => n.frame === home.id);
      const x = mine.length
        ? mine.reduce((mx, n) => Math.max(mx, n.x + NODE_W + 28), 0)
        : home.x + 16;
      node = { ...node, x, y: home.y + 34, frame: home.id };
      const need = x + NODE_W + 16 - home.x;
      if (need > home.w)
        model = updateFrame(model, home.id, { w: Math.round(need) });
    } else {
      const right = model.nodes.reduce(
        (mx, n) => Math.max(mx, n.x + NODE_W + 28),
        0,
      );
      const top = model.nodes.length
        ? Math.min(...model.nodes.map((n) => n.y))
        : 0;
      node = { ...node, x: right, y: top };
    }
  } else if (patch.x === undefined) {
    // a new node goes to the right of the others in its lane
    const lane = bandOf(model, node);
    const right = model.nodes
      .filter((n) => bandOf(model, n) === lane)
      .reduce((mx, n) => Math.max(mx, n.x + NODE_W + 28), 0);
    node = { ...node, x: Math.max(right, 0) };
  }
  return {
    model: { ...model, nodes: [...model.nodes, node] },
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
  // a module end of the edge uses one of its ports (the first unless told)
  const outDef = defOf(m, a);
  const inDef = defOf(m, b);
  const outPort =
    outDef?.outputs.find((p) => p.id === rest.fromPort) ??
    (outDef && kind !== "effect"
      ? outDef.outputs.find((p) => p.name === mm)
      : undefined) ??
    outDef?.outputs[0];
  const inPort =
    inDef?.inputs.find((p) => p.id === rest.toPort) ??
    inDef?.inputs.find((p) => p.name === mm) ??
    inDef?.inputs[0];
  const msg =
    mm ??
    (inPort
      ? inPort.name
      : outPort && kind !== "effect"
        ? outPort.name
        : defaultMsg(m, a, b, kind));
  const dup = m.edges.find(
    (e) =>
      e.from === from &&
      e.to === to &&
      e.kind === kind &&
      e.msg === msg &&
      (!outPort || e.fromPort === outPort.id) &&
      (!inPort || e.toPort === inPort.id),
  );
  if (dup) return null;
  const made = rest.id ? { model: m, id: rest.id } : newId(m, "e");
  const edge = blankEdge(made.id, from, to, kind, msg, {
    rid: carriesRid(a, b),
    fromPort: outPort?.id ?? "",
    toPort: inPort?.id ?? "",
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

/**
 * A condition is a name (`limited`, `!cacheHit`) whose value the scenario sets, or an
 * expression over the data (`payload.rowCount == 0`) that is worked out when the
 * message travels.
 */
export const isExprCond = (c: string): boolean =>
  c.trim() !== "" && !/^!?\s*[A-Za-z_]\w*$/.test(c.trim());

/** The condition names an edge list uses (`!x` and `x` are the same name). */
export const condName = (c: string): string => c.trim().replace(/^!\s*/, "");
export function condNames(m: Model): string[] {
  const set = new Set<string>(Object.keys(m.conds));
  for (const e of m.edges)
    if (e.cond.trim() && !isExprCond(e.cond)) set.add(condName(e.cond));
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
  // an expression is worked out by the engine, with the message; seen from the
  // outside (the checks) it is assumed to hold
  if (isExprCond(c)) return true;
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
    ref: kind === "module" ? str(v.ref) : "",
    lane: (LANES as string[]).includes(str(v.lane)) ? (v.lane as Lane) : "",
    ...(str(v.band) ? { band: str(v.band) } : {}),
    ...(str(v.frame) ? { frame: str(v.frame) } : {}),
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
      fromPort: str(v.fromPort),
      toPort: str(v.toPort),
    },
  );
}

/** The nodes and edges of a graph read from JSON, edges only between known nodes. */
function graphFrom(
  nodesV: unknown,
  edgesV: unknown,
): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const nodes = (Array.isArray(nodesV) ? nodesV : [])
    .map(nodeFrom)
    .filter((n): n is FlowNode => !!n)
    .filter((n, i, all) => all.findIndex((o) => o.id === n.id) === i);
  const ids = new Set(nodes.map((n) => n.id));
  const edges = (Array.isArray(edgesV) ? edgesV : [])
    .map((e) => edgeFrom(e, ids))
    .filter((e): e is FlowEdge => !!e)
    .filter((e, i, all) => all.findIndex((o) => o.id === e.id) === i);
  return { nodes, edges };
}

const strList = (v: unknown): string[] =>
  Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string" && x !== "")
    : [];

function portsFrom(v: unknown, nodeIds: Set<string>): ModulePort[] {
  return (Array.isArray(v) ? v : [])
    .filter(isObj)
    .filter((p) => typeof p.id === "string" && p.id !== "")
    .map((p) => ({
      id: str(p.id),
      name: str(p.name),
      fields: fieldList(p.fields),
      node: nodeIds.has(str(p.node)) ? str(p.node) : "",
      via: str(p.via),
      pass: p.pass === true,
    }))
    .filter((p, i, all) => all.findIndex((o) => o.id === p.id) === i);
}

function effectsFrom(v: unknown, plugin: string): EffectDef[] {
  return (Array.isArray(v) ? v : [])
    .filter(isObj)
    .filter((e) => typeof e.type === "string" && e.type !== "")
    .map((e) => ({
      type: str(e.type),
      plugin,
      hint: str(e.hint),
      detail: str(e.detail),
      replies: e.replies === true,
      ...(e.optionalReply === true ? { optionalReply: true } : {}),
      ...(e.noFail === true ? { noFail: true } : {}),
      ...(e.responds === true ? { responds: true } : {}),
    }));
}

function pluginsFrom(v: unknown): PluginManifest[] {
  return (Array.isArray(v) ? v : [])
    .filter(isObj)
    .filter(
      (p) =>
        /^[a-z][a-z0-9]*$/.test(str(p.name)) &&
        !(PLUGIN_NAMES as readonly string[]).includes(str(p.name)),
    )
    .map((p) => ({
      name: str(p.name),
      about: str(p.about),
      external: str(p.external),
      latency: Math.max(0, num(p.latency, 20)),
      timeout: Math.max(0, num(p.timeout, 0)),
      errorCode: str(p.errorCode, "ERR"),
      effects: effectsFrom(p.effects, str(p.name)),
    }))
    .filter((p, i, all) => all.findIndex((o) => o.name === p.name) === i);
}

function modulesFrom(v: unknown): ModuleDef[] {
  return (Array.isArray(v) ? v : [])
    .filter(isObj)
    .filter((d) => typeof d.id === "string" && d.id !== "")
    .map((d): ModuleDef => {
      const g = graphFrom(d.nodes, d.edges);
      const ids = new Set(g.nodes.map((n) => n.id));
      return {
        id: str(d.id),
        name: str(d.name, "module"),
        side: d.side === "frontend" ? "frontend" : "backend",
        about: str(d.about),
        inputs: portsFrom(d.inputs, ids),
        outputs: portsFrom(d.outputs, ids),
        reads: strList(d.reads),
        writes: strList(d.writes),
        plugins: strList(d.plugins),
        body: d.body === "code" || d.body === "pipe" ? d.body : "graph",
        source: str(d.source),
        held: str(d.held),
        stages: strList(d.stages),
        ...g,
        ...framesField(d.frames),
      };
    })
    .filter((d, i, all) => all.findIndex((o) => o.id === d.id) === i);
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

/** The lanes of a saved project: a field only when it has lanes of its own. */
/** The frames of a saved design: a field only when it has frames of its own (even none). */
function framesFrom(v: unknown): Frame[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const seen = new Set<string>();
  const frames: Frame[] = [];
  for (const x of v) {
    if (!isObj(x) || typeof x.id !== "string" || x.id === "" || seen.has(x.id))
      continue;
    seen.add(x.id);
    frames.push({
      id: x.id,
      name: str(x.name, "Frame"),
      x: Math.round(num(x.x, 0)),
      y: Math.round(num(x.y, 0)),
      w: Math.max(FRAME_MIN_W, Math.round(num(x.w, FRAME_W))),
      h: Math.max(FRAME_MIN_H, Math.round(num(x.h, FRAME_H))),
      role: (LANES as string[]).includes(str(x.role)) ? (x.role as Lane) : "",
    });
  }
  return frames;
}
const framesField = (v: unknown): { frames?: Frame[] } => {
  const frames = framesFrom(v);
  return frames ? { frames } : {};
};

function lanesFrom(v: unknown): LaneDef[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const seen = new Set<string>();
  const lanes: LaneDef[] = [];
  for (const x of v) {
    if (!isObj(x) || typeof x.id !== "string" || x.id === "" || seen.has(x.id))
      continue;
    seen.add(x.id);
    const h = Math.round(num(x.h, 0));
    lanes.push({
      id: x.id,
      name: str(x.name, x.id),
      role: (LANES as string[]).includes(str(x.role))
        ? (x.role as Lane)
        : "app",
      ...(h > 0 ? { h } : {}),
    });
  }
  return lanes.length > 0 ? lanes : undefined;
}
const lanesField = (v: unknown): { lanes?: LaneDef[] } => {
  const lanes = lanesFrom(v);
  return lanes ? { lanes } : {};
};

export function readModel(value: unknown): Model | string {
  if (
    !isObj(value) ||
    !Array.isArray(value.nodes) ||
    !Array.isArray(value.edges)
  )
    return "This is not a Flow Studio project (it needs nodes and edges).";
  const { nodes, edges } = graphFrom(value.nodes, value.edges);
  const ids = new Set(nodes.map((n) => n.id));
  const modules = modulesFrom(value.modules);
  const all = [
    ...nodes.map((n) => n.id),
    ...edges.map((e) => e.id),
    ...modules.flatMap((d) => [
      d.id,
      ...d.nodes.map((n) => n.id),
      ...d.edges.map((e) => e.id),
      ...d.inputs.map((p) => p.id),
      ...d.outputs.map((p) => p.id),
    ]),
  ];
  const top = all.reduce(
    (mx, id) => Math.max(mx, Number(/^(?:mod|[nep])(\d+)$/.exec(id)?.[1] ?? 0)),
    0,
  );
  return {
    name: str(value.name, "Imported flow"),
    nodes,
    edges,
    modules,
    plugins: pluginsFrom(value.plugins),
    db: dbFrom(value.db),
    conds: boolMap(value.conds),
    shared: strMap(value.shared),
    latency: Object.fromEntries(
      Object.entries(isObj(value.latency) ? value.latency : {})
        .filter(([, x]) => typeof x === "number" && x >= 0)
        .map(([k, x]) => [k, x as number]),
    ),
    scenario: scenarioFrom(value.scenario, ids),
    ...framesField(value.frames),
    ...lanesField(value.lanes),
    ...(num(value.laneW, 0) > 0
      ? { laneW: Math.round(num(value.laneW, 0)) }
      : {}),
    seq: Math.max(num(value.seq, 0), top),
  };
}

/** The manifests in a JSON text (an array, or one manifest), or a message. */
export function parsePlugins(text: string): PluginManifest[] | string {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch (e) {
    return `Not valid JSON: ${e instanceof Error ? e.message : String(e)}`;
  }
  const list = pluginsFrom(Array.isArray(v) ? v : [v]);
  return list.length
    ? list
    : "No plugin in it: a plugin needs a name (lower case letters and digits, not a built-in one) and effects.";
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
