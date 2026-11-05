/**
 * `createForm`: per-field signals (value, error, touched, dirty, validating),
 * nested objects and arrays, sync/async validators with debounce and stale
 * result protection, Standard Schema or function schemas, and submit handling.
 *
 * @module
 */
import {
  batch,
  computed,
  getOwner,
  onCleanup,
  signal,
  untrack,
} from "../core/mod.ts";
import type { Accessor, Signal } from "../core/mod.ts";
import { makeBind } from "./bind.ts";
import type { BoundElement } from "./bind.ts";
import {
  deepEqual,
  expandPattern,
  getAt,
  normalizePath,
  parsePath,
  setAt,
  toPattern,
} from "./paths.ts";
import { isStandardSchema, issuePath } from "./standard-schema.ts";
import type { SchemaFn, StandardSchemaV1 } from "./standard-schema.ts";
import { toMessages } from "./validators.ts";
import type { Validator } from "./validators.ts";

// ------------------------------------------------------------------ types

type Primitive =
  | string
  | number
  | boolean
  | bigint
  | symbol
  | null
  | undefined
  | Date
  | File
  | Blob
  | ((...args: never[]) => unknown);

/** Dotted paths into `T` (`"address.city"`, `"tags.0"`), to a depth of six. */
export type Path<T, D extends unknown[] = []> = D["length"] extends 6
  ? never
  : T extends Primitive
    ? never
    : T extends readonly (infer U)[]
      ? `${number}` | `${number}.${Path<U, [...D, 0]>}`
      : {
          [K in keyof T & string]:
            | K
            | (NonNullable<T[K]> extends Primitive
                ? never
                : `${K}.${Path<NonNullable<T[K]>, [...D, 0]>}`);
        }[keyof T & string];

export type PathValue<T, P extends string> = P extends `${infer H}.${infer R}`
  ? T extends readonly (infer U)[]
    ? PathValue<U, R>
    : H extends keyof T
      ? PathValue<NonNullable<T[H]>, R>
      : undefined
  : T extends readonly (infer U)[]
    ? U | undefined
    : P extends keyof T
      ? T[P]
      : undefined;

export type ValidateOn = "input" | "change" | "blur" | "submit";

export interface FieldOptions<V = unknown, T = unknown> {
  /** One or more validators, sync or async. */
  validate?: Validator<V, T> | readonly Validator<V, T>[];
  /** Delay (ms) for validation triggered by typing. Blur, change, submit and `validate()` are immediate. Default: the form's `debounce`. */
  debounce?: number;
}

/** A readable signal with `set`/`update`. */
export interface FieldValue<V> {
  (): V;
  set(value: V): void;
  update(fn: (prev: V) => V): void;
  peek(): V;
}

export interface Field<V = unknown> {
  /** The current path (a reactive path reads its source). */
  readonly path: Accessor<string>;
  value: FieldValue<V>;
  /** The first error message, or `undefined`. Order: server error, validator error, schema error. */
  error: Accessor<string | undefined>;
  errors: Accessor<readonly string[]>;
  touched: Signal<boolean>;
  /** Differs from the initial value (deep comparison). */
  dirty: Accessor<boolean>;
  /** An async validator (or a debounce) is pending. */
  validating: Accessor<boolean>;
  /** Id for the element that shows the error; `bind` points `aria-describedby` at it while there is an error. */
  errorId: Accessor<string>;
  /** Set the value as if the user changed it. */
  set(value: V): void;
  /** Spread/directive for `input`, `textarea`, `select`, checkbox, radio, number and file inputs: `<input ${f.field("email").bind}>`. */
  bind: (el: Element) => () => void;
  /** Validate now; resolves to whether the field is valid. */
  validate(): Promise<boolean>;
  /** Back to the initial value, untouched, no errors. */
  reset(): void;
}

export interface ArrayItem {
  /** Stable across moves and removals: use it as the `each` key. */
  key: number;
  index: number;
}

export interface FieldArray<V = unknown> {
  readonly path: string;
  items: Accessor<readonly ArrayItem[]>;
  length: Accessor<number>;
  add(value: V, at?: number): void;
  remove(index: number): void;
  move(from: number, to: number): void;
  swap(a: number, b: number): void;
  clear(): void;
}

export interface FormOptions<T extends object, Out = T> {
  initial: T;
  /** A Standard Schema (Zod, Valibot, ArkType, ...) or `(values) => ({ path: message })`. */
  schema?: StandardSchemaV1<unknown, Out> | SchemaFn<T>;
  /** Called with the (schema-parsed) values when validation passes. Throwing sets `submitError`. */
  onSubmit?: (values: Out, form: Form<T, Out>) => unknown;
  /** When a field validates: while typing, on change (default), on blur, or only on submit. After the first validation a field also re-validates while typing. */
  validateOn?: ValidateOn;
  /** Default debounce (ms) for validation while typing. Default 0. */
  debounce?: number;
  /** Validators by path; `*` matches any array index (`"tags.*"`). */
  validators?: Record<string, Validator | readonly Validator[]>;
}

export interface Form<T extends object, Out = T> {
  field<P extends Path<T>>(
    path: P,
    options?: FieldOptions<PathValue<T, P>, T>,
  ): Field<PathValue<T, P>>;
  field(
    path: string | (() => string),
    options?: FieldOptions<unknown, T>,
  ): Field<unknown>;
  array<P extends Path<T>>(
    path: P,
  ): FieldArray<
    PathValue<T, P> extends readonly (infer U)[] | undefined
      ? NonNullable<U>
      : unknown
  >;
  array(path: string): FieldArray<unknown>;
  /** The current form data. */
  values: Accessor<T>;
  setValues(values: Partial<T>): void;
  /** Submit handler: use as `@submit=${f.submit}`. Prevents the default, validates, focuses the first invalid field, runs `onSubmit`, catches errors into `submitError`. */
  submit: (event?: Event) => Promise<void>;
  submitting: Accessor<boolean>;
  submitError: Accessor<unknown>;
  submitCount: Accessor<number>;
  /** No known errors. Fields are checked when they validate; `await f.validate()` checks everything. */
  valid: Accessor<boolean>;
  dirty: Accessor<boolean>;
  validating: Accessor<boolean>;
  /** Every current error by path (`""` is form-level). */
  errors: Accessor<Readonly<Record<string, readonly string[]>>>;
  /** Form-level errors (schema issues without a path, `setErrors({ "": ... })`). */
  formErrors: Accessor<readonly string[]>;
  /** Validate everything now (fields, then the schema); resolves to whether the form is valid. */
  validate(): Promise<boolean>;
  /** Server-side errors: `{ email: "taken", "address.city": ["a", "b"] }`. A field's server error clears when its value changes or on submit. */
  setErrors(errors: Record<string, string | readonly string[]>): void;
  clearErrors(): void;
  /** Back to the initial values (or to `next`, which becomes the new initial), untouched, no errors. */
  reset(next?: T): void;
  /** Mark every field touched. */
  touchAll(): void;
  dispose(): void;
}

// ------------------------------------------------------------- internals

type Errors = Record<string, readonly string[]>;
type Flags = Record<string, true>;
type Counts = Record<string, number>;

const NONE: readonly string[] = [];
const sameList = (a: readonly string[], b: readonly string[]): boolean =>
  a !== undefined &&
  b !== undefined &&
  a.length === b.length &&
  a.every((x, i) => x === b[i]);

function isThenable(x: unknown): x is PromiseLike<unknown> {
  return (
    typeof x === "object" &&
    x !== null &&
    typeof (x as { then?: unknown }).then === "function"
  );
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

let formCounter = 0;

export function createForm<T extends object, Out = T>(
  options: FormOptions<T, Out>,
): Form<T, Out> {
  const formId = `mxf${++formCounter}`;
  const validateOn: ValidateOn = options.validateOn ?? "change";
  const defaultDebounce = options.debounce ?? 0;

  const initial = signal<T>(options.initial);
  const data = signal<T>(options.initial);
  const touched = signal<Flags>({});
  const validatingCounts = signal<Counts>({});
  const ownErrors = signal<Errors>({});
  const serverErrors = signal<Errors>({});
  const schemaErrors = signal<Errors>({});
  const submitting = signal(false);
  const submitError = signal<unknown>(undefined);
  const submitCount = signal(0);
  const validated = new Set<string>();
  let disposed = false;

  const exactValidators = new Map<string, Validator[]>();
  const patternValidators = new Map<string, Validator[]>();
  const debounces = new Map<string, number>();
  const toList = (v: Validator | readonly Validator[]): Validator[] =>
    typeof v === "function" ? [v] : [...v];
  if (options.validators)
    for (const [p, v] of Object.entries(options.validators)) {
      const key = normalizePath(p).replace(/(^|\.)\*/g, "$1*");
      (key.includes("*") ? patternValidators : exactValidators).set(
        key,
        toList(v),
      );
    }

  const validatorsFor = (path: string): Validator[] => [
    ...(exactValidators.get(path) ?? []),
    ...(patternValidators.get(toPattern(path)) ?? []),
  ];

  // -------- bookkeeping per path

  interface Control {
    id: number;
    ctrl: AbortController | null;
    timer: ReturnType<typeof setTimeout> | undefined;
    resolve: ((v: boolean) => void) | null;
    /** a debounce delay is counted as "validating" */
    waiting: boolean;
  }
  const controls = new Map<string, Control>();
  const control = (path: string): Control => {
    let c = controls.get(path);
    if (c === undefined)
      controls.set(
        path,
        (c = {
          id: 0,
          ctrl: null,
          timer: undefined,
          resolve: null,
          waiting: false,
        }),
      );
    return c;
  };

  const bump = (path: string, by: number): void =>
    validatingCounts.update((m) => {
      const n = (m[path] ?? 0) + by;
      const next = { ...m };
      if (n <= 0) delete next[path];
      else next[path] = n;
      return next;
    });

  const setList = (
    sig: Signal<Errors>,
    path: string,
    list: readonly string[],
  ): void => {
    const cur = sig.peek()[path] ?? NONE;
    if (sameList(cur, list)) return;
    sig.update((m) => {
      const next = { ...m };
      if (list.length === 0) delete next[path];
      else next[path] = list;
      return next;
    });
  };

  const errorsAt = (path: string): readonly string[] => {
    const s = serverErrors()[path];
    const o = ownErrors()[path];
    const c = schemaErrors()[path];
    if (s === undefined && o === undefined && c === undefined) return NONE;
    return [...(s ?? NONE), ...(o ?? NONE), ...(c ?? NONE)];
  };

  const valueAt = (path: string): unknown => getAt(data(), parsePath(path));
  const initialAt = (path: string): unknown =>
    getAt(initial(), parsePath(path));

  // -------- schema

  const schema = options.schema;
  let schemaRun = 0;

  interface SchemaOutcome {
    stale: boolean;
    issues: Record<string, string[]>;
    value: unknown;
    ok: boolean;
  }
  async function runSchema(): Promise<SchemaOutcome> {
    const id = ++schemaRun;
    const values = data.peek();
    const issues: Record<string, string[]> = {};
    const add = (p: string, m: string): void => void (issues[p] ??= []).push(m);
    let value: unknown = values;
    let ok = true;
    if (schema === undefined) return { stale: false, issues, value, ok };
    if (isStandardSchema(schema)) {
      let r = schema["~standard"].validate(values);
      if (isThenable(r)) r = await r;
      if (r.issues !== undefined) {
        ok = false;
        for (const issue of r.issues) add(issuePath(issue), issue.message);
      } else value = r.value;
    } else {
      let r = (schema as SchemaFn<T>)(values);
      if (isThenable(r)) r = await r;
      if (r) {
        for (const [p, m] of Object.entries(r))
          for (const msg of toMessages(m as string | readonly string[]))
            add(normalizePath(p), msg);
        ok = Object.keys(issues).length === 0;
      }
    }
    return { stale: id !== schemaRun, issues, value, ok };
  }

  // -------- field validation

  async function execute(
    path: string,
    id: number,
    c: Control,
    withSchema: boolean,
  ): Promise<boolean> {
    const validators = validatorsFor(path);
    const value = untrack(() => valueAt(path));
    const msgs: string[] = [];
    const pending: Promise<void>[] = [];
    const ctx = { values: data.peek(), path, signal: c.ctrl!.signal };
    for (const v of validators) {
      let r;
      try {
        r = v(value, ctx);
      } catch (e) {
        msgs.push(messageOf(e));
        continue;
      }
      if (isThenable(r)) {
        pending.push(
          Promise.resolve(r).then(
            (x) => void msgs.push(...toMessages(x as never)),
            (e: unknown) => {
              if (!c.ctrl!.signal.aborted) msgs.push(messageOf(e));
            },
          ),
        );
      } else msgs.push(...toMessages(r));
    }
    let counted = false;
    if (pending.length > 0 || withSchema) {
      bump(path, 1);
      counted = true;
    }
    try {
      if (pending.length > 0) await Promise.all(pending);
      if (id !== c.id || disposed) return !hasErrors(path);
      if (withSchema && schema !== undefined) {
        const out = await runSchema();
        if (id !== c.id || out.stale || disposed) return !hasErrors(path);
        batch(() => {
          const next: Errors = { ...schemaErrors.peek() };
          for (const k of Object.keys(next))
            if (k === path || k.startsWith(path + ".")) delete next[k];
          for (const [k, list] of Object.entries(out.issues))
            if (k === path || k.startsWith(path + ".")) next[k] = list;
          schemaErrors.set(next);
        });
      }
      setList(ownErrors, path, msgs);
      validated.add(path);
      return !hasErrors(path);
    } finally {
      if (counted) bump(path, -1);
    }
  }

  function hasErrors(path: string): boolean {
    return errorsAtPeek(path).length > 0;
  }
  function errorsAtPeek(path: string): readonly string[] {
    return untrack(() => errorsAt(path));
  }

  function validatePath(
    path: string,
    immediate: boolean,
    withSchema = true,
  ): Promise<boolean> {
    validated.add(path);
    const c = control(path);
    const id = ++c.id;
    cancel(c, path, !hasErrors(path));
    c.ctrl = new AbortController();
    const delay = debounces.get(path) ?? defaultDebounce;
    if (immediate || delay <= 0) return execute(path, id, c, withSchema);
    bump(path, 1);
    c.waiting = true;
    return new Promise<boolean>((resolve) => {
      c.resolve = resolve;
      c.timer = setTimeout(() => {
        c.resolve = null;
        c.waiting = false;
        bump(path, -1);
        void execute(path, id, c, withSchema).then(resolve, () =>
          resolve(false),
        );
      }, delay);
    });
  }

  /** Abort the running validation and drop a pending debounce of `path`. */
  function cancel(c: Control, path: string, result: boolean): void {
    c.ctrl?.abort();
    clearTimeout(c.timer);
    if (c.waiting) {
      c.waiting = false;
      bump(path, -1);
    }
    c.resolve?.(result);
    c.resolve = null;
  }

  const submitted = (): boolean => submitCount.peek() > 0;

  /** Does `trigger` validate this path now? */
  function shouldValidate(
    path: string,
    trigger: "input" | "change" | "blur",
  ): boolean {
    const again = submitted() || validated.has(path);
    if (trigger === "input") return validateOn === "input" || again;
    if (trigger === "change")
      return validateOn === "input" || validateOn === "change" || again;
    return validateOn === "blur" || again;
  }

  /** The user (or `field.set`) changed a value. */
  function change(
    path: string,
    value: unknown,
    trigger: "input" | "change",
    immediate = trigger === "change",
  ): void {
    batch(() => {
      if (!deepEqual(getAt(data.peek(), parsePath(path)), value)) {
        data.update((d) => setAt(d, parsePath(path), value));
        if (serverErrors.peek()[path] !== undefined)
          setList(serverErrors, path, NONE);
      }
    });
    if (shouldValidate(path, trigger))
      void validatePath(path, immediate).catch(() => {});
  }

  function blur(path: string): void {
    setTouched(path, true);
    if (shouldValidate(path, "blur"))
      void validatePath(path, true).catch(() => {});
  }

  function setTouched(path: string, on: boolean): void {
    const cur = touched.peek()[path] === true;
    if (cur === on) return;
    touched.update((m) => {
      const next = { ...m };
      if (on) next[path] = true;
      else delete next[path];
      return next;
    });
  }

  // -------- fields

  const bound = new Set<BoundElement>();
  const fields = new Map<string, Field>();
  const known = new Set<string>(); // concrete paths that were requested as fields

  function makeField(
    getPath: () => string,
    opts: FieldOptions | undefined,
    reactivePath: boolean,
  ): Field {
    const path = reactivePath
      ? computed(getPath)
      : (getPath as Accessor<string>);
    const initialPath = untrack(getPath);
    if (opts !== undefined) {
      const key = reactivePath
        ? toPattern(initialPath)
        : normalizePath(initialPath);
      if (opts.validate !== undefined)
        (reactivePath ? patternValidators : exactValidators).set(
          key,
          toList(opts.validate as Validator | readonly Validator[]),
        );
      if (opts.debounce !== undefined)
        debounces.set(normalizePath(initialPath), opts.debounce);
    }
    known.add(initialPath);
    const value = computed(() => valueAt(path()));
    const valueSig = Object.assign(() => value(), {
      set: (v: unknown) => change(untrack(path), v, "change", false),
      update: (fn: (p: unknown) => unknown) =>
        change(
          untrack(path),
          fn(untrack(() => valueAt(untrack(path)))),
          "change",
          false,
        ),
      peek: () => untrack(() => valueAt(untrack(path))),
    }) as FieldValue<unknown>;
    const errors = computed(() => errorsAt(path()), { equals: sameList });
    const error = computed(() => errors()[0]);
    const touchedSig = Object.assign(() => touched()[path()] === true, {
      set: (v: boolean) => setTouched(untrack(path), v),
      update: (fn: (p: boolean) => boolean) =>
        setTouched(untrack(path), fn(touched.peek()[untrack(path)] === true)),
      peek: () => touched.peek()[untrack(path)] === true,
    }) as Signal<boolean>;
    const dirty = computed(
      () => !deepEqual(valueAt(path()), initialAt(path())),
    );
    const validating = computed(() => (validatingCounts()[path()] ?? 0) > 0);
    const errorId = (): string =>
      `${formId}-${path().replace(/\./g, "-")}-error`;
    const field: Field = {
      path,
      value: valueSig,
      error,
      errors,
      touched: touchedSig,
      dirty,
      validating,
      errorId,
      set: (v) => change(untrack(path), v, "change", false),
      bind: makeBind({
        path,
        value: valueSig,
        error,
        errorId,
        change: (v, t) => change(untrack(path), v, t),
        blur: () => blur(untrack(path)),
        registry: bound,
      }),
      validate: () => validatePath(untrack(path), true),
      reset() {
        const p = untrack(path);
        batch(() => {
          data.update((d) => setAt(d, parsePath(p), initialAt(p)));
          setTouched(p, false);
          setList(ownErrors, p, NONE);
          setList(serverErrors, p, NONE);
          validated.delete(p);
        });
      },
    };
    return field;
  }

  function fieldFor(path: string | (() => string), opts?: FieldOptions): Field {
    if (typeof path === "function") return makeField(path, opts, true);
    const key = normalizePath(path);
    let f = fields.get(key);
    if (f === undefined)
      fields.set(key, (f = makeField(() => key, opts, false)));
    else if (opts !== undefined) {
      if (opts.validate !== undefined)
        exactValidators.set(
          key,
          toList(opts.validate as Validator | readonly Validator[]),
        );
      if (opts.debounce !== undefined) debounces.set(key, opts.debounce);
    }
    return f;
  }

  // -------- arrays

  const keyStore = new Map<string, number[]>();
  let nextKey = 1;

  function keysFor(path: string, len: number): number[] {
    let keys = keyStore.get(path);
    if (keys === undefined) keyStore.set(path, (keys = []));
    while (keys.length < len) keys.push(nextKey++);
    if (keys.length > len) keys.length = len;
    return keys;
  }

  /** Move per-path state when array indexes change: `map(old)` gives the new index or `null` to drop. */
  function remap(prefix: string, map: (i: number) => number | null): void {
    const p = prefix === "" ? "" : prefix + ".";
    const rename = (k: string): string | null => {
      if (!k.startsWith(p)) return k;
      const rest = k.slice(p.length);
      const dot = rest.indexOf(".");
      const head = dot === -1 ? rest : rest.slice(0, dot);
      if (!/^\d+$/.test(head)) return k;
      const n = map(Number(head));
      return n === null ? null : p + n + (dot === -1 ? "" : rest.slice(dot));
    };
    const moveRecord = <R>(rec: Record<string, R>): Record<string, R> => {
      const out: Record<string, R> = {};
      for (const k of Object.keys(rec)) {
        const nk = rename(k);
        if (nk !== null) out[nk] = rec[k]!;
      }
      return out;
    };
    touched.set(moveRecord(touched.peek()));
    ownErrors.set(moveRecord(ownErrors.peek()));
    serverErrors.set(moveRecord(serverErrors.peek()));
    schemaErrors.set(moveRecord(schemaErrors.peek()));
    for (const k of [...validated]) {
      validated.delete(k);
      const nk = rename(k);
      if (nk !== null) validated.add(nk);
    }
  }

  function arrayFor(path: string): FieldArray {
    const key = normalizePath(path);
    const segs = parsePath(key);
    const raw = computed(() => getAt(data(), segs));
    const length = computed(() => {
      const v = raw();
      return Array.isArray(v) ? v.length : 0;
    });
    // depends on the array itself, so a move (same length) is seen too
    const items = computed(() => {
      raw();
      return keysFor(key, length()).map((k, index) => ({ key: k, index }));
    });
    const write = (next: unknown[]): void =>
      data.update((d) => setAt(d, segs, next));
    const current = (): unknown[] => {
      const v = getAt(data.peek(), segs);
      return Array.isArray(v) ? v.slice() : [];
    };
    const revalidate = (): void => {
      if (validated.has(key) || submitted() || validatorsFor(key).length > 0)
        void validatePath(key, true).catch(() => {});
    };
    return {
      path: key,
      items,
      length,
      add(value, at) {
        const arr = current();
        const i =
          at === undefined ? arr.length : Math.max(0, Math.min(at, arr.length));
        batch(() => {
          const keys = keysFor(key, arr.length);
          arr.splice(i, 0, value);
          keys.splice(i, 0, nextKey++);
          remap(key, (old) => (old >= i ? old + 1 : old));
          write(arr);
        });
        revalidate();
      },
      remove(index) {
        const arr = current();
        if (index < 0 || index >= arr.length) return;
        batch(() => {
          const keys = keysFor(key, arr.length);
          arr.splice(index, 1);
          keys.splice(index, 1);
          remap(key, (old) =>
            old === index ? null : old > index ? old - 1 : old,
          );
          write(arr);
        });
        revalidate();
      },
      move(from, to) {
        const arr = current();
        if (
          from === to ||
          from < 0 ||
          from >= arr.length ||
          to < 0 ||
          to >= arr.length
        )
          return;
        batch(() => {
          const keys = keysFor(key, arr.length);
          const [v] = arr.splice(from, 1);
          arr.splice(to, 0, v);
          const [k] = keys.splice(from, 1);
          keys.splice(to, 0, k!);
          remap(key, (old) => {
            if (old === from) return to;
            if (from < to && old > from && old <= to) return old - 1;
            if (from > to && old >= to && old < from) return old + 1;
            return old;
          });
          write(arr);
        });
        revalidate();
      },
      swap(a, b) {
        const arr = current();
        if (a === b || a < 0 || b < 0 || a >= arr.length || b >= arr.length)
          return;
        batch(() => {
          const keys = keysFor(key, arr.length);
          [arr[a], arr[b]] = [arr[b], arr[a]];
          [keys[a], keys[b]] = [keys[b]!, keys[a]!];
          remap(key, (old) => (old === a ? b : old === b ? a : old));
          write(arr);
        });
        revalidate();
      },
      clear() {
        batch(() => {
          keyStore.set(key, []);
          remap(key, () => null);
          write([]);
        });
        revalidate();
      },
    };
  }

  // -------- whole form

  const allErrors = computed(
    () => {
      const out: Record<string, string[]> = {};
      for (const src of [serverErrors(), ownErrors(), schemaErrors()])
        for (const [k, list] of Object.entries(src))
          (out[k] ??= []).push(...list);
      return out as Errors;
    },
    { equals: (a, b) => deepEqual(a, b) },
  );
  const valid = computed(() => Object.keys(allErrors()).length === 0);
  const dirtyAll = computed(() => !deepEqual(data(), initial()));
  const validatingAll = computed(
    () => Object.keys(validatingCounts()).length > 0,
  );
  const formErrors = computed(() => allErrors()[""] ?? NONE, {
    equals: sameList,
  });

  async function validateAll(): Promise<{ ok: boolean; value: unknown }> {
    const paths = new Set<string>(exactValidators.keys());
    for (const p of patternValidators.keys())
      for (const c of expandPattern(p, data.peek())) paths.add(c);
    const own = [...paths].map((p) => validatePath(p, true, false));
    const results = await Promise.all(own);
    let value: unknown = data.peek();
    let ok = results.every(Boolean);
    if (schema !== undefined) {
      const out = await runSchema();
      if (!out.stale) {
        batch(() =>
          schemaErrors.set(Object.fromEntries(Object.entries(out.issues))),
        );
        if (!out.ok) ok = false;
        else value = out.value;
      }
    }
    return { ok: ok && Object.keys(untrack(allErrors)).length === 0, value };
  }

  function focusFirstInvalid(): void {
    const invalid = [...bound].filter(
      (b) => untrack(() => errorsAt(untrack(b.path))).length > 0,
    );
    if (invalid.length === 0) return;
    invalid.sort((a, b) => (a.el.compareDocumentPosition(b.el) & 4 ? -1 : 1));
    const el = invalid[0]!.el as HTMLElement;
    el.focus?.();
    el.scrollIntoView?.({ block: "center" });
  }

  const form: Form<T, Out> = {
    field: fieldFor as Form<T, Out>["field"],
    array: arrayFor as Form<T, Out>["array"],
    values: () => data(),
    setValues(values) {
      batch(() => {
        data.update((d) => ({ ...d, ...values }));
        for (const k of Object.keys(values)) keyStore.delete(k);
      });
    },
    submit: async (event) => {
      event?.preventDefault();
      if (submitting.peek()) return;
      batch(() => {
        submitCount.update((n) => n + 1);
        submitError.set(undefined);
        serverErrors.set({});
        for (const p of known) setTouched(p, true);
        for (const b of bound) setTouched(untrack(b.path), true);
      });
      const { ok, value } = await validateAll();
      if (disposed) return;
      if (!ok) {
        focusFirstInvalid();
        return;
      }
      submitting.set(true);
      try {
        await options.onSubmit?.(value as Out, form);
      } catch (e) {
        submitError.set(e);
      } finally {
        submitting.set(false);
      }
    },
    submitting: () => submitting(),
    submitError: () => submitError(),
    submitCount: () => submitCount(),
    valid,
    dirty: dirtyAll,
    validating: validatingAll,
    errors: allErrors,
    formErrors,
    validate: async () => (await validateAll()).ok,
    setErrors(errors) {
      const next: Record<string, string[]> = {};
      for (const [k, v] of Object.entries(errors)) {
        const list = toMessages(v as string | readonly string[]);
        if (list.length > 0) next[normalizePath(k)] = list;
      }
      serverErrors.set(next);
    },
    clearErrors() {
      batch(() => {
        serverErrors.set({});
        ownErrors.set({});
        schemaErrors.set({});
        validated.clear();
      });
    },
    reset(next) {
      for (const [p, c] of controls) {
        cancel(c, p, true);
        c.id++;
      }
      schemaRun++;
      batch(() => {
        if (next !== undefined) initial.set(next);
        data.set(initial.peek());
        touched.set({});
        ownErrors.set({});
        serverErrors.set({});
        schemaErrors.set({});
        validatingCounts.set({});
        submitCount.set(0);
        submitError.set(undefined);
        validated.clear();
        keyStore.clear();
      });
    },
    touchAll() {
      batch(() => {
        for (const p of known) setTouched(p, true);
        for (const b of bound) setTouched(untrack(b.path), true);
      });
    },
    dispose() {
      disposed = true;
      for (const [p, c] of controls) cancel(c, p, false);
    },
  };
  if (getOwner() !== null) onCleanup(form.dispose);
  return form;
}
