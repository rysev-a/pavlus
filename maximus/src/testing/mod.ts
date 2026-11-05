/**
 * Test helpers (jsdom or any DOM). `mount` renders into a fresh container
 * attached to `document.body`; `flush` lets pending effects and microtasks run;
 * `fire` dispatches DOM events; `waitFor` polls.
 *
 * @module
 */
import { flushSync } from "../core/mod.ts";
import { render } from "../dom/mod.ts";
import type { Child } from "../dom/mod.ts";

export interface Mounted {
  container: HTMLElement;
  /** `container.querySelector`, throwing when nothing matches. */
  query<T extends Element = HTMLElement>(selector: string): T;
  queryAll<T extends Element = HTMLElement>(selector: string): T[];
  /** `container.textContent`. */
  text(): string;
  /** `container.innerHTML` without the framework's marker comments. */
  html(): string;
  unmount(): void;
}

const mounted = new Set<Mounted>();

/** Render `fn` into a new container in the document body. Remember to `unmount()` or call `cleanup()`. */
export function mount(
  fn: () => Child,
  options: { container?: HTMLElement } = {},
): Mounted {
  const container =
    options.container ??
    document.body.appendChild(document.createElement("div"));
  const dispose = render(fn, container);
  const m: Mounted = {
    container,
    query<T extends Element = HTMLElement>(selector: string): T {
      const el = container.querySelector<T>(selector);
      if (el === null)
        throw new Error(
          `Maximus testing: nothing matches "${selector}" in:\n${m.html()}`,
        );
      return el;
    },
    queryAll<T extends Element = HTMLElement>(selector: string): T[] {
      return Array.from(container.querySelectorAll<T>(selector));
    },
    text: () => container.textContent ?? "",
    html: () => container.innerHTML.replace(/<!--[^>]*-->/g, ""),
    unmount() {
      dispose();
      if (!options.container) container.remove();
      mounted.delete(m);
    },
  };
  mounted.add(m);
  return m;
}

/** Unmount everything mounted with {@link mount} (call from `afterEach`). */
export function cleanup(): void {
  for (const m of [...mounted]) m.unmount();
}

/** Run pending effects, then let promise continuations settle, then run effects again. */
export async function flush(ticks = 3): Promise<void> {
  for (let i = 0; i < ticks; i++) {
    flushSync();
    await Promise.resolve();
  }
  flushSync();
}

type EventInit = Record<string, unknown> & {
  value?: string;
  checked?: boolean;
};

const MOUSE = new Set([
  "click",
  "dblclick",
  "mousedown",
  "mouseup",
  "mousemove",
  "mouseover",
  "mouseout",
  "contextmenu",
]);
const KEY = new Set(["keydown", "keyup", "keypress"]);

/**
 * Dispatch an event on `el` (bubbling, cancelable). `value`/`checked` in the
 * init are assigned to the element first, which is what `input`/`change`
 * handlers read. Returns the event so `defaultPrevented` can be asserted.
 */
export function fire(el: Element, type: string, init: EventInit = {}): Event {
  const { value, checked, ...rest } = init;
  if (value !== undefined) (el as HTMLInputElement).value = value;
  if (checked !== undefined) (el as HTMLInputElement).checked = checked;
  const opts = { bubbles: true, cancelable: true, composed: true, ...rest };
  const win = el.ownerDocument.defaultView as unknown as Record<
    string,
    new (t: string, i: object) => Event
  >;
  const Ctor = MOUSE.has(type)
    ? win.MouseEvent!
    : KEY.has(type)
      ? win.KeyboardEvent!
      : type === "input"
        ? win.InputEvent!
        : win.Event!;
  const e = new Ctor(type, opts);
  el.dispatchEvent(e);
  return e;
}

/** Retry `fn` until it returns without throwing (and not `false`), or fail with the last error after `timeout` ms. */
export async function waitFor<T>(
  fn: () => T,
  options: { timeout?: number; interval?: number } = {},
): Promise<T> {
  const timeout = options.timeout ?? 1000;
  const interval = options.interval ?? 10;
  const deadline = Date.now() + timeout;
  let last: unknown = new Error("waitFor: condition not met");
  for (;;) {
    flushSync();
    try {
      const r = fn();
      if (r !== false) return r;
    } catch (e) {
      last = e;
    }
    if (Date.now() > deadline) throw last;
    await new Promise((r) => setTimeout(r, interval));
  }
}
