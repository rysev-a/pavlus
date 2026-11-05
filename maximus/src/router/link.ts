/** Decide whether a click on an anchor is a plain in-app navigation. */
export function shouldHandleClick(e: MouseEvent, el: Element): boolean {
  if (e.defaultPrevented) return false;
  if (e.button !== 0) return false;
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
  const target = el.getAttribute("target");
  if (target && target !== "_self") return false;
  if (el.hasAttribute("download")) return false;
  const rel = el.getAttribute("rel");
  if (rel && /(^|\s)external(\s|$)/.test(rel)) return false;
  return true;
}

/** `https://x`, `mailto:x`, `//host/x` (anything that leaves the app). */
export function isExternal(path: string): boolean {
  return /^([a-z][a-z0-9+.-]*:|\/\/)/i.test(path);
}
