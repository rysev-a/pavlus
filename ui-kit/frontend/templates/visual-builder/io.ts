// Reading a project from text (import, the saved copy in localStorage). The
// text is untrusted: everything is checked and filled in, so a model that
// comes out of here can be drawn and run.
import { readModel as readFlow } from "../flow-studio/model.ts";
import { unsafeExpr } from "./bind.ts";
import {
  type Action,
  type El,
  ELEMENTS,
  type ElType,
  type Model,
  type Page,
  type Section,
  type StateKey,
  type MockRoute,
  type FormField,
  blankField,
} from "./model.ts";

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, d = ""): string => (typeof v === "string" ? v : d);
const num = (v: unknown, d: number): number =>
  typeof v === "number" && Number.isFinite(v) ? v : d;
const strMap = (v: unknown): Record<string, string> =>
  isObj(v)
    ? Object.fromEntries(
        Object.entries(v).filter(([, x]) => typeof x === "string") as [
          string,
          string,
        ][],
      )
    : {};

const rect = (v: unknown) =>
  isObj(v)
    ? { x: num(v.x, 0), y: num(v.y, 0), w: num(v.w, 1), h: num(v.h, 1) }
    : undefined;

function action(v: unknown, depth = 0): Action | null {
  if (!isObj(v) || depth > 6) return null;
  const t = v.t;
  if (
    !["set", "toggle", "push", "remove", "http", "navigate", "notice"].includes(
      t as string,
    )
  )
    return null;
  const a: Action = { t: t as Action["t"] };
  for (const k of [
    "key",
    "value",
    "index",
    "url",
    "text",
    "method",
    "headers",
    "body",
    "okKey",
    "okPath",
    "errKey",
    "loadingKey",
  ] as const)
    if (typeof v[k] === "string") a[k] = v[k] as string;
  if (t === "http") {
    a.then = chain(v.then, depth + 1);
    a.catch = chain(v.catch, depth + 1);
  }
  return a;
}

const chain = (v: unknown, depth = 0): Action[] =>
  Array.isArray(v)
    ? v.map((x) => action(x, depth)).filter((x): x is Action => !!x)
    : [];

function element(v: unknown): El | null {
  if (!isObj(v) || typeof v.id !== "string" || !(str(v.type) in ELEMENTS))
    return null;
  const type = v.type as ElType;
  const pos = isObj(v.pos) ? v.pos : {};
  const desktop = rect(pos.desktop) ?? {
    x: 0,
    y: 0,
    w: ELEMENTS[type].w,
    h: ELEMENTS[type].h,
  };
  const events: El["events"] = {};
  if (isObj(v.events))
    for (const [k, c] of Object.entries(v.events)) {
      const list = chain(c);
      if (list.length) events[k as keyof El["events"]] = list;
    }
  return {
    id: v.id,
    type,
    pos: { desktop, tablet: rect(pos.tablet), mobile: rect(pos.mobile) },
    hide: isObj(v.hide)
      ? {
          desktop: !!v.hide.desktop,
          tablet: !!v.hide.tablet,
          mobile: !!v.hide.mobile,
        }
      : {},
    props: { ...ELEMENTS[type].defaults, ...strMap(v.props) },
    visible: str(v.visible),
    bind: str(v.bind),
    style: strMap(v.style),
    fields: Array.isArray(v.fields)
      ? v.fields.filter(isObj).map(
          (f): FormField => ({
            ...blankField(str(f.name, "field"), str(f.label, "Field")),
            ...(strMap(f) as Partial<FormField>),
          }),
        )
      : [],
    events,
  };
}

function section(v: unknown): Section | null {
  if (!isObj(v) || typeof v.id !== "string") return null;
  return {
    id: v.id,
    kind: str(v.kind, "empty") as Section["kind"],
    name: str(v.name, "Section"),
    rows: Math.min(60, Math.max(1, num(v.rows, 4))),
    bg: str(v.bg, "none"),
    pad: str(v.pad, "md"),
    elements: Array.isArray(v.elements)
      ? v.elements.map(element).filter((e): e is El => !!e)
      : [],
  };
}

/** The diagram a project is linked to, or null when there is none (or it is not one). */
function flowFrom(v: unknown): Model["flow"] {
  if (!isObj(v)) return null;
  const r = readFlow(v);
  return typeof r === "string" ? null : r;
}

export function readModel(value: unknown): Model | string {
  if (!isObj(value) || !Array.isArray(value.pages))
    return "This is not a Visual Builder project (no pages).";
  const pages: Page[] = value.pages
    .filter(isObj)
    .map((p) => ({
      id: str(p.id),
      name: str(p.name, "Page"),
      slug: str(p.slug, "/"),
      sections: Array.isArray(p.sections)
        ? p.sections.map(section).filter((s): s is Section => !!s)
        : [],
    }))
    .filter((p) => p.id !== "");
  if (pages.length === 0) return "The project has no pages.";
  const keys: StateKey[] = Array.isArray(value.keys)
    ? value.keys
        .filter(isObj)
        .filter(
          (k) =>
            /^[A-Za-z_][A-Za-z0-9_]*$/.test(str(k.key)) &&
            ["string", "number", "boolean", "json"].includes(str(k.type)),
        )
        .map((k) => ({
          key: str(k.key),
          type: str(k.type) as StateKey["type"],
          initial: str(k.initial),
        }))
    : [];
  const mocks: MockRoute[] = Array.isArray(value.mocks)
    ? value.mocks.filter(isObj).map((r, i) => ({
        id: str(r.id, `m${i + 1}`),
        method: str(r.method, "GET"),
        path: str(r.path, "/"),
        status: num(r.status, 200),
        body: str(r.body),
        delay: Math.min(10_000, Math.max(0, num(r.delay, 0))),
      }))
    : [];
  const model: Model = {
    name: str(value.name, "Imported project"),
    pages,
    keys,
    mocks,
    mockOn: value.mockOn !== false,
    flow: flowFrom(value.flow),
    seq: num(value.seq, 0),
  };
  // ids made later must not clash with the ids read here
  const ids = [
    ...pages.map((p) => p.id),
    ...pages.flatMap((p) =>
      p.sections.flatMap((s) => [s.id, ...s.elements.map((e) => e.id)]),
    ),
  ];
  const top = ids.reduce(
    (m, id) => Math.max(m, Number(/\d+$/.exec(id)?.[0] ?? 0)),
    0,
  );
  return { ...model, seq: Math.max(model.seq, top) };
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

/** The expressions of a project that the evaluator would refuse (for a warning on import). */
export function unsafeCount(m: Model): number {
  let n = 0;
  const check = (s: string | undefined): void => {
    if (s && unsafeExpr(s)) n++;
  };
  for (const p of m.pages)
    for (const s of p.sections)
      for (const e of s.elements) {
        check(e.visible);
        for (const v of Object.values(e.props)) check(v);
      }
  return n;
}
