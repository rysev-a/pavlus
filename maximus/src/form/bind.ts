/**
 * The `bind` directive: wires one element to a field. Value or checked state
 * flows into the DOM through a render effect; `input`, `change` and `blur`
 * flow back; `aria-invalid` and `aria-describedby` follow the error.
 *
 * @module
 */
import { batch, onMount, renderEffect } from "../core/mod.ts";
import type { Accessor } from "../core/mod.ts";

export interface BoundElement {
  el: Element;
  path: Accessor<string>;
}

export interface BindContext {
  path: Accessor<string>;
  value: Accessor<unknown>;
  error: Accessor<string | undefined>;
  errorId: Accessor<string>;
  change(value: unknown, trigger: "input" | "change"): void;
  blur(): void;
  registry: Set<BoundElement>;
}

type Kind =
  "checkbox" | "radio" | "number" | "file" | "select" | "multiselect" | "text";

function kindOf(
  el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
): Kind {
  const tag = el.localName;
  if (tag === "select")
    return (el as HTMLSelectElement).multiple ? "multiselect" : "select";
  if (tag === "input") {
    const type = (
      (el as HTMLInputElement).getAttribute("type") ?? "text"
    ).toLowerCase();
    if (type === "checkbox" || type === "radio" || type === "file") return type;
    if (type === "number" || type === "range") return "number";
  }
  return "text";
}

function readNumber(el: HTMLInputElement): number | undefined {
  if (el.value === "") return undefined;
  const n =
    typeof el.valueAsNumber === "number" ? el.valueAsNumber : Number(el.value);
  return Number.isNaN(n) ? undefined : n;
}

export function makeBind(ctx: BindContext): (el: Element) => () => void {
  return (target) => {
    const el = target as HTMLInputElement &
      HTMLSelectElement &
      HTMLTextAreaElement;
    const kind = kindOf(el);
    const registered: BoundElement = { el, path: ctx.path };
    ctx.registry.add(registered);
    if (!el.hasAttribute("name")) el.setAttribute("name", ctx.path());

    const write = (): void => {
      const v = ctx.value();
      switch (kind) {
        case "checkbox":
          el.checked = Array.isArray(v)
            ? v.map(String).includes(el.value)
            : !!v;
          break;
        case "radio":
          el.checked = v != null && String(v) === el.value;
          break;
        case "number": {
          const n = readNumber(el);
          const want =
            v == null || (typeof v === "number" && Number.isNaN(v))
              ? ""
              : String(v);
          if (want === "" ? el.value !== "" && n !== undefined : n !== v)
            el.value = want;
          break;
        }
        case "file":
          if (
            (v == null || (Array.isArray(v) && v.length === 0)) &&
            el.value !== ""
          )
            el.value = "";
          break;
        case "multiselect": {
          const set = new Set(Array.isArray(v) ? v.map(String) : []);
          for (const o of Array.from(el.options)) o.selected = set.has(o.value);
          break;
        }
        default: {
          const s = v == null ? "" : String(v);
          if (el.value !== s) el.value = s;
        }
      }
    };

    const read = (): unknown => {
      switch (kind) {
        case "checkbox": {
          const cur = ctx.value();
          if (Array.isArray(cur)) {
            const rest = cur.filter((x) => String(x) !== el.value);
            return el.checked ? [...rest, el.value] : rest;
          }
          return el.checked;
        }
        case "radio":
          return el.checked ? el.value : ctx.value();
        case "number":
          return readNumber(el);
        case "file": {
          const files = Array.from(el.files ?? []);
          return el.multiple ? files : (files[0] ?? null);
        }
        case "multiselect":
          return Array.from(el.selectedOptions ?? []).map((o) => o.value);
        default:
          return el.value;
      }
    };

    renderEffect(write);
    // options may be inserted after the directive ran: apply once more when attached
    onMount(write);

    renderEffect(() => {
      const err = ctx.error();
      const id = ctx.errorId();
      const tokens = (el.getAttribute("aria-describedby") ?? "")
        .split(/\s+/)
        .filter((t) => t !== "" && !/^mxf\d+-.*-error$/.test(t));
      if (err !== undefined) {
        el.setAttribute("aria-invalid", "true");
        tokens.push(id);
      } else el.removeAttribute("aria-invalid");
      if (tokens.length > 0)
        el.setAttribute("aria-describedby", tokens.join(" "));
      else el.removeAttribute("aria-describedby");
    });

    const onInput = (): void => batch(() => ctx.change(read(), "input"));
    const onChange = (): void => batch(() => ctx.change(read(), "change"));
    const onBlur = (): void => batch(() => ctx.blur());
    el.addEventListener("input", onInput);
    el.addEventListener("change", onChange);
    el.addEventListener("blur", onBlur);
    const cleanup = (): void => {
      ctx.registry.delete(registered);
      el.removeEventListener("input", onInput);
      el.removeEventListener("change", onChange);
      el.removeEventListener("blur", onBlur);
    };
    return cleanup;
  };
}
