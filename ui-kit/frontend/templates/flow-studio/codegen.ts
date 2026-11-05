// Code out: from the design, (a) a pavlus-server skeleton (a pure handler module per
// route in the style of server/examples/todo-api, a routes table, a conditions
// module and the plugin wiring), (b) `scenario` tests played from the simulated
// happy path and each fault path with pavlus-server/testing, (c) pavlus frontend
// handlers. Pure: text out. The generated TypeScript is parsed in the unit tests.
import {
  type FlowEdge,
  type FlowNode,
  type Model,
  condName,
  effectDef,
  findNode,
  inEdges,
  outEdges,
  slugify,
} from "./model.ts";
import {
  type Step,
  type Variant,
  simulate,
  stepsOf,
  variantsOf,
} from "./engine.ts";

export interface GenFile {
  path: string;
  group: "server" | "tests" | "frontend";
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

interface Imports {
  pg?: boolean;
  redis?: boolean;
  http?: boolean;
  crypto?: boolean;
  log?: boolean;
  ws?: boolean;
  fetch?: boolean;
  time?: boolean;
  rq?: boolean;
}

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
export function planOf(m: Model): Plan {
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

function condCall(name: string): string {
  return `${ident(name)}(msg, state)`;
}

interface EffCall {
  code: string;
  uses: keyof Imports;
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
      const count = new Set(n.detail.match(/\$\d+/g) ?? []).size;
      const params = count
        ? `, [${Array.from({ length: count }, (_, i) => `/* $${i + 1} */ undefined`).join(", ")}]`
        : "";
      return {
        uses: "pg",
        code: `pg.query(${q(n.detail)}, ${opts || '{ replyTo: "" }'}${params})`,
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
  return { uses: "rq", code: `/* TODO ${n.title} */ log.info(${q(n.title)})` };
}

const IMPORT_AS: Record<keyof Imports, string> = {
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
function caseBody(
  m: Model,
  h: FlowNode,
  used: Imports,
  conds: Set<string>,
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
    if (e.cond.trim()) conds.add(e.cond.trim());
    items.push({ cond: e.cond.trim(), code: call.code });
  }
  const anyCond = items.some((i) => i.cond);
  const hasPayload = items.some((i) => /\bp\b/.test(i.code));
  const hasReq = items.some((i) => /\breq\b/.test(i.code));
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
      const neg = i.cond.startsWith("!");
      out.push(
        `if (${neg ? "!" : ""}${condCall(condName(i.cond))}) out.push(${i.code});`,
      );
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
    cases.push(
      `case ${q(id)}: {${h.detail ? `\n  // ${h.detail}` : ""}\n${indent(caseBody(m, h, used, conds), 2)}\n}`,
    );
  }
  const names = (Object.keys(IMPORT_AS) as (keyof Imports)[])
    .filter((k) => used[k])
    .map((k) => IMPORT_AS[k]);
  const condNames = [...conds].map((c) => ident(condName(c)));
  const head = [
    `// ${title}: the handlers of this route. Pure: (msg, state) => effects.`,
    `// Every effect names its replyTo and onError; the runtime stamps the rid on them.`,
    `import type { Effect, Message } from "@service-laboratory/pavlus";`,
    `import {\n${["type ServerState", ...names, ...(used.pg ? [] : [])].map((n) => `  ${n},`).join("\n")}\n} from "pavlus-server";`,
    ...(condNames.length
      ? [
          `import { ${[...new Set(condNames)].join(", ")} } from "${condImport}";`,
        ]
      : []),
    "",
  ];
  const code = `${head.join("\n")}
export function handle(msg: Message, state: ServerState): Effect[] | undefined {
  switch (msg.id) {
${indent(cases.join("\n"), 4)}
  }
  return undefined;
}
`;
  return { code: code.replace(/\n\n\n+/g, "\n\n"), conds };
}

export function generateServer(m: Model): GenFile[] {
  const plan = planOf(m);
  const files: GenFile[] = [];
  const allConds = new Set<string>();
  const imports: { name: string; path: string }[] = [];
  const usedPlugins = new Set<string>();
  for (const n of m.nodes) if (n.kind === "effect") usedPlugins.add(n.plugin);

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

  const condList = [...allConds].sort();
  files.push({
    path: "server/conditions.ts",
    group: "server",
    title: "conditions.ts",
    code: `// The conditions of the design (the branches of the flow). Replace each body with
// the real test on msg.payload / state.requests[rid]. Until then a condition reads
// state.shared.flags, which is how the generated scenario tests flip them.
import type { Message } from "@service-laboratory/pavlus";
import type { ServerState } from "pavlus-server";

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
import type { Effect, Message } from "@service-laboratory/pavlus";
import type { ServerState } from "pavlus-server";
${imports.map((i) => `import { handle as ${i.name} } from ${q(i.path)};`).join("\n")}

const modules = [${imports.map((i) => i.name).join(", ")}];

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
import {\n${pimports.map((p) => `  ${p},`).join("\n")}\n} from "pavlus-server";
import { app } from "./app.ts";
import { routes } from "./routes.ts";

${wires.join("\n")}
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
    const responds = lastEmitted.some((n) => effectDef(n.title)?.responds);
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

export function generateTests(m: Model): GenFile[] {
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
import { scenario } from "pavlus-server/testing";
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
    if (!n || n.kind !== "effect" || effectDef(n.title)?.responds !== true)
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

export function generateFrontend(m: Model): GenFile[] {
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
import { Component, type Effect, type Message } from "@service-laboratory/pavlus";
import {
  httpEffector as http,
  storeEffector as store,
} from "@service-laboratory/pavlus/plugins";

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

export function generateAll(m: Model): GenFile[] {
  return [...generateServer(m), ...generateTests(m), ...generateFrontend(m)];
}
