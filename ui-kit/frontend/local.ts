import type { Effect, Plugin } from "@service-laboratory/pavlus";

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
    | { type: "keys"; onMessage: string }
    | { type: "unkeys" }
    | { type: "prefix"; name: string; onSuccess: string }
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
  /** Starts sending `{ key, ctrl, shift }` for the keys outside text fields to `onMessage`. */
  keys: (onMessage: string): LocalEffect => ({
    plugin: "local",
    type: "keys",
    onMessage,
  }),
  unkeys: (): LocalEffect => ({ plugin: "local", type: "unkeys" }),
  /** Replies the prefix that messages of the asking component carry (`name` is the reply id without it). */
  prefix: (name: string): LocalEffect => ({
    plugin: "local",
    type: "prefix",
    name,
    onSuccess: name,
  }),
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
          const fn = (e: Event): void => {
            const k = e as KeyboardEvent;
            if (textTarget(k.target) || !doc.querySelector(".vb")) return;
            const ctrl = Boolean(k.ctrlKey || k.metaKey);
            const key = k.key.length === 1 ? k.key.toLowerCase() : k.key;
            const wanted =
              [
                "Delete",
                "ArrowUp",
                "ArrowDown",
                "ArrowLeft",
                "ArrowRight",
                "Escape",
              ].includes(key) ||
              (ctrl && ["z", "y", "d"].includes(key));
            if (!wanted) return;
            if (ctrl || key.startsWith("Arrow")) k.preventDefault();
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
        case "unkeys":
          off?.();
          off = undefined;
      }
    },
    dispose() {
      off?.();
      offDrag?.();
    },
  };
}
