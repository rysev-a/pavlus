import { Component, type Effect, type Message } from "@pavlus/frontend";
import { storeEffector as store } from "@pavlus/frontend/plugins";
import view from "./combobox.pavlus";

const options = ["Next.js", "SvelteKit", "Nuxt.js", "Remix", "Astro", "Pavlus"];

export interface ComboboxState {
  open: boolean;
  query: string;
  value: string;
  /** Derived from `query`: the options that match it. */
  filtered: string[];
}

export const initial: ComboboxState = {
  open: false,
  query: "",
  value: "",
  filtered: options,
};

export class Combobox extends Component<ComboboxState> {
  view = view;

  toggle(_msg: Message, state: ComboboxState): Effect[] {
    return [store.set("open", !state.open)];
  }

  close(): Effect[] {
    return [store.set("open", false)];
  }

  search(msg: Message): Effect[] {
    const query = msg.event?.value ?? "";
    return [
      store.set("query", query),
      store.set(
        "filtered",
        options.filter((o) => o.toLowerCase().includes(query.toLowerCase())),
      ),
    ];
  }

  choose(msg: Message, state: ComboboxState): Effect[] {
    return [
      store.set("value", msg.payload === state.value ? "" : msg.payload),
      store.set("open", false),
      store.set("query", ""),
      store.set("filtered", options),
    ];
  }
}

export const page = new Combobox();
