/**
 * Devtools on top of the `__MAXIMUS__` hook: a bounded timeline of what the
 * runtime did (signal writes, effect runs, owners, mounts, router events, errors),
 * a snapshot of the owner tree, and time travel over `{ debug: true }` signals.
 *
 * @module
 */
import {
  installDevtools as installHook,
  signal,
  subscriberCount,
} from "../core/mod.ts";
import type { Accessor, DevtoolsEvent, Owner } from "../core/mod.ts";

export interface TimelineEntry {
  /** Increasing sequence number. */
  seq: number;
  /** `performance.now()` (or `Date.now()`) when the event was seen. */
  time: number;
  /** `signal:write`, `effect:run`, `computed:update`, `owner:create`, `owner:dispose`, `mount`, `unmount`, `error`, `router:*`, ... */
  type: string;
  /** Signal / effect name when it has one. */
  name?: string;
  /** Owner path (names, `#id` for unnamed owners). */
  path?: readonly string[];
  /** New value of a signal write. */
  value?: unknown;
  /** Previous value of a signal write. */
  prev?: unknown;
  /** Everything else the event carried. */
  detail?: Readonly<Record<string, unknown>>;
}

export interface OwnerNode {
  id: number;
  name: string;
  kind: "owner" | "computed" | "render" | "effect";
  children: OwnerNode[];
}

export interface DevtoolsSnapshot {
  time: number;
  /** Live owner trees (one per root owner). */
  owners: OwnerNode[];
  /** Number of live owners. */
  ownerCount: number;
  /** Latest value of every named signal that was written since the devtools were installed. */
  signals: Record<string, unknown>;
  /** How many timeline entries were seen (including the dropped ones) and kept. */
  seen: number;
  kept: number;
}

export interface DebugWrite {
  seq: number;
  name: string | undefined;
  prev: unknown;
  value: unknown;
}

export interface TimeTravel {
  /** Recorded writes of `{ debug: true }` signals, oldest first. */
  entries: Accessor<readonly DebugWrite[]>;
  /** How many of them are applied: `entries().length` is "now". */
  position: Accessor<number>;
  canBack(): boolean;
  canForward(): boolean;
  /** Undo the last `n` applied writes. */
  back(n?: number): void;
  /** Redo `n` undone writes. */
  forward(n?: number): void;
  /** Jump so that exactly `position` writes are applied. */
  goto(position: number): void;
  /** Back to the present. */
  present(): void;
}

export interface Devtools {
  /** The kept timeline, oldest first. */
  timeline(): readonly TimelineEntry[];
  /** Reactive version of the timeline (updates are batched on a timer; call `flush()` to publish at once). */
  entries: Accessor<readonly TimelineEntry[]>;
  clear(): void;
  pause(): void;
  resume(): void;
  readonly paused: boolean;
  /** Publish pending updates to `entries()` now. */
  flush(): void;
  /** Be called with every recorded entry. Returns the unsubscribe function. */
  onEntry(fn: (entry: TimelineEntry) => void): () => void;
  snapshot(): DevtoolsSnapshot;
  timeTravel: TimeTravel;
  /** Stop listening. The hook object stays installed. */
  dispose(): void;
}

export interface DevtoolsOptions {
  /** Max entries kept. Default 1000. */
  limit?: number;
  /** Return false to skip an event (e.g. noisy `computed:update`). */
  filter?: (event: DevtoolsEvent) => boolean;
  /** Publish interval (ms) for `entries()` while someone reads it. Default 50. */
  interval?: number;
}

/** The owner the devtools panel creates its effects under; events from below it are not recorded (no feedback loop). */
export const PANEL_OWNER = "maximus-devtools";

let current: Devtools | null = null;

const now = (): number =>
  typeof performance !== "undefined" ? performance.now() : Date.now();

/**
 * Start recording. Installs the `__MAXIMUS__` hook if needed and listens on
 * it; returns the controller. Calling it again returns the same controller
 * (dispose it first to change options). Owners and signals that existed
 * before this call are not known.
 */
export function installDevtools(options: DevtoolsOptions = {}): Devtools {
  if (current !== null) return current;
  const limit = options.limit ?? 1000;
  const interval = options.interval ?? 50;
  const hook = installHook();

  let entries: TimelineEntry[] = [];
  let seq = 0;
  let seen = 0;
  let paused = false;
  const listeners = new Set<(e: TimelineEntry) => void>();
  const owners = new Map<number, Owner>();
  const signals = new Map<string, unknown>();
  const version = signal(0, { name: "devtools:version" });
  let published: readonly TimelineEntry[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;

  // time travel
  const writes: DebugWrite[] = [];
  const setters: Array<(v: never) => void> = [];
  const position = signal(0, { name: "devtools:position" });
  const writesSig = signal<readonly DebugWrite[]>([], {
    name: "devtools:writes",
  });
  let traveling = false;

  const publish = (): void => {
    timer = undefined;
    published = entries.slice();
    version.update((n) => n + 1);
  };
  const schedule = (): void => {
    if (timer !== undefined || subscriberCount(version) === 0) return;
    timer = setTimeout(publish, interval);
  };

  const record = (event: DevtoolsEvent): void => {
    const path = event.path as readonly string[] | undefined;
    if (path !== undefined && path.includes(PANEL_OWNER)) return;
    if (typeof event.name === "string" && event.name.startsWith("devtools:"))
      return;
    if (event.type === "owner:create")
      owners.set(event.id as number, event.owner as Owner);
    else if (event.type === "owner:dispose") owners.delete(event.id as number);
    if (paused) return;
    if (options.filter !== undefined && !options.filter(event)) return;

    if (event.type === "signal:write") {
      if (typeof event.name === "string" && !event.name.startsWith("devtools:"))
        signals.set(event.name, event.value);
      const set = event.set as ((v: never) => void) | null | undefined;
      if (set != null && !traveling) {
        writes.length = Math.min(writes.length, position.peek()); // a new write ends the redo branch
        setters.length = writes.length;
        writes.push({
          seq: seq + 1,
          name: event.name as string | undefined,
          prev: event.prev,
          value: event.value,
        });
        setters.push(set);
        if (writes.length > limit) {
          writes.shift();
          setters.shift();
        }
        position.set(writes.length);
        writesSig.set(writes.slice());
      }
    }

    const {
      type,
      name,
      path: _p,
      value,
      prev,
      set: _s,
      owner: _o,
      ...rest
    } = event;
    const entry: TimelineEntry = { seq: ++seq, time: now(), type };
    if (typeof name === "string") entry.name = name;
    if (path !== undefined) entry.path = path;
    if ("value" in event) entry.value = value;
    if ("prev" in event) entry.prev = prev;
    if (Object.keys(rest).length > 0) entry.detail = rest;
    seen++;
    entries.push(entry);
    if (entries.length > limit * 1.25)
      entries = entries.slice(entries.length - limit);
    for (const l of listeners) l(entry);
    schedule();
  };
  const off = hook.on(record);

  const apply = (index: number, direction: 1 | -1): void => {
    const w = writes[index]!;
    traveling = true;
    try {
      (setters[index] as (v: unknown) => void)(
        direction === 1 ? w.value : w.prev,
      );
    } finally {
      traveling = false;
    }
  };
  const goto = (target: number): void => {
    const to = Math.max(0, Math.min(writes.length, Math.trunc(target)));
    let p = position.peek();
    while (p > to) apply(--p, -1);
    while (p < to) apply(p++, 1);
    position.set(to);
  };

  const timeTravel: TimeTravel = {
    entries: () => writesSig(),
    position: () => position(),
    canBack: () => position.peek() > 0,
    canForward: () => position.peek() < writes.length,
    back: (n = 1) => goto(position.peek() - n),
    forward: (n = 1) => goto(position.peek() + n),
    goto,
    present: () => goto(writes.length),
  };

  const treeOf = (o: Owner): OwnerNode => {
    const kind = (o as unknown as { kind?: number }).kind;
    return {
      id: o.id,
      name: o.name ?? `#${o.id}`,
      kind:
        kind === 0
          ? "computed"
          : kind === 1
            ? "render"
            : kind === 2
              ? "effect"
              : "owner",
      children:
        o.children === null
          ? []
          : [...o.children].filter((c) => !c.disposed).map(treeOf),
    };
  };

  const devtools: Devtools = {
    timeline: () =>
      entries.length > limit
        ? entries.slice(entries.length - limit)
        : entries.slice(),
    entries: () => (version(), published),
    clear() {
      entries = [];
      publish();
    },
    pause() {
      paused = true;
    },
    resume() {
      paused = false;
    },
    get paused() {
      return paused;
    },
    flush() {
      clearTimeout(timer);
      publish();
    },
    onEntry(fn) {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    snapshot() {
      const live = [...owners.values()].filter((o) => !o.disposed);
      const roots = live.filter(
        (o) =>
          o.parent === null ||
          o.parent.disposed ||
          !(o.parent.children?.has(o) ?? false),
      );
      return {
        time: now(),
        owners: roots.filter((o) => o.name !== PANEL_OWNER).map(treeOf),
        ownerCount: live.length,
        signals: Object.fromEntries(signals),
        seen,
        kept: Math.min(entries.length, limit),
      };
    },
    timeTravel,
    dispose() {
      off();
      clearTimeout(timer);
      listeners.clear();
      if (current === devtools) current = null;
    },
  };
  current = devtools;
  return devtools;
}

/** The installed devtools, installing them with default options when needed. */
export function getDevtools(): Devtools {
  return current ?? installDevtools();
}

/** Snapshot of the owner tree and named signal values (installs the devtools if needed). */
export function snapshot(): DevtoolsSnapshot {
  return getDevtools().snapshot();
}

/** Time travel over signals created with `{ debug: true }` (installs the devtools if needed). */
export function timeTravel(): TimeTravel {
  return getDevtools().timeTravel;
}
