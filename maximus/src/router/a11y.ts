/**
 * Accessibility and viewport side effects of navigation: a polite live
 * region, focus management and scroll handling.
 *
 * @module
 */
import type { Scroller } from "./types.ts";

const HIDDEN_STYLE =
  "position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0";

export interface Announcer {
  say(message: string): void;
  destroy(): void;
}

/** A visually hidden `aria-live="polite"` status region, created on first use. */
export function createAnnouncer(): Announcer {
  let el: HTMLElement | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    say(message) {
      if (typeof document === "undefined") return;
      if (el === null || !el.isConnected) {
        el = document.createElement("div");
        el.setAttribute("aria-live", "polite");
        el.setAttribute("aria-atomic", "true");
        el.setAttribute("role", "status");
        el.setAttribute("data-maximus-announcer", "");
        el.setAttribute("style", HIDDEN_STYLE);
        document.body.appendChild(el);
      }
      // Clear first so announcing the same text twice still triggers the screen reader.
      el.textContent = "";
      if (timer !== null) clearTimeout(timer);
      const target = el;
      timer = setTimeout(() => {
        timer = null;
        target.textContent = message;
      }, 0);
    },
    destroy() {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      el?.remove();
      el = null;
    },
  };
}

/** Move focus to the main content of the new page so keyboard and screen-reader users start there. */
export function focusContent(selector: string | "auto"): boolean {
  if (typeof document === "undefined") return false;
  const sel = selector === "auto" ? "[data-router-focus], main, [role=main], h1" : selector;
  const target = document.querySelector<HTMLElement>(sel);
  if (target === null) return false;
  if (!target.hasAttribute("tabindex") && !isNativelyFocusable(target)) {
    target.setAttribute("tabindex", "-1");
    target.addEventListener("blur", () => target.removeAttribute("tabindex"), {
      once: true,
    });
  }
  target.focus({ preventScroll: true });
  return true;
}

function isNativelyFocusable(el: HTMLElement): boolean {
  return /^(A|BUTTON|INPUT|SELECT|TEXTAREA)$/.test(el.tagName);
}

export function prefersReducedMotion(): boolean {
  try {
    return (
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  } catch {
    return false;
  }
}

/** The text a screen reader should hear for a page: title, else first heading, else the path. */
export function pageLabel(path: string): string {
  if (typeof document === "undefined") return path;
  const t = document.title.trim();
  if (t) return t;
  const h1 = document.querySelector("h1")?.textContent?.trim();
  return h1 || path;
}

export function windowScroller(): Scroller {
  return {
    position: () => ({ x: window.scrollX, y: window.scrollY }),
    scrollTo(x, y) {
      try {
        window.scrollTo(x, y);
      } catch {
        /* jsdom: not implemented */
      }
    },
    scrollToElement(el) {
      try {
        el.scrollIntoView();
      } catch {
        /* jsdom: not implemented */
      }
    },
  };
}
