/**
 * `renderToString` and `renderToStream`: run the same component code against
 * the virtual DOM (no jsdom), wait for the resources registered with the
 * suspense context, and serialise.
 *
 * @module
 */
import {
  SuspenseCtx,
  batch,
  createContext,
  flushSync,
  root,
} from "../core/mod.ts";
import type { SuspenseContext } from "../core/mod.ts";
import { env, hashStrings } from "../dom/env.ts";
import type { TemplateInfo } from "../dom/env.ts";
import { toNodes } from "../dom/insert.ts";
import type { Child } from "../dom/mod.ts";
import { ServerCtx, useServer } from "./context.ts";
import type { ServerInfo } from "./context.ts";
import { serialize, serializeChildren } from "./serialize.ts";
import {
  DEFAULT_STATE_ID,
  TransferCtx,
  TransferState,
  stateScript,
} from "./state.ts";
import { VDocument, VElement } from "./vdom.ts";
import type { VNode } from "./vdom.ts";

export interface RenderOptions {
  /** The request URL; available to the app through {@link useServer} (routers read it). */
  url?: string;
  /** Anything else the app needs from the request (headers, cookies, ...), exposed by {@link useServer}. */
  request?: unknown;
  /** Max time (ms) to wait for registered resources. Default 5000. */
  timeout?: number;
  /** Initial transfer state (the server may also fill it while rendering). */
  state?: TransferState | Record<string, unknown>;
  /** Append the transfer state as a JSON `<script>` when it is not empty. Default true. */
  embedState?: boolean;
  /** Id of that script element. */
  stateId?: string;
  /** Called instead of `console.warn` when the timeout hits. */
  onTimeout?: (pending: number) => void;
}

export { ServerCtx, useServer };
export type { ServerInfo };

/** True while this code runs inside `renderToString`/`renderToStream`. Effects run on the server too: guard browser-only work with it. */
export function isServer(): boolean {
  return env.server;
}

interface Boundary {
  id: number;
  start: Comment;
  end: Comment;
  pending: () => number;
  /** the fallback was sent to the client and the content still has to follow */
  waiting: boolean;
  done: boolean;
}

class Render {
  seq = 0;
  nextBoundary = 0;
  readonly boundaries: Boundary[] = [];
  readonly live = new Set<Promise<unknown>>();
  /** promises registered outside every suspense boundary */
  readonly unbounded = new Set<Promise<unknown>>();
  readonly state: TransferState;
  readonly info: ServerInfo;
  readonly stream: boolean;
  readonly timeout: number;
  readonly container: VElement;
  dispose: (() => void) | null = null;

  constructor(opts: RenderOptions, stream: boolean) {
    this.state =
      opts.state instanceof TransferState
        ? opts.state
        : new TransferState(opts.state);
    this.info = { url: opts.url ?? "/", request: opts.request };
    this.stream = stream;
    this.timeout = opts.timeout ?? 5000;
    this.container = getDocument().createElement("div");
  }

  track(p: Promise<unknown>, bounded: boolean): void {
    const wrapped: Promise<unknown> = p.then(
      () => void this.live.delete(wrapped),
      () => void this.live.delete(wrapped),
    );
    this.live.add(wrapped);
    if (!bounded) this.unbounded.add(wrapped);
    void wrapped.then(() => void this.unbounded.delete(wrapped));
  }

  /** Run effects and let promise continuations settle. */
  async drain(): Promise<void> {
    for (let i = 0; i < 4; i++) {
      flushSync();
      await Promise.resolve();
    }
    flushSync();
  }

  /** Wait until `set()` is empty or the deadline passes. Returns false on timeout. */
  async settle(
    set: () => ReadonlySet<Promise<unknown>>,
    deadline: number,
  ): Promise<boolean> {
    for (;;) {
      await this.drain();
      const current = set();
      if (current.size === 0) return true;
      const remaining = deadline - Date.now();
      if (remaining <= 0) return false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timedOut = new Promise<void>((r) => {
        timer = setTimeout(r, remaining);
      });
      await Promise.race([...current, timedOut]);
      clearTimeout(timer);
    }
  }

  start(view: () => Child): void {
    this.dispose = root((dispose) => {
      const ctx: SuspenseContext = {
        register: (p) => this.track(p, false),
        pending: () => this.live.size,
      };
      TransferCtx.provide(this.state, () =>
        ServerCtx.provide(this.info, () =>
          RenderCtx.provide(this, () =>
            SuspenseCtx.provide(ctx, () => {
              batch(() => {
                for (const n of toNodes(view()))
                  this.container.appendChild(n as unknown as VNode);
              });
            }),
          ),
        ),
      );
      return dispose;
    });
  }

  finish(): void {
    this.dispose?.();
    this.dispose = null;
  }

  timedOut(opts: RenderOptions): void {
    const n = this.live.size;
    if (opts.onTimeout) opts.onTimeout(n);
    else
      console.warn(
        `Maximus ssr: timed out after ${this.timeout}ms waiting for ${n} resource(s); the page is rendered with what is ready`,
      );
  }
}

const RenderCtx = createContext<Render | null>(null);

// ----------------------------------------------------------- environment

let sharedDoc: VDocument | null = null;
function getDocument(): VDocument {
  return (sharedDoc ??= new VDocument());
}

const hashCache = new WeakMap<readonly string[], string>();

function tag(info: TemplateInfo, result: Node, seq: number): Node {
  const rc = RenderCtx.use();
  if (rc === null || seq === 0) return result;
  let hash = hashCache.get(info.strings);
  if (hash === undefined)
    hashCache.set(info.strings, (hash = hashStrings(info.strings)));
  if (info.single) {
    (result as unknown as VElement).mx = { seq, hash };
    return result;
  }
  const frag = result as unknown as VNode;
  const d = getDocument();
  frag.insertBefore(d.createComment(`mx:${seq}:${hash}`), frag.firstChild);
  frag.appendChild(d.createComment(`/mx:${seq}`));
  return result;
}

let refs = 0;
const saved = {
  doc: null as Document | null,
  server: false,
  seq: null as typeof env.seq,
  tag: null as typeof env.tag,
  pending: null as typeof env.pending,
  suspense: null as typeof env.suspense,
};

function enter(): void {
  if (refs++ > 0) return;
  saved.doc = env.doc;
  saved.server = env.server;
  saved.seq = env.seq;
  saved.tag = env.tag;
  saved.pending = env.pending;
  saved.suspense = env.suspense;
  env.doc = getDocument() as unknown as Document;
  env.server = true;
  env.seq = () => {
    const rc = RenderCtx.use();
    return rc === null ? 0 : ++rc.seq;
  };
  env.tag = tag;
  env.pending = (p) => RenderCtx.use()?.track(p, true);
  env.suspense = (b) => {
    const rc = RenderCtx.use();
    if (rc === null) return;
    const id = ++rc.nextBoundary;
    if (rc.stream) {
      b.start.data = `suspense:${id}`;
      b.end.data = `/suspense:${id}`;
    }
    rc.boundaries.push({
      id,
      start: b.start,
      end: b.end,
      pending: b.pending,
      waiting: false,
      done: false,
    });
  };
}

function leave(): void {
  if (--refs > 0) return;
  env.doc = saved.doc;
  env.server = saved.server;
  env.seq = saved.seq;
  env.tag = saved.tag;
  env.pending = saved.pending;
  env.suspense = saved.suspense;
}

// ---------------------------------------------------------------- string

function withState(html: string, rc: Render, opts: RenderOptions): string {
  return opts.embedState !== false && rc.state.size > 0
    ? html + stateScript(rc.state, opts.stateId ?? DEFAULT_STATE_ID)
    : html;
}

/**
 * Render `view` to an HTML string. Runs the same component code as the
 * browser, then waits (up to `timeout`) for every promise registered with a
 * suspense boundary (`resource`, `lazy`, `registerPending`) and for the
 * effects they trigger. Suspense content is rendered when it is ready; if the
 * timeout hits, the fallback is rendered.
 */
export async function renderToString(
  view: () => Child,
  opts: RenderOptions = {},
): Promise<string> {
  enter();
  const rc = new Render(opts, false);
  try {
    rc.start(view);
    const ok = await rc.settle(() => rc.live, Date.now() + rc.timeout);
    if (!ok) rc.timedOut(opts);
    return withState(serializeChildren(rc.container), rc, opts);
  } finally {
    rc.finish();
    leave();
  }
}

// ---------------------------------------------------------------- stream

const RUNTIME =
  "<script>function $MX(i){var c=document.currentScript,t=document.getElementById('mx-b'+i),w=document.createTreeWalker(document,128),s,e,n;" +
  "while(n=w.nextNode()){if(n.data==='suspense:'+i)s=n;else if(n.data==='/suspense:'+i){e=n;break}}" +
  "if(s&&e&&t){while(s.nextSibling&&s.nextSibling!==e)s.parentNode.removeChild(s.nextSibling);" +
  "while(t.content.firstChild)e.parentNode.insertBefore(t.content.firstChild,e)}" +
  "t&&t.remove();c&&c.remove()}var s=document.currentScript;s&&s.remove()</script>";

function attached(rc: Render, n: Node): boolean {
  for (
    let p: VNode | null = n as unknown as VNode;
    p !== null;
    p = p.parentNode
  )
    if (p === (rc.container as VNode)) return true;
  return false;
}

function rangeHtml(b: Boundary): string {
  let out = "";
  const end = b.end as unknown as VNode;
  for (
    let n = (b.start as unknown as VNode).nextSibling;
    n !== null && n !== end;
    n = n.nextSibling
  )
    out += serialize(n);
  return out;
}

async function* chunks(
  view: () => Child,
  opts: RenderOptions,
): AsyncGenerator<string, void, void> {
  enter();
  const rc = new Render(opts, true);
  try {
    const deadline = Date.now() + rc.timeout;
    rc.start(view);
    // the shell waits only for work that is not inside a suspense boundary
    if (!(await rc.settle(() => rc.unbounded, deadline))) rc.timedOut(opts);
    const mark = (): void => {
      for (const b of rc.boundaries)
        if (!b.done && !b.waiting && b.pending() > 0 && attached(rc, b.start))
          b.waiting = true;
    };
    mark();
    yield serializeChildren(rc.container);
    let sentRuntime = false;
    while (rc.boundaries.some((b) => b.waiting && !b.done)) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        rc.timedOut(opts);
        break;
      }
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timedOut = new Promise<void>((r) => {
        timer = setTimeout(r, remaining);
      });
      await Promise.race([...rc.live, timedOut]);
      clearTimeout(timer);
      await rc.drain();
      // outer boundaries first: their content may carry the inner boundaries
      for (const b of rc.boundaries) {
        if (b.done || !b.waiting || b.pending() > 0 || !attached(rc, b.start))
          continue;
        b.done = true;
        const body = rangeHtml(b);
        mark();
        if (!sentRuntime) {
          sentRuntime = true;
          yield RUNTIME;
        }
        yield `<template id="mx-b${b.id}">${body}</template><script>$MX(${b.id})</script>`;
      }
    }
    await rc.drain();
    if (opts.embedState !== false && rc.state.size > 0)
      yield stateScript(rc.state, opts.stateId ?? DEFAULT_STATE_ID);
  } finally {
    rc.finish();
    leave();
  }
}

/**
 * Stream `view`: the first chunk is the shell (suspense boundaries that are
 * still loading show their fallback, marked `<!--suspense:N-->`); each
 * boundary that becomes ready is sent as a `<template>` plus an inline script
 * that swaps it in; the transfer state comes last. Cancel the stream to stop.
 * Pipe through `TextEncoderStream` to use it as a `Response` body.
 *
 * Hydrate after the stream has completed (the swap scripts have run).
 */
export function renderToStream(
  view: () => Child,
  opts: RenderOptions = {},
): ReadableStream<string> {
  const it = chunks(view, opts);
  return new ReadableStream<string>({
    async pull(controller) {
      try {
        const r = await it.next();
        if (r.done) controller.close();
        else controller.enqueue(r.value);
      } catch (e) {
        controller.error(e);
      }
    },
    async cancel() {
      await it.return();
    },
  });
}
