// Import of a Visual Builder project (templates/visual-builder): its elements with
// events fill the Browser lane (UI event -> frontend handler), and each HTTP action
// of a chain becomes an edge from the handler to a route of the App lane, with a
// pure handler and an `http.respond` behind it (built from the project's mock
// route when it has one), so the imported flow runs end to end. Pure.
import { autoLayout } from "./layout.ts";
import {
  type FlowNode,
  type Model,
  addEdge,
  addNode,
  fieldsOf,
  findNode,
  emptyModel,
  msgOfRoute,
} from "./model.ts";
import { parseProject as parseVb } from "../visual-builder/io.ts";
import {
  type Action,
  type El,
  type Model as VbModel,
  ELEMENTS,
  allElements,
} from "../visual-builder/model.ts";

/** the prefix of the ids this import makes, so a second import replaces the first */
export const VB_PREFIX = "vb-";

const camel = (s: string): string => {
  const parts = s.replace(/[^A-Za-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
  const id = parts
    .map((p, i) => (i === 0 ? p[0].toLowerCase() + p.slice(1) : p[0].toUpperCase() + p.slice(1)))
    .join("");
  return /^[A-Za-z_]/.test(id) ? id : `h${id}`;
};

const labelOf = (e: El): string =>
  (
    e.props.text ||
    e.props.title ||
    e.props.label ||
    e.props.placeholder ||
    ELEMENTS[e.type].label
  )
    .trim()
    .slice(0, 28);

/** `https://api.example.com/users/{event.id}?x=1` -> `/users/:id` */
export function pathOfUrl(url: string): string {
  let p = url.trim().replace(/^[a-z]+:\/\/[^/]+/i, "");
  p = p.split("?")[0].split("#")[0];
  if (!p.startsWith("/")) p = `/${p}`;
  return (
    p.replace(/\{[^}]*?(\w+)\s*\}/g, (_, name: string) => `:${name}`) || "/"
  );
}

interface Call {
  method: string;
  path: string;
  body: string;
  okKey: string;
  errKey: string;
}

/** the HTTP actions of a chain, nested ones (then / catch) included */
function callsOf(chain: Action[]): Call[] {
  const out: Call[] = [];
  const walk = (list: Action[]): void => {
    for (const a of list) {
      if (a.t === "http")
        out.push({
          method: (a.method || "GET").toUpperCase(),
          path: pathOfUrl(a.url ?? "/"),
          body: a.body ?? "",
          okKey: (a.okKey ?? "").split(".")[0],
          errKey: (a.errKey ?? "").split(".")[0],
        });
      walk(a.then ?? []);
      walk(a.catch ?? []);
    }
  };
  walk(chain);
  return out;
}

const clientSetOf = (chain: Action[]): Record<string, string> => {
  const o: Record<string, string> = {};
  const walk = (list: Action[]): void => {
    for (const a of list) {
      if ((a.t === "set" || a.t === "push") && a.key)
        o[a.key.split(".")[0]] = a.value ?? "";
      if (a.t === "toggle" && a.key) o[a.key] = `!${a.key}`;
      walk(a.then ?? []);
      walk(a.catch ?? []);
    }
  };
  walk(chain);
  return o;
};

export interface ImportResult {
  model: Model;
  /** what was made, for the message after the import */
  summary: { events: number; calls: number; routes: number };
}

/**
 * Adds the frontend of a Visual Builder project to `into` (or to an empty model).
 * Nodes of an earlier import are replaced.
 */
export function importVisualBuilder(
  vb: VbModel,
  into: Model = emptyModel(),
): ImportResult {
  // drop an earlier import
  const keep = new Set(
    into.nodes.filter((n) => !n.id.startsWith(VB_PREFIX)).map((n) => n.id),
  );
  let m: Model = {
    ...into,
    nodes: into.nodes.filter((n) => keep.has(n.id)),
    edges: into.edges.filter((e) => keep.has(e.from) && keep.has(e.to)),
    scenario: {
      ...into.scenario,
      requests: into.scenario.requests.filter((r) => keep.has(r.entry)),
    },
  };
  let events = 0;
  let calls = 0;
  const routeIds = new Map<string, string>();
  const stateIds = new Map<string, string>();
  const starts: string[] = [];

  const routeFor = (c: Call): string => {
    const title = `${c.method} ${c.path}`;
    const known = routeIds.get(title);
    if (known) return known;
    const existing = m.nodes.find((n) => n.kind === "route" && n.title === title);
    if (existing) {
      routeIds.set(title, existing.id);
      return existing.id;
    }
    const slug = `${VB_PREFIX}r${routeIds.size + 1}`;
    const msg = msgOfRoute(title);
    m = addNode(m, "route", title, { id: slug, detail: msg }).model;
    m = addNode(m, "handler", msg, {
      id: `${slug}-h`,
      detail: "imported: fill in what the server does",
    }).model;
    m = addEdge(m, slug, `${slug}-h`, { kind: "request", msg })!.model;
    // the mock route of the project, when it has one, is the response
    const mock = vb.mocks.find(
      (r) =>
        r.method.toUpperCase() === c.method && pathOfUrl(r.path) === c.path,
    );
    m = addNode(m, "effect", "http.respond", {
      id: `${slug}-ok`,
      status: mock?.status ?? 200,
      detail: mock?.body || "{}",
    }).model;
    m = addEdge(m, `${slug}-h`, `${slug}-ok`, { kind: "effect", msg: "http.respond" })!.model;
    routeIds.set(title, slug);
    return slug;
  };

  const stateFor = (key: string): string => {
    const known = stateIds.get(key);
    if (known) return known;
    const id = `${VB_PREFIX}s-${key}`;
    m = addNode(m, "fe-state", key, { id, detail: "{payload.data}" }).model;
    stateIds.set(key, id);
    return id;
  };

  for (const el of allElements(vb)) {
    for (const [event, chain] of Object.entries(el.events)) {
      if (!chain || chain.length === 0) continue;
      const label = labelOf(el);
      const evId = `${VB_PREFIX}ev-${el.id}-${event}`;
      const fhId = `${VB_PREFIX}fh-${el.id}-${event}`;
      const name = camel(`${event} ${label}`);
      m = addNode(m, "ui-event", `${event} ${label}`, { id: evId }).model;
      m = addNode(m, "fe-handler", name, {
        id: fhId,
        clientSet: clientSetOf(chain),
        note: `from the ${ELEMENTS[el.type].label} ${el.id}`,
      }).model;
      m = addEdge(m, evId, fhId, { kind: "request", msg: `ui.${event}` })!.model;
      events++;
      starts.push(evId);
      for (const c of callsOf(chain)) {
        calls++;
        const rt = routeFor(c);
        m = addEdge(m, fhId, rt, {
          kind: "request",
          msg: "http.request",
          payload: fieldsOf(
            `method=${c.method}; path=${c.path}${c.body ? `; body:any=${c.body}` : ""}`,
          ),
        })?.model ?? m;
        const ok = findNode(m, `${rt}-ok`);
        if (ok && c.okKey) {
          const okH = `${fhId}-ok-${calls}`;
          m = addNode(m, "fe-handler", `${name}Ok`, { id: okH }).model;
          m = addEdge(m, ok.id, okH, { kind: "reply", msg: `${name}Ok` })?.model ?? m;
          m = addEdge(m, okH, stateFor(c.okKey), { kind: "effect", msg: "store.set" })?.model ?? m;
        }
        if (c.errKey) {
          const errId = `${rt}-err`;
          if (!findNode(m, errId)) {
            m = addNode(m, "effect", "http.respond", {
              id: errId,
              status: 500,
              detail: '{"error":"unavailable"}',
            }).model;
            m = addEdge(m, `${rt}-h`, errId, { kind: "effect", msg: "http.respond", cond: "failed" })!.model;
          }
          const errH = `${fhId}-err-${calls}`;
          m = addNode(m, "fe-handler", `${name}Failed`, { id: errH }).model;
          m = addEdge(m, errId, errH, { kind: "reply", msg: `${name}Failed` })?.model ?? m;
          m = addEdge(m, errH, stateFor(c.errKey), { kind: "effect", msg: "store.set" })?.model ?? m;
        }
      }
    }
  }
  // a client and the externals the imported routes need
  if (!m.nodes.some((n) => n.kind === "external" && n.plugin === "http"))
    m = addNode(m, "external", "Client", { id: `${VB_PREFIX}x-client`, plugin: "http" }).model;
  m = {
    ...m,
    name: into.nodes.length === 0 ? vb.name : m.name,
    conds: m.edges.some((e) => e.cond === "failed") ? { ...m.conds, failed: false } : m.conds,
    scenario: {
      ...m.scenario,
      requests: [
        ...m.scenario.requests,
        ...starts.slice(0, 2).map((entry, i) => ({
          rid: `v${m.scenario.requests.length + i + 1}`,
          entry,
          at: i * 12,
          payload: {},
        })),
      ],
    },
  };
  m = autoLayout(m);
  return {
    model: m,
    summary: { events, calls, routes: routeIds.size },
  };
}

/** From the text of an exported Visual Builder project (or its saved copy). */
export function importVisualBuilderText(
  text: string,
  into?: Model,
): ImportResult | string {
  const vb = parseVb(text);
  if (typeof vb === "string") return vb;
  return importVisualBuilder(vb, into);
}
