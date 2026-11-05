/**
 * The reactive engine: signals, computeds, effects, owners, batching and the
 * microtask scheduler. One file because they are mutually recursive.
 *
 * Algorithm: push-pull with three node states (CLEAN, CHECK, DIRTY). A write
 * marks direct observers DIRTY and everything downstream CHECK, and queues the
 * effects it reaches. Computeds are lazy: they re-run only when read, and only
 * if a source really changed, so a diamond runs each node once and equal
 * values stop propagation. Effects run from the queue ordered by creation id
 * (a parent is always created before its children, so a parent that re-runs
 * disposes its children before they get a chance to run).
 *
 * @module
 */
import { devtoolsActive, emit } from "./devtools.ts";

export type Accessor<T> = () => T;
export type Equals<T> = false | ((a: T, b: T) => boolean);

export interface SignalOptions<T> {
  /** `false` always notifies; a function customises equality. Default `Object.is`. */
  equals?: Equals<T>;
  /** Name shown by devtools. */
  name?: string;
  /** Let devtools time travel this signal: its writes carry the previous value and a setter. */
  debug?: boolean;
}

export interface Signal<T> {
  (): T;
  set(value: T): void;
  update(fn: (prev: T) => T): void;
  /** Read without subscribing. */
  peek(): T;
}

export interface ReadonlySignal<T> {
  (): T;
  peek(): T;
}

const CLEAN = 0;
const CHECK = 1;
const DIRTY = 2;

const KIND_COMPUTED = 0;
const KIND_RENDER = 1;
const KIND_USER = 2;

const MAX_ROUNDS = 1000;

let nextId = 1;
let owner: Owner | null = null;
let listener: Computation | null = null;
let batchDepth = 0;
let flushing = false;
let scheduled = false;
let renderQueue: Computation[] = [];
let userQueue: Computation[] = [];

// Diagnostics for leak tests.
let liveOwners = 0;
let liveLinks = 0;

const SIGNAL_NODE = Symbol("maximus.signal");

interface Source {
  observers: Set<Computation> | null;
  refresh(): void;
}

class SignalNode<T> implements Source {
  value: T;
  observers: Set<Computation> | null = null;
  equals: Equals<T>;
  name: string | undefined;
  /** the signal's `set`, kept only for `{ debug: true }` signals (devtools time travel) */
  debugSet: ((v: T) => void) | null = null;
  constructor(value: T, options?: SignalOptions<T>) {
    this.value = value;
    this.equals = options?.equals === undefined ? Object.is : options.equals;
    this.name = options?.name;
  }
  refresh(): void {}
}

export class Owner {
  readonly id: number = nextId++;
  /** Lookup parent (context, error handlers). Always set; disposal follows `children`. */
  parent: Owner | null;
  children: Set<Owner> | null = null;
  cleanups: Array<() => void> | null = null;
  context: Map<symbol, unknown> | null = null;
  handlers: Array<(error: unknown) => void> | null = null;
  disposed = false;
  name: string | undefined;
  constructor(parent: Owner | null, attach: boolean) {
    this.parent = parent;
    if (attach && parent !== null) (parent.children ??= new Set()).add(this);
    liveOwners++;
    if (devtoolsActive())
      emit({
        type: "owner:create",
        id: this.id,
        parent: parent === null ? null : parent.id,
        owner: this,
        path: ownerPath(this),
      });
  }
}

class Computation extends Owner implements Source {
  fn: (prev: unknown) => unknown;
  value: unknown;
  kind: number;
  state = DIRTY;
  sources: Source[] | null = null;
  observers: Set<Computation> | null = null;
  equals: Equals<unknown>;
  running = false;
  error: { e: unknown } | null = null;
  constructor(
    fn: (prev: unknown) => unknown,
    kind: number,
    value: unknown,
    equals: Equals<unknown>,
    name?: string,
  ) {
    super(owner, true);
    this.fn = fn;
    this.kind = kind;
    this.value = value;
    this.equals = equals;
    this.name = name;
  }

  stale(state: number): void {
    if (this.state < state) {
      if (this.state === CLEAN && this.kind !== KIND_COMPUTED) enqueue(this);
      this.state = state;
      const obs = this.observers;
      if (obs !== null) for (const o of obs) o.stale(CHECK);
    }
  }

  refresh(): void {
    if (this.running) {
      throw new Error(
        `Maximus: circular dependency detected${this.name ? ` in "${this.name}"` : ""} (a computed read itself while computing)`,
      );
    }
    if (this.disposed) return;
    if (this.state === CHECK) {
      const s = this.sources;
      if (s !== null) {
        for (let i = 0; i < s.length; i++) {
          s[i]!.refresh();
          if ((this.state as number) === DIRTY) break;
        }
      }
    }
    if (this.state === DIRTY) this.run();
    else this.state = CLEAN;
  }

  run(): void {
    this.state = CLEAN;
    cleanNode(this);
    const prevOwner = owner;
    const prevListener = listener;
    owner = listener = this;
    this.running = true;
    let next: unknown;
    let failure: { e: unknown } | null = null;
    try {
      next = this.fn(this.value);
    } catch (e) {
      failure = { e };
    } finally {
      this.running = false;
      owner = prevOwner;
      listener = prevListener;
    }
    if (this.kind === KIND_COMPUTED) {
      const changed =
        failure !== null ||
        this.error !== null ||
        this.equals === false ||
        !this.equals(this.value, next);
      this.error = failure;
      if (changed) {
        if (failure === null) this.value = next;
        const obs = this.observers;
        if (obs !== null) for (const o of obs) o.state = DIRTY;
        if (devtoolsActive()) {
          emit({
            type: "computed:update",
            id: this.id,
            name: this.name,
            value: this.value,
            path: ownerPath(this),
          });
        }
      }
    } else {
      if (devtoolsActive()) {
        emit({
          type: "effect:run",
          id: this.id,
          name: this.name,
          render: this.kind === KIND_RENDER,
          path: ownerPath(this),
        });
      }
      if (failure !== null) {
        handleError(failure.e, this);
      } else if (typeof next === "function") {
        (this.cleanups ??= []).push(next as () => void);
      }
    }
  }
}

function enqueue(c: Computation): void {
  (c.kind === KIND_RENDER ? renderQueue : userQueue).push(c);
  if (!scheduled) {
    scheduled = true;
    queueMicrotask(microFlush);
  }
}

function microFlush(): void {
  scheduled = false;
  flushSync();
}

function runQueue(queue: Computation[], errors: { e: unknown }[]): void {
  if (queue.length > 1) queue.sort((a, b) => a.id - b.id);
  for (let i = 0; i < queue.length; i++) {
    const c = queue[i]!;
    if (c.disposed || c.state === CLEAN) continue;
    try {
      c.refresh();
    } catch (e) {
      errors.push({ e });
    }
  }
}

/**
 * Run all pending effects now (render effects first, then user effects),
 * until nothing is queued. Throws the first unhandled effect error after the
 * queue drained. Re-entrant calls (from inside an effect) are ignored.
 */
export function flushSync(): void {
  if (flushing || batchDepth > 0) return;
  flushing = true;
  const errors: { e: unknown }[] = [];
  let rounds = 0;
  try {
    while (renderQueue.length > 0 || userQueue.length > 0) {
      if (++rounds > MAX_ROUNDS) {
        renderQueue = [];
        userQueue = [];
        throw new Error(
          `Maximus: effect cycle detected: effects kept re-triggering each other for ${MAX_ROUNDS} rounds in one flush. ` +
            "An effect probably writes a signal that it also reads (use untrack or peek).",
        );
      }
      const queue = renderQueue.length > 0 ? renderQueue : userQueue;
      if (queue === renderQueue) renderQueue = [];
      else userQueue = [];
      runQueue(queue, errors);
    }
  } finally {
    flushing = false;
  }
  if (errors.length > 0) {
    for (let i = 1; i < errors.length; i++) console.error(errors[i]!.e);
    throw errors[0]!.e;
  }
}

/** Resolves after pending effects ran (the next microtask flush). */
export function tick(): Promise<void> {
  return Promise.resolve().then(flushSync);
}

// ---------------------------------------------------------------- tracking

function track(src: Source): void {
  const l = listener;
  if (l === null) return;
  const obs = (src.observers ??= new Set());
  if (!obs.has(l)) {
    obs.add(l);
    liveLinks++;
    (l.sources ??= []).push(src);
  }
}

function unsubscribe(c: Computation): void {
  const s = c.sources;
  if (s === null) return;
  c.sources = null;
  for (let i = 0; i < s.length; i++) {
    const obs = s[i]!.observers;
    if (obs !== null && obs.delete(c)) liveLinks--;
  }
}

function cleanNode(o: Owner): void {
  if (o.children !== null) {
    const ch = o.children;
    o.children = null;
    for (const c of ch) disposeOwner(c, false);
  }
  if (o.cleanups !== null) {
    const cl = o.cleanups;
    o.cleanups = null;
    let failure: { e: unknown } | null = null;
    for (let i = cl.length - 1; i >= 0; i--) {
      try {
        cl[i]!();
      } catch (e) {
        failure ??= { e };
      }
    }
    if (failure !== null) handleError(failure.e, o.parent);
  }
  if (o instanceof Computation) unsubscribe(o);
}

/** Dispose an owner: children first, then cleanups, then detach from the parent. */
export function disposeOwner(o: Owner, detach = true): void {
  if (o.disposed) return;
  o.disposed = true;
  liveOwners--;
  cleanNode(o);
  if (detach && o.parent !== null && o.parent.children !== null)
    o.parent.children.delete(o);
  if (devtoolsActive()) emit({ type: "owner:dispose", id: o.id });
}

export function ownerPath(o: Owner | null): string[] {
  const path: string[] = [];
  for (let p = o; p !== null; p = p.parent) path.unshift(p.name ?? `#${p.id}`);
  return path;
}

/** Route an error to the nearest handler up the owner chain; throws when there is none. */
export function handleError(err: unknown, from: Owner | null): void {
  let error = err;
  if (devtoolsActive()) emit({ type: "error", error, path: ownerPath(from) });
  for (let o = from; o !== null; o = o.parent) {
    if (o.handlers !== null) {
      for (let i = o.handlers.length - 1; i >= 0; i--) {
        try {
          o.handlers[i]!(error);
          return;
        } catch (e) {
          error = e;
        }
      }
    }
  }
  throw error;
}

// -------------------------------------------------------------- public API

/** A writable reactive value. */
export function signal<T>(initial: T, options?: SignalOptions<T>): Signal<T> {
  const node = new SignalNode(initial, options);
  const read = (() => {
    track(node);
    return node.value;
  }) as Signal<T>;
  read.set = (v) => writeSignal(node, v);
  read.update = (fn) => writeSignal(node, fn(node.value));
  read.peek = () => node.value;
  (read as unknown as Record<symbol, unknown>)[SIGNAL_NODE] = node;
  if (options?.debug === true) node.debugSet = read.set;
  return read;
}

function writeSignal<T>(node: SignalNode<T>, v: T): void {
  if (node.equals !== false && node.equals(node.value, v)) return;
  if (listener !== null && listener.kind === KIND_COMPUTED) {
    throw new Error(
      "Maximus: cannot write to a signal inside a computed (computeds must be pure; use an effect)",
    );
  }
  const prev = node.value;
  node.value = v;
  if (devtoolsActive())
    emit({
      type: "signal:write",
      name: node.name,
      value: v,
      prev,
      set: node.debugSet,
      path: ownerPath(owner),
    });
  const obs = node.observers;
  if (obs !== null) for (const o of obs) o.stale(DIRTY);
}

/** A lazy, cached derived value. Re-runs only when a source actually changed. */
export function computed<T>(
  fn: () => T,
  options?: SignalOptions<T>,
): ReadonlySignal<T> {
  const c = new Computation(
    fn,
    KIND_COMPUTED,
    undefined,
    options?.equals === undefined
      ? Object.is
      : (options.equals as Equals<unknown>),
    options?.name,
  );
  const read = (() => {
    if (!c.disposed) c.refresh();
    track(c);
    if (c.error !== null) throw c.error.e;
    return c.value as T;
  }) as ReadonlySignal<T>;
  read.peek = () => {
    if (!c.disposed) c.refresh();
    if (c.error !== null) throw c.error.e;
    return c.value as T;
  };
  (read as unknown as Record<symbol, unknown>)[SIGNAL_NODE] = c;
  return read;
}

function createEffect(fn: () => void | (() => void), kind: number): () => void {
  const c = new Computation(fn, kind, undefined, false);
  if (kind === KIND_RENDER || (batchDepth === 0 && !flushing)) {
    c.run();
  } else {
    enqueue(c);
  }
  return () => disposeOwner(c);
}

/**
 * Run `fn` now and again whenever a signal it read changes. A returned function
 * is a cleanup, run before the next run and on dispose. Created inside a batch,
 * a render or a flush, the first run is deferred until that finishes.
 * Returns the stop function.
 */
export function effect(fn: () => void | (() => void)): () => void {
  return createEffect(fn, KIND_USER);
}

/** Like {@link effect} but runs first and synchronously at creation; the DOM layer uses it for bindings. */
export function renderEffect(fn: () => void | (() => void)): () => void {
  return createEffect(fn, KIND_RENDER);
}

/** Run `fn` once after the current render/batch, untracked. A returned function is a cleanup. */
export function onMount(fn: () => void | (() => void)): void {
  effect(() => untrack(fn));
}

/** Group writes: effects run once, after the outermost batch ends. */
export function batch<T>(fn: () => T): T {
  batchDepth++;
  try {
    return fn();
  } finally {
    if (--batchDepth === 0) flushSync();
  }
}

/** Run `fn` without subscribing the current computation to what it reads. */
export function untrack<T>(fn: () => T): T {
  const prev = listener;
  listener = null;
  try {
    return fn();
  } finally {
    listener = prev;
  }
}

export function isTracking(): boolean {
  return listener !== null;
}

/** The current owner (the computation, root or provider being run), or null. */
export function getOwner(): Owner | null {
  return owner;
}

/** Create a detached scope. The `dispose` argument tears down everything created inside. Context and error handlers still resolve through the surrounding owner. */
export function root<T>(fn: (dispose: () => void) => T): T {
  const o = new Owner(owner, false);
  const prevOwner = owner;
  const prevListener = listener;
  owner = o;
  listener = null;
  try {
    return fn(() => disposeOwner(o));
  } catch (e) {
    disposeOwner(o);
    throw e;
  } finally {
    owner = prevOwner;
    listener = prevListener;
  }
}

/** Swap the current owner without touching tracking; returns the previous one. Internal. */
export function setOwner(o: Owner | null): Owner | null {
  const prev = owner;
  owner = o;
  return prev;
}

/** Create an owner that is disposed with `parent` (or the current owner). */
export function createOwner(
  parent: Owner | null = owner,
  name?: string,
): Owner {
  const o = new Owner(parent, true);
  if (name !== undefined) o.name = name;
  return o;
}

/** Run `fn` with `o` as the current owner, untracked. Errors go to the owner's error handlers. */
export function runWithOwner<T>(o: Owner | null, fn: () => T): T | undefined {
  const prevOwner = owner;
  const prevListener = listener;
  owner = o;
  listener = null;
  try {
    return fn();
  } catch (e) {
    handleError(e, o);
    return undefined;
  } finally {
    owner = prevOwner;
    listener = prevListener;
  }
}

/** Register a cleanup on the current owner. Runs (in reverse order) before the owner re-runs or is disposed. */
export function onCleanup(fn: () => void): void {
  if (owner !== null) (owner.cleanups ??= []).push(fn);
}

/** Run `fn`; errors thrown by it or by anything created under it later are passed to `handler`. */
export function catchError<T>(
  fn: () => T,
  handler: (error: unknown) => void,
): T | undefined {
  const o = new Owner(owner, true);
  o.handlers = [handler];
  const prev = owner;
  owner = o;
  try {
    return fn();
  } catch (e) {
    disposeOwner(o);
    handleError(e, o);
    return undefined;
  } finally {
    owner = prev;
  }
}

export function isSignal(value: unknown): value is Signal<unknown> {
  return (
    typeof value === "function" &&
    (value as unknown as Record<symbol, unknown>)[SIGNAL_NODE] !== undefined
  );
}

/** Number of computations currently subscribed to a signal or computed (diagnostics, leak tests). */
export function subscriberCount(s: Accessor<unknown>): number {
  const n = (s as unknown as Record<symbol, Source | undefined>)[SIGNAL_NODE];
  return n?.observers?.size ?? 0;
}

/** Live counters for leak tests: owners alive, and signal-to-computation subscription links alive. */
export function debugStats(): { owners: number; links: number } {
  return { owners: liveOwners, links: liveLinks };
}
