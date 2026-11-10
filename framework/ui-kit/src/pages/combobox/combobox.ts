import { Component, type Effect, type Message } from "@pavlus/client";
import { storeEffector as store } from "@pavlus/client/plugins";
import view from "./combobox.pavlus";

const options = ["Next.js", "SvelteKit", "Nuxt.js", "Remix", "Astro", "Pavlus"];

/** An option as the template reads it: flagged against the picked value. */
export interface ComboboxOption {
  label: string;
  /** The option is the picked value. */
  selected: boolean;
}

export interface ComboboxState {
  open: boolean;
  query: string;
  value: string;
  /** Derived from `open`, `query` and `value` — see `derive`. */
  filtered: ComboboxOption[];
  empty: boolean;
  expanded: string;
  buttonLabel: string;
  valueLabel: string;
}

/** `aria-expanded` from the open flag — one place. */
const expandedOf = (open: boolean): string => (open ? "true" : "false");

/** Everything the template reads beyond the base — the one place. */
function derive(
  open: boolean,
  query: string,
  value: string,
): Omit<ComboboxState, "open" | "query" | "value"> {
  const q = query.toLowerCase();
  const filtered = options
    .filter((o) => o.toLowerCase().includes(q))
    .map((label) => ({ label, selected: label === value }));
  return {
    filtered,
    empty: filtered.length === 0,
    expanded: expandedOf(open),
    buttonLabel: value || "Select a framework...",
    valueLabel: value || "nothing",
  };
}

export const initial: ComboboxState = {
  open: false,
  query: "",
  value: "",
  ...derive(false, "", ""),
};

export class Combobox extends Component<ComboboxState> {
  view = view;

  toggle(_msg: Message, state: ComboboxState): Effect[] {
    const open = !state.open;
    return [store.set("open", open), store.set("expanded", expandedOf(open))];
  }

  close(): Effect[] {
    return [store.set("open", false), store.set("expanded", expandedOf(false))];
  }

  search(msg: Message, state: ComboboxState): Effect[] {
    const query = msg.event?.value ?? "";
    const { filtered, empty } = derive(state.open, query, state.value);
    return [
      store.set("query", query),
      store.set("filtered", filtered),
      store.set("empty", empty),
    ];
  }

  choose(msg: Message, state: ComboboxState): Effect[] {
    const value = msg.payload === state.value ? "" : (msg.payload as string);
    // the popover closes and the list starts over
    const d = derive(false, "", value);
    return [
      store.set("value", value),
      store.set("open", false),
      store.set("query", ""),
      ...Object.entries(d).map(([k, v]) => store.set(k, v)),
    ];
  }
}

export const page = new Combobox();
