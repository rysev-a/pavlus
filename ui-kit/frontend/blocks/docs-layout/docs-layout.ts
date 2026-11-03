import {
  Component,
  type Children,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import {
  domEffector as dom,
  storeEffector as store,
} from "@service-laboratory/pavlus/plugins";
import {
  type Crumb,
  type DocPage,
  type DocSource,
  type Neighbour,
  type NavGroup,
  type TocItem,
  compilePage,
  crumbsOf,
  navOf,
  neighbours,
  searchItemsOf,
  tocOf,
} from "./docs.ts";
import {
  type SearchItem,
  type SearchResult,
  searchView,
} from "../search-box/search-box.ts";
import pageView from "./docs-layout.pavlus";
import view from "./view.pavlus";

export interface DocsState {
  site: string;
  version: string;
  pages: DocPage[];
  items: SearchItem[];
  /** The id of the page being read. */
  current: string;
  /** The ids of the groups folded in the menu. */
  closed: string[];
  /** The menu as a drawer on a narrow screen. */
  menuOpen: boolean;
  query: string;
  searchOpen: boolean;
  results: SearchResult[];
  total: number;
  // derived from `current` and `closed`
  nav: NavGroup[];
  page: DocPage;
  toc: TocItem[];
  crumbs: Crumb[];
  prev: Neighbour | null;
  next: Neighbour | null;
}

/** Pure: the parts of the state that follow from the page and the folded groups. */
export function derive(
  pages: DocPage[],
  site: string,
  current: string,
  closed: string[],
): Pick<DocsState, "nav" | "page" | "toc" | "crumbs" | "prev" | "next"> {
  const page = pages.find((p) => p.id === current) ?? pages[0];
  return {
    nav: navOf(pages, page.id, closed),
    page,
    toc: tocOf(page),
    crumbs: crumbsOf(pages, page.id, site),
    ...neighbours(pages, page.id),
  };
}

/** Pure: the whole state of a docs site from its pages as written. */
export function docsState(
  site: string,
  version: string,
  sources: DocSource[],
  current: string = sources[0].id,
): DocsState {
  const pages = sources.map(compilePage);
  return {
    site,
    version,
    pages,
    items: searchItemsOf(pages),
    current,
    closed: [],
    menuOpen: false,
    query: "",
    searchOpen: false,
    results: [],
    total: 0,
    ...derive(pages, site, current, []),
  };
}

const replace = (patch: Partial<DocsState>): Effect[] =>
  Object.entries(patch).map(([k, v]) => store.set(k, v));

/** The docs layout with its own state: menu, search, page, contents, neighbours. */
export class DocsLayout extends Component<DocsState> {
  view = view;

  /** Opens a page: closes the menu and the search, and brings the title into view. */
  open(msg: Message, state: DocsState): Effect[] {
    const id = msg.payload as string;
    if (!state.pages.some((p) => p.id === id)) return [];
    return [
      ...replace({
        ...derive(state.pages, state.site, id, state.closed),
        current: id,
        menuOpen: false,
        query: "",
        searchOpen: false,
        results: [],
        total: 0,
      }),
      dom.focus("#dl-title"),
    ];
  }

  "runs.open"(msg: Message, state: DocsState): Effect[] {
    return this.open(msg, state);
  }

  /** A link of the table of contents: focus the heading, the browser scrolls to it. */
  jump(msg: Message): Effect[] {
    return [dom.focus(`#${msg.payload as string}`)];
  }

  toggleGroup(msg: Message, state: DocsState): Effect[] {
    const id = msg.payload as string;
    const closed = state.closed.includes(id)
      ? state.closed.filter((x) => x !== id)
      : [...state.closed, id];
    return replace({
      closed,
      ...derive(state.pages, state.site, state.current, closed),
    });
  }

  toggleMenu(_msg: Message, state: DocsState): Effect[] {
    return [store.set("menuOpen", !state.menuOpen)];
  }

  "search.setQuery"(msg: Message, state: DocsState): Effect[] {
    const v = searchView(state.items, String(msg.event?.value ?? ""));
    return replace({
      query: v.query,
      searchOpen: v.open,
      results: v.results,
      total: v.total,
    });
  }

  "search.clear"(): Effect[] {
    return replace({ query: "", searchOpen: false, results: [], total: 0 });
  }

  "search.pick"(msg: Message, state: DocsState): Effect[] {
    return this.open(msg, state);
  }

  "search.key"(msg: Message, state: DocsState): Effect[] {
    const key = msg.event?.key;
    if (key === "Escape") return [store.set("searchOpen", false)];
    if (key === "Enter" && state.searchOpen && state.results[0]) {
      return this.open({ ...msg, payload: state.results[0].id }, state);
    }
    return [];
  }
}

export const docsLayout = new DocsLayout();

const SAMPLE: DocSource[] = [
  {
    id: "welcome",
    title: "Welcome",
    group: "Start here",
    summary: "What this little library does, in one minute.",
    body: `## Why Fennel

Fennel checks that data has the shape you expect. You describe a **schema** once and use it to \`parse\` input and to get the TypeScript type.

> [!TIP] Small on purpose
> The whole library is under 4 kB and has no dependencies.

## A first schema

\`\`\`ts user.ts
import { object, string, number } from "fennel";

const User = object({ name: string(), age: number().min(0) });
const user = User.parse(input);
\`\`\`
`,
  },
  {
    id: "install",
    title: "Installation",
    group: "Start here",
    summary: "Add Fennel to a project.",
    body: `## Install the package

\`\`\`sh
npm install fennel
\`\`\`

Fennel needs Node 20 or newer, or any modern browser.
`,
  },
  {
    id: "errors",
    title: "Parsing and errors",
    group: "Guides",
    summary: "What happens when the input is wrong.",
    body: `## Two ways to parse

| Method | On bad input |
| --- | --- |
| \`parse\` | throws a \`FennelError\` |
| \`safeParse\` | returns \`{ ok: false, issues }\` |

Read more about [installation](page:install).
`,
  },
];

export interface DocsPageState {
  docs: DocsState;
}

export const initial: DocsPageState = {
  docs: docsState("Fennel", "v2.1", SAMPLE),
};

/** The page of the block: the layout in its own state, under `docs`. */
export class DocsLayoutPage extends Component<DocsPageState> {
  view = pageView;
  children: Children<DocsPageState> = {
    docs: { component: docsLayout, key: "docs" },
  };
}

export const page = new DocsLayoutPage();
