/**
 * `hydrate`: adopt server-rendered DOM instead of creating it. The component
 * code runs as on the client; every `html` call claims the server nodes of its
 * template instance (found through the markers the server left, verified by a
 * fingerprint of the template) and attaches bindings to them. Nothing is
 * cloned, so nodes keep their identity.
 *
 * @module
 */
import { batch, root } from "../core/mod.ts";
import { doc, env, hashStrings } from "../dom/env.ts";
import type { Claim, TemplateInfo } from "../dom/env.ts";
import { bindChild, toNodes } from "../dom/insert.ts";
import type { Child } from "../dom/mod.ts";
import {
  DEFAULT_STATE_ID,
  TransferCtx,
  TransferState,
  deserializeState,
} from "./state.ts";

export interface HydrateOptions {
  /** Transfer state; by default read from the JSON script `#__MAXIMUS_STATE__` (inside the container or the document). */
  state?: TransferState | Record<string, unknown>;
  /** Id of the state script. */
  stateId?: string;
  /** Called for every difference between server HTML and client render. Default: `console.warn`. */
  onMismatch?: (message: string) => void;
}

const INSTANCE_ATTR = "data-mx-i";
const K_CHILD = 0;

interface Instance {
  seq: number;
  hash: string;
  el: Element | null;
  start: Comment | null;
  end: Comment | null;
}

function scan(container: Element): Instance[] {
  const found: Instance[] = [];
  const ends = new Map<number, Comment>();
  const w = doc().createTreeWalker(container, 129);
  for (let n = w.nextNode(); n !== null; n = w.nextNode()) {
    if (n.nodeType === 1) {
      const v = (n as Element).getAttribute(INSTANCE_ATTR);
      if (v !== null) {
        const i = v.indexOf(":");
        found.push({
          seq: Number(v.slice(0, i)),
          hash: v.slice(i + 1),
          el: n as Element,
          start: null,
          end: null,
        });
      }
    } else {
      const d = (n as Comment).data;
      if (d.startsWith("mx:")) {
        const [seq, hash] = d.slice(3).split(":") as [string, string];
        found.push({
          seq: Number(seq),
          hash,
          el: null,
          start: n as Comment,
          end: null,
        });
      } else if (d.startsWith("/mx:"))
        ends.set(Number(d.slice(4)), n as Comment);
    }
  }
  for (const f of found) if (f.start !== null) f.end = ends.get(f.seq) ?? null;
  return found
    .filter((f) => f.el !== null || f.end !== null)
    .sort((a, b) => a.seq - b.seq);
}

/** Locate bindings by the same tree-walk index the client's clone would use, skipping hole content. */
function locate(
  first: Node | null,
  last: Node | null,
  info: TemplateInfo,
): Node[] | null {
  const sole = new Set<number>();
  const pair = new Set<number>();
  for (const p of info.parts)
    if (p.kind === K_CHILD) (p.sole ? sole : pair).add(p.node);
  const nodes: Node[] = [];
  let idx = 0;
  const max = info.maxNode;
  /** returns false when the structure does not fit */
  const walk = (from: Node | null, stop: Node | null): boolean => {
    for (let n = from; n !== null; n = n === stop ? null : n.nextSibling) {
      if (n.nodeType !== 1 && n.nodeType !== 8) continue;
      if (idx > max) return true;
      const i = idx++;
      nodes[i] = n;
      if (n.nodeType === 1) {
        if (!sole.has(i) && !walk(n.firstChild, null)) return false;
      } else if (pair.has(i)) {
        let depth = 1;
        let e: Node | null = n.nextSibling;
        for (; e !== null; e = e.nextSibling) {
          if (e.nodeType !== 8) continue;
          const d = (e as Comment).data;
          if (d === "$mx$") depth++;
          else if (d === "/$mx$" && --depth === 0) break;
        }
        if (e === null) return false;
        nodes[idx++] = e;
        n = e;
        if (n === stop) break;
      }
    }
    return true;
  };
  if (!walk(first, last)) return null;
  for (const p of info.parts) {
    const t = nodes[p.node];
    if (t === undefined) return null;
    if (p.kind === K_CHILD) {
      if (
        p.sole
          ? t.nodeType !== 1
          : t.nodeType !== 8 || nodes[p.node + 1]?.nodeType !== 8
      )
        return null;
    } else if (t.nodeType !== 1) return null;
  }
  return nodes.length > max ? nodes : null;
}

function makeClaimer(
  container: Element,
  report: (m: string) => void,
): { claim(info: TemplateInfo): Claim | null; leftovers(): number } {
  const queue = scan(container);
  let pos = 0;
  const hashes = new WeakMap<readonly string[], string>();
  const claim = (info: TemplateInfo): Claim | null => {
    let h = hashes.get(info.strings);
    if (h === undefined)
      hashes.set(info.strings, (h = hashStrings(info.strings)));
    let k = pos;
    while (k < queue.length && k < pos + 16 && queue[k]!.hash !== h) k++;
    if (k >= queue.length || k >= pos + 16) {
      report(
        pos < queue.length
          ? `template mismatch: the client rendered a template that does not match the next server template (${queue.length - pos} unclaimed); it is created fresh`
          : "template mismatch: the client rendered more templates than the server did; it is created fresh",
      );
      return null;
    }
    if (k > pos)
      report(
        `template mismatch: ${k - pos} server template(s) were not rendered on the client`,
      );
    const inst = queue[k]!;
    let first: Node | null;
    let last: Node | null;
    if (inst.el !== null) {
      first = last = inst.el;
    } else {
      first = inst.start!.nextSibling;
      last = inst.end!.previousSibling;
      if (first === inst.end) first = last = null;
    }
    const nodes = locate(first, last, info);
    if (nodes === null) {
      report(
        "template mismatch: the server markup does not have the shape of this template; it is created fresh",
      );
      return null;
    }
    pos = k + 1;
    return {
      nodes,
      finish(): Node {
        if (inst.el !== null) {
          inst.el.removeAttribute(INSTANCE_ATTR);
          return inst.el;
        }
        const frag = doc().createDocumentFragment();
        const start = inst.start!;
        const end = inst.end!;
        for (
          let n = start.nextSibling;
          n !== null && n !== end;
          n = start.nextSibling
        )
          frag.appendChild(n);
        start.remove();
        end.remove();
        return frag;
      },
    };
  };
  const leftovers = (): number => {
    let n = 0;
    for (const inst of queue) {
      if (inst.el !== null && inst.el.hasAttribute(INSTANCE_ATTR)) {
        inst.el.removeAttribute(INSTANCE_ATTR);
        n++;
      } else if (inst.start !== null && inst.start.parentNode !== null) {
        inst.start.remove();
        inst.end?.remove();
        n++;
      }
    }
    return n;
  };
  return { claim, leftovers };
}

function findState(container: Element, id: string): TransferState | null {
  const d = container.ownerDocument;
  const el = container.querySelector(`script#${id}`) ?? d.getElementById(id);
  if (el === null) return null;
  const text = el.textContent ?? "";
  el.remove();
  return text.trim() === "" ? null : deserializeState(text);
}

/**
 * Adopt the server-rendered DOM in `container` and make it live: bindings and
 * event handlers attach to the existing nodes, which keep their identity.
 * Call it with the same `view` that was passed to `renderToString`. Differences
 * between server and client output are reported through `onMismatch` (default
 * `console.warn`) and repaired by creating the client version. Returns the dispose function.
 *
 * Nodes of multi-root templates and of control flow (`each`, `show`, ...) are
 * detached and re-inserted in place during the pass (same nodes, nothing is
 * recreated); an `<iframe>` inside such a node would reload.
 */
export function hydrate(
  view: () => Child,
  container: Element,
  options: HydrateOptions = {},
): () => void {
  const report =
    options.onMismatch ??
    ((m: string) => console.warn(`Maximus hydrate: ${m}`));
  const state =
    options.state instanceof TransferState
      ? options.state
      : options.state !== undefined
        ? new TransferState(options.state)
        : (findState(container, options.stateId ?? DEFAULT_STATE_ID) ??
          new TransferState());
  if (options.state !== undefined)
    container
      .querySelector(`script#${options.stateId ?? DEFAULT_STATE_ID}`)
      ?.remove();
  const claimer = makeClaimer(container, report);
  const prevClaim = env.claim;
  const prevMismatch = env.mismatch;
  env.claim = claimer.claim;
  env.mismatch = report;
  try {
    return root((dispose) => {
      let nodes: Node[] = [];
      try {
        TransferCtx.provide(state, () => {
          batch(() => {
            nodes = toNodes(view());
            bindChild(
              { start: null, end: null, parent: container },
              nodes,
              true,
            );
          });
        });
      } catch (e) {
        dispose();
        throw e;
      }
      const left = claimer.leftovers();
      if (left > 0)
        report(
          `${left} server template instance(s) were not claimed by the client render`,
        );
      let done = false;
      return () => {
        if (done) return;
        done = true;
        dispose();
        for (const n of nodes) n.parentNode?.removeChild(n);
      };
    });
  } finally {
    env.claim = prevClaim;
    env.mismatch = prevMismatch;
  }
}
