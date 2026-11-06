import type { Effect, Plugin } from "@pavlus/frontend";

/**
 * Small browser things the Visual Builder needs, kept out of its pure code:
 * the saved project (`localStorage`), the clipboard, opening a URL, the
 * keyboard shortcuts (Ctrl+Z ... the message events carry no modifiers), and
 * the message prefix of the page (the svg plugin sends messages by id, and a
 * page lives under a prefix in the app).
 */

export type LocalEffect = Effect & { plugin: "local" } & (
    | { type: "save"; key: string; text: string }
    | { type: "load"; key: string; onSuccess: string }
    | { type: "copy"; text: string; onSuccess?: string; onError?: string }
    | { type: "open"; url: string }
    | { type: "keys"; onMessage: string; root?: string; keys?: string[] }
    | { type: "unkeys" }
    | { type: "prefix"; name: string; onSuccess: string }
    | { type: "media"; query: string; onSuccess: string }
    | { type: "watch"; selector: string; onSuccess: string }
    | { type: "wheel"; selector: string; onSuccess: string }
    | { type: "fullscreen"; selector: string; onSuccess: string }
    | { type: "drag"; onSuccess: string; rel?: string }
  );

export const localEffector = {
  /** Saves a text under a key; no reply (a full disk is ignored). */
  save: (key: string, text: string): LocalEffect => ({
    plugin: "local",
    type: "save",
    key,
    text,
  }),
  /** Replies `{ text }` (null when nothing is saved) to `onSuccess`. */
  load: (key: string, onSuccess: string): LocalEffect => ({
    plugin: "local",
    type: "load",
    key,
    onSuccess,
  }),
  copy: (text: string, onSuccess?: string, onError?: string): LocalEffect => ({
    plugin: "local",
    type: "copy",
    text,
    onSuccess,
    onError,
  }),
  open: (url: string): LocalEffect => ({ plugin: "local", type: "open", url }),
  /**
   * Starts sending `{ key, ctrl, shift }` for the keys outside text fields to
   * `onMessage`. Only while an element matching `root` (default `.vb`, the Visual
   * Builder) is on the page; `keys` lists the wanted keys (default: Delete, the
   * arrows, Escape and Ctrl+Z / Y / D). Space and Enter are left to a focused
   * button or link.
   */
  keys: (
    onMessage: string,
    opts: { root?: string; keys?: string[] } = {},
  ): LocalEffect => ({
    plugin: "local",
    type: "keys",
    onMessage,
    ...opts,
  }),
  /** Replies `{ matches }` for a media query (`(prefers-reduced-motion: reduce)`). */
  media: (query: string, onSuccess: string): LocalEffect => ({
    plugin: "local",
    type: "media",
    query,
    onSuccess,
  }),
  unkeys: (): LocalEffect => ({ plugin: "local", type: "unkeys" }),
  /**
   * Replies `{ w, h }` (the size of the element that matches `selector`, in px) now
   * and each time it changes: a drawing that fills its box needs to know the box.
   */
  watch: (selector: string, onSuccess: string): LocalEffect => ({
    plugin: "local",
    type: "watch",
    selector,
    onSuccess,
  }),
  /**
   * Replies `{ dy, x, y, w, h }` for the wheel turned over the element with Shift
   * (or Ctrl, which is a pinch on a trackpad) held: `x`, `y` are the pointer in px
   * from the element's corner. The page does not scroll for it; a plain wheel does.
   * A pinch of two fingers on the element is the same message (a wheel of the right size).
   */
  wheel: (selector: string, onSuccess: string): LocalEffect => ({
    plugin: "local",
    type: "wheel",
    selector,
    onSuccess,
  }),
  /**
   * Toggles the full screen for the element that matches `selector` (and the page
   * where the browser has no such thing). Replies `{ on }` each time it changes.
   */
  fullscreen: (selector: string, onSuccess: string): LocalEffect => ({
    plugin: "local",
    type: "fullscreen",
    selector,
    onSuccess,
  }),
  /**
   * A drag that follows the pointer wherever it goes, off the element too: replies
   * `{ x, y, done, over }` (px of the window) for each move, and once more with `done`.
   * `over` is the `data-drop` of the element under the pointer (or of its closest ancestor
   * that has one), else null: what the thing being dragged is over. With `rel` (a selector)
   * it also says where the pointer is on that element: `{ rx, ry, inside }`, px from its
   * corner, and whether it is within it.
   */
  drag: (onSuccess: string, rel?: string): LocalEffect => ({
    plugin: "local",
    type: "drag",
    onSuccess,
    ...(rel ? { rel } : {}),
  }),
  /** Replies the prefix that messages of the asking component carry (`name` is the reply id without it). */
  prefix: (name: string): LocalEffect => ({
    plugin: "local",
    type: "prefix",
    name,
    onSuccess: name,
  }),
};

const DEFAULT_KEYS = [
  "Delete",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Escape",
];

const nativeTarget = (t: EventTarget | null): boolean => {
  const el = t as HTMLElement | null;
  return !!el?.tagName && /^(BUTTON|A|SUMMARY)$/i.test(el.tagName);
};

export interface KeyPayload {
  key: string;
  ctrl: boolean;
  shift: boolean;
}

const textTarget = (t: EventTarget | null): boolean => {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return (
    /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) ||
    el.isContentEditable === true
  );
};

export interface LocalOptions {
  storage?: Pick<Storage, "getItem" | "setItem">;
  document?: Document;
}

export function createLocalPlugin(
  opts: LocalOptions = {},
): Plugin<LocalEffect, unknown> {
  const doc =
    opts.document ?? (typeof document === "undefined" ? undefined : document);
  const store = (): Pick<Storage, "getItem" | "setItem"> | undefined => {
    try {
      return opts.storage ?? globalThis.localStorage;
    } catch {
      return undefined;
    }
  };
  let off: (() => void) | undefined;
  let offDrag: (() => void) | undefined;
  const offWatch = new Map<string, () => void>();
  let offWheel: (() => void) | undefined;
  let offFull: (() => void) | undefined;
  let offPointer: (() => void) | undefined;
  /** where the pointer last went down (px of the window): where a drag started */
  let pressed: { x: number; y: number } | undefined;
  let offDown: (() => void) | undefined;
  /** the page itself is the full screen (where the browser has no API for it) */
  let pseudoFull = false;
  return {
    name: "local",
    init() {
      // Firefox starts a drag only when it has data: give every builder drag some
      if (!doc) return;
      const fn = (e: Event): void => {
        const t = e.target as Element | null;
        const dt = (e as DragEvent).dataTransfer;
        if (dt && t?.closest?.("[data-vb-drag]")) {
          dt.setData("text/plain", "vb");
          dt.effectAllowed = "copyMove";
        }
      };
      doc.addEventListener("dragstart", fn);
      offDrag = () => doc.removeEventListener("dragstart", fn);
      // a drag starts where the pointer went down, not where it first moved: a quick
      // drag may have only a move at the far end
      const down = (e: Event): void => {
        const p = e as PointerEvent;
        if (typeof p.clientX === "number")
          pressed = { x: p.clientX, y: p.clientY };
      };
      doc.addEventListener("pointerdown", down, true);
      offDown = () => doc.removeEventListener("pointerdown", down, true);
    },
    handle(effect, ctx) {
      switch (effect.type) {
        case "save":
          try {
            store()?.setItem(effect.key, effect.text);
          } catch {
            /* full or blocked: the project just is not saved */
          }
          return;
        case "load": {
          let text: string | null = null;
          try {
            text = store()?.getItem(effect.key) ?? null;
          } catch {
            text = null;
          }
          ctx.dispatch({ id: effect.onSuccess, payload: { text } });
          return;
        }
        case "copy": {
          const ok = (): void => {
            if (effect.onSuccess) ctx.dispatch({ id: effect.onSuccess });
          };
          const fail = (): void => {
            if (effect.onError) ctx.dispatch({ id: effect.onError });
          };
          const nav = typeof navigator === "undefined" ? undefined : navigator;
          if (nav?.clipboard?.writeText)
            nav.clipboard.writeText(effect.text).then(ok, fail);
          else fail();
          return;
        }
        case "open":
          if (/^https?:\/\//i.test(effect.url) && typeof window !== "undefined")
            window.open(effect.url, "_blank", "noopener");
          return;
        case "prefix":
          ctx.dispatch({
            id: effect.onSuccess,
            payload: effect.onSuccess.slice(
              0,
              effect.onSuccess.length - effect.name.length,
            ),
          });
          return;
        case "keys": {
          off?.();
          if (!doc) return;
          const root = effect.root ?? ".vb";
          const keys = effect.keys ?? DEFAULT_KEYS;
          const fn = (e: Event): void => {
            const k = e as KeyboardEvent;
            if (textTarget(k.target) || !doc.querySelector(root)) return;
            const ctrl = Boolean(k.ctrlKey || k.metaKey);
            const key = k.key.length === 1 ? k.key.toLowerCase() : k.key;
            // a focused button or link keeps its own Space and Enter
            if ((key === " " || key === "Enter") && nativeTarget(k.target))
              return;
            const wanted =
              keys.includes(key) || (ctrl && ["z", "y", "d"].includes(key));
            if (!wanted) return;
            if (ctrl || key.startsWith("Arrow") || key === " ")
              k.preventDefault();
            ctx.dispatch({
              id: effect.onMessage,
              payload: {
                key,
                ctrl,
                shift: Boolean(k.shiftKey),
              } satisfies KeyPayload,
            });
          };
          doc.addEventListener("keydown", fn);
          off = () => doc.removeEventListener("keydown", fn);
          return;
        }
        case "media": {
          let matches = false;
          try {
            matches =
              typeof window !== "undefined" &&
              typeof window.matchMedia === "function" &&
              window.matchMedia(effect.query).matches;
          } catch {
            matches = false;
          }
          ctx.dispatch({ id: effect.onSuccess, payload: { matches } });
          return;
        }
        case "unkeys":
          off?.();
          off = undefined;
          return;
        case "watch": {
          // one watcher per selector: asking again replaces it
          offWatch.get(effect.selector)?.();
          offWatch.delete(effect.selector);
          const el = doc?.querySelector(effect.selector);
          const win = doc?.defaultView;
          if (!el || !win) return;
          let last = "";
          const tell = (): void => {
            const r = el.getBoundingClientRect();
            const size = { w: Math.round(r.width), h: Math.round(r.height) };
            const key = `${size.w}x${size.h}`;
            if (key === last || size.w === 0 || size.h === 0) return;
            last = key;
            ctx.dispatch({ id: effect.onSuccess, payload: size });
          };
          tell();
          // the box changes when the element does, and when the window does
          win.addEventListener("resize", tell);
          const RO = (
            win as unknown as { ResizeObserver?: typeof ResizeObserver }
          ).ResizeObserver;
          const ro = RO ? new RO(tell) : undefined;
          ro?.observe(el);
          offWatch.set(effect.selector, () => {
            win.removeEventListener("resize", tell);
            ro?.disconnect();
          });
          return;
        }
        case "wheel": {
          offWheel?.();
          if (!doc) return;
          const fn = (e: Event): void => {
            const w = e as WheelEvent;
            if (!w.shiftKey && !w.ctrlKey) return;
            const el = (w.target as Element | null)?.closest?.(effect.selector);
            if (!el) return;
            // the page does not scroll (or zoom) for it
            w.preventDefault();
            const r = el.getBoundingClientRect();
            // Shift turns a vertical wheel into a horizontal one in some browsers
            const dy = w.deltaY !== 0 ? w.deltaY : w.deltaX;
            ctx.dispatch({
              id: effect.onSuccess,
              payload: {
                dy,
                x: w.clientX - r.left,
                y: w.clientY - r.top,
                w: r.width,
                h: r.height,
              },
            });
          };
          doc.addEventListener("wheel", fn, { passive: false, capture: true });
          // two fingers on the element are a pinch: the same message, as a wheel that
          // zooms in by the ratio of the distances (`dy` of a wheel is -ln(ratio) / 0.0018)
          let gap = 0;
          const spread = (t: TouchList): number =>
            Math.hypot(
              t[0].clientX - t[1].clientX,
              t[0].clientY - t[1].clientY,
            );
          const onStart = (e: Event): void => {
            const t = (e as TouchEvent).touches;
            gap = t.length === 2 ? spread(t) : 0;
          };
          const onTouch = (e: Event): void => {
            const t = (e as TouchEvent).touches;
            if (t.length !== 2) {
              gap = 0;
              return;
            }
            const el = (t[0].target as Element | null)?.closest?.(
              effect.selector,
            );
            if (!el) return;
            e.preventDefault();
            const now = spread(t);
            if (gap > 0 && now > 0 && now !== gap) {
              const r = el.getBoundingClientRect();
              ctx.dispatch({
                id: effect.onSuccess,
                payload: {
                  dy: -Math.log(now / gap) / 0.0018,
                  x: (t[0].clientX + t[1].clientX) / 2 - r.left,
                  y: (t[0].clientY + t[1].clientY) / 2 - r.top,
                  w: r.width,
                  h: r.height,
                },
              });
            }
            gap = now;
          };
          const onEnd = (e: Event): void => {
            const t = (e as TouchEvent).touches;
            gap = t.length === 2 ? spread(t) : 0;
          };
          doc.addEventListener("touchstart", onStart, { passive: true });
          doc.addEventListener("touchmove", onTouch, { passive: false });
          doc.addEventListener("touchend", onEnd, { passive: true });
          doc.addEventListener("touchcancel", onEnd, { passive: true });
          offWheel = () => {
            doc.removeEventListener("wheel", fn, { capture: true });
            doc.removeEventListener("touchstart", onStart);
            doc.removeEventListener("touchmove", onTouch);
            doc.removeEventListener("touchend", onEnd);
            doc.removeEventListener("touchcancel", onEnd);
          };
          return;
        }
        case "fullscreen": {
          const el = doc?.querySelector(effect.selector) as HTMLElement | null;
          if (!el || !doc) return;
          const tell = (on: boolean): void =>
            ctx.dispatch({ id: effect.onSuccess, payload: { on } });
          if (!offFull) {
            const fn = (): void => {
              if (!pseudoFull) tell(doc.fullscreenElement !== null);
            };
            doc.addEventListener("fullscreenchange", fn);
            offFull = () => doc.removeEventListener("fullscreenchange", fn);
          }
          if (doc.fullscreenElement) {
            void doc.exitFullscreen().catch(() => undefined);
            return;
          }
          if (pseudoFull) {
            pseudoFull = false;
            tell(false);
            return;
          }
          if (typeof el.requestFullscreen === "function") {
            el.requestFullscreen().catch(() => {
              pseudoFull = true;
              tell(true);
            });
          } else {
            pseudoFull = true;
            tell(true);
          }
          return;
        }
        case "drag": {
          offPointer?.();
          const win = doc?.defaultView;
          if (!win) return;
          const send = (e: PointerEvent, done: boolean): void => {
            const under = doc?.elementFromPoint?.(e.clientX, e.clientY);
            const over = under
              ?.closest?.("[data-drop]")
              ?.getAttribute("data-drop");
            const box = effect.rel
              ? doc?.querySelector(effect.rel)?.getBoundingClientRect()
              : undefined;
            ctx.dispatch({
              id: effect.onSuccess,
              payload: {
                x: e.clientX,
                y: e.clientY,
                done,
                over: over ?? null,
                ...(box
                  ? {
                      rx: e.clientX - box.left,
                      ry: e.clientY - box.top,
                      inside:
                        e.clientX >= box.left &&
                        e.clientX <= box.right &&
                        e.clientY >= box.top &&
                        e.clientY <= box.bottom,
                    }
                  : {}),
              },
            });
          };
          // a second finger (a pinch) is not the pointer that is followed
          const move = (e: Event): void => {
            if ((e as PointerEvent).isPrimary === false) return;
            send(e as PointerEvent, false);
          };
          // the first sample is where the pointer went down
          if (pressed) {
            ctx.dispatch({
              id: effect.onSuccess,
              payload: { x: pressed.x, y: pressed.y, done: false, over: null },
            });
            pressed = undefined;
          }
          const stop = (e: Event): void => {
            if ((e as PointerEvent).isPrimary === false) return;
            send(e as PointerEvent, true);
            offPointer?.();
            offPointer = undefined;
          };
          win.addEventListener("pointermove", move);
          win.addEventListener("pointerup", stop);
          win.addEventListener("pointercancel", stop);
          offPointer = () => {
            win.removeEventListener("pointermove", move);
            win.removeEventListener("pointerup", stop);
            win.removeEventListener("pointercancel", stop);
          };
        }
      }
    },
    dispose() {
      off?.();
      offDrag?.();
      offDown?.();
      for (const off of offWatch.values()) off();
      offWatch.clear();
      offWheel?.();
      offFull?.();
      offPointer?.();
    },
  };
}
