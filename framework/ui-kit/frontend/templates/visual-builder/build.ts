// Small helpers that build models by hand: the section library and the demos.
import {
  type Action,
  type El,
  ELEMENTS,
  type ElType,
  type EventName,
  type FormField,
  type Model,
  type Page,
  type Rect,
  type Section,
  type SectionKind,
  type StateKey,
  blankField,
} from "./model.ts";

export interface Opts {
  visible?: string;
  bind?: string;
  style?: El["style"];
  events?: Partial<Record<EventName, Action[]>>;
  fields?: FormField[];
  tablet?: Rect;
  mobile?: Rect;
  hide?: El["hide"];
}

/** A builder hands out ids from a counter; `seq()` is the counter to store. */
export function builder(start: number) {
  let n = start;
  const id = (p: string): string => `${p}${++n}`;
  return {
    seq: () => n,
    el(
      type: ElType,
      x: number,
      y: number,
      w: number,
      h: number,
      props: Record<string, string> = {},
      o: Opts = {},
    ): El {
      return {
        id: id("e"),
        type,
        pos: {
          desktop: { x, y, w, h },
          ...(o.tablet ? { tablet: o.tablet } : {}),
          ...(o.mobile ? { mobile: o.mobile } : {}),
        },
        hide: o.hide ?? {},
        props: { ...ELEMENTS[type].defaults, ...props },
        visible: o.visible ?? "",
        bind: o.bind ?? "",
        style: o.style ?? {},
        fields:
          o.fields ??
          (type === "form" ? [blankField("name", "Name", "text", "yes")] : []),
        events: o.events ?? {},
      };
    },
    section(
      kind: SectionKind,
      name: string,
      elements: El[],
      o: { rows?: number; bg?: string; pad?: string } = {},
    ): Section {
      return {
        id: id("s"),
        kind,
        name,
        rows: o.rows ?? 4,
        bg: o.bg ?? "none",
        pad: o.pad ?? "md",
        elements,
      };
    },
    page(name: string, slug: string, sections: Section[]): Page {
      return { id: id("p"), name, slug, sections };
    },
  };
}

export type Builder = ReturnType<typeof builder>;

export const key = (
  k: string,
  type: StateKey["type"],
  initial: string,
): StateKey => ({
  key: k,
  type,
  initial,
});

export const set = (k: string, value: string): Action => ({
  t: "set",
  key: k,
  value,
});
export const notice = (text: string): Action => ({ t: "notice", text });
export const go = (url: string): Action => ({ t: "navigate", url });

export function http(
  method: string,
  url: string,
  o: Partial<Action> = {},
): Action {
  return {
    t: "http",
    method,
    url,
    headers: "",
    body: "",
    okKey: "",
    okPath: "",
    errKey: "",
    loadingKey: "",
    then: [],
    catch: [],
    ...o,
  };
}

/** Adds the keys that are missing (a section of the library needs its own). */
export function withKeys(m: Model, keys: StateKey[]): Model {
  const missing = keys.filter((k) => !m.keys.some((x) => x.key === k.key));
  return missing.length ? { ...m, keys: [...m.keys, ...missing] } : m;
}
