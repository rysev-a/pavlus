/**
 * Binding primitives: attribute, property, boolean attribute, class, style,
 * event, ref and spread. Reactive values (functions) get a render effect,
 * everything else is applied once.
 *
 * @module
 */
import {
  batch,
  getOwner,
  handleError,
  isSignal,
  onCleanup,
  renderEffect,
  untrack,
} from "../core/mod.ts";
import {
  DANGEROUS_PROPS,
  URL_ATTRS,
  isEventAttr,
  isSafeUrl,
  isUnsafe,
} from "./safety.ts";

function unwrap(v: unknown): unknown {
  while (typeof v === "function") v = (v as () => unknown)();
  return v;
}

function checkUrl(name: string, value: string): void {
  if (!isSafeUrl(value)) {
    throw new Error(
      `Maximus: refused unsafe URL in "${name}" (${JSON.stringify(value.slice(0, 40))}). Validate it, or wrap it in unsafe() if you really mean it.`,
    );
  }
}

/** Set (or remove) an attribute from a resolved value, with safety checks. */
export function setAttr(el: Element, name: string, v: unknown): void {
  if (isUnsafe(v)) {
    el.setAttribute(name, v.value);
    return;
  }
  if (v == null || v === false) {
    el.removeAttribute(name);
    return;
  }
  if (v === true) {
    el.setAttribute(name, "");
    return;
  }
  const s = String(v);
  const lower = name.toLowerCase();
  if (URL_ATTRS.has(lower)) checkUrl(name, s);
  else if (lower === "srcdoc")
    throw new Error('Maximus: "srcdoc" can only be set with unsafe()');
  el.setAttribute(name, s);
}

// ------------------------------------------------------------------ class

const classState = new WeakMap<Element, Set<string>>();

function collectClasses(v: unknown, out: Set<string>): void {
  if (v == null || typeof v === "boolean") return;
  if (typeof v === "function")
    return collectClasses((v as () => unknown)(), out);
  if (typeof v === "string") {
    for (const t of v.split(/\s+/)) if (t) out.add(t);
  } else if (Array.isArray(v)) {
    for (const x of v) collectClasses(x, out);
  } else if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    for (const k in o) {
      if (unwrap(o[k])) for (const t of k.split(/\s+/)) if (t) out.add(t);
    }
  } else {
    out.add(String(v));
  }
}

function applyClass(el: Element, value: unknown): void {
  const next = new Set<string>();
  collectClasses(value, next);
  const prev = classState.get(el);
  if (prev !== undefined)
    for (const c of prev) if (!next.has(c)) el.classList.remove(c);
  for (const c of next)
    if (prev === undefined || !prev.has(c)) el.classList.add(c);
  classState.set(el, next);
}

export function bindClass(el: Element, value: unknown): void {
  if (typeof value === "string" || value == null) applyClass(el, value);
  else renderEffect(() => applyClass(el, value));
}

// ------------------------------------------------------------------ style

const styleState = new WeakMap<Element, Set<string>>();

function kebab(k: string): string {
  return k.startsWith("--") || k.includes("-")
    ? k
    : k.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
}

function applyStyle(el: Element, value: unknown): void {
  const style = (el as HTMLElement).style;
  const v = unwrap(value);
  const prev = styleState.get(el);
  if (v == null || v === false || typeof v === "string") {
    if (prev !== undefined) for (const p of prev) style.removeProperty(p);
    styleState.delete(el);
    if (v == null || v === false || v === "") el.removeAttribute("style");
    else el.setAttribute("style", v as string);
    return;
  }
  const next = new Set<string>();
  const o = v as Record<string, unknown>;
  for (const k in o) {
    const val = unwrap(o[k]);
    const prop = kebab(k);
    if (val == null || val === false) style.removeProperty(prop);
    else {
      style.setProperty(prop, String(val));
      next.add(prop);
    }
  }
  if (prev !== undefined)
    for (const p of prev) if (!next.has(p)) style.removeProperty(p);
  styleState.set(el, next);
}

export function bindStyle(el: Element, value: unknown): void {
  if (typeof value === "string" || value == null) applyStyle(el, value);
  else renderEffect(() => applyStyle(el, value));
}

// --------------------------------------------------------- attr / prop / bool

export function bindAttr(el: Element, name: string, value: unknown): void {
  if (isEventAttr(name) && !isUnsafe(value)) {
    throw new Error(
      `Maximus: "${name}" attribute bindings are not allowed (inline handlers are an XSS vector). Use @${name.slice(2).toLowerCase()}=\${handler}, or wrap the value in unsafe().`,
    );
  }
  const lower = name.toLowerCase();
  if (lower === "class") return bindClass(el, value);
  if (lower === "style") return bindStyle(el, value);
  if (typeof value === "function")
    renderEffect(() => setAttr(el, name, unwrap(value)));
  else setAttr(el, name, value);
}

/** `name="a ${x} b"`: one attribute built from static pieces and holes. */
export function bindComposite(
  el: Element,
  name: string,
  strings: readonly string[],
  values: readonly unknown[],
): void {
  if (isEventAttr(name))
    throw new Error(
      `Maximus: "${name}" attribute bindings are not allowed. Use @event handlers.`,
    );
  const lower = name.toLowerCase();
  const compute = (): string => {
    let s = strings[0]!;
    for (let i = 0; i < values.length; i++) {
      const v = unwrap(values[i]);
      s +=
        (v == null || v === false ? "" : isUnsafe(v) ? v.value : String(v)) +
        strings[i + 1]!;
    }
    return s;
  };
  const apply = (): void => {
    if (lower === "class") applyClass(el, compute());
    else if (lower === "style") applyStyle(el, compute());
    else setAttr(el, name, compute());
  };
  if (values.some((v) => typeof v === "function")) renderEffect(apply);
  else apply();
}

function setProp(el: Element, name: string, v: unknown): void {
  let value = v;
  if (isUnsafe(v)) value = v.value;
  else if (DANGEROUS_PROPS.has(name)) {
    throw new Error(
      `Maximus: ".${name}" can only be set with unsafe() (it parses markup)`,
    );
  } else if (URL_ATTRS.has(name.toLowerCase()) && typeof v === "string")
    checkUrl(name, v);
  if ((el as unknown as Record<string, unknown>)[name] !== value)
    (el as unknown as Record<string, unknown>)[name] = value;
}

/** `.prop=${value}`. A function is a reactive getter; to assign a function, wrap it: `() => fn`. */
export function bindProp(el: Element, name: string, value: unknown): void {
  if (typeof value === "function")
    renderEffect(() => setProp(el, name, unwrap(value)));
  else setProp(el, name, value);
}

/** `?attr=${value}`: presence follows truthiness. */
export function bindBool(el: Element, name: string, value: unknown): void {
  if (typeof value === "function")
    renderEffect(() => void el.toggleAttribute(name, !!unwrap(value)));
  else el.toggleAttribute(name, !!value);
}

// ------------------------------------------------------------------ events

const DELEGATED: ReadonlySet<string> = new Set([
  "click",
  "dblclick",
  "contextmenu",
  "input",
  "beforeinput",
  "change",
  "keydown",
  "keyup",
  "mousedown",
  "mouseup",
  "pointerdown",
  "pointerup",
  "focusin",
  "focusout",
]);

const MODIFIERS: ReadonlySet<string> = new Set([
  "once",
  "passive",
  "capture",
  "prevent",
  "stop",
  "self",
  "direct",
]);
const delegatedDocs = new WeakMap<Document, Set<string>>();
type Handlers = Record<string, ((e: Event) => void) | undefined>;

function delegate(e: Event): void {
  const key = "$$" + e.type;
  const path = e.composedPath();
  let current: EventTarget | null = null;
  Object.defineProperty(e, "currentTarget", {
    configurable: true,
    get: () => current,
  });
  for (let i = 0; i < path.length; i++) {
    const node = path[i]!;
    const h = (node as unknown as Handlers)[key];
    if (h !== undefined) {
      current = node;
      h(e);
    }
    if (e.cancelBubble) break;
  }
  current = null;
}

function ensureDelegate(doc: Document, type: string): void {
  let set = delegatedDocs.get(doc);
  if (set === undefined) delegatedDocs.set(doc, (set = new Set()));
  if (!set.has(type)) {
    set.add(type);
    doc.addEventListener(type, delegate);
  }
}

/**
 * `@type.modifier=${handler}`. Modifiers: `once`, `passive`, `capture`,
 * `prevent`, `stop`, `self`, `direct`. Common bubbling events are delegated to
 * the document (one listener per type) unless a modifier that changes
 * listener semantics is present (`once`, `passive`, `capture`, `direct`).
 * Handlers run batched and untracked; their errors go to the nearest error boundary.
 */
export function bindEvent(el: Element, spec: string, handler: unknown): void {
  if (handler == null || handler === false) return;
  if (typeof handler !== "function")
    throw new TypeError(`Maximus: @${spec} expects a function`);
  const [type, ...mods] = spec.split(".") as [string, ...string[]];
  for (const m of mods)
    if (!MODIFIERS.has(m))
      throw new Error(`Maximus: unknown event modifier ".${m}" in @${spec}`);
  const prevent = mods.includes("prevent");
  const stop = mods.includes("stop");
  const self = mods.includes("self");
  const once = mods.includes("once");
  const passive = mods.includes("passive");
  const capture = mods.includes("capture");
  const owner = getOwner();
  const fn = handler as (this: Element, e: Event) => void;
  const run = (e: Event): void => {
    if (self && e.target !== e.currentTarget) return;
    if (prevent) e.preventDefault();
    if (stop) e.stopPropagation();
    batch(() => {
      try {
        untrack(() => fn.call(el, e));
      } catch (err) {
        handleError(err, owner);
      }
    });
  };
  if (
    DELEGATED.has(type) &&
    !once &&
    !passive &&
    !capture &&
    !mods.includes("direct")
  ) {
    const key = "$$" + type;
    ensureDelegate(document, type);
    (el as unknown as Handlers)[key] = run;
    onCleanup(() => {
      if ((el as unknown as Handlers)[key] === run)
        (el as unknown as Handlers)[key] = undefined;
    });
  } else {
    const opts = { once, passive: passive || undefined, capture };
    el.addEventListener(type, run, opts);
    onCleanup(() => el.removeEventListener(type, run, opts));
  }
}

// --------------------------------------------------------------- ref/spread

/** `ref=${signal | fn}`: receives the element when it is created (before it is attached; use `onMount` for attached work). A signal is reset to `null` on dispose. */
export function bindRef(el: Element, value: unknown): void {
  if (value == null) return;
  if (isSignal(value)) {
    value.set(el);
    onCleanup(() => value.set(null));
  } else if (typeof value === "function") {
    (value as (el: Element) => void)(el);
  } else throw new TypeError("Maximus: ref expects a function or a signal");
}

/** Apply one `key: value` pair using attribute-position syntax (`@click`, `.prop`, `?bool`, `ref`, `class`, others are attributes). */
export function bindKey(el: Element, key: string, value: unknown): void {
  const c = key.charCodeAt(0);
  if (c === 64) bindEvent(el, key.slice(1), value);
  else if (c === 46) bindProp(el, key.slice(1), value);
  else if (c === 63) bindBool(el, key.slice(1), value);
  else if (key === "ref") bindRef(el, value);
  else bindAttr(el, key, value);
}

function unbindKey(el: Element, key: string): void {
  const c = key.charCodeAt(0);
  if (c === 64 || c === 46 || key === "ref") return; // listeners/refs are owned by the effect; props cannot be restored
  const name = c === 63 ? key.slice(1) : key;
  if (name === "class") {
    for (const t of classState.get(el) ?? []) el.classList.remove(t);
    classState.delete(el);
  } else if (name === "style") applyStyle(el, null);
  else el.removeAttribute(name);
}

/**
 * `...${spread}` or a bare `${spread}` in a tag. An object applies its keys; a
 * signal/computed holding an object is reactive (keys that vanish are
 * removed); any other function is a directive `(el) => void | cleanup` called once.
 */
export function bindSpread(el: Element, value: unknown): void {
  if (value == null || value === false) return;
  if (
    isSignal(value) ||
    (typeof value === "function" &&
      (value as { peek?: unknown }).peek !== undefined)
  ) {
    const getter = value as () => Record<string, unknown> | null;
    let prevKeys: string[] = [];
    renderEffect(() => {
      const obj = getter() ?? {};
      untrack(() => {
        const keys = Object.keys(obj);
        for (const k of prevKeys) if (!(k in obj)) unbindKey(el, k);
        for (const k of keys) bindKey(el, k, obj[k]);
        prevKeys = keys;
      });
    });
  } else if (typeof value === "function") {
    const cleanup = (value as (el: Element) => unknown)(el);
    if (typeof cleanup === "function") onCleanup(cleanup as () => void);
  } else if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    for (const k of Object.keys(obj)) bindKey(el, k, obj[k]);
  } else
    throw new TypeError(
      "Maximus: a spread expects an object, a signal of an object, or a directive function",
    );
}
