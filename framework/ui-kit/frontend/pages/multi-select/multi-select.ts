import {
  type Children,
  Component,
  type ComponentCtx,
  type Effect,
  type Message,
} from "@pavlus/frontend";
import view from "./multi-select.pavlus";
import { MultiSelect, type SelectState, selectState } from "./select.ts";

const FRAMEWORKS = [
  "Angular",
  "Astro",
  "Backbone",
  "Ember",
  "Gatsby",
  "Lit",
  "Marko",
  "Next.js",
  "Nuxt",
  "Pavlus",
  "Preact",
  "Qwik",
  "React",
  "Remix",
  "Riot",
  "Solid",
  "Stencil",
  "Svelte",
  "SvelteKit",
  "Vue",
  "Alpine.js",
  "htmx",
  "Mithril",
  "Inferno",
].map((label) => ({ id: label.toLowerCase(), label }));

export interface MultiSelectPageState {
  sync: SelectState;
  remote: SelectState;
  limited: SelectState;
}

export const initial: MultiSelectPageState = {
  sync: selectState({
    uid: "ms-sync",
    label: "Frameworks",
    placeholder: "Pick frameworks...",
    kind: "sync",
    options: FRAMEWORKS,
    selected: [FRAMEWORKS[9]],
  }),
  remote: selectState({
    uid: "ms-remote",
    label: "People",
    placeholder: "Search people...",
    kind: "async",
    // the site is served under a base path: the file is found from it
    url: `${import.meta.env.BASE_URL}data/people.json`,
  }),
  limited: selectState({
    uid: "ms-limited",
    label: "Up to three tags",
    placeholder: "Pick tags...",
    kind: "sync",
    size: "sm",
    max: 3,
    options: [
      "bug",
      "feature",
      "docs",
      "design",
      "performance",
      "security",
      "question",
    ].map((label) => ({ id: label, label })),
  }),
};

const select = new MultiSelect();

/** The page: three instances of one multi-select. */
export class MultiSelectPage extends Component<MultiSelectPageState> {
  view = view;

  children: Children<MultiSelectPageState> = {
    sync: { component: select, key: "sync" },
    remote: { component: select, key: "remote" },
    limited: { component: select, key: "limited" },
  };

  /** The page is left: the pending search timer and request stop. */
  leave(
    _msg: Message,
    _state: MultiSelectPageState,
    { send }: ComponentCtx,
  ): Effect[] {
    return send("remote", "leave");
  }
}

export const page = new MultiSelectPage();
