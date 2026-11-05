// The inspector: which fields a selection shows and how an edit of a field changes
// the model. Every field carries a `ctx` (what it edits) and a `name`; one message
// `f.edit(ctx, name)` plus the typed value does the rest, so the template needs no
// code per field. The field view model is the one of the Visual Builder.
import {
  type FieldView,
  field as vbField,
} from "../visual-builder/inspector.ts";
import {
  type EdgeKind,
  type FieldType,
  type Fault,
  type FlowEdge,
  type FlowNode,
  type Model,
  DEFAULT_LATENCY,
  DEFAULT_TIMEOUT,
  EDGE_KINDS,
  EDGE_LABEL,
  EFFECTS,
  FIELD_TYPES,
  KIND_LABEL,
  condNames,
  effectDef,
  fieldsOf,
  findEdge,
  findNode,
  laneOf,
  onErrorOf,
  setOnError,
  updateEdge,
  updateNode,
} from "./model.ts";
import { nodeFault, updateFault } from "./faults.ts";

export type { FieldView };

type Kind = "text" | "area" | "expr" | "choice" | "key" | "number";

interface Choice {
  v: string;
  label: string;
}

function mk(
  ctx: string,
  name: string,
  label: string,
  value: string,
  kind: Kind,
  opts: { choices?: Choice[]; hint?: string; error?: string } = {},
): FieldView {
  const f = vbField(
    ctx,
    name,
    label,
    value,
    kind,
    [],
    opts.hint ?? "",
    opts.error ?? "",
  );
  if (opts.choices)
    f.choices = opts.choices.map((c) => ({
      v: c.v,
      label: c.label,
      selected: c.v === value,
    }));
  return { ...f, id: `fs-f-${ctx}-${name}`.replace(/[^\w-]/g, "_") };
}

const lines = (o: Record<string, string>): string =>
  Object.entries(o)
    .map(([k, v]) => `${k} = ${v}`)
    .join("\n");

/** `key = value` lines (or `key: value`) as a map */
export function parseLines(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split("\n")) {
    const m = /^\s*([\w.$-]+)\s*[=:]\s*(.*?)\s*$/.exec(raw);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

const payloadLines = (e: FlowEdge): string =>
  e.payload
    .map((f) => `${f.name}:${f.type}${f.example ? `=${f.example}` : ""}`)
    .join("\n");

/** one field per line: `name:type=example` (a `;` also separates) */
export function parsePayload(text: string): FlowEdge["payload"] {
  return fieldsOf(
    text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .join(";"),
  );
}

const isHandlerLike = (n: FlowNode): boolean =>
  n.kind === "handler" || n.kind === "reply" || n.kind === "error";

export interface FaultRow {
  k: string;
  label: string;
  on: boolean;
  kind: string;
  node: string;
}

export interface InspectorView {
  mode: "none" | "node" | "edge";
  title: string;
  subtitle: string;
  id: string;
  fields: FieldView[];
  /** the fields about the state of the request (reqSet / sharedSet / clientSet) */
  stateFields: FieldView[];
  faults: FaultRow[];
  isEffect: boolean;
  breakpoint: boolean;
  /** the lane the node is in, for the badge */
  lane: string;
  hint: string;
}

export const NO_INSPECTOR: InspectorView = {
  mode: "none",
  title: "Nothing selected",
  subtitle: "",
  id: "",
  fields: [],
  stateFields: [],
  faults: [],
  isEffect: false,
  breakpoint: false,
  lane: "",
  hint: "Select a node or an edge to edit it. Drag from the dot at the right of a node onto another node to link them. Arrows move the selection, Enter edits, Delete removes.",
};

const titleLabel = (n: FlowNode): string => {
  switch (n.kind) {
    case "ui-event":
      return "UI event (what the user does)";
    case "fe-handler":
      return "Handler name";
    case "fe-state":
      return "State key";
    case "route":
      return "Route (METHOD /path/:param)";
    case "handler":
    case "reply":
    case "error":
      return "Message id it handles";
    case "effect":
      return "Effect type";
    default:
      return "Name";
  }
};

const detailLabel = (n: FlowNode): string => {
  switch (n.kind) {
    case "route":
      return "Message id the route rewrites http.request into";
    case "fe-state":
      return "Value written (a {payload.x} reference or text)";
    case "effect":
      return effectDef(n.title)?.hint
        ? `Detail: ${effectDef(n.title)!.hint}`
        : "Detail";
    case "external":
      return "Note";
    default:
      return "What it does";
  }
};

/** the faults that can be injected on a plugin hop, with their state */
export function faultRows(m: Model, n: FlowNode): FaultRow[] {
  if (n.kind !== "effect" || n.plugin === "log") return [];
  return (
    [
      ["error", n.plugin === "pg" ? "Postgres error (SQLSTATE)" : "Error"],
      ["timeout", "Timeout"],
      ["slow", "Slow (+1.5 s)"],
    ] as const
  ).map(([kind, label]) => ({
    k: `${n.id}-${kind}`,
    label,
    on: nodeFault(m, n.id, kind)?.on ?? false,
    kind,
    node: n.id,
  }));
}

export function nodeInspector(
  m: Model,
  n: FlowNode,
  breakpoint: boolean,
): InspectorView {
  const ctx = `n:${n.id}`;
  const fields: FieldView[] = [];
  if (n.kind === "effect")
    fields.push(
      mk(ctx, "title", titleLabel(n), n.title, "choice", {
        choices: [
          ...EFFECTS.map((e) => ({
            v: e.type,
            label: `${e.type}  (${e.hint})`,
          })),
          ...(EFFECTS.some((e) => e.type === n.title)
            ? []
            : [{ v: n.title, label: n.title }]),
        ],
      }),
    );
  else
    fields.push(
      mk(ctx, "title", titleLabel(n), n.title, "text", {
        error: n.title.trim() === "" ? "A name is needed" : "",
      }),
    );
  fields.push(mk(ctx, "detail", detailLabel(n), n.detail, "area"));
  if (n.kind === "effect") {
    const def = effectDef(n.title);
    if (def?.responds)
      fields.push(
        mk(ctx, "status", "HTTP status", String(n.status || 200), "number"),
      );
    fields.push(
      mk(
        ctx,
        "latency",
        "Latency (ms, 0 = plugin default)",
        String(n.latency),
        "number",
        {
          hint: `default ${model(m, n.plugin)} ms`,
        },
      ),
      mk(
        ctx,
        "timeoutMs",
        "Timeout (ms, 0 = plugin default)",
        String(n.timeoutMs),
        "number",
        {
          hint: `default ${DEFAULT_TIMEOUT[n.plugin] || "none"} ms`,
        },
      ),
    );
    if (def?.replies && !def.noFail)
      fields.push(
        mk(
          ctx,
          "retries",
          "Retries before onError",
          String(n.retries),
          "number",
        ),
        mk(
          ctx,
          "backoffMs",
          "Backoff (ms, doubles each retry)",
          String(n.backoffMs),
          "number",
        ),
        mk(
          ctx,
          "onError",
          "onError: the node that gets the failure",
          onErrorOf(m, n.id),
          "choice",
          {
            choices: [
              { v: "", label: "(none: the runtime answers 500)" },
              ...m.nodes.filter(isHandlerLike).map((h) => ({
                v: h.id,
                label: `${KIND_LABEL[h.kind]}: ${h.title}`,
              })),
            ],
          },
        ),
      );
  }
  if (n.kind === "external")
    fields.push(
      mk(ctx, "plugin", "Stands behind the plugin", n.plugin, "choice", {
        choices: ["pg", "redis", "fetch", "http"].map((p) => ({
          v: p,
          label: p,
        })),
      }),
    );
  const stateFields: FieldView[] = [];
  if (isHandlerLike(n) || n.kind === "route") {
    stateFields.push(
      mk(
        ctx,
        "reqSet",
        "Writes to state.requests[rid] (key = value)",
        lines(n.reqSet),
        "area",
        {
          hint: "value: text, or {payload.body.email}, {req.x}, {shared.x}, {rid}",
        },
      ),
      mk(
        ctx,
        "sharedSet",
        "Writes to state.shared (key = value)",
        lines(n.sharedSet),
        "area",
      ),
    );
  }
  if (n.kind === "fe-handler")
    stateFields.push(
      mk(
        ctx,
        "clientSet",
        "Sets browser state (key = value)",
        lines(n.clientSet),
        "area",
        {
          hint: "value: text, or {payload.x}",
        },
      ),
    );
  fields.push(mk(ctx, "note", "Note", n.note, "text"));
  const faults = faultRows(m, n);
  return {
    mode: "node",
    title: n.title || "(unnamed)",
    subtitle: `${KIND_LABEL[n.kind]} in the ${laneOf(n)} lane`,
    id: n.id,
    fields,
    stateFields,
    faults,
    isEffect: n.kind === "effect",
    breakpoint,
    lane: laneOf(n),
    hint: "",
  };
}

const model = (m: Model, plugin: string): string =>
  String(m.latency[plugin] ?? DEFAULT_LATENCY[plugin] ?? 1);

export function edgeInspector(m: Model, e: FlowEdge): InspectorView {
  const ctx = `e:${e.id}`;
  const from = findNode(m, e.from);
  const to = findNode(m, e.to);
  const fields: FieldView[] = [
    mk(ctx, "kind", "Kind", e.kind, "choice", {
      choices: EDGE_KINDS.map((k) => ({ v: k, label: EDGE_LABEL[k] })),
    }),
    mk(
      ctx,
      "msg",
      e.kind === "effect" ? "Effect type" : "Message id",
      e.msg,
      "text",
      {
        error:
          e.msg.trim() === ""
            ? "An edge needs a message id or an effect type"
            : "",
      },
    ),
    mk(ctx, "cond", "Condition (name, or !name)", e.cond, "key", {
      hint: "empty = always. A name is true or false in the Scenario panel",
    }),
    mk(
      ctx,
      "rid",
      "The request context (rid) rides on it",
      e.rid ? "yes" : "no",
      "choice",
      {
        choices: [
          { v: "yes", label: "yes: ctx.rid is stamped on it" },
          { v: "no", label: "no: it happens outside the request" },
        ],
      },
    ),
    mk(
      ctx,
      "latency",
      "Delivery time (ms, 0 = default)",
      String(e.latency),
      "number",
    ),
    mk(
      ctx,
      "payload",
      "Payload fields (name:type=example, one per line)",
      payloadLines(e),
      "area",
      {
        hint: `types: ${FIELD_TYPES.join(", ")}. A dotted name nests (body.email). {payload.x} / {req.x} are filled in at run time`,
      },
    ),
  ];
  return {
    mode: "edge",
    title: e.msg || "(no id)",
    subtitle: `${EDGE_LABEL[e.kind]}: ${from?.title ?? "?"} to ${to?.title ?? "?"}`,
    id: e.id,
    fields,
    stateFields: [],
    // an edge into a plugin node: the fault is a fault of that hop
    faults: to ? faultRows(m, to) : [],
    isEffect: false,
    breakpoint: false,
    lane: "",
    hint: "",
  };
}

export function inspectorOf(
  m: Model,
  sel: { kind: "none" | "node" | "edge"; id: string },
  breakpoints: Record<string, boolean>,
): InspectorView {
  if (sel.kind === "node") {
    const n = findNode(m, sel.id);
    if (n) return nodeInspector(m, n, !!breakpoints[n.id]);
  }
  if (sel.kind === "edge") {
    const e = findEdge(m, sel.id);
    if (e) return edgeInspector(m, e);
  }
  return NO_INSPECTOR;
}

// ---- the scenario panel ----

export interface ScenarioView {
  conds: FieldView[];
  requests: { k: string; index: number; fields: FieldView[] }[];
  latency: FieldView[];
  faults: {
    k: string;
    id: string;
    label: string;
    on: boolean;
    fields: FieldView[];
  }[];
  general: FieldView[];
}

export const LATENCY_KEYS = [
  "net",
  "app",
  "pg",
  "redis",
  "fetch",
  "crypto",
  "http",
  "ws",
];

export function scenarioView(m: Model): ScenarioView {
  const sc = m.scenario;
  const entries = m.nodes.filter(
    (n) =>
      n.kind === "ui-event" || (n.kind === "external" && n.plugin === "http"),
  );
  const nodeChoices: Choice[] = [
    { v: "", label: "the whole request" },
    ...["pg", "redis", "fetch", "crypto", "timer"].map((p) => ({
      v: `plugin:${p}`,
      label: `every ${p} call`,
    })),
    ...m.nodes
      .filter((n) => n.kind === "effect")
      .map((n) => ({
        v: n.id,
        label: `${n.title}: ${n.detail.slice(0, 26) || n.id}`,
      })),
  ];
  return {
    general: [
      mk(
        "m",
        "seed",
        "Seed (the same seed gives the same latencies)",
        String(sc.seed),
        "number",
      ),
    ],
    conds: condNames(m).map((c) =>
      mk(
        `sc:${c}`,
        "cond",
        `Condition ${c}`,
        c in sc.conds ? String(sc.conds[c]) : "",
        "choice",
        {
          choices: [
            { v: "", label: `design: ${m.conds[c] ?? false}` },
            { v: "true", label: "true" },
            { v: "false", label: "false" },
          ],
        },
      ),
    ),
    requests: sc.requests.map((r, i) => ({
      k: `${i}-${r.rid}`,
      index: i,
      fields: [
        mk(`rq:${i}`, "rid", "Request id (rid)", r.rid, "text"),
        mk(`rq:${i}`, "entry", "Starts at", r.entry, "choice", {
          choices: entries.map((n) => ({ v: n.id, label: n.title })),
        }),
        mk(`rq:${i}`, "at", "Starts at (ms)", String(r.at), "number"),
        mk(
          `rq:${i}`,
          "payload",
          "What the user brings (key = value)",
          lines(r.payload),
          "area",
        ),
      ],
    })),
    latency: LATENCY_KEYS.map((p) =>
      mk(
        "m",
        `lat:${p}`,
        p === "net"
          ? "network hop (ms)"
          : p === "app"
            ? "handler hop (ms)"
            : `${p} plugin (ms)`,
        String(m.latency[p] ?? DEFAULT_LATENCY[p] ?? 1),
        "number",
      ),
    ),
    faults: sc.faults.map((f) => ({
      k: f.id,
      id: f.id,
      label: `${f.kind}`,
      on: f.on,
      fields: [
        mk(`fl:${f.id}`, "target", "Where", f.target, "choice", {
          choices: nodeChoices.some((c) => c.v === f.target)
            ? nodeChoices
            : [...nodeChoices, { v: f.target, label: f.target }],
        }),
        mk(`fl:${f.id}`, "rid", "Only request (empty = all)", f.rid, "text"),
        mk(
          `fl:${f.id}`,
          "code",
          f.kind === "error" ? "Code / SQLSTATE" : "Code",
          f.code,
          "text",
        ),
        mk(
          `fl:${f.id}`,
          "ms",
          f.kind === "error"
            ? "Fails the first N attempts (0 = always)"
            : f.kind === "abort"
              ? "Client hangs up at (ms)"
              : f.kind === "deadline"
                ? "Deadline (ms)"
                : "Extra ms",
          String(f.ms),
          "number",
        ),
      ],
    })),
  };
}

// ---- edits ----

const toNum = (v: string, d = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : d;
};

export function applyEdit(
  m: Model,
  ctx: string,
  name: string,
  value: string,
): { model: Model; tag: string } | null {
  const [kind, id] = [ctx.split(":")[0], ctx.slice(ctx.indexOf(":") + 1)];
  if (kind === "n") {
    const n = findNode(m, id);
    if (!n) return null;
    const tag = `n:${id}:${name}`;
    switch (name) {
      case "title": {
        let next = updateNode(m, id, { title: value });
        if (n.kind === "effect") {
          const def = effectDef(value);
          // a new effect type brings its own example detail and status
          next = updateNode(next, id, {
            detail:
              def && n.detail === (effectDef(n.title)?.detail ?? "")
                ? def.detail
                : n.detail,
            status: def?.responds ? n.status || 200 : 0,
          });
        }
        return { model: next, tag };
      }
      case "detail":
      case "note":
      case "plugin":
        return { model: updateNode(m, id, { [name]: value }), tag };
      case "status":
        return { model: updateNode(m, id, { status: toNum(value, 200) }), tag };
      case "latency":
      case "timeoutMs":
      case "backoffMs":
        return { model: updateNode(m, id, { [name]: toNum(value) }), tag };
      case "retries":
        return {
          model: updateNode(m, id, {
            retries: Math.min(10, Math.round(toNum(value))),
          }),
          tag,
        };
      case "onError":
        return { model: setOnError(m, id, value), tag: "" };
      case "reqSet":
      case "sharedSet":
      case "clientSet":
        return { model: updateNode(m, id, { [name]: parseLines(value) }), tag };
    }
    return null;
  }
  if (kind === "e") {
    const e = findEdge(m, id);
    if (!e) return null;
    const tag = `e:${id}:${name}`;
    switch (name) {
      case "kind":
        return {
          model: updateEdge(m, id, { kind: value as EdgeKind }),
          tag: "",
        };
      case "msg":
      case "cond":
        return { model: updateEdge(m, id, { [name]: value }), tag };
      case "rid":
        return { model: updateEdge(m, id, { rid: value === "yes" }), tag: "" };
      case "latency":
        return { model: updateEdge(m, id, { latency: toNum(value) }), tag };
      case "payload":
        return {
          model: updateEdge(m, id, { payload: parsePayload(value) }),
          tag,
        };
    }
    return null;
  }
  if (kind === "m") {
    if (name === "seed")
      return {
        model: {
          ...m,
          scenario: { ...m.scenario, seed: Math.round(toNum(value, 1)) },
        },
        tag: "seed",
      };
    if (name.startsWith("lat:")) {
      const key = name.slice(4);
      const latency = { ...m.latency };
      if (value.trim() === "") delete latency[key];
      else latency[key] = toNum(value, DEFAULT_LATENCY[key] ?? 1);
      return { model: { ...m, latency }, tag: `lat:${key}` };
    }
    return null;
  }
  if (kind === "sc") {
    const conds = { ...m.scenario.conds };
    if (value === "") delete conds[id];
    else conds[id] = value === "true";
    return { model: { ...m, scenario: { ...m.scenario, conds } }, tag: "" };
  }
  if (kind === "rq") {
    const i = Number(id);
    const requests = m.scenario.requests.map((r, k) => {
      if (k !== i) return r;
      switch (name) {
        case "rid":
          return { ...r, rid: value };
        case "entry":
          return { ...r, entry: value };
        case "at":
          return { ...r, at: toNum(value) };
        case "payload":
          return { ...r, payload: parseLines(value) };
      }
      return r;
    });
    return {
      model: { ...m, scenario: { ...m.scenario, requests } },
      tag: `rq:${i}:${name}`,
    };
  }
  if (kind === "fl") {
    const patch: Partial<Fault> =
      name === "ms"
        ? { ms: toNum(value) }
        : name === "target" || name === "rid" || name === "code"
          ? { [name]: value }
          : {};
    return { model: updateFault(m, id, patch), tag: `fl:${id}:${name}` };
  }
  return null;
}

export const FIELD_TYPE_LIST: FieldType[] = FIELD_TYPES;
