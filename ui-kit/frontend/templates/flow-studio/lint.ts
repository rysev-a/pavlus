// The Checks tab: a linter on the design. Pure: the model in, a list of issues out.
// Each issue can name a node or an edge, so the tab can focus it on the canvas.
import {
  type FlowEdge,
  type FlowNode,
  type Model,
  condHolds,
  condName,
  effectDef,
  findNode,
  inEdges,
  laneOf,
  outEdges,
} from "./model.ts";

export type Severity = "error" | "warn" | "info";

export interface Issue {
  /** the rule */
  rule: string;
  severity: Severity;
  title: string;
  detail: string;
  node: string;
  edge: string;
}

export const RULES: { rule: string; title: string }[] = [
  { rule: "no-reply-consumer", title: "An effect whose reply nobody handles" },
  { rule: "no-producer", title: "A message with no producer" },
  { rule: "missing-onerror", title: "An effect with no onError" },
  { rule: "route-never-responds", title: "A route that never calls http.respond" },
  { rule: "route-path-no-respond", title: "A path of a route that does not respond" },
  { rule: "unreachable", title: "A node nothing leads to" },
  { rule: "tx-not-closed", title: "A transaction without commit or rollback on a path" },
  { rule: "loop", title: "A loop with no condition" },
  { rule: "fan-out", title: "Unbounded fan-out" },
  { rule: "secret-in-log", title: "A secret that is logged" },
  { rule: "msg-mismatch", title: "A message id that no handler takes" },
  { rule: "duplicate", title: "Two nodes with the same name" },
  { rule: "no-timeout", title: "A call with no timeout" },
  { rule: "cond-undefined", title: "A condition with no value" },
];

/** messages the runtime sends: a handler for them needs no producer */
export const RUNTIME_MESSAGES = [
  "http.aborted",
  "request.timeout",
  "request.done",
  "ws.open",
  "ws.close",
  "http.listening",
];

const SECRET = /password|passwd|secret|token|authorization|cookie|credit|card|cvv|hash|api[-_]?key|signature/i;
const HANDLER_LIKE = ["handler", "reply", "error"];
const FAN_OUT = 5;

const isRespond = (n: FlowNode): boolean =>
  n.kind === "effect" &&
  (effectDef(n.title)?.responds === true ||
    n.title === "ws.send" ||
    n.title === "ws.broadcast");

/**
 * Do all the paths from `id` reach a node for which `pred` holds, whatever the
 * conditions say? An effect that replies must lead there on success and on failure;
 * `runtime` says whether a failure with no onError counts (the runtime answers 500).
 */
function leads(
  m: Model,
  id: string,
  pred: (n: FlowNode) => boolean,
  assign: Record<string, boolean>,
  runtime: boolean,
  stack: Set<string> = new Set(),
): boolean {
  const n = findNode(m, id);
  if (!n) return false;
  if (pred(n)) return true;
  if (stack.has(id)) return false;
  stack.add(id);
  const taken = outEdges(m, id).filter((e) => condHolds(e.cond, m.conds, assign));
  let res: boolean;
  if (n.kind === "effect") {
    const replies = taken.filter((e) => e.kind === "reply");
    const errs = taken.filter((e) => e.kind === "error");
    if (replies.length === 0) res = false;
    else {
      const ok = replies.some((e) => leads(m, e.to, pred, assign, runtime, stack));
      const bad = errs.length
        ? errs.some((e) => leads(m, e.to, pred, assign, runtime, stack))
        : runtime;
      res = ok && bad;
    }
  } else
    res = taken.some((e) => leads(m, e.to, pred, assign, runtime, stack));
  stack.delete(id);
  return res;
}

const reach = (m: Model, from: string[]): Set<string> => {
  const seen = new Set<string>(from);
  const todo = [...from];
  while (todo.length) {
    const id = todo.pop()!;
    for (const e of outEdges(m, id))
      if (!seen.has(e.to)) {
        seen.add(e.to);
        todo.push(e.to);
      }
  }
  return seen;
};

/** Every assignment of the conditions the subgraph uses (at most 2^8). */
function assignments(m: Model, ids: Set<string>): Record<string, boolean>[] {
  const names = [
    ...new Set(
      m.edges
        .filter((e) => ids.has(e.from) && e.cond.trim())
        .map((e) => condName(e.cond)),
    ),
  ].slice(0, 8);
  const all: Record<string, boolean>[] = [];
  for (let bits = 0; bits < 1 << names.length; bits++) {
    const a: Record<string, boolean> = {};
    names.forEach((n, i) => (a[n] = (bits & (1 << i)) !== 0));
    all.push(a);
  }
  return all;
}

const showAssign = (a: Record<string, boolean>): string => {
  const parts = Object.entries(a).map(([k, v]) => `${k}=${v}`);
  return parts.length ? ` when ${parts.join(", ")}` : "";
};

export function lint(m: Model): Issue[] {
  const issues: Issue[] = [];
  const add = (
    rule: string,
    severity: Severity,
    title: string,
    detail: string,
    where: { node?: string; edge?: string } = {},
  ): void => {
    issues.push({
      rule,
      severity,
      title,
      detail,
      node: where.node ?? "",
      edge: where.edge ?? "",
    });
  };

  // ---- effects: reply consumers, onError, timeouts ----
  for (const n of m.nodes) {
    if (n.kind !== "effect") continue;
    const def = effectDef(n.title);
    const out = outEdges(m, n.id);
    const replies = out.filter((e) => e.kind === "reply");
    const errors = out.filter((e) => e.kind === "error");
    if (def?.replies && !def.optionalReply && replies.length === 0)
      add(
        "no-reply-consumer",
        "error",
        `${n.title} has no handler for its reply`,
        `${n.title} (${n.detail.slice(0, 40) || n.id}) answers with a message, but no edge carries the reply to a handler. Drag from its green port to the handler that continues the flow.`,
        { node: n.id },
      );
    for (const e of replies) {
      const to = findNode(m, e.to);
      if (to && !HANDLER_LIKE.includes(to.kind) && to.kind !== "fe-handler")
        add(
          "no-reply-consumer",
          "error",
          `the reply ${e.msg} goes to ${to.title}, which is not a handler`,
          "A reply is a message: it must reach a pure handler (or a frontend handler).",
          { edge: e.id },
        );
    }
    if (
      errors.length === 0 &&
      !def?.noFail &&
      (replies.length > 0 || (def?.replies && !def.optionalReply))
    )
      add(
        "missing-onerror",
        n.plugin === "pg" || n.plugin === "fetch" ? "error" : "warn",
        `${n.title} has no onError`,
        `If ${n.plugin} fails, no message comes back and the runtime ends the request with a 500. Set an onError target in the inspector (drag from the red port).`,
        { node: n.id },
      );
    if (
      (n.plugin === "fetch" || n.plugin === "pg" || n.plugin === "redis") &&
      n.timeoutMs === 0 &&
      n.title !== "pg.tx.rollback"
    )
      add(
        "no-timeout",
        "info",
        `${n.title} uses the default timeout`,
        `${n.title} has no timeout of its own: the plugin default applies. Set one in the inspector when the call is on a hot path.`,
        { node: n.id },
      );
  }

  // ---- messages: producers and ids ----
  for (const n of m.nodes) {
    if (!HANDLER_LIKE.includes(n.kind)) continue;
    const ins = inEdges(m, n.id);
    if (ins.length === 0 && !RUNTIME_MESSAGES.includes(n.title))
      add(
        "no-producer",
        "error",
        `${n.title} is never produced`,
        `Nothing sends the message ${n.title}: no route, effect reply or handler leads to this node.`,
        { node: n.id },
      );
    for (const e of ins) {
      const from = findNode(m, e.from);
      if (e.msg !== n.title && e.kind !== "effect")
        add(
          "msg-mismatch",
          "warn",
          `${e.msg} is not the message ${n.title} takes`,
          `The edge says ${e.msg} but the handler is named ${n.title}: in code the switch would never match. Rename one of them.`,
          { edge: e.id },
        );
      if (from && from.kind === "route" && from.detail && from.detail !== e.msg)
        add(
          "msg-mismatch",
          "warn",
          `route ${from.title} routes to ${from.detail}, the edge says ${e.msg}`,
          "The message id of the route (its detail) and of the edge to the handler must be the same.",
          { edge: e.id },
        );
    }
  }
  const byTitle = new Map<string, FlowNode[]>();
  for (const n of m.nodes)
    if (HANDLER_LIKE.includes(n.kind) || n.kind === "route") {
      const k = `${n.kind === "route" ? "route" : "msg"}:${n.title}`;
      byTitle.set(k, [...(byTitle.get(k) ?? []), n]);
    }
  for (const [k, list] of byTitle)
    if (list.length > 1)
      add(
        "duplicate",
        "warn",
        `${list.length} nodes are called ${k.slice(k.indexOf(":") + 1)}`,
        "Two handlers for one message id would be merged into one `case`. Rename one.",
        { node: list[1].id },
      );

  // ---- reachability ----
  const starts = m.nodes.filter(
    (n) =>
      n.kind === "ui-event" ||
      (n.kind === "external" && outEdges(m, n.id).length > 0) ||
      (HANDLER_LIKE.includes(n.kind) && RUNTIME_MESSAGES.includes(n.title)),
  );
  const seen = reach(m, starts.map((s) => s.id));
  for (const n of m.nodes) {
    if (seen.has(n.id) || n.kind === "external") continue;
    if (HANDLER_LIKE.includes(n.kind) && inEdges(m, n.id).length === 0) continue; // reported as no-producer
    add(
      "unreachable",
      "warn",
      `${n.title} is unreachable`,
      `No UI event, client or runtime message leads to ${n.title}.`,
      { node: n.id },
    );
  }

  // ---- routes: does every path respond? ----
  for (const rt of m.nodes.filter((n) => n.kind === "route")) {
    const sub = reach(m, [rt.id]);
    const anyRespond = [...sub].some((id) => {
      const x = findNode(m, id);
      return x ? isRespond(x) : false;
    });
    if (!anyRespond) {
      add(
        "route-never-responds",
        "error",
        `${rt.title} never calls http.respond`,
        `No path from ${rt.title} reaches http.respond: the client waits until it gives up and the request is dropped by its deadline.`,
        { node: rt.id },
      );
      continue;
    }
    for (const a of assignments(m, sub)) {
      if (!leads(m, rt.id, isRespond, a, true)) {
        add(
          "route-path-no-respond",
          "warn",
          `${rt.title} has a path with no response${showAssign(a)}`,
          `Following the edges${showAssign(a)} the request ends without http.respond (or the reply of an effect is not handled).`,
          { node: rt.id },
        );
        break;
      }
    }
  }

  // ---- transactions ----
  for (const b of m.nodes.filter((n) => n.kind === "effect" && n.title === "pg.tx.begin")) {
    const closes = (n: FlowNode): boolean =>
      n.kind === "effect" &&
      (n.title === "pg.tx.commit" || n.title === "pg.tx.rollback");
    const replies = outEdges(m, b.id).filter((e) => e.kind === "reply");
    const sub = reach(
      m,
      replies.map((e) => e.to),
    );
    let bad: Record<string, boolean> | null = null;
    for (const a of assignments(m, sub)) {
      const ok = replies.some((e) => leads(m, e.to, closes, a, false));
      if (!ok) {
        bad = a;
        break;
      }
    }
    if (replies.length === 0 || bad)
      add(
        "tx-not-closed",
        "error",
        `the transaction of ${b.id} is not always closed${bad ? showAssign(bad) : ""}`,
        "After pg.tx.begin every path, the failure paths too, should reach pg.tx.commit or pg.tx.rollback. The pg plugin rolls back at the end of the request, but an explicit rollback keeps the connection free sooner.",
        { node: b.id },
      );
  }

  // ---- loops and fan-out ----
  const state = new Map<string, number>();
  const cycles: FlowEdge[][] = [];
  const path: FlowEdge[] = [];
  const dfs = (id: string): void => {
    state.set(id, 1);
    for (const e of outEdges(m, id)) {
      const s = state.get(e.to) ?? 0;
      path.push(e);
      if (s === 1) {
        const at = path.findIndex((x) => x.from === e.to);
        cycles.push(path.slice(at));
      } else if (s === 0) dfs(e.to);
      path.pop();
    }
    state.set(id, 2);
  };
  for (const n of m.nodes) if ((state.get(n.id) ?? 0) === 0) dfs(n.id);
  for (const c of cycles) {
    const bounded = c.some((e) => e.cond.trim() !== "");
    add(
      "loop",
      bounded ? "info" : "error",
      `a loop through ${c.map((e) => e.msg).join(" > ")}`,
      bounded
        ? "The loop has a condition, so it can end; the runtime also stops a request after its message budget."
        : "Nothing in this cycle can stop it: the request would use its whole message budget. Add a condition to one edge.",
      { edge: c[0].id },
    );
  }
  for (const n of m.nodes) {
    if (laneOf(n) !== "app") continue;
    const plain = outEdges(m, n.id).filter(
      (e) => e.kind === "effect" && e.cond.trim() === "",
    );
    if (plain.length > FAN_OUT)
      add(
        "fan-out",
        "warn",
        `${n.title} emits ${plain.length} effects at once`,
        `More than ${FAN_OUT} unconditional effects from one message is unbounded fan-out; use a pipeline, a queue or a condition.`,
        { node: n.id },
      );
  }

  // ---- secrets ----
  for (const n of m.nodes.filter((x) => x.kind === "effect" && x.title === "log")) {
    const hit = SECRET.exec(n.detail);
    if (hit)
      add(
        "secret-in-log",
        "error",
        `the log line of ${n.id} mentions ${hit[0]}`,
        `"${n.detail}" would write a secret to the logs (every line is also tagged with the rid). Log the user id, never the credential.`,
        { node: n.id },
      );
    for (const e of inEdges(m, n.id)) {
      const f = e.payload.find((p) => SECRET.test(p.name));
      if (f)
        add(
          "secret-in-log",
          "error",
          `${f.name} flows into a log`,
          `The payload field ${f.name} of ${e.msg} reaches a log effect.`,
          { edge: e.id },
        );
    }
  }
  // a secret kept in the request slice is a smell too
  for (const n of m.nodes)
    for (const k of Object.keys(n.reqSet))
      if (/password|secret/i.test(k) && n.reqSet[k] !== "")
        add(
          "secret-in-log",
          "info",
          `${n.title} keeps ${k} in state.requests[rid]`,
          `A credential in the request slice can end up in a trace. Clear it (set it to an empty value) as soon as it was used.`,
          { node: n.id },
        );

  // ---- conditions ----
  for (const e of m.edges) {
    const c = condName(e.cond);
    if (c && !(c in m.conds) && !(c in m.scenario.conds))
      add(
        "cond-undefined",
        "info",
        `the condition ${c} has no value`,
        `${c} is false unless the scenario says otherwise. Give it a value in the Scenario panel.`,
        { edge: e.id },
      );
  }
  const order: Record<Severity, number> = { error: 0, warn: 1, info: 2 };
  return issues
    .filter(
      (i, k, all) =>
        all.findIndex(
          (o) => o.rule === i.rule && o.title === i.title && o.node === i.node && o.edge === i.edge,
        ) === k,
    )
    .sort((a, b) => order[a.severity] - order[b.severity]);
}

export function counts(issues: Issue[]): Record<Severity, number> {
  return {
    error: issues.filter((i) => i.severity === "error").length,
    warn: issues.filter((i) => i.severity === "warn").length,
    info: issues.filter((i) => i.severity === "info").length,
  };
}
