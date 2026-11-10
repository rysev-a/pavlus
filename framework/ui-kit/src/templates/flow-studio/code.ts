// Code bodies of modules. A module whose body is code is a pure function body
// `(msg, state) => effects`, written with the effect builders of @pavlus/server
// (`pg.query`, `redis.incr`, `http.json`, `log.info`, `rq.merge`, ...). The studio
// runs it for real while it simulates: the builders here do not touch the world,
// they record the effects as data, which is what the real builders do as well.
//
// An effect leaves the module by a port: the port of an effect is the type of the
// plugin effect (`pg.query`), the port of `emit("login.allowed", payload)` is the
// message id. Where the port leads is the business of the diagram.
import {
  type ModuleDef,
  type ModulePort,
  type PluginManifest,
  payloadOf,
} from "./model.ts";
import { builderOf } from "./plugins.ts";

/** One effect as the code returned it. */
export interface CodeEffect {
  __fx: true;
  plugin: string;
  type: string;
  /** the port it leaves by; "" for a change of state */
  port: string;
  /** what the effect node of the simulation takes: sql, args, status, json, ... */
  args: Record<string, unknown>;
  replyTo?: string;
  onError?: string;
  timeoutMs?: number;
}

export interface CodeMsg {
  id: string;
  payload: unknown;
  ctx: { rid: string };
}

export interface CodeState {
  requests: Record<string, Record<string, unknown>>;
  shared: Record<string, unknown>;
  client: Record<string, unknown>;
}

export type CodeResult = { effects: CodeEffect[] } | { error: string };

interface Opts {
  replyTo?: string;
  onError?: string;
  timeoutMs?: number;
}

const make = (
  plugin: string,
  type: string,
  port: string,
  args: Record<string, unknown>,
  o: Opts = {},
): CodeEffect => ({
  __fx: true,
  plugin,
  type,
  port,
  args,
  ...(o.replyTo ? { replyTo: o.replyTo } : {}),
  ...(o.onError ? { onError: o.onError } : {}),
  ...(o.timeoutMs ? { timeoutMs: o.timeoutMs } : {}),
});

const str = (v: unknown): string =>
  typeof v === "string" ? v : v === undefined ? "" : JSON.stringify(v);

/** The builders: the names and shapes of the @pavlus/server effectors. */
function builders() {
  const redis = (args: string[], o: Opts = {}) =>
    make("redis", "cmd", "redis.cmd", { args }, o);
  return {
    pg: {
      query: (sql: unknown, o: Opts = {}, params: unknown[] = []) =>
        make("pg", "query", "pg.query", { sql: str(sql), params }, o),
      begin: (o: Opts = {}) => make("pg", "tx.begin", "pg.tx.begin", {}, o),
      commit: (tx: unknown, o: Opts = {}) =>
        make("pg", "tx.commit", "pg.tx.commit", { tx: str(tx) }, o),
      rollback: (tx: unknown, o: Opts = {}) =>
        make("pg", "tx.rollback", "pg.tx.rollback", { tx: str(tx) }, o),
    },
    redis: {
      get: (key: unknown, o?: Opts) => redis(["GET", str(key)], o),
      set: (
        key: unknown,
        value: unknown,
        o: Opts & { ex?: number; nx?: boolean } = {},
      ) =>
        redis(
          [
            "SET",
            str(key),
            str(value),
            ...(o.ex ? ["EX", String(o.ex)] : []),
            ...(o.nx ? ["NX"] : []),
          ],
          o,
        ),
      incr: (key: unknown, o?: Opts) => redis(["INCR", str(key)], o),
      del: (key: unknown, o?: Opts) => redis(["DEL", str(key)], o),
      expire: (key: unknown, sec: number, o?: Opts) =>
        redis(["EXPIRE", str(key), String(sec)], o),
      lrange: (key: unknown, a: number, b: number, o?: Opts) =>
        redis(["LRANGE", str(key), String(a), String(b)], o),
      lpush: (key: unknown, v: unknown, o?: Opts) =>
        redis(["LPUSH", str(key), str(v)], o),
      cmd: (args: unknown[], o?: Opts) => redis(args.map(str), o),
      pipeline: (cmds: unknown[][], o: Opts = {}) =>
        make(
          "redis",
          "pipeline",
          "redis.pipeline",
          { cmds: cmds.map((c) => c.map(str)) },
          o,
        ),
    },
    http: {
      json: (body: unknown, status = 200) =>
        make("http", "respond", "http.respond", { status, json: body }),
      sseStart: () => make("http", "sse.start", "http.sse", {}),
      /** the browser asks the server (a frontend module) */
      request: (method: string, path: string, body?: unknown) =>
        make("http", "request", "http.request", {
          method,
          path,
          ...(body === undefined ? {} : { body }),
        }),
    },
    log: Object.fromEntries(
      ["trace", "debug", "info", "warn", "error", "fatal"].map((level) => [
        level,
        (msg: unknown) =>
          make("log", "log", "log", { msg: `${level} ${str(msg)}` }),
      ]),
    ) as Record<
      "trace" | "debug" | "info" | "warn" | "error" | "fatal",
      (m: unknown) => CodeEffect
    >,
    crypto: {
      hash: (secret: unknown, o?: Opts) =>
        make("crypto", "hash", "crypto.hash", { secret: str(secret) }, o),
      verify: (secret: unknown, hash: unknown, o?: Opts) =>
        make(
          "crypto",
          "verify",
          "crypto.verify",
          { secret: str(secret), hash: str(hash) },
          o,
        ),
      randomToken: (o?: Opts) =>
        make("crypto", "randomToken", "crypto.randomToken", {}, o),
    },
    fetch: {
      request: (url: unknown, o: Opts & { method?: string } = {}) =>
        make(
          "fetch",
          "request",
          "fetch.request",
          { method: o.method ?? "GET", url: str(url) },
          o,
        ),
    },
    time: {
      after: (ms: number, replyTo: string, o: { payload?: unknown } = {}) =>
        make(
          "time",
          "timer.after",
          "timer.after",
          { ms, ...(o.payload === undefined ? {} : { payload: o.payload }) },
          { replyTo },
        ),
    },
    ws: {
      send: (text: unknown) =>
        make("ws", "send", "ws.send", { detail: str(text) }),
      broadcast: (room: unknown, text: unknown) =>
        make("ws", "broadcast", "ws.broadcast", {
          detail: `${str(room)} ${str(text)}`,
        }),
    },
    // changes of state: they leave by no port
    rq: {
      merge: (values: Record<string, unknown>) =>
        make("rq", "merge", "", { values }),
      set: (key: string, value: unknown) =>
        make("rq", "set", "", { key, value }),
      sharedSet: (key: string, value: unknown) =>
        make("rq", "sharedSet", "", { key, value }),
    },
    store: {
      set: (key: string, value: unknown) =>
        make("store", "set", "", { key, value }),
      merge: (values: Record<string, unknown>) =>
        make("store", "merge", "", { values }),
    },
    /** a message to another module: it leaves by the port of that name */
    emit: (id: string, payload?: unknown) =>
      make("app", "emit", id, payload === undefined ? {} : { payload }),
  };
}

type Builders = ReturnType<typeof builders>;
const NAMES = Object.keys(builders()) as (keyof Builders)[];

/** The builders of the plugins of the project: `mailer.send(detail, { replyTo })`. */
function customBuilders(
  plugins: PluginManifest[],
): Record<string, Record<string, (detail: unknown, o?: Opts) => CodeEffect>> {
  const out: Record<
    string,
    Record<string, (detail: unknown, o?: Opts) => CodeEffect>
  > = {};
  for (const p of plugins) {
    // a plugin cannot take the name of a builder of the sandbox
    if ((NAMES as string[]).includes(p.name)) continue;
    out[p.name] = Object.fromEntries(
      p.effects.map((e) => [
        builderOf(e.type),
        (detail: unknown, o: Opts = {}) =>
          make(
            p.name,
            e.type.slice(p.name.length + 1),
            e.type,
            { detail: str(detail) },
            o,
          ),
      ]),
    );
  }
  return out;
}

const compiled = new Map<string, Function | Error>();

function compile(source: string, extra: string[] = []): Function | Error {
  const key = `${extra.join(",")}\u0000${source}`;
  const hit = compiled.get(key);
  if (hit) return hit;
  let out: Function | Error;
  try {
    out = new Function(
      "msg",
      "state",
      ...NAMES,
      ...extra,
      `"use strict";\n${source}`,
    );
  } catch (e) {
    out = new Error(e instanceof Error ? e.message : String(e));
  }
  if (compiled.size > 500) compiled.clear();
  compiled.set(key, out);
  return out;
}

/** "" when the source parses, else the message of the parser. */
export function syntaxError(
  source: string,
  plugins: PluginManifest[] = [],
): string {
  const c = compile(source, Object.keys(customBuilders(plugins)));
  return c instanceof Error ? c.message : "";
}

/** Runs the body once. Never throws: a failure comes back as `{ error }`. */
export function runCode(
  source: string,
  msg: CodeMsg,
  state: CodeState,
  plugins: PluginManifest[] = [],
): CodeResult {
  const custom = customBuilders(plugins);
  const fn = compile(source, Object.keys(custom));
  if (fn instanceof Error) return { error: `syntax error: ${fn.message}` };
  const b = builders();
  try {
    const out = fn(
      msg,
      state,
      ...NAMES.map((n) => b[n]),
      ...Object.values(custom),
    );
    if (out === undefined || out === null) return { effects: [] };
    if (!Array.isArray(out))
      return { error: "the body must return an array of effects" };
    for (const x of out)
      if (!x || typeof x !== "object" || (x as CodeEffect).__fx !== true)
        return {
          error: `the body returned ${JSON.stringify(x)?.slice(0, 40) ?? String(x)}, which is not an effect`,
        };
    return { effects: out as CodeEffect[] };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

// ---- probing: what the code does with the examples of its input ports ----

export interface Probe {
  input: ModulePort;
  result: CodeResult;
}

/** Runs the code once per input port with the example payload of the port. */
export function probe(def: ModuleDef, plugins: PluginManifest[] = []): Probe[] {
  // the inputs are tried in order and the request slice goes from one to the next,
  // as it does in a request: what `order.created` kept is there for `loyalty.added`
  let slice: Record<string, unknown> = {};
  return def.inputs.map((input) => {
    const result = runCode(
      def.source,
      { id: input.name, payload: payloadOf(input.fields), ctx: { rid: "r1" } },
      {
        requests: { r1: JSON.parse(JSON.stringify(slice)) },
        shared: {},
        client: {},
      },
      plugins,
    );
    if ("effects" in result)
      for (const fx of result.effects) {
        if (fx.plugin !== "rq") continue;
        if (fx.type === "merge")
          slice = { ...slice, ...((fx.args.values ?? {}) as object) };
        else if (fx.type === "set")
          slice = { ...slice, [String(fx.args.key)]: fx.args.value };
      }
    return { input, result };
  });
}

export interface CodeIssue {
  rule:
    | "code-error"
    | "code-port-missing"
    | "code-port-silent"
    | "code-input-silent";
  severity: "error" | "warn" | "info";
  title: string;
  detail: string;
}

/** The port checks: does the code agree with the interface of the module? */
export function checkCode(
  def: ModuleDef,
  plugins: PluginManifest[] = [],
): CodeIssue[] {
  if (def.body !== "code") return [];
  const out: CodeIssue[] = [];
  const bad = syntaxError(def.source, plugins);
  if (bad) {
    out.push({
      rule: "code-error",
      severity: "error",
      title: `${def.name}: the code does not parse`,
      detail: bad,
    });
    return out;
  }
  const seen = new Set<string>();
  for (const p of probe(def, plugins)) {
    if ("error" in p.result) {
      out.push({
        rule: "code-error",
        severity: "error",
        title: `${def.name}: the code fails on ${p.input.name}`,
        detail: p.result.error,
      });
      continue;
    }
    const ports = p.result.effects.map((e) => e.port).filter(Boolean);
    ports.forEach((x) => seen.add(x));
    if (p.result.effects.length === 0)
      out.push({
        rule: "code-input-silent",
        severity: "info",
        title: `${def.name}: ${p.input.name} returns no effects`,
        detail:
          "With the example payload of the port the body returns an empty list. Fine if it only changes state; check the case of the message id.",
      });
    for (const port of ports)
      if (!def.outputs.some((o) => o.name === port))
        out.push({
          rule: "code-port-missing",
          severity: "warn",
          title: `${def.name}: the code emits ${port} but no output port has that name`,
          detail:
            "Add an output port with this message id (Sync ports does it), or the effect goes nowhere.",
        });
  }
  for (const o of def.outputs)
    if (!seen.has(o.name))
      out.push({
        rule: "code-port-silent",
        severity: "info",
        title: `${def.name}: the output ${o.name} is not emitted for the examples`,
        detail:
          "No input port, with its example payload, makes the code emit it. A branch the examples do not reach, or a port that is not needed.",
      });
  return out;
}

/** The ports the code emits (for the examples of its inputs) that have no output yet. */
export function missingOutputs(
  def: ModuleDef,
  plugins: PluginManifest[] = [],
): string[] {
  const have = new Set(def.outputs.map((o) => o.name));
  const out: string[] = [];
  for (const p of probe(def, plugins))
    if ("effects" in p.result)
      for (const e of p.result.effects)
        if (e.port && !have.has(e.port) && !out.includes(e.port))
          out.push(e.port);
  return out;
}

/** The body a new code module starts with. */
export const codeTemplate = (input: string, output: string): string =>
  `// A pure function body: (msg, state) => effects.
// Effects are data. Builders: pg, redis, http, log, crypto, fetch, time, ws, emit;
// state changes: rq.merge({ ... }), rq.set(k, v), rq.sharedSet(k, v).
// msg.id is the input port, msg.payload its payload, state.requests[msg.ctx.rid]
// the memory of this request.
switch (msg.id) {
  case ${JSON.stringify(input)}:
    return [emit(${JSON.stringify(output)}, msg.payload)];
}
return [];
`;

// ---- the view of a code body, for the panel ----

export interface CodeView {
  name: string;
  side: string;
  source: string;
  /** "" when the source parses */
  syntax: string;
  probes: { k: string; input: string; lines: string[]; error: string }[];
  issues: { k: string; severity: string; title: string; detail: string }[];
  /** the output ports the code emits and the module lacks, comma separated */
  missing: string;
  /** disabled: nothing to sync */
  syncDisabled: boolean;
  held: boolean;
}

const brief = (v: unknown): string => {
  const t = JSON.stringify(v);
  return t.length > 90 ? `${t.slice(0, 89)}…` : t;
};

export function codeViewOf(
  def: ModuleDef,
  plugins: PluginManifest[] = [],
): CodeView {
  const probes = def.body === "code" ? probe(def, plugins) : [];
  return {
    name: def.name,
    side: def.side === "frontend" ? "browser" : "server",
    source: def.source,
    syntax: syntaxError(def.source, plugins),
    probes: probes.map((p) => ({
      k: p.input.id,
      input: p.input.name,
      error: "error" in p.result ? p.result.error : "",
      lines:
        "effects" in p.result
          ? p.result.effects.map(
              (e) =>
                `${e.port || `${e.plugin}.${e.type} (state)`}  ${brief(e.args)}${e.replyTo ? `  replyTo ${e.replyTo}` : ""}`,
            )
          : [],
    })),
    issues: checkCode(def, plugins).map((i, k) => ({ k: String(k), ...i })),
    missing: missingOutputs(def, plugins).join(", "),
    syncDisabled: missingOutputs(def, plugins).length === 0,
    held: def.held !== "",
  };
}
