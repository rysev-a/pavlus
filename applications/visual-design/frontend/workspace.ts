// Where the studios keep their project.
//
// Flow Studio and the Visual Builder save the project they edit with the `local`
// plugin (`local.save(key, text)` / `local.load(key, onSuccess)`: in a template
// that is localStorage). Here the same two effects are answered by the server:
// the key says which document of the open project it is (the id of the project is
// in the address), and the text goes to Postgres through the API. The studios do
// not know the difference.
//
// Two more things happen here, because they are about the project and not about
// one studio:
//  - the interface is wired to the diagram: when the Visual Builder loads its
//    project, `flow` is the project's current diagram, so a route drawn in the
//    diagram answers the requests of the interface at once;
//  - a save is never lost or reordered: edits wait a moment (they come in bursts),
//    go out one after another, are retried after a failure, and a load waits
//    for the saves before it.
//
// Everything that is not about the project (the clipboard, the keys, the
// "My library" of plugins) is the ui-kit's own `local` plugin, which this wraps.
import type { Effect, Plugin } from "@pavlus/frontend";
import {
  createLocalPlugin,
  type LocalEffect,
} from "../../../framework/ui-kit/frontend/local.ts";
import { STORAGE_KEY as FLOW_KEY } from "../../../framework/ui-kit/frontend/templates/flow-studio/flow-studio.ts";
import { parseProject as parseFlow } from "../../../framework/ui-kit/frontend/templates/flow-studio/model.ts";
import { STORAGE_KEY as UI_KEY } from "../../../framework/ui-kit/frontend/templates/visual-builder/visual-builder.ts";

/** the documents of a project, by the key the studios save under */
export const DOC_OF: Record<string, "flow" | "interface"> = {
  [FLOW_KEY]: "flow",
  [UI_KEY]: "interface",
};

export type SaveEvent =
  | { event: "changed"; key: string }
  | { event: "saved" }
  | { event: "error"; detail: string }
  | { event: "loadFailed"; key: string; detail: string };

export type WorkspaceEffect = Effect & {
  plugin: "workspace";
  type: "listen";
  onMessage: string;
};

export const workspaceEffector = {
  /** Tells `onMessage` what happens to the project's documents (a {@link SaveEvent}). */
  listen: (onMessage: string): WorkspaceEffect => ({
    plugin: "workspace",
    type: "listen",
    onMessage,
  }),
};

export interface WorkspaceOptions {
  /** where the API is (the dev server proxies it) */
  base?: string;
  fetch?: typeof fetch;
  /** the project that is open: from the address by default */
  projectId?: () => number | null;
  /** how long an edit waits for the next one */
  delayMs?: number;
  /** how long a failed save waits before it is tried again */
  retryMs?: number;
  window?: Pick<Window, "addEventListener" | "location">;
}

type Dispatch = (m: { id: string; payload?: unknown }) => void;
interface Pending {
  id: number;
  doc: string;
  text: string;
}

/** a diagram that is good, or nothing */
function goodFlow(text: string | null): unknown | null {
  if (!text) return null;
  const parsed = parseFlow(text);
  return typeof parsed === "string" ? null : parsed;
}

/**
 * The interface of the project, wired to the diagram: the saved project with `flow`
 * set to the diagram. The first time it gets one, the simulated backend is switched on.
 */
export function linked(ui: string | null, flow: string | null): string | null {
  const diagram = goodFlow(flow);
  if (ui === null || diagram === null) return ui;
  try {
    const model = JSON.parse(ui) as Record<string, unknown>;
    if (model === null || typeof model !== "object") return ui;
    return JSON.stringify({
      ...model,
      flow: diagram,
      mockOn: model.flow ? model.mockOn : true,
    });
  } catch {
    return ui;
  }
}

export function createWorkspace(opts: WorkspaceOptions = {}): {
  local: Plugin<LocalEffect, unknown>;
  workspace: Plugin<WorkspaceEffect, unknown>;
} {
  const base = (opts.base ?? "/api").replace(/\/+$/, "");
  const win =
    opts.window ?? (typeof window === "undefined" ? undefined : window);
  const call: typeof fetch = (...a) => (opts.fetch ?? globalThis.fetch)(...a);
  const delay = opts.delayMs ?? 400;
  const retry = opts.retryMs ?? 2000;
  const idOf =
    opts.projectId ??
    ((): number | null => {
      const m = /^\/projects\/(\d+)\//.exec(win?.location.pathname ?? "");
      return m ? Number(m[1]) : null;
    });

  const inner = createLocalPlugin();
  let listener: Dispatch | undefined;
  let onMessage = "";
  const say = (e: SaveEvent): void => listener?.({ id: onMessage, payload: e });

  /** what was last read or written, by project and document: an unchanged text is no edit */
  const known = new Map<string, string>();
  /** the documents that were read: a document that could not be read is never written over */
  const readable = new Set<string>();
  const pending = new Map<string, Pending>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running: Promise<void> = Promise.resolve();
  let failing = false;

  const slot = (id: number, doc: string): string => `${id}:${doc}`;

  async function put(p: Pending): Promise<void> {
    const res = await call(`${base}/projects/${p.id}/docs/${p.doc}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: p.text }),
    });
    if (!res.ok) throw new Error(`The server answered ${res.status}`);
  }

  /** sends what is waiting, one document after another, until nothing is */
  function flush(): Promise<void> {
    clearTimeout(timer);
    timer = undefined;
    running = running.then(async () => {
      let wrote = false;
      while (pending.size > 0) {
        const [k, p] = pending.entries().next().value as [string, Pending];
        try {
          await put(p);
          wrote = true;
          // a newer text may have come in while it was on its way
          if (pending.get(k) === p) pending.delete(k);
          if (failing) failing = false;
        } catch (e) {
          failing = true;
          say({
            event: "error",
            detail: e instanceof Error ? e.message : "The server is not there",
          });
          // try again later, with whatever is the newest text then
          timer = setTimeout(() => void flush(), retry);
          return;
        }
      }
      if (wrote) say({ event: "saved" });
    });
    return running;
  }

  function schedule(): void {
    clearTimeout(timer);
    timer = setTimeout(() => void flush(), delay);
  }

  function save(key: string, text: string): boolean {
    const doc = DOC_OF[key];
    const id = idOf();
    if (!doc || id === null) return false;
    const s = slot(id, doc);
    if (!readable.has(s)) return true;
    if (known.get(s) === text) return true;
    known.set(s, text);
    pending.set(s, { id, doc, text });
    say({ event: "changed", key: doc });
    schedule();
    return true;
  }

  async function read(id: number, doc: string): Promise<string | null> {
    const res = await call(`${base}/projects/${id}/docs/${doc}`);
    if (!res.ok) throw new Error(`The server answered ${res.status}`);
    const data = (await res.json()) as { text: string | null };
    return data.text ?? null;
  }

  async function load(
    key: string,
    onSuccess: string,
    dispatch: Dispatch,
  ): Promise<void> {
    const doc = DOC_OF[key];
    const id = idOf();
    // not a document of the project (or no project): the plain `local` answer
    if (!doc || id === null) return;
    // what was edited a moment ago is on the server before it is read
    await flush();
    const s = slot(id, doc);
    try {
      let text = await read(id, doc);
      if (doc === "interface") text = linked(text, await read(id, "flow"));
      readable.add(s);
      // a text that is the one on the server is no edit when the studio saves it again
      if (doc !== "interface") known.set(s, text ?? "");
      else known.delete(s);
      // `keepEmpty`: a blank diagram is the project's own, not a reason for the demo
      dispatch({ id: onSuccess, payload: { text, keepEmpty: true } });
    } catch (e) {
      readable.delete(s);
      say({
        event: "loadFailed",
        key: doc,
        detail: e instanceof Error ? e.message : "The server is not there",
      });
      // the studio opens on its sample, and nothing it does is written over the project
      dispatch({ id: onSuccess, payload: { text: null } });
    }
  }

  win?.addEventListener("beforeunload", ((e: Event) => {
    if (pending.size === 0) return;
    void flush();
    e.preventDefault();
  }) as EventListener);

  const local: Plugin<LocalEffect, unknown> = {
    name: "local",
    init: (ctx) => inner.init?.(ctx),
    handle(effect, ctx) {
      if (effect.type === "save" && save(effect.key, effect.text)) return;
      if (effect.type === "load" && DOC_OF[effect.key] && idOf() !== null) {
        void load(effect.key, effect.onSuccess, (m) => ctx.dispatch(m));
        return;
      }
      return inner.handle(effect, ctx);
    },
    dispose: (...a) => inner.dispose?.(...a),
  };

  const workspace: Plugin<WorkspaceEffect, unknown> = {
    name: "workspace",
    handle(effect, ctx) {
      if (effect.type !== "listen") return;
      onMessage = effect.onMessage;
      listener = (m) => ctx.dispatch(m);
    },
  };

  return { local, workspace };
}
