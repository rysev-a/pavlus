// Running the model ("Preview"): events become action chains, actions change a
// `Run` (the live state and a little bookkeeping) and ask for HTTP requests.
// Pure reducers: (run, actions) -> { run, requests, opens }. The component turns
// a request into an effect (the mock router or the http plugin) and the answer
// comes back through `finish`.
import {
  coerce,
  evalExpr,
  fill,
  getPath,
  initialData,
  scopeOf,
  type Scope,
  setPath,
  toText,
} from "./bind.ts";
import { isOk } from "./mock.ts";
import type { Action, El, EventName, Model, StateKey } from "./model.ts";
import { validateForm, validateField } from "./validate.ts";

export const SLOTS = 24;

export interface HttpSpec {
  okKey: string;
  okPath: string;
  errKey: string;
  loadingKey: string;
  then: Action[];
  catch: Action[];
}

export interface Slot {
  spec: HttpSpec;
  extras: Scope;
  /** the answer of the mock server, kept until its timer fires */
  answer?: Answer;
}

export interface UiState {
  sort?: string;
  dir?: "asc" | "desc";
  page?: number;
  q?: string;
  errors?: Record<string, string>;
  sent?: boolean;
}

export interface Run {
  data: Record<string, unknown>;
  /** the page being shown (an id) and the address bar text */
  page: string;
  location: string;
  notice: string;
  slots: (Slot | null)[];
  ui: Record<string, UiState>;
  log: string[];
}

export interface Env {
  keys: StateKey[];
  pages: { id: string; slug: string; name: string }[];
}

export interface HttpRequest {
  slot: number;
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

export interface Step {
  run: Run;
  requests: HttpRequest[];
  /** absolute URLs the page asks the browser to open */
  opens: string[];
}

export const envOf = (m: Model): Env => ({
  keys: m.keys,
  pages: m.pages.map((p) => ({ id: p.id, slug: p.slug, name: p.name })),
});

export function startRun(m: Model): Run {
  const first = m.pages[0];
  return {
    data: initialData(m.keys),
    page: first?.id ?? "",
    location: first?.slug ?? "/",
    notice: "",
    slots: Array.from({ length: SLOTS }, () => null),
    ui: {},
    log: [],
  };
}

const LOG_MAX = 40;
const logged = (run: Run, line: string): Run => ({
  ...run,
  log: [...run.log, line].slice(-LOG_MAX),
});

const short = (v: unknown): string => {
  const s = toText(v);
  return s.length > 40 ? s.slice(0, 37) + "..." : s;
};

const sameJson = (a: unknown, b: unknown): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

export function keyType(env: Env, path: string): StateKey["type"] | undefined {
  const root = path.split(".")[0];
  const k = env.keys.find((x) => x.key === root);
  return path.includes(".") ? undefined : k?.type;
}

/** Writes a value the user typed into a (typed) key. */
export function writeKey(
  run: Run,
  env: Env,
  path: string,
  value: unknown,
): Run {
  if (!path) return run;
  return {
    ...run,
    data: setPath(run.data, path, coerce(keyType(env, path), value)),
  };
}

function parseHeaders(text: string, scope: Scope): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\n|;/)) {
    const i = line.indexOf(":");
    if (i > 0)
      out[line.slice(0, i).trim()] = fill(line.slice(i + 1).trim(), scope);
  }
  return out;
}

function navigate(
  run: Run,
  env: Env,
  target: string,
): { run: Run; open?: string } {
  const url = target.trim();
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(url))
    return { run: logged(run, `open ${url}`), open: url };
  const slug = ("/" + url.replace(/^#?\/?/, "")).replace(/(.)\/+$/, "$1");
  const page = env.pages.find((p) => p.slug === slug);
  if (page)
    return {
      run: logged(
        { ...run, page: page.id, location: page.slug },
        `go ${page.slug}`,
      ),
    };
  return {
    run: logged(
      { ...run, location: url, notice: `No page at ${url}` },
      `go ${url} (no page)`,
    ),
  };
}

/** Runs a chain. HTTP actions start a request and the chain goes on without waiting. */
export function execute(
  actions: Action[] | undefined,
  start: Run,
  extras: Scope,
  env: Env,
): Step {
  let run = start;
  const requests: HttpRequest[] = [];
  const opens: string[] = [];
  const scope = (): Scope =>
    scopeOf(run.data, { location: run.location, ...extras });
  for (const a of actions ?? []) {
    switch (a.t) {
      case "set": {
        const r = evalExpr(a.value ?? "", scope());
        if (!r.ok) {
          run = logged(run, `set ${a.key}: ${r.error}`);
          break;
        }
        run = logged(
          { ...run, data: setPath(run.data, a.key ?? "", r.value) },
          `set ${a.key} = ${short(r.value)}`,
        );
        break;
      }
      case "toggle":
        run = logged(
          {
            ...run,
            data: setPath(
              run.data,
              a.key ?? "",
              !getPath(run.data, a.key ?? ""),
            ),
          },
          `toggle ${a.key}`,
        );
        break;
      case "push": {
        const r = evalExpr(a.value ?? "", scope());
        if (!r.ok) {
          run = logged(run, `push ${a.key}: ${r.error}`);
          break;
        }
        const cur = getPath(run.data, a.key ?? "");
        const list = Array.isArray(cur) ? [...cur, r.value] : [r.value];
        run = logged(
          { ...run, data: setPath(run.data, a.key ?? "", list) },
          `push ${a.key} <- ${short(r.value)}`,
        );
        break;
      }
      case "remove": {
        const r = evalExpr(a.index ?? "", scope());
        const cur = getPath(run.data, a.key ?? "");
        if (!r.ok || !Array.isArray(cur)) {
          run = logged(
            run,
            `remove ${a.key}: ${r.ok ? "not an array" : r.error}`,
          );
          break;
        }
        const at =
          typeof r.value === "number"
            ? r.value
            : cur.findIndex((x) => sameJson(x, r.value));
        const list =
          at >= 0 && at < cur.length ? cur.filter((_, i) => i !== at) : cur;
        run = logged(
          { ...run, data: setPath(run.data, a.key ?? "", list) },
          `remove ${a.key}[${at}]`,
        );
        break;
      }
      case "notice":
        run = logged({ ...run, notice: fill(a.text ?? "", scope()) }, "notice");
        break;
      case "navigate": {
        const n = navigate(run, env, fill(a.url ?? "", scope()));
        run = n.run;
        if (n.open) opens.push(n.open);
        break;
      }
      case "http": {
        const free = run.slots.findIndex((s) => s === null);
        if (free < 0) {
          run = logged(
            { ...run, notice: "Too many requests at once" },
            "http: no free slot",
          );
          break;
        }
        const sc = scope();
        const method = (a.method || "GET").toUpperCase();
        const url = fill(a.url ?? "", sc);
        const bodyR =
          method === "GET" || !a.body?.trim() ? null : evalExpr(a.body, sc);
        const spec: HttpSpec = {
          okKey: a.okKey ?? "",
          okPath: a.okPath ?? "",
          errKey: a.errKey ?? "",
          loadingKey: a.loadingKey ?? "",
          then: a.then ?? [],
          catch: a.catch ?? [],
        };
        const slots = run.slots.slice();
        slots[free] = { spec, extras };
        run = logged({ ...run, slots }, `${method} ${url}`);
        if (spec.loadingKey)
          run = { ...run, data: setPath(run.data, spec.loadingKey, true) };
        requests.push({
          slot: free,
          method,
          url,
          headers: parseHeaders(a.headers ?? "", sc),
          body: bodyR && bodyR.ok ? bodyR.value : undefined,
        });
        break;
      }
    }
  }
  return { run, requests, opens };
}

export interface Answer {
  status: number;
  data: unknown;
  error?: string;
}

/** The answer of the request in `slot`: store it and run `then` / `catch`. */
export function finish(
  start: Run,
  slot: number,
  answer: Answer,
  env: Env,
): Step {
  const s = start.slots[slot];
  if (!s) return { run: start, requests: [], opens: [] };
  const slots = start.slots.slice();
  slots[slot] = null;
  let run: Run = { ...start, slots };
  if (s.spec.loadingKey)
    run = { ...run, data: setPath(run.data, s.spec.loadingKey, false) };
  const ok = !answer.error && isOk(answer.status);
  if (ok) {
    const stored = s.spec.okPath
      ? getPath(answer.data, s.spec.okPath)
      : answer.data;
    if (s.spec.okKey)
      run = { ...run, data: setPath(run.data, s.spec.okKey, stored) };
    run = logged(run, `${answer.status} ok`);
    return chain(
      s.spec.then,
      run,
      { ...s.extras, response: answer.data, status: answer.status },
      env,
    );
  }
  const d = answer.data as { error?: unknown; message?: unknown } | null;
  const message =
    answer.error ??
    (typeof d?.error === "string"
      ? d.error
      : typeof d?.message === "string"
        ? d.message
        : `HTTP ${answer.status}`);
  if (s.spec.errKey)
    run = {
      ...run,
      data: setPath(run.data, s.spec.errKey, {
        message,
        status: answer.status,
        data: answer.data,
      }),
    };
  run = logged(run, `${answer.status || "network"} error: ${message}`);
  return chain(
    s.spec.catch,
    run,
    {
      ...s.extras,
      error: message,
      status: answer.status,
      response: answer.data,
    },
    env,
  );
}

const chain = (a: Action[], run: Run, extras: Scope, env: Env): Step =>
  execute(a, run, extras, env);

/** Joins the steps of two runs of a chain (requests and opens add up). */
export const andThen = (a: Step, fn: (run: Run) => Step): Step => {
  const b = fn(a.run);
  return {
    run: b.run,
    requests: [...a.requests, ...b.requests],
    opens: [...a.opens, ...b.opens],
  };
};

/** Fires the chain of an element's event. */
export function fire(
  el: El,
  event: EventName,
  run: Run,
  extras: Scope,
  env: Env,
): Step {
  return execute(el.events[event], run, { ...extras, id: el.id }, env);
}

// ---- forms ----

/** A field of a form changed: store it, re-validate it if it showed an error. */
export function formInput(el: El, run: Run, name: string, value: unknown): Run {
  const cur =
    (getPath(run.data, el.bind) as Record<string, unknown> | undefined) ?? {};
  let next: Run = {
    ...run,
    data: setPath(run.data, `${el.bind}`, { ...cur, [name]: value }),
  };
  const ui = next.ui[el.id];
  const field = el.fields.find((f) => f.name === name);
  if (field && ui?.errors && ui.errors[name]) {
    const e = validateField(field, value);
    const errors = { ...ui.errors };
    if (e) errors[name] = e;
    else delete errors[name];
    next = withErrors(next, el, errors);
  }
  return next;
}

function withErrors(run: Run, el: El, errors: Record<string, string>): Run {
  let out: Run = {
    ...run,
    ui: { ...run.ui, [el.id]: { ...run.ui[el.id], errors } },
  };
  const ek = el.props.errorsKey;
  if (ek) out = { ...out, data: setPath(out.data, ek, errors) };
  return out;
}

/** Submit: validate; `invalid` or `submit` chain runs. */
export function formSubmit(el: El, start: Run, env: Env): Step {
  const values =
    (getPath(start.data, el.bind) as Record<string, unknown> | undefined) ?? {};
  const errors = validateForm(el.fields, values);
  const bad = Object.keys(errors).length > 0;
  let run = withErrors(start, el, errors);
  run = {
    ...run,
    ui: { ...run.ui, [el.id]: { ...run.ui[el.id], errors, sent: !bad } },
  };
  if (bad)
    return execute(
      el.events.invalid,
      logged(run, `${el.id} invalid`),
      { errors, values, id: el.id },
      env,
    );
  if (el.props.okText)
    run = {
      ...run,
      notice: fill(el.props.okText, scopeOf(run.data, { values })),
    };
  return execute(
    el.events.submit,
    logged(run, `${el.id} submit`),
    { values, id: el.id },
    env,
  );
}
