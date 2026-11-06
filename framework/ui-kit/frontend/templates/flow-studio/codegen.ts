// Code out: from the design, (a) a @pavlus/backend skeleton (a pure handler module per
// route in the style of server/examples/todo-api, a routes table, a conditions
// module and the plugin wiring), (b) `scenario` tests played from the simulated
// happy path and each fault path with @pavlus/backend/testing, (c) pavlus frontend
// handlers. Pure: text out. The generated TypeScript is parsed in the unit tests.

import { probe } from "./code.ts";
import {
  type Step,
  simulate,
  stepsOf,
  type Variant,
  variantsOf,
} from "./engine.ts";
import {
  condName,
  customOf,
  effectDefIn,
  type FieldType,
  type FlowEdge,
  type FlowNode,
  findDef,
  findNode,
  inEdges,
  isExprCond,
  type Model,
  type ModuleDef,
  outEdges,
  type PayloadField,
  payloadOf,
  slugify,
} from "./model.ts";
import { flatten } from "./modules.ts";
import { builderOf, pluginStub, usedCustom } from "./plugins.ts";
import { dbModule, schemaSql, seedModule } from "./schema.ts";

export interface GenFile {
  path: string;
  group: "server" | "tests" | "frontend" | "project";
  title: string;
  code: string;
}

// ---- small text helpers ----

const q = (s: string): string => JSON.stringify(s);
const ident = (s: string): string => {
  const parts = s
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  const id = parts
    .map((p, i) =>
      i === 0
        ? p[0].toLowerCase() + p.slice(1)
        : p[0].toUpperCase() + p.slice(1),
    )
    .join("");
  return /^[A-Za-z_]/.test(id) ? id : `_${id}`;
};
const indent = (s: string, n: number): string =>
  s
    .split("\n")
    .map((l) => (l ? " ".repeat(n) + l : l))
    .join("\n");

type Side = "server" | "client";

/** `{payload.rows.0.id}` -> `p.rows?.[0]?.id` */
export function pathExpr(path: string, side: Side): string {
  const segs = path.split(".");
  const head = segs[0];
  const tail = segs.slice(1);
  const walk = (base: string, rest: string[], opt: boolean): string =>
    rest.reduce(
      (acc, s) =>
        /^\d+$/.test(s)
          ? `${acc}${opt ? "?." : ""}[${s}]`
          : `${acc}${opt ? "?." : "."}${s}`,
      base,
    );
  if (side === "client") {
    const msgBase = "(msg.payload as any)";
    if (head === "payload") {
      const rest = tail[0] === "body" ? ["data", ...tail.slice(1)] : tail;
      return walk(msgBase, rest, true);
    }
    if (head === "client") return walk("state", tail, true);
    return walk("state", segs, true);
  }
  if (head === "payload") return walk("p", tail, true);
  if (head === "req") return walk("req", tail, true);
  if (head === "shared") return walk("(state.shared as any)", tail, true);
  if (head === "rid") return "String(msg.ctx?.rid)";
  if (head === "client") return "undefined";
  return `(req.${segs[0]} ?? p.${segs[0]})`;
}

const REF = /\{([A-Za-z_][\w.]*)\}/g;

/** A text with `{refs}` as a JS expression: a literal, a reference, or a template literal. */
export function textExpr(template: string, side: Side): string {
  const whole = /^\{([A-Za-z_][\w.]*)\}$/.exec(template.trim());
  if (whole) return pathExpr(whole[1], side);
  if (!REF.test(template)) {
    REF.lastIndex = 0;
    return literalExpr(template);
  }
  REF.lastIndex = 0;
  const body = template
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\$\{/g, "\\${")
    .replace(REF, (_, p: string) => `\${${pathExpr(p, side)}}`);
  return `\`${body}\``;
}

/** `12` -> 12, `true` -> true, text -> a string literal */
function literalExpr(text: string): string {
  const t = text.trim();
  if (
    /^-?\d+(\.\d+)?$/.test(t) ||
    t === "true" ||
    t === "false" ||
    t === "null"
  )
    return t;
  return q(text);
}

/**
 * A JSON-ish text with `{refs}` (a response body) as a JS expression. Refs inside
 * a string become template literals; a bare ref stands for the value.
 */
export function jsonExpr(detail: string, side: Side): string {
  const refs: string[] = [];
  let out = "";
  let inStr = false;
  for (let i = 0; i < detail.length; i++) {
    const c = detail[i];
    if (c === "\\" && inStr) {
      out += c + (detail[++i] ?? "");
      continue;
    }
    if (c === '"') inStr = !inStr;
    if (c === "{") {
      REF.lastIndex = 0;
      const m = /^\{([A-Za-z_][\w.]*)\}/.exec(detail.slice(i));
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
    return `{} /* TODO: ${detail.replace(/\*\//g, "")} */`;
  }
  const emit = (v: unknown, pad: number): string => {
    if (typeof v === "string") {
      const whole = /^\u00a7(\d+)\u00a7$/.exec(v);
      if (whole) return pathExpr(refs[Number(whole[1])], side);
      if (v.includes("\u00a7")) {
        const body = v
          .replace(/\\/g, "\\\\")
          .replace(/`/g, "\\`")
          .replace(/\$\{/g, "\\${")
          .replace(
            /\u00a7(\d+)\u00a7/g,
            (_, n: string) => `\${${pathExpr(refs[Number(n)], side)}}`,
          );
        return `\`${body}\``;
      }
      return q(v);
    }
    if (Array.isArray(v)) return `[${v.map((x) => emit(x, pad)).join(", ")}]`;
    if (v && typeof v === "object") {
      const entries = Object.entries(v as Record<string, unknown>);
      if (entries.length === 0) return "{}";
      return `{ ${entries.map(([k, x]) => `${/^[A-Za-z_]\w*$/.test(k) ? k : q(k)}: ${emit(x, pad)}`).join(", ")} }`;
    }
    return JSON.stringify(v);
  };
  return emit(value, 0);
}

/** the fields of a payload as an object literal */
function fieldsExpr(edge: FlowEdge, side: Side, prefix = ""): string {
  const tree: Record<string, unknown> = {};
  for (const f of edge.payload) {
    if (!f.name.startsWith(prefix)) continue;
    const name = f.name.slice(prefix.length).replace(/^\./, "");
    if (!name) continue;
    const keys = name.split(".");
    let cur = tree;
    for (const k of keys.slice(0, -1)) {
      if (typeof cur[k] !== "object" || cur[k] === null) cur[k] = {};
      cur = cur[k] as Record<string, unknown>;
    }
    cur[keys[keys.length - 1]] = f;
  }
  const emit = (t: Record<string, unknown>): string => {
    const entries = Object.entries(t).map(([k, v]) => {
      const key = /^[A-Za-z_]\w*$/.test(k) ? k : q(k);
      if (v && typeof v === "object" && "example" in (v as object))
        return `${key}: ${valueExpr(v as FlowEdge["payload"][number], side)}`;
      return `${key}: ${emit(v as Record<string, unknown>)}`;
    });
    return entries.length ? `{ ${entries.join(", ")} }` : "{}";
  };
  return emit(tree);
}

function valueExpr(f: FlowEdge["payload"][number], side: Side): string {
  if (f.example.includes("{")) return textExpr(f.example, side);
  if (f.type === "number")
    return Number.isFinite(Number(f.example)) && f.example !== ""
      ? String(Number(f.example))
      : "0";
  if (f.type === "boolean")
    return f.example.trim() === "true" ? "true" : "false";
  if (f.type === "array" || f.type === "object" || f.type === "any") {
    try {
      return JSON.stringify(JSON.parse(f.example));
    } catch {
      return f.example === ""
        ? f.type === "array"
          ? "[]"
          : "{}"
        : q(f.example);
    }
  }
  return q(f.example);
}

// ---- the server ----

/** the plugins a file uses: the built-in ones by name, those of the project as `custom:<name>` */
type Imports = Record<string, boolean | undefined>;

const routeParts = (n: FlowNode): { method: string; path: string } => {
  const m = /^(\w+)\s+(\S+)/.exec(n.title.trim());
  return { method: (m?.[1] ?? "GET").toUpperCase(), path: m?.[2] ?? n.title };
};

const isWs = (n: FlowNode): boolean => routeParts(n).method === "WS";

/** the message id of a route */
export const routeMsg = (n: FlowNode): string =>
  n.detail || `${slugify(n.title).replace(/-/g, ".")}`;

/** the handler nodes reached from a node, stopping at routes and at nodes already taken */
function handlersFrom(m: Model, start: string, taken: Set<string>): FlowNode[] {
  const found: FlowNode[] = [];
  const seen = new Set<string>([start]);
  const todo = [start];
  while (todo.length) {
    const id = todo.shift()!;
    for (const e of outEdges(m, id)) {
      const to = findNode(m, e.to);
      if (!to || seen.has(to.id) || to.kind === "route") continue;
      seen.add(to.id);
      todo.push(to.id);
      if (["handler", "reply", "error"].includes(to.kind) && !taken.has(to.id))
        found.push(to);
    }
  }
  return found;
}

export interface Plan {
  modules: { slug: string; title: string; handlers: FlowNode[] }[];
  common: FlowNode[];
  routes: FlowNode[];
}

/** Which handler goes in which module: by the first route that reaches it. */
export function planOf(source: Model): Plan {
  return planFrom(flatten(source));
}

function planFrom(m: Model): Plan {
  const routes = m.nodes.filter((n) => n.kind === "route");
  const taken = new Set<string>();
  const reachedBy = new Map<string, string[]>();
  for (const r of routes)
    for (const h of handlersFrom(m, r.id, new Set()))
      reachedBy.set(h.id, [...(reachedBy.get(h.id) ?? []), r.id]);
  const modules: Plan["modules"] = [];
  const slugs = new Set<string>();
  for (const r of routes) {
    const own = handlersFrom(m, r.id, new Set()).filter(
      (h) => (reachedBy.get(h.id) ?? []).length === 1 && !taken.has(h.id),
    );
    own.forEach((h) => taken.add(h.id));
    let slug = slugify(routeMsg(r));
    for (let i = 2; slugs.has(slug); i++) slug = `${slugify(routeMsg(r))}-${i}`;
    slugs.add(slug);
    modules.push({ slug, title: r.title, handlers: own });
  }
  const common = m.nodes.filter(
    (n) => ["handler", "reply", "error"].includes(n.kind) && !taken.has(n.id),
  );
  return { modules, common, routes };
}

/**
 * An expression condition (`payload.rowCount == 0`) as TypeScript in a handler:
 * `payload` is the `p` of the case, `req` its slice; a path reads null-safe.
 */
export function exprToTs(src: string): string {
  return src
    .replace(/\bpayload\b/g, "p")
    .replace(/\bshared\b/g, "(state.shared as any)")
    .replace(/\brid\b/g, "String(msg.ctx?.rid)")
    .replace(
      /\b(p|req)((?:\.[A-Za-z_]\w*|\[\d+\])+)/g,
      (_, head: string, tail: string) =>
        head + tail.replace(/\.(?=[A-Za-z_])/g, "?.").replace(/\[/g, "?.["),
    );
}

/** the test of a condition, named or an expression */
function condTest(cond: string): string {
  if (isExprCond(cond)) return `(${exprToTs(cond)})`;
  const neg = cond.startsWith("!");
  return `${neg ? "!" : ""}${condCall(condName(cond))}`;
}

function condCall(name: string): string {
  return `${ident(name)}(msg, state)`;
}

interface EffCall {
  code: string;
  uses: string;
}

/** `GET key` / `SET key value EX 60` as the redis effector call */
function redisCall(
  detail: string,
  opts: string,
): { code: string; arg?: undefined } {
  const toks = detail.trim().split(/\s+/).filter(Boolean);
  const cmd = (toks[0] ?? "GET").toUpperCase();
  const a = toks.slice(1);
  const k = (i: number): string => textExpr(a[i] ?? "key", "server");
  const o = opts ? `, ${opts}` : "";
  switch (cmd) {
    case "GET":
      return { code: `redis.get(${k(0)}${o})` };
    case "INCR":
      return { code: `redis.incr(${k(0)}${o})` };
    case "DEL":
      return { code: `redis.del(${k(0)}${o})` };
    case "EXPIRE":
      return { code: `redis.expire(${k(0)}, ${Number(a[1]) || 60}${o})` };
    case "LRANGE":
      return {
        code: `redis.lrange(${k(0)}, ${Number(a[1]) || 0}, ${Number(a[2]) || -1}${o})`,
      };
    case "LPUSH":
      return {
        code: `redis.lpush(${k(0)}, ${textExpr(a.slice(1).join(" ") || "value", "server")}${o})`,
      };
    case "SET": {
      const exI = a.findIndex((x) => x.toUpperCase() === "EX");
      const nx = a.some((x) => x.toUpperCase() === "NX");
      const valToks = a.slice(
        1,
        [exI, a.findIndex((x) => x.toUpperCase() === "NX")]
          .filter((i) => i > 0)
          .sort((x, y) => x - y)[0] ?? a.length,
      );
      const set = [
        exI > 0 ? `ex: ${Number(a[exI + 1]) || 60}` : "",
        nx ? "nx: true" : "",
        opts ? opts.replace(/^\{\s*/, "").replace(/\s*\}$/, "") : "",
      ]
        .filter(Boolean)
        .join(", ");
      return {
        code: `redis.set(${k(0)}, ${textExpr(valToks.join(" ") || "1", "server")}${set ? `, { ${set} }` : ""})`,
      };
    }
    default:
      return {
        code: `redis.cmd([${toks.map((t) => textExpr(t, "server")).join(", ")}]${o})`,
      };
  }
}

function effectCall(m: Model, n: FlowNode): EffCall {
  const out = outEdges(m, n.id);
  const reply = out.find((e) => e.kind === "reply");
  const err = out.find((e) => e.kind === "error");
  const optList = [
    reply ? `replyTo: ${q(reply.msg)}` : "",
    err ? `onError: ${q(err.msg)}` : "",
  ].filter(Boolean);
  const opts = optList.length ? `{ ${optList.join(", ")} }` : "";
  const tmo = n.timeoutMs ? `timeoutMs: ${n.timeoutMs}` : "";
  const optsT =
    optList.length || tmo
      ? `{ ${[...optList, tmo].filter(Boolean).join(", ")} }`
      : "";
  switch (n.title) {
    case "pg.query": {
      // a {ref} in the sql is a parameter: the value is passed, never pasted
      const own = (n.detail.match(/\$\d+/g) ?? []).reduce(
        (mx, x) => Math.max(mx, Number(x.slice(1))),
        0,
      );
      const refs: string[] = [];
      const sql = n.detail.replace(
        /\{([A-Za-z_][\w.]*)\}/g,
        (_, path: string) => {
          refs.push(`json(${pathExpr(path, "server")})`);
          return "$" + String(own + refs.length);
        },
      );
      const list = [
        ...Array.from({ length: own }, (_, i) => `/* $${i + 1} */ undefined`),
        ...refs,
      ];
      const params = list.length ? `, [${list.join(", ")}]` : "";
      return {
        uses: "pg",
        code: `pg.query(${q(sql)}, ${opts || '{ replyTo: "" }'}${params})`,
      };
    }
    case "pg.tx.begin":
      return { uses: "pg", code: `pg.begin(${opts || '{ replyTo: "" }'})` };
    case "pg.tx.commit":
      return {
        uses: "pg",
        code: `pg.commit(String(req.tx), ${opts || '{ replyTo: "" }'})`,
      };
    case "pg.tx.rollback":
      return {
        uses: "pg",
        code: `pg.rollback(String(req.tx)${opts ? `, ${opts}` : ""})`,
      };
    case "redis.cmd":
      return { uses: "redis", code: redisCall(n.detail, optsT).code };
    case "redis.pipeline": {
      const cmds = n.detail
        .split(";")
        .map((c) => c.trim())
        .filter(Boolean)
        .map(
          (c) =>
            `[${c
              .split(/\s+/)
              .map((t) => textExpr(t, "server"))
              .join(", ")}]`,
        );
      return {
        uses: "redis",
        code: `redis.pipeline([${cmds.join(", ")}], ${opts || "{}"})`,
      };
    }
    case "fetch.request": {
      const mm = /^([A-Z]+)\s+(\S+)/.exec(n.detail.trim());
      const o = [`method: ${q(mm?.[1] ?? "GET")}`, ...optList, tmo].filter(
        Boolean,
      );
      return {
        uses: "fetch",
        // the FetchEffect type has no index signature, so it needs the cast to Effect
        code: `fetch.request(${textExpr(mm?.[2] ?? n.detail, "server")}, { ${o.join(", ")} }) as unknown as Effect`,
      };
    }
    case "timer.after":
      return {
        uses: "time",
        code: `time.after(${Number(n.detail) || 1000}, ${q(reply?.msg ?? "request.timeout")})`,
      };
    case "crypto.hash":
      return {
        uses: "crypto",
        code: `crypto.hash(String(req.secret), ${opts || "{}"})`,
      };
    case "crypto.verify":
      return {
        uses: "crypto",
        code: `crypto.verify(String(req.secret), String(req.hash), ${opts || "{}"})`,
      };
    case "crypto.randomToken":
      return { uses: "crypto", code: `crypto.randomToken(${opts})` };
    case "http.respond":
      return {
        uses: "http",
        code: `http.json(${jsonExpr(n.detail || "{}", "server")}, ${n.status || 200})`,
      };
    case "http.sse":
      return { uses: "http", code: "http.sseStart()" };
    case "ws.send":
      return {
        uses: "ws",
        code: `ws.send(${textExpr(n.detail || "ok", "server")})`,
      };
    case "ws.broadcast": {
      const room = /^room\s+(.+)$/.exec(n.detail)?.[1] ?? "general";
      return {
        uses: "ws",
        code: `ws.broadcast(${textExpr(room, "server")}, ${textExpr("{req.text}", "server")})`,
      };
    }
    case "log": {
      const mm = /^(trace|debug|info|warn|error|fatal)\s+(.*)$/.exec(
        n.detail.trim(),
      );
      const level = mm?.[1] ?? "info";
      return {
        uses: "log",
        code: `log.${level}(${textExpr(mm?.[2] ?? n.detail, "server")})`,
      };
    }
  }
  // an effect of a plugin of the project: its builder, made from the manifest
  if (customOf(m.plugins, n.plugin))
    return {
      uses: `custom:${n.plugin}`,
      code: `${n.plugin}.${builderOf(n.title)}(${textExpr(n.detail || "", "server")}${opts ? `, ${opts}` : ""})`,
    };
  return { uses: "rq", code: `/* TODO ${n.title} */ log.info(${q(n.title)})` };
}

/** The imports of the plugins a file uses, as lines, from `names` of `used`. */
function importLines(used: Imports, from: string): string[] {
  const names = Object.keys(IMPORT_AS)
    .filter((k) => used[k])
    .map((k) => IMPORT_AS[k]);
  const custom = Object.keys(used)
    .filter((k) => k.startsWith("custom:") && used[k])
    .map((k) => k.slice(7));
  return [
    `import {\n${["type ServerState", ...names].map((n) => `  ${n},`).join("\n")}\n} from "@pavlus/backend";`,
    ...custom.map(
      (c) => `import { ${c}Effector as ${c} } from "${from}/plugins/${c}.ts";`,
    ),
  ];
}

const IMPORT_AS: Record<string, string> = {
  pg: "pgEffector as pg",
  redis: "redisEffector as redis",
  http: "httpEffector as http",
  crypto: "cryptoEffector as crypto",
  log: "logEffector as log",
  ws: "wsEffector as ws",
  fetch: "fetchEffector as fetch",
  time: "timeEffector as time",
  rq: "requestsEffector as rq",
};

/** the body of the `case` of a handler node */
/** what a module adds to the handlers of its body (see `moduleFile`) */
interface Extra {
  /** more labels of the `case` of a handler: the input ports bound to it */
  labels: (h: FlowNode) => string[];
  /** more effects of a handler: messages to modules, effects of the outer edges */
  emits: (h: FlowNode, used: Imports) => { cond: string; code: string }[];
  /** where the file of `emit` is, relative to the generated file */
  emitFrom: string;
}

function caseBody(
  m: Model,
  h: FlowNode,
  used: Imports,
  conds: Set<string>,
  extra?: Extra,
): string {
  const lines: string[] = [];
  const pre: string[] = [];
  const reqKeys = Object.entries(h.reqSet);
  if (reqKeys.length) {
    used.rq = true;
    lines.push(
      `rq.merge({ ${reqKeys.map(([k, v]) => `${/^[A-Za-z_]\w*$/.test(k) ? k : q(k)}: ${textExpr(v, "server")}`).join(", ")} })`,
    );
  }
  for (const [k, v] of Object.entries(h.sharedSet)) {
    used.rq = true;
    lines.push(`rq.sharedSet(${q(k)}, ${textExpr(v, "server")})`);
  }
  const items: { cond: string; code: string }[] = lines.map((code) => ({
    cond: "",
    code,
  }));
  for (const e of outEdges(m, h.id)) {
    const to = findNode(m, e.to);
    if (!to || to.kind !== "effect") continue;
    const call = effectCall(m, to);
    used[call.uses] = true;
    if (e.cond.trim() && !isExprCond(e.cond)) conds.add(e.cond.trim());
    items.push({ cond: e.cond.trim(), code: call.code });
  }
  for (const x of extra?.emits(h, used) ?? []) {
    if (x.cond && !isExprCond(x.cond)) conds.add(x.cond);
    items.push(x);
  }
  const anyCond = items.some((i) => i.cond);
  const text = (i: { cond: string; code: string }): string =>
    `${i.code} ${isExprCond(i.cond) ? exprToTs(i.cond) : ""}`;
  const hasPayload = items.some((i) => /\bp\b/.test(text(i)));
  const hasReq = items.some((i) => /\breq\b/.test(text(i)));
  if (hasPayload)
    pre.push("const p = (msg.payload ?? {}) as Record<string, any>;");
  if (hasReq)
    pre.push(
      "const req = (state.requests[msg.ctx!.rid as string] ?? {}) as Record<string, any>;",
    );
  if (!anyCond) {
    const body = items.length
      ? `return [\n${items.map((i) => `  ${i.code},`).join("\n")}\n];`
      : "return [];";
    return [...pre, body].join("\n");
  }
  const out = ["const out: Effect[] = [];"];
  for (const i of items) {
    if (!i.cond) out.push(`out.push(${i.code});`);
    else {
      out.push(`if (${condTest(i.cond)}) out.push(${i.code});`);
    }
  }
  out.push("return out;");
  return [...pre, ...out].join("\n");
}

function handlerModule(
  m: Model,
  title: string,
  handlers: FlowNode[],
  condImport: string,
  extra?: Extra,
  header: string[] = [],
): { code: string; conds: Set<string> } {
  const used: Imports = {};
  const conds = new Set<string>();
  const cases: string[] = [];
  const seen = new Set<string>();
  for (const h of handlers) {
    const id = h.title;
    if (seen.has(id)) continue;
    seen.add(id);
    // the route's message is the id of the first handler it reaches
    const labels = [...new Set([id, ...(extra?.labels(h) ?? [])])]
      .map((l) => `case ${q(l)}:`)
      .join(" ");
    cases.push(
      `${labels} {${h.detail ? `\n  // ${h.detail}` : ""}\n${indent(caseBody(m, h, used, conds, extra), 2)}\n}`,
    );
  }
  const body = cases.join("\n");
  const condNames = [...conds].map((c) => ident(condName(c)));
  const head = [
    `// ${title}: the handlers of this route. Pure: (msg, state) => effects.`,
    `// Every effect names its replyTo and onError; the runtime stamps the rid on them.`,
    `import type { Effect, Message } from "@pavlus/frontend";`,
    ...importLines(used, ".."),
    ...(extra && /\bemit\(/.test(body)
      ? [`import { emit } from "${extra.emitFrom}";`]
      : []),
    ...(/\bjson\(/.test(body) ? ["", JSON_HELPER] : []),
    ...(condNames.length
      ? [
          `import { ${[...new Set(condNames)].join(", ")} } from "${condImport}";`,
        ]
      : []),
    "",
    ...header,
  ];
  const code = `${head.join("\n")}
export function handle(msg: Message, state: ServerState): Effect[] | undefined {
  switch (msg.id) {
${indent(body, 4)}
  }
  return undefined;
}
`;
  return { code: code.replace(/\n\n\n+/g, "\n\n"), conds };
}

// ---- modules: one file per module, the ports as types ----

const hasModules = (m: Model): boolean =>
  m.nodes.some((n) => n.kind === "module") || m.modules.length > 0;

const Pascal = (s: string): string =>
  s
    .replace(/[^A-Za-z0-9]+(.)?/g, (_, c: string) => (c ? c.toUpperCase() : ""))
    .replace(/^./, (c) => c.toUpperCase());

const TS_TYPE: Record<FieldType, string> = {
  string: "string",
  number: "number",
  boolean: "boolean",
  object: "Record<string, unknown>",
  array: "unknown[]",
  any: "unknown",
};

/** `body.email:string, count:number` as an object type; nested by the dotted names */
export function payloadType(fields: PayloadField[]): string {
  type Tree = { [k: string]: string | Tree };
  const tree: Tree = {};
  for (const f of fields) {
    if (!f.name) continue;
    const path = f.name.split(".").filter(Boolean);
    let cur = tree;
    for (const k of path.slice(0, -1)) {
      if (typeof cur[k] !== "object") cur[k] = {};
      cur = cur[k] as Tree;
    }
    cur[path[path.length - 1]] = TS_TYPE[f.type];
  }
  const render = (t: Tree, ind: string): string =>
    Object.entries(t)
      .map(
        ([k, v]) =>
          `${ind}${/^[A-Za-z_]\w*$/.test(k) ? k : q(k)}: ${
            typeof v === "string" ? v : `{\n${render(v, `${ind}  `)}\n${ind}}`
          };`,
      )
      .join("\n");
  return Object.keys(tree).length
    ? `{\n${render(tree, "  ")}\n}`
    : "Record<string, unknown>";
}

/** the modules the design uses, at any depth, in the order of the library */
export function usedModules(m: Model): ModuleDef[] {
  const used = new Set<string>();
  const visit = (nodes: FlowNode[]): void => {
    for (const n of nodes)
      if (n.kind === "module" && !used.has(n.ref)) {
        used.add(n.ref);
        const d = findDef(m, n.ref);
        if (d) visit(d.nodes);
      }
  };
  visit(m.nodes);
  return m.modules.filter((d) => used.has(d.id));
}

const slugOf = (d: ModuleDef): string => slugify(d.name);

/** where an instance of a module is: the graph it is in, its node, the module that graph is the body of */
function instanceOf(
  m: Model,
  defId: string,
): { graph: Model; node: FlowNode; owner?: ModuleDef } | undefined {
  const graphs: { graph: Model; owner?: ModuleDef }[] = [
    { graph: m },
    ...m.modules.map((d) => ({
      graph: { ...m, nodes: d.nodes, edges: d.edges },
      owner: d,
    })),
  ];
  for (const { graph, owner } of graphs) {
    const node = graph.nodes.find(
      (n) => n.kind === "module" && n.ref === defId,
    );
    if (node) return { graph, node, owner };
  }
  return undefined;
}

/**
 * The edges that leave a module by one of its output ports. A port that the module
 * it is an instance in shows as its own (a pipe does) is followed up to the edges of
 * that module's instance, so the stage that ends a pipe still reaches what the pipe does.
 */
function outerEdges(
  m: Model,
  defId: string,
  portId: string,
  depth = 0,
): { graph: Model; edge: FlowEdge }[] {
  const at = instanceOf(m, defId);
  if (!at || depth > 8) return [];
  const first = findDef(m, defId)?.outputs[0]?.id;
  const direct = outEdges(at.graph, at.node.id)
    .filter((e) => e.fromPort === portId || (!e.fromPort && portId === first))
    .map((edge) => ({ graph: at.graph, edge }));
  const exposed = (at.owner?.outputs ?? []).filter(
    (p) => p.node === at.node.id && p.via === portId,
  );
  return [
    ...direct,
    ...exposed.flatMap((p) => outerEdges(m, at.owner!.id, p.id, depth + 1)),
  ];
}

/** the input port of a module an edge arrives at */
const inPortOf = (m: Model, to: FlowNode, e: FlowEdge) => {
  const d = findDef(m, to.ref);
  return (
    d?.inputs.find((p) => p.id === e.toPort) ??
    d?.inputs.find((p) => p.name === e.msg) ??
    d?.inputs[0]
  );
};

/** the messages a handler sends to module instances: `emit(port, p)` */
function emitsToModules(
  m: Model,
  g: Model,
  h: FlowNode,
): { cond: string; code: string }[] {
  const out: { cond: string; code: string }[] = [];
  for (const e of outEdges(g, h.id)) {
    const to = findNode(g, e.to);
    if (to?.kind === "module")
      out.push({
        cond: e.cond.trim(),
        code: `emit(${q(inPortOf(m, to, e)?.name ?? e.msg)}, p)`,
      });
  }
  return out;
}

const PORT_TYPES = (d: ModuleDef): string[] =>
  [...d.inputs, ...d.outputs]
    .filter(
      (p, i, all) =>
        p.fields.length && all.findIndex((o) => o.name === p.name) === i,
    )
    .map(
      (p) =>
        `/** the payload of ${p.name} */\nexport interface ${Pascal(p.name)}Payload ${payloadType(p.fields)}`,
    );

const portsHeader = (d: ModuleDef): string[] => [
  `export const inputs = [${d.inputs.map((p) => q(p.name)).join(", ")}] as const;`,
  `export const outputs = [${d.outputs.map((p) => q(p.name)).join(", ")}] as const;`,
  "",
  ...PORT_TYPES(d).flatMap((t) => [t, ""]),
];

const PLUGIN_USE: [string, RegExp][] = [
  ["pg", /\bpg\./],
  ["redis", /\bredis\./],
  ["http", /\bhttp\./],
  ["crypto", /\bcrypto\./],
  ["log", /\blog\./],
  ["ws", /\bws\./],
  ["fetch", /\bfetch\./],
  ["time", /\btime\./],
  ["rq", /\brq\./],
];

/** The file of a module with a body of code: the source, between the ports. */
function codeFile(d: ModuleDef, m: Model): string {
  const used: Imports = {};
  for (const [k, re] of PLUGIN_USE) if (re.test(d.source)) used[k] = true;
  for (const p of m.plugins)
    if (new RegExp(`\\b${p.name}\\.`).test(d.source))
      used[`custom:${p.name}`] = true;
  const uses = /\bemit\(/.test(d.source);
  return `// ${d.name} (${d.side === "frontend" ? "browser" : "server"} module, code body)${d.about ? `: ${d.about}` : ""}
// A pure function: (msg, state) => effects. The body below is the one of the design.
import type { Effect, Message } from "@pavlus/frontend";
${importLines(used, "..").join("\n")}
${uses ? 'import { emit } from "./emit.ts";' : ""}

${portsHeader(d).join("\n")}
export function handle(message: Message, serverState: ServerState): Effect[] | undefined {
  if (!(inputs as readonly string[]).includes(message.id)) return undefined;
  // the body reads the payload and the slices of the requests as plain data
  const msg = message as Message & { payload: any; ctx: { rid: string } };
  const state = serverState as unknown as {
    requests: Record<string, any>;
    shared: Record<string, any>;
  };
  void msg;
  void state;
  const effects: Effect[] = (() => {
${indent(d.source.trim(), 4)}
  })();
  return effects;
}
`.replace(/\n\n\n+/g, "\n\n");
}

/** The file of a pipe: its stages in order, and the names between them. */
function pipeFile(m: Model, d: ModuleDef): string {
  const stages = d.stages
    .map((sid) => d.nodes.find((n) => n.id === sid))
    .map((n) => (n ? findDef(m, n.ref) : undefined))
    .filter((x): x is ModuleDef => !!x);
  const idents = stages.map((s, i) => `stage${i}_${ident(slugOf(s))}`);
  // a message that passes down the pipe may be named differently by the next stage
  const next: Record<string, string> = {};
  for (const e of d.edges) {
    const from = d.nodes.find((n) => n.id === e.from);
    const fd = from ? findDef(m, from.ref) : undefined;
    const name = fd?.outputs.find((p) => p.id === e.fromPort)?.name;
    if (name && name !== e.msg) next[name] = e.msg;
  }
  return `// ${d.name} (pipe): ${stages.map((s) => s.name).join(" > ") || "no stage"}
// A message goes through the stages in order. A stage passes it on by emitting the
// message the next stage takes; every other output leaves the pipe.
import type { Effect, Message } from "@pavlus/frontend";
import type { ServerState } from "@pavlus/backend";
import { retarget } from "./emit.ts";
${stages.map((s, i) => `import * as ${idents[i]} from "./${slugOf(s)}.ts";`).join("\n")}

export const stages = [${idents.join(", ")}];
export const inputs = [${d.inputs.map((p) => q(p.name)).join(", ")}] as const;
export const outputs = [${d.outputs.map((p) => q(p.name)).join(", ")}] as const;

/** the name a stage gives the message it passes on -> the name the next stage takes */
const renames: Record<string, string> = ${JSON.stringify(next)};

export function handle(msg: Message, state: ServerState): Effect[] | undefined {
  for (const stage of stages) {
    const effects = stage.handle(msg, state);
    if (effects) return retarget(effects, renames);
  }
  return undefined;
}
`;
}

/** The file of a module with a graph body: the handlers of its nodes. */
function graphFile(
  m: Model,
  d: ModuleDef,
): { code: string; conds: Set<string> } {
  const g: Model = { ...m, nodes: d.nodes, edges: d.edges };
  const handlers = d.nodes.filter((n) =>
    ["handler", "reply", "error"].includes(n.kind),
  );
  const extra: Extra = {
    emitFrom: "./emit.ts",
    labels: (h) =>
      d.inputs
        .filter((p) => p.node === h.id && !p.via && p.name !== h.title)
        .map((p) => p.name),
    emits: (h, used) => {
      const out = emitsToModules(m, g, h);
      // the outer edges of the output ports bound to this handler
      for (const port of d.outputs.filter((p) => p.node === h.id && !p.via)) {
        for (const { graph, edge: e } of outerEdges(m, d.id, port.id)) {
          const to = findNode(graph, e.to);
          if (!to) continue;
          if (to.kind === "effect") {
            const call = effectCall(graph, to);
            used[call.uses] = true;
            out.push({ cond: e.cond.trim(), code: call.code });
          } else if (to.kind === "module")
            out.push({
              cond: e.cond.trim(),
              code: `emit(${q(inPortOf(m, to, e)?.name ?? e.msg)}, p)`,
            });
          else if (["handler", "reply", "error"].includes(to.kind))
            out.push({ cond: e.cond.trim(), code: `emit(${q(e.msg)}, p)` });
        }
      }
      return out;
    },
  };
  const r = handlerModule(
    g,
    `${d.name} (module)`,
    handlers,
    "../conditions.ts",
    extra,
    portsHeader(d),
  );
  return {
    code: r.code.replace(
      "the handlers of this route.",
      `${d.about || "the handlers of this module."}`,
    ),
    conds: r.conds,
  };
}

const EMIT_FILE = `// \`emit\`: a message from one module to another. The runtime dispatches it with the
// context of the effect (the rid), so a flow that crosses modules is still one request.
import type { Effect } from "@pavlus/frontend";
import { requestsEffector as rq } from "@pavlus/backend";

export const emit = (id: string, payload?: unknown): Effect =>
  rq.dispatch({ id, payload }) as unknown as Effect;

/** Renames the messages a stage emits (the pass-through of a pipe). */
export function retarget(
  effects: Effect[],
  renames: Record<string, string>,
): Effect[] {
  return effects.map((e) => {
    const x = e as unknown as {
      plugin?: string;
      type?: string;
      message?: { id: string; payload?: unknown };
    };
    return x.plugin === "requests" &&
      x.type === "dispatch" &&
      x.message &&
      renames[x.message.id]
      ? ({
          ...x,
          message: { ...x.message, id: renames[x.message.id] },
        } as unknown as Effect)
      : e;
  });
}
`;

/** an object or an array is a JSON value for the database, not a Postgres array */
const JSON_HELPER = `const json = (v: unknown): unknown =>
  v !== null && typeof v === "object" ? JSON.stringify(v) : v;`;

/** The files of the modules of a design, and the conditions they use. */
function moduleFiles(m: Model): {
  files: GenFile[];
  conds: Set<string>;
  registered: { name: string; path: string }[];
} {
  const files: GenFile[] = [];
  const conds = new Set<string>();
  const registered: { name: string; path: string }[] = [];
  const mods = usedModules(m);
  const staged = new Set(
    mods
      .filter((d) => d.body === "pipe")
      .flatMap((d) =>
        d.nodes.filter((n) => d.stages.includes(n.id)).map((n) => n.ref),
      ),
  );
  if (mods.some((d) => d.side === "backend"))
    files.push({
      path: "server/modules/emit.ts",
      group: "server",
      title: "modules/emit.ts",
      code: EMIT_FILE,
    });
  for (const d of mods) {
    if (d.side === "frontend") continue;
    const slug = slugOf(d);
    let code: string;
    if (d.body === "code") code = codeFile(d, m);
    else if (d.body === "pipe") code = pipeFile(m, d);
    else {
      const r = graphFile(m, d);
      code = r.code;
      r.conds.forEach((c) => conds.add(condName(c)));
    }
    files.push({
      path: `server/modules/${slug}.ts`,
      group: "server",
      title: `modules/${slug}.ts`,
      code,
    });
    // the stages of a pipe are reached through the pipe
    if (!staged.has(d.id))
      registered.push({
        name: `mod_${ident(slug)}`,
        path: `./modules/${slug}.ts`,
      });
  }
  return { files, conds, registered };
}

export function generateServer(source: Model): GenFile[] {
  const modular = hasModules(source);
  const m = modular ? source : flatten(source);
  const mf = modular ? moduleFiles(source) : null;
  const plan = planFrom(m);
  const files: GenFile[] = [];
  const allConds = new Set<string>();
  const imports: { name: string; path: string }[] = [];
  const usedPlugins = new Set<string>();
  for (const n of m.nodes) if (n.kind === "effect") usedPlugins.add(n.plugin);
  if (modular) {
    // the effects inside the modules, what the code bodies call, and `emit`
    for (const d of usedModules(source)) {
      for (const n of d.nodes)
        if (n.kind === "effect") usedPlugins.add(n.plugin);
      for (const p of d.plugins) usedPlugins.add(p);
      if (d.body === "code") {
        for (const [k, re] of PLUGIN_USE)
          if (re.test(d.source)) usedPlugins.add(k === "time" ? "timer" : k);
      }
    }
  }

  const httpRoutes = plan.routes.filter((r) => !isWs(r));
  files.push({
    path: "server/routes.ts",
    group: "server",
    title: "routes.ts",
    code: `// The route table: "METHOD /path/:param" -> the message id the router rewrites
// http.request into (pure data, the runtime and the tests both read it).
export const routes: Record<string, string> = {
${httpRoutes.map((r) => `  ${q(r.title.trim())}: ${q(routeMsg(r))},`).join("\n")}
};
${
  plan.routes.some(isWs)
    ? `
// websocket routes: the ws plugin sends ws.open / ws.message with the same ctx.
export const wsRoutes: Record<string, string> = {
${plan.routes
  .filter(isWs)
  .map((r) => `  ${q(r.title.trim())}: ${q(routeMsg(r))},`)
  .join("\n")}
};
`
    : ""
}`,
  });

  const mods = [
    ...plan.modules.filter((x) => x.handlers.length),
    ...(plan.common.length
      ? [
          {
            slug: "common",
            title: "messages shared by several routes",
            handlers: plan.common,
          },
        ]
      : []),
  ];
  for (const mod of mods) {
    const { code, conds } = handlerModule(
      m,
      mod.title,
      mod.handlers,
      "../conditions.ts",
      modular
        ? {
            emitFrom: "../modules/emit.ts",
            labels: () => [],
            emits: (h) => emitsToModules(source, source, h),
          }
        : undefined,
    );
    conds.forEach((c) => allConds.add(condName(c)));
    const path = `server/handlers/${mod.slug}.ts`;
    files.push({
      path,
      group: "server",
      title: `handlers/${mod.slug}.ts`,
      code,
    });
    imports.push({ name: ident(mod.slug), path: `./handlers/${mod.slug}.ts` });
  }

  mf?.conds.forEach((c) => allConds.add(c));
  if (mf) files.push(...mf.files);
  const hasDb = Object.keys(source.db).length > 0;
  if (hasDb)
    files.push(
      {
        path: "server/schema.sql",
        group: "server",
        title: "schema.sql",
        code: schemaSql(source.db),
      },
      {
        path: "server/seed.ts",
        group: "server",
        title: "seed.ts",
        code: seedModule(source.db),
      },
      {
        path: "server/db.ts",
        group: "server",
        title: "db.ts",
        code: dbModule(source.db),
      },
    );
  for (const p of usedCustom(source))
    files.push({
      path: `server/plugins/${p.name}.ts`,
      group: "server",
      title: `plugins/${p.name}.ts`,
      code: pluginStub(p),
    });
  const condList = [...allConds].sort();
  files.push({
    path: "server/conditions.ts",
    group: "server",
    title: "conditions.ts",
    code: `// The conditions of the design (the branches of the flow). Replace each body with
// the real test on msg.payload / state.requests[rid]. Until then a condition reads
// state.shared.flags, which is how the generated scenario tests flip them.
import type { Message } from "@pavlus/frontend";
import type { ServerState } from "@pavlus/backend";

const flag = (state: ServerState, name: string, fallback: boolean): boolean =>
  ((state.shared as { flags?: Record<string, boolean> }).flags ?? {})[name] ?? fallback;

${condList
  .map(
    (c) =>
      `/** ${c} */\nexport const ${ident(c)} = (_msg: Message, state: ServerState): boolean =>\n  flag(state, ${q(c)}, ${m.conds[c] ? "true" : "false"});`,
  )
  .join("\n\n")}
${condList.length ? "" : "export {};"}
`,
  });

  files.push({
    path: "server/app.ts",
    group: "server",
    title: "app.ts",
    code: `// The application: one pure function. Each module answers the messages of its
// route and returns undefined for the others, so the modules compose with a loop.
import type { Effect, Message } from "@pavlus/frontend";
import type { ServerState } from "@pavlus/backend";
${[...imports, ...(mf?.registered ?? [])].map((i) => `import { handle as ${i.name} } from ${q(i.path)};`).join("\n")}

const modules = [${[...imports, ...(mf?.registered ?? [])].map((i) => i.name).join(", ")}];

export const app = (msg: Message, state: ServerState): Effect[] => {
  for (const handle of modules) {
    const effects = handle(msg, state);
    if (effects) return effects;
  }
  return [];
};
`,
  });

  const wires: string[] = [];
  const customImports: string[] = [];
  const plugins: string[] = [];
  const pimports: string[] = ["createServerApp"];
  if (usedPlugins.has("log")) {
    plugins.push("createLogPlugin()");
    pimports.push("createLogPlugin");
  }
  if (usedPlugins.has("pg")) {
    plugins.push("createPostgresPlugin({ url: process.env.DATABASE_URL })");
    pimports.push("createPostgresPlugin");
  }
  if (usedPlugins.has("redis")) {
    plugins.push("createRedisPlugin({ url: process.env.REDIS_URL })");
    pimports.push("createRedisPlugin");
  }
  if (usedPlugins.has("fetch")) {
    plugins.push("createFetchPlugin()");
    pimports.push("createFetchPlugin");
  }
  if (usedPlugins.has("timer")) {
    plugins.push("createTimePlugin()");
    pimports.push("createTimePlugin");
  }
  for (const p of usedCustom(source)) {
    plugins.push(`create${Pascal(p.name)}Plugin()`);
    customImports.push(
      `import { create${Pascal(p.name)}Plugin } from "./plugins/${p.name}.ts";`,
    );
  }
  if (usedPlugins.has("crypto")) {
    plugins.push("createCryptoPlugin()");
    pimports.push("createCryptoPlugin");
  }
  pimports.push("createHttpServerPlugin");
  wires.push(
    "const http = createHttpServerPlugin({ port: Number(process.env.PORT ?? 3000) });",
  );
  plugins.push("http");
  if (usedPlugins.has("ws") || plan.routes.some(isWs)) {
    plugins.push("createWsServerPlugin({ http })");
    pimports.push("createWsServerPlugin");
  }
  files.push({
    path: "server/main.ts",
    group: "server",
    title: "main.ts",
    code: `// node main.ts   (DATABASE_URL, REDIS_URL, PORT)
// Wiring: the app is pure, everything that touches the world is a plugin.
import {\n${pimports.map((p) => `  ${p},`).join("\n")}\n} from "@pavlus/backend";
import { app } from "./app.ts";
import { routes } from "./routes.ts";
${hasDb ? 'import { ensureDatabase } from "./db.ts";\n' : ""}${customImports.join("\n")}

${hasDb ? 'if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");\nawait ensureDatabase(process.env.DATABASE_URL);\n\n' : ""}${wires.join("\n")}
const server = createServerApp({
  app,
  routes,
  plugins: [
${plugins.map((p) => `    ${p},`).join("\n")}
  ],
});

// graceful shutdown: stop accepting, let in-flight requests finish
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => void server.shutdown({ timeoutMs: 10_000 }));
`,
  });
  return files;
}

// ---- the scenario tests ----

interface TestStep {
  code: string;
}

const pattern = (n: FlowNode): string => {
  const parts = (o: Record<string, string>): string =>
    `{ ${Object.entries(o)
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ")} }`;
  switch (n.title) {
    case "pg.query":
      return parts({ plugin: q("pg"), type: q("query") });
    case "pg.tx.begin":
      return parts({ plugin: q("pg"), type: q("tx.begin") });
    case "pg.tx.commit":
      return parts({ plugin: q("pg"), type: q("tx.commit") });
    case "pg.tx.rollback":
      return parts({ plugin: q("pg"), type: q("tx.rollback") });
    case "redis.cmd": {
      const cmd = n.detail.trim().split(/\s+/)[0]?.toUpperCase() ?? "GET";
      return parts({
        plugin: q("redis"),
        type: q("cmd"),
        args: `(a: unknown[]) => a[0] === ${q(cmd)}`,
      });
    }
    case "redis.pipeline":
      return parts({ plugin: q("redis"), type: q("pipeline") });
    case "fetch.request":
      return parts({ plugin: q("fetch"), type: q("request") });
    case "timer.after":
      return parts({ plugin: q("time"), type: q("timer.after") });
    case "http.respond":
      return parts({
        plugin: q("http"),
        type: q("respond"),
        status: String(n.status || 200),
      });
    case "http.sse":
      return parts({ plugin: q("http"), type: q("sse.start") });
    case "log":
      return parts({ plugin: q("log"), type: q("log") });
  }
  const [plugin, ...rest] = n.title.split(".");
  return parts({ plugin: q(plugin), type: q(rest.join(".") || n.title) });
};

/** One variant as a list of `scenario` steps (text), read from its trace. */
export function scenarioSteps(
  m: Model,
  v: Variant,
  trace: Step[],
): { steps: TestStep[]; flags: Record<string, boolean>; notes: string[] } {
  const rid = trace[0]?.rid ?? "r1";
  const mine = stepsOf(trace, rid);
  const notes: string[] = [];
  const steps: TestStep[] = [];
  const routeIdx = mine.findIndex(
    (s) => findNode(m, s.to)?.kind === "route" && s.edge,
  );
  const flags: Record<string, boolean> = {};
  for (const [k, val] of Object.entries(v.scenario.conds)) flags[k] = val;
  if (routeIdx < 0) {
    notes.push("the flow does not reach a route");
    return { steps, flags, notes };
  }
  const entry = mine[routeIdx];
  const route = findNode(m, entry.to)!;
  const { method, path } = routeParts(route);
  const body = (entry.payload ?? {}) as Record<string, unknown>;
  const payload = {
    method,
    path: path.replace(/:\w+/g, "1"),
    query: {},
    headers: {},
    cookies: {},
    params: {},
    ip: "203.0.113.9",
    ...body,
  };
  // a websocket frame is not routed by the table: the app takes its message id
  steps.push({
    code: isWs(route)
      ? `{ send: { id: ${q(routeMsg(route))}, ctx: { rid, conn: "ws", connId: "c1" }, payload: ${JSON.stringify(payload)} } }`
      : `{ send: { id: "http.request", ctx, payload: ${JSON.stringify(payload)} } }`,
  });
  let i = routeIdx + 1;
  const isApp = (s: Step): boolean => {
    const n = findNode(m, s.to);
    return !!n && ["handler", "reply", "error"].includes(n.kind);
  };
  const aborted = v.scenario.faults.some((f) => f.on && f.kind === "abort");
  const deadlined = v.scenario.faults.some(
    (f) => f.on && f.kind === "deadline",
  );
  while (i < mine.length) {
    const h = mine[i];
    if (
      !isApp(h) ||
      !["message", "reply", "error", "timeout"].includes(h.type)
    ) {
      i++;
      continue;
    }
    if (h.type === "timeout") {
      steps.push({ code: `{ send: { id: "request.timeout", ctx } }` });
    }
    const node = findNode(m, h.to)!;
    // the effects this handler emitted, in order
    const emitted: Step[] = [];
    let k = i + 1;
    while (
      k < mine.length &&
      mine[k].type === "effect" &&
      mine[k].from === node.id
    ) {
      emitted.push(mine[k]);
      k++;
    }
    const pats: string[] = [];
    if (Object.keys(node.reqSet).length)
      pats.push(`{ plugin: "requests", type: "req.merge" }`);
    for (const _ of Object.keys(node.sharedSet))
      pats.push(`{ plugin: "requests", type: "shared.set" }`);
    const offset = pats.length;
    for (const e of emitted) {
      const en = findNode(m, e.to)!;
      pats.push(pattern(en));
    }
    // what answers: the next reply or error that comes from one of these effects
    let answer: { index: number; step: Step } | null = null;
    for (let j = k; j < mine.length && !answer; j++) {
      const s = mine[j];
      if ((s.type === "reply" || s.type === "error") && !isApp(s) === false) {
        const idx = emitted.findIndex((e) => e.to === s.from);
        if (idx >= 0) answer = { index: idx + offset, step: s };
        else if (s.type === "reply" || s.type === "error") break;
      }
    }
    const lastEmitted = emitted.map((e) => findNode(m, e.to)!);
    const responds = lastEmitted.some(
      (n) => effectDefIn(m.plugins, n.title)?.responds,
    );
    let code = `{\n  expect: [${pats.join(", ")}],`;
    if (answer) {
      const r = answer.step;
      const pl = JSON.stringify(r.payload ?? {});
      code +=
        r.type === "error"
          ? `\n  from: ${answer.index},\n  error: ${pl},`
          : `\n  from: ${answer.index},\n  reply: { payload: ${pl} },`;
    }
    code += "\n}";
    steps.push({ code });
    if (!answer && !responds && aborted) {
      steps.push({
        code: `{ send: { id: "http.aborted", ctx } }`,
      });
      const ab = m.nodes.find(
        (x) => x.kind === "handler" && x.title === "http.aborted",
      );
      const fx = ab
        ? outEdges(m, ab.id)
            .map((e) => findNode(m, e.to))
            .filter((x): x is FlowNode => !!x && x.kind === "effect")
            .map(pattern)
        : [];
      steps.push({ code: `{ expect: [${fx.join(", ")}] }` });
      notes.push(
        "the runtime cancels the in-flight effects of the aborted rid and rolls back its transaction: that is plugin work, see the simulated trace",
      );
      break;
    }
    if (!answer && !responds && deadlined) {
      notes.push(
        "the deadline is a runtime timer: here it is delivered as request.timeout",
      );
      const at = mine.findIndex((s, idx) => idx > i && s.type === "timeout");
      if (at >= 0) {
        i = at;
        continue;
      }
    }
    if (!answer) break;
    // continue with the handler the answer reached
    i = mine.indexOf(answer.step);
  }
  return { steps, flags, notes };
}

/** The tests of a design with modules: each module takes the examples of its input ports. */
function moduleTests(source: Model): GenFile[] {
  const mods = usedModules(source).filter((d) => d.side === "backend");
  const blocks: string[] = [];
  const imports: string[] = [];
  for (const d of mods) {
    const name = `mod_${ident(slugOf(d))}`;
    imports.push(
      `import { handle as ${name} } from "./modules/${slugOf(d)}.ts";`,
    );
    const its: string[] = [];
    const probes = d.body === "code" ? probe(d, source.plugins) : [];
    for (const p of d.inputs) {
      const payload = JSON.stringify(payloadOf(p.fields));
      const found = probes.find((x) => x.input.id === p.id);
      const patterns =
        found && "effects" in found.result
          ? found.result.effects
              .filter((e) => e.port)
              .map((e) =>
                e.plugin === "app"
                  ? `expect.objectContaining({ plugin: "requests", type: "dispatch", message: expect.objectContaining({ id: ${q(e.port)} }) })`
                  : `expect.objectContaining({ plugin: ${q(e.plugin)}, type: ${q(e.type)} })`,
              )
          : [];
      its.push(`  it(${q(`takes ${p.name}`)}, () => {
    const out = ${name}(message(${q(p.name)}, ${payload}), st);
    remember(st, out);
    expect(out).toBeDefined();${
      patterns.length
        ? `\n    expect(out).toEqual(expect.arrayContaining([\n${patterns.map((x) => `      ${x},`).join("\n")}\n    ]));`
        : ""
    }
  });`);
    }
    its.push(`  it("leaves the other messages to the others", () => {
    expect(${name}(message("nobody.takes.this", {}), st)).toBeUndefined();
  });`);
    // the ports are tried in order and the request slice goes from one to the next,
    // as in a request: what `order.created` kept is there for `loyalty.added`
    blocks.push(
      `describe(${q(d.name)}, () => {\n  const st = state();\n\n${its.join("\n\n")}\n});`,
    );
  }
  return [
    {
      path: "server/modules.test.ts",
      group: "tests",
      title: "modules.test.ts",
      code: `// Generated from the interfaces of the modules: each takes the example payload of
// each of its input ports and answers with effects, and ignores every other message.
import { describe, expect, it } from "vitest";
import type { Message } from "@pavlus/frontend";
import type { ServerState } from "@pavlus/backend";
${imports.join("\n")}

const message = (id: string, payload: unknown): Message => ({
  id,
  payload,
  ctx: { rid: "r1", conn: "http" },
});
const state = (): ServerState =>
  ({ requests: { r1: {} }, shared: {} }) as unknown as ServerState;

/** what the runtime does with the effects that write the slice of the request */
function remember(st: ServerState, effects: unknown): void {
  for (const e of (effects ?? []) as { plugin?: string; type?: string; path?: string; value?: unknown }[]) {
    if (e.plugin !== "requests") continue;
    if (e.type === "req.merge")
      Object.assign(st.requests.r1, e.value as Record<string, unknown>);
    else if (e.type === "req.set" && typeof e.path === "string")
      st.requests.r1[e.path] = e.value;
  }
}

${blocks.join("\n\n")}
`,
    },
  ];
}

export function generateTests(source: Model): GenFile[] {
  if (hasModules(source)) return moduleTests(source);
  const m = flatten(source);
  const variants = variantsOf(m);
  const blocks: string[] = [];
  const flagsOf = (v: Variant): Record<string, boolean> => ({
    ...m.conds,
    ...v.scenario.conds,
  });
  const hasFlags = Object.keys(m.conds).length > 0;
  for (const v of variants) {
    const trace = simulate(m, v.scenario, v.scenario.seed);
    const { steps, notes } = scenarioSteps(m, v, trace);
    if (steps.length === 0) continue;
    if (
      v.id === "deadline" &&
      !m.nodes.some((n) => n.title === "request.timeout")
    ) {
      // no handler for the deadline: the runtime answers 504 itself, nothing to assert on the app
      continue;
    }
    const opts = hasFlags
      ? `{ routes, state: { shared: { flags: ${JSON.stringify(flagsOf(v))} } } }`
      : `{ routes }`;
    blocks.push(
      `  it(${q(v.title)}, () => {\n${notes.map((n) => `    // ${n}\n`).join("")}    scenario(\n      app,\n      [\n${steps.map((s) => indent(`${s.code},`, 8)).join("\n")}\n      ],\n      ${opts},\n    );\n  });`,
    );
  }
  return [
    {
      path: "server/flow.scenario.test.ts",
      group: "tests",
      title: "flow.scenario.test.ts",
      code: `// Generated from the simulated happy path and each fault path of the design.
// No network, no database, no clock: every \`reply\` stands in for what a plugin
// would have answered, with the same ctx (so the same rid).
import { describe, it } from "vitest";
import { scenario } from "@pavlus/backend/testing";
import { app } from "./app.ts";
import { routes } from "./routes.ts";

const ctx = { rid: "r1", conn: "http" };
const rid = "r1";

describe(${q(m.name)}, () => {
${blocks.join("\n\n")}
});
`,
    },
  ];
}

// ---- the frontend ----

/** the fe-handlers a response reaches, split by the status of the respond node */
function replyHandlers(
  m: Model,
  route: FlowNode,
): { ok: string; fail: string } {
  const sub = new Set<string>([route.id]);
  const todo = [route.id];
  while (todo.length) {
    const id = todo.pop()!;
    for (const e of outEdges(m, id))
      if (!sub.has(e.to)) {
        sub.add(e.to);
        todo.push(e.to);
      }
  }
  let ok = "";
  let fail = "";
  for (const id of sub) {
    const n = findNode(m, id);
    if (
      !n ||
      n.kind !== "effect" ||
      effectDefIn(m.plugins, n.title)?.responds !== true
    )
      continue;
    for (const e of outEdges(m, id)) {
      const to = findNode(m, e.to);
      if (!to || to.kind !== "fe-handler") continue;
      if ((n.status || 200) < 400) ok = ok || ident(to.title);
      else fail = fail || ident(to.title);
    }
  }
  return { ok, fail };
}

export function generateFrontend(source: Model): GenFile[] {
  const m = flatten(source);
  const feNodes = m.nodes.filter((n) => n.kind === "fe-handler");
  const keys = new Set<string>();
  for (const n of m.nodes) {
    if (n.kind === "fe-state") keys.add(n.title);
    for (const k of Object.keys(n.clientSet)) keys.add(k);
  }
  const methods: string[] = [];
  const uiOf = (h: FlowNode): string[] =>
    inEdges(m, h.id)
      .map((e) => findNode(m, e.from))
      .filter((x): x is FlowNode => !!x && x.kind === "ui-event")
      .map((x) => x.title);
  const done = new Set<string>();
  for (const h of feNodes) {
    const name = ident(h.title);
    if (done.has(name)) continue;
    done.add(name);
    const fx: string[] = [];
    for (const [k, v] of Object.entries(h.clientSet))
      fx.push(`store.set(${q(k)}, ${textExpr(v, "client")})`);
    for (const e of outEdges(m, h.id)) {
      const to = findNode(m, e.to);
      if (!to) continue;
      if (to.kind === "route") {
        const { method, path } = routeParts(to);
        const { ok, fail } = replyHandlers(m, to);
        if (method === "WS") {
          fx.push(
            `/* TODO: send a websocket frame to ${path} */ store.set("pending", true)`,
          );
          continue;
        }
        const url = path.replace(
          /:(\w+)/g,
          (_, p: string) => `\${(state as Record<string, any>).${p} ?? ""}`,
        );
        const bodyFields = e.payload.filter((f) => f.name.startsWith("body."));
        fx.push(
          `http.request({\n    id: ${q(name)},\n    method: ${q(method)},\n    url: ${url.includes("${") ? `\`${url}\`` : q(url)},${bodyFields.length ? `\n    body: ${fieldsExpr(e, "client", "body")},` : ""}\n    onSuccess: ${q(ok || "onSuccess")},\n    onError: ${q(fail || "onError")},\n  })`,
        );
      } else if (to.kind === "fe-state") {
        fx.push(
          `store.set(${q(to.title)}, ${to.detail ? textExpr(to.detail, "client") : "(msg.payload as any)"})`,
        );
      }
    }
    const ui = uiOf(h);
    methods.push(
      `${ui.length ? `  // UI: ${ui.join(", ")}  (bind it in the template: @${ui[0].split(" ")[0]}=${name})\n` : ""}  ${name}(msg: Message, state: State): Effect[] {\n    return [${fx.length ? `\n${fx.map((f) => `      ${f},`).join("\n")}\n    ` : ""}];\n  }`,
    );
  }
  const stateLines = [...keys].map(
    (k) => `  ${/^[A-Za-z_]\w*$/.test(k) ? k : q(k)}: unknown;`,
  );
  const code = `// Frontend handlers of the design (pavlus): a UI event is a message, the handler is a
// pure method (msg, state) => effects, and the answer of the server comes back as a
// message with the status and the data.
import { Component, type Effect, type Message } from "@pavlus/frontend";
import {
  httpEffector as http,
  storeEffector as store,
} from "@pavlus/frontend/plugins";

export interface State {
${stateLines.join("\n") || "  // no state keys yet"}
}

export const initial: State = {
${[...keys].map((k) => `  ${/^[A-Za-z_]\w*$/.test(k) ? k : q(k)}: null,`).join("\n")}
};

export class AppHandlers extends Component<State> {
${methods.join("\n\n")}
}
`;
  return [
    {
      path: "frontend/handlers.ts",
      group: "frontend",
      title: "handlers.ts",
      code,
    },
  ];
}

export function generateAll(source: Model): GenFile[] {
  return [
    ...generateServer(source),
    ...generateTests(source),
    ...generateFrontend(source),
  ];
}
