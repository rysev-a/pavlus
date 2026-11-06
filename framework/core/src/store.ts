// The pure half of the store: paths, change effects and the state transitions
// they describe. This is plain data manipulation, so it lives in the core (the
// backend applies the same changes to its request slices); the plugin that
// owns the state and its history lives in the frontend package.
/** `"user.email"` or `["user", "email"]`. Numeric segments index arrays. */
export type Path = string | readonly (string | number)[];

/**
 * `onSuccess` is the message dispatched once the change landed — `payload`
 * is `{ prev, next }`, the state before and after the write — and only when
 * it changed anything (a no-op never answers). How the application learns
 * about its own writes: set, then decide in the next message. The pair is
 * exactly what a view diff takes, so an answer can be turned into
 * `DomPlugin.update(patches, target)` directly.
 */
export type StoreEffect =
  | {
      plugin: "store";
      type: "set";
      path: Path;
      value: unknown;
      onSuccess?: string;
    }
  | {
      plugin: "store";
      type: "merge";
      path: Path;
      value: Record<string, unknown>;
      onSuccess?: string;
    }
  | { plugin: "store"; type: "remove"; path: Path; onSuccess?: string }
  /**
   * Recipe-style write: `recipe` mutates a draft of the state (see
   * `produce`), the store keeps structural sharing, and history records the
   * shallowest path that covers every change (so undo restores exactly the
   * branch the recipe touched). Unlike the other changes this effect is not
   * plain data — it lives in history for undo, not for serialization.
   */
  | {
      plugin: "store";
      type: "update";
      recipe: (draft: never) => void;
      onSuccess?: string;
    }
  /** Revert the last `steps` (default 1) recorded changes. */
  | { plugin: "store"; type: "undo"; steps?: number }
  /** Revert everything recorded after `timestamp`. */
  | { plugin: "store"; type: "restoreTo"; timestamp: number };

/** A change that can be applied (`set` / `merge` / `remove`). */
export type StoreChange = Extract<
  StoreEffect,
  { type: "set" | "merge" | "remove" }
>;

/** A recipe-style change (see `produce`). */
export type UpdateEffect = Extract<StoreEffect, { type: "update" }>;

const segments = (p: Path): (string | number)[] =>
  typeof p === "string" ? (p === "" ? [] : p.split(".")) : [...p];

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;

/** Reads a value; `exists` tells `undefined` apart from "not there". */
export function getIn(
  state: unknown,
  path: Path,
): { exists: boolean; value: unknown } {
  let cur = state;
  for (const seg of segments(path)) {
    if (!isObj(cur) || !(seg in cur))
      return { exists: false, value: undefined };
    cur = (cur as Record<string | number, unknown>)[seg];
  }
  return { exists: true, value: cur };
}

function setAt(
  state: unknown,
  segs: (string | number)[],
  value: unknown,
): unknown {
  if (segs.length === 0) return value;
  const [head, ...rest] = segs;
  const base: Record<string | number, unknown> | unknown[] = isObj(state)
    ? state
    : /^\d+$/.test(String(head))
      ? []
      : {};
  const child = (base as Record<string | number, unknown>)[head];
  const next = setAt(child, rest, value);
  if (next === child && head in base) return state;
  if (Array.isArray(base)) {
    const copy: unknown[] = [...base];
    copy[Number(head)] = next;
    return copy;
  }
  return { ...base, [head]: next };
}

function removeAt(state: unknown, segs: (string | number)[]): unknown {
  if (segs.length === 0) return undefined;
  if (!isObj(state)) return state;
  const [head, ...rest] = segs;
  if (!(head in state)) return state;
  if (rest.length === 0) {
    if (Array.isArray(state)) return state.filter((_, i) => i !== Number(head));
    const { [head]: _removed, ...others } = state as Record<string, unknown>;
    return others;
  }
  const child = (state as Record<string | number, unknown>)[head];
  const next = removeAt(child, rest);
  if (next === child) return state;
  if (Array.isArray(state)) {
    const copy = [...state];
    copy[Number(head)] = next;
    return copy;
  }
  return { ...state, [head]: next };
}

/** Pure state transition for a change. Structural sharing keeps `===` valid. */
export function applyChange(state: unknown, change: StoreChange): unknown {
  const segs = segments(change.path);
  switch (change.type) {
    case "set":
      return setAt(state, segs, change.value);
    case "remove":
      return removeAt(state, segs);
    case "merge": {
      const cur = getIn(state, segs).value;
      return setAt(state, segs, {
        ...(isObj(cur) ? cur : {}),
        ...change.value,
      });
    }
  }
}
