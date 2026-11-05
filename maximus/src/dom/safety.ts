/**
 * XSS-safety primitives. Text is always created with `createTextNode`,
 * attribute values go through `setAttribute`, `on*` attribute bindings and
 * `javascript:`-style URLs are rejected, and the only way around is wrapping
 * the value in {@link unsafe} so the opt-out is greppable.
 *
 * @module
 */

const BRAND = Symbol("maximus.unsafe");

/** A string the author vouches for. See {@link unsafe}. */
export class Unsafe {
  readonly value: string;
  readonly [BRAND] = true;
  constructor(value: string) {
    this.value = value;
  }
  toString(): string {
    return this.value;
  }
}

/**
 * Opt out of the safety checks for one value: allows `javascript:` URLs,
 * `on*` attributes, `.innerHTML`/`.srcdoc`, and, as a child, inserts the string
 * as parsed HTML. Never pass user input through it.
 */
export function unsafe(value: string): Unsafe {
  return new Unsafe(String(value));
}

export function isUnsafe(v: unknown): v is Unsafe {
  return (
    typeof v === "object" &&
    v !== null &&
    (v as Record<symbol, unknown>)[BRAND] === true
  );
}

/** Attributes whose value is a URL and therefore a script-injection vector. */
export const URL_ATTRS: ReadonlySet<string> = new Set([
  "href",
  "src",
  "action",
  "formaction",
  "xlink:href",
  "poster",
  "cite",
  "data",
  "background",
  "ping",
  "manifest",
  "codebase",
  "longdesc",
  "usemap",
]);

/** Properties that parse markup or navigate, rejected unless the value is {@link unsafe}. */
export const DANGEROUS_PROPS: ReadonlySet<string> = new Set([
  "innerHTML",
  "outerHTML",
  "srcdoc",
]);

const STRIP = new RegExp(
  "[\\u0000-\\u0020\\u007f-\\u009f\\u00ad\\u200b-\\u200d\\u2028\\u2029\\ufeff]",
  "g",
);

/** True unless `url` uses a scripting scheme (`javascript:`, `vbscript:`) or a non-image `data:` URL. Whitespace and control characters are stripped first, as browsers do. */
export function isSafeUrl(url: string): boolean {
  const s = String(url).replace(STRIP, "").toLowerCase();
  if (s.startsWith("javascript:") || s.startsWith("vbscript:")) return false;
  if (s.startsWith("data:"))
    return /^data:image\/(png|gif|jpe?g|webp|avif|bmp)[;,]/.test(s);
  return true;
}

export function isEventAttr(name: string): boolean {
  return /^on[a-z]/i.test(name);
}
