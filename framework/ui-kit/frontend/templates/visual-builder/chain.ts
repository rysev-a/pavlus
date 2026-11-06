// Editing action chains. An action is addressed by a path: `"2"` is the third
// action of the chain, `"2.then.0"` the first action of the `then` chain of the
// HTTP request that is third. Pure; every function returns a new chain.
import type { Action, ActionType, El, EventName, Model } from "./model.ts";
import { mapElement } from "./model.ts";

export type Chain = Action[];

export function blankAction(t: ActionType): Action {
  switch (t) {
    case "set":
      return { t, key: "", value: "" };
    case "toggle":
      return { t, key: "" };
    case "push":
      return { t, key: "", value: "" };
    case "remove":
      return { t, key: "", index: "index" };
    case "navigate":
      return { t, url: "/" };
    case "notice":
      return { t, text: "Done" };
    case "http":
      return {
        t,
        method: "GET",
        url: "/api/items",
        headers: "",
        body: "",
        okKey: "",
        okPath: "",
        errKey: "",
        loadingKey: "",
        then: [],
        catch: [],
      };
  }
}

const split = (path: string): string[] => (path === "" ? [] : path.split("."));

/** The chain that holds the action at `path` (its parent chain) and its index. */
function locate(
  root: Chain,
  path: string,
): { parent: string[]; index: number } | null {
  const segs = split(path);
  if (segs.length === 0 || segs.length % 2 === 0) return null;
  const index = Number(segs[segs.length - 1]);
  if (!Number.isInteger(index) || index < 0) return null;
  return { parent: segs.slice(0, -1), index };
}

function chainAt(root: Chain, parent: string[]): Chain | null {
  let cur: Chain = root;
  for (let i = 0; i < parent.length; i += 2) {
    const a = cur[Number(parent[i])];
    const branch = parent[i + 1];
    if (!a || (branch !== "then" && branch !== "catch")) return null;
    cur = a[branch] ?? [];
  }
  return cur;
}

/** Replaces the chain found at `parent` with `fn(chain)`. */
function editChain(
  root: Chain,
  parent: string[],
  fn: (c: Chain) => Chain,
): Chain {
  if (parent.length === 0) return fn(root);
  const [idx, branch, ...rest] = parent;
  const i = Number(idx);
  const b = branch as "then" | "catch";
  return root.map((a, j) =>
    j === i ? { ...a, [b]: editChain(a[b] ?? [], rest, fn) } : a,
  );
}

export function getAction(root: Chain, path: string): Action | null {
  const l = locate(root, path);
  if (!l) return null;
  return chainAt(root, l.parent)?.[l.index] ?? null;
}

export function updateAction(
  root: Chain,
  path: string,
  fn: (a: Action) => Action,
): Chain {
  const l = locate(root, path);
  if (!l) return root;
  return editChain(root, l.parent, (c) =>
    c.map((a, i) => (i === l.index ? fn(a) : a)),
  );
}

export function removeAction(root: Chain, path: string): Chain {
  const l = locate(root, path);
  if (!l) return root;
  return editChain(root, l.parent, (c) => c.filter((_, i) => i !== l.index));
}

/** Moves the action one place up (-1) or down (+1) inside its chain. */
export function moveAction(root: Chain, path: string, by: -1 | 1): Chain {
  const l = locate(root, path);
  if (!l) return root;
  return editChain(root, l.parent, (c) => {
    const j = l.index + by;
    if (j < 0 || j >= c.length) return c;
    const out = c.slice();
    [out[l.index], out[j]] = [out[j], out[l.index]];
    return out;
  });
}

/** Appends to the chain at `branchPath` ("" = the top chain, "1.then" = a branch). */
export function appendAction(
  root: Chain,
  branchPath: string,
  a: Action,
): Chain {
  return editChain(root, split(branchPath), (c) => [...c, a]);
}

export interface Row {
  /** the path of the action */
  path: string;
  depth: number;
  action: Action;
  /** "" for the top chain, else `then` / `catch` */
  branch: string;
  /** the path of the chain it sits in ("" or `1.then`) */
  chain: string;
  first: boolean;
  last: boolean;
}

/** The actions of a chain flattened for the editor (nested chains follow their request). */
export function rows(root: Chain, prefix = "", depth = 0, branch = ""): Row[] {
  const out: Row[] = [];
  root.forEach((a, i) => {
    const path = prefix ? `${prefix}.${i}` : String(i);
    out.push({
      path,
      depth,
      action: a,
      branch,
      chain: prefix,
      first: i === 0,
      last: i === root.length - 1,
    });
    if (a.t === "http") {
      out.push(...rows(a.then ?? [], `${path}.then`, depth + 1, "then"));
      out.push(...rows(a.catch ?? [], `${path}.catch`, depth + 1, "catch"));
    }
  });
  return out;
}

/** Visits every action (nested ones too) with its path. */
export function walk(
  root: Chain,
  fn: (a: Action, path: string) => void,
  prefix = "",
): void {
  root.forEach((a, i) => {
    const path = prefix ? `${prefix}.${i}` : String(i);
    fn(a, path);
    if (a.t === "http") {
      walk(a.then ?? [], fn, `${path}.then`);
      walk(a.catch ?? [], fn, `${path}.catch`);
    }
  });
}

// ---- on the model ----

export function editEvent(
  m: Model,
  elId: string,
  event: EventName,
  fn: (c: Chain) => Chain,
): Model {
  return mapElement(m, elId, (e: El) => {
    const next = fn(e.events[event] ?? []);
    const events = { ...e.events };
    if (next.length === 0) delete events[event];
    else events[event] = next;
    return { ...e, events };
  });
}
