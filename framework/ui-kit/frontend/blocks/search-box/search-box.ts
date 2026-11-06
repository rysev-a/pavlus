import { Component, type Effect, type Message } from "@pavlus/frontend";
import { storeEffector as store } from "@pavlus/frontend/plugins";
import view from "./search-box.pavlus";

/** Something to search: a page, with its text. */
export interface SearchItem {
  id: string;
  title: string;
  body: string;
  /** Shown under the title (the section of the docs). */
  group?: string;
}

/** A piece of text, and whether it is a match. */
export interface Segment {
  t: string;
  hit: boolean;
}

export interface SearchResult {
  id: string;
  group: string;
  titleSegs: Segment[];
  snippetSegs: Segment[];
  score: number;
}

export interface SearchView {
  query: string;
  /** Show the panel of results. */
  open: boolean;
  results: SearchResult[];
  total: number;
}

const escapeRe = (s: string): string =>
  s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Pure: the words of a query, lower case, without duplicates and empty ones. */
export function termsOf(query: string): string[] {
  return [...new Set(query.toLowerCase().split(/\s+/).filter(Boolean))];
}

/** Pure: `text` cut into pieces, the ones that contain a term marked as hits. */
export function highlight(text: string, terms: string[]): Segment[] {
  if (!text) return [];
  if (terms.length === 0) return [{ t: text, hit: false }];
  const re = new RegExp(
    `(${[...terms]
      .sort((a, b) => b.length - a.length)
      .map(escapeRe)
      .join("|")})`,
    "gi",
  );
  const segments: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    const at = m.index ?? 0;
    if (at > last) segments.push({ t: text.slice(last, at), hit: false });
    segments.push({ t: m[0], hit: true });
    last = at + m[0].length;
  }
  if (last < text.length) segments.push({ t: text.slice(last), hit: false });
  return segments;
}

/** Pure: a short piece of `body` around the first match (the start when nothing matches). */
export function snippetOf(body: string, terms: string[], radius = 70): string {
  const flat = body.replace(/\s+/g, " ").trim();
  const lower = flat.toLowerCase();
  let at = -1;
  for (const t of terms) {
    const i = lower.indexOf(t);
    if (i !== -1 && (at === -1 || i < at)) at = i;
  }
  if (at === -1) {
    return flat.length > radius * 2 ? `${flat.slice(0, radius * 2)}…` : flat;
  }
  const from = Math.max(0, at - radius);
  const to = Math.min(flat.length, at + radius);
  return `${from > 0 ? "…" : ""}${flat.slice(from, to).trim()}${to < flat.length ? "…" : ""}`;
}

const countOf = (haystack: string, needle: string): number => {
  let n = 0;
  for (
    let i = haystack.indexOf(needle);
    i !== -1;
    i = haystack.indexOf(needle, i + needle.length)
  )
    n++;
  return n;
};

/**
 * Pure: the items that contain every word of the query in their title or
 * body. A word in the title counts more than one in the text; the best come
 * first (ties by title).
 */
export function searchItems(
  items: SearchItem[],
  query: string,
  limit = 8,
): SearchResult[] {
  const terms = termsOf(query);
  if (terms.length === 0) return [];
  const results: SearchResult[] = [];
  for (const item of items) {
    const title = item.title.toLowerCase();
    const body = item.body.toLowerCase();
    let score = 0;
    let all = true;
    for (const t of terms) {
      const inTitle = title.includes(t);
      const inBody = countOf(body, t);
      if (!inTitle && inBody === 0) {
        all = false;
        break;
      }
      if (inTitle) score += title === t ? 30 : title.startsWith(t) ? 20 : 12;
      score += Math.min(inBody, 5);
    }
    if (!all) continue;
    results.push({
      id: item.id,
      group: item.group ?? "",
      titleSegs: highlight(item.title, terms),
      snippetSegs: highlight(snippetOf(item.body, terms), terms),
      score,
    });
  }
  const titleOf = (id: string) => items.find((i) => i.id === id)?.title ?? "";
  results.sort(
    (a, b) => b.score - a.score || titleOf(a.id).localeCompare(titleOf(b.id)),
  );
  return results.slice(0, limit);
}

/** Pure: what the box shows for a query: results, and whether the panel is open. */
export function searchView(
  items: SearchItem[],
  query: string,
  limit = 8,
): SearchView {
  const all = termsOf(query).length > 0;
  return {
    query,
    open: all,
    results: searchItems(items, query, limit),
    total: all ? searchItems(items, query, items.length).length : 0,
  };
}

export interface SearchBoxState {
  items: SearchItem[];
  query: string;
  open: boolean;
  results: SearchResult[];
  total: number;
  picked: string;
}

const items: SearchItem[] = [
  {
    id: "install",
    group: "Getting started",
    title: "Installation",
    body: "Install the package with npm, pnpm or yarn. Fennel needs Node 20 or newer and has no runtime dependencies.",
  },
  {
    id: "schemas",
    group: "Guides",
    title: "Schemas",
    body: "A schema describes the shape of a value. Build one from primitives, then compose objects, arrays and unions out of them.",
  },
  {
    id: "errors",
    group: "Guides",
    title: "Parsing and errors",
    body: "parse returns the typed value or throws. safeParse returns a result you can check. Every issue has a path and a message.",
  },
  {
    id: "rules",
    group: "Guides",
    title: "Custom rules",
    body: "Add your own rule to any schema with check. A rule is a pure function that returns an error message or nothing.",
  },
];

const start = searchView(items, "");

export const initial: SearchBoxState = { items, ...start, picked: "" };

/** The page owns the query; the box sends `search.setQuery`, `search.clear`, `search.pick`, `search.key`. */
export class SearchBoxPage extends Component<SearchBoxState> {
  view = view;

  "search.setQuery"(msg: Message, state: SearchBoxState): Effect[] {
    const v = searchView(state.items, String(msg.event?.value ?? ""));
    return [
      store.set("query", v.query),
      store.set("open", v.open),
      store.set("results", v.results),
      store.set("total", v.total),
    ];
  }

  "search.clear"(): Effect[] {
    return [
      store.set("query", ""),
      store.set("open", false),
      store.set("results", []),
      store.set("total", 0),
    ];
  }

  "search.pick"(msg: Message, state: SearchBoxState): Effect[] {
    const title = state.items.find((i) => i.id === msg.payload)?.title ?? "";
    return [store.set("picked", title), store.set("open", false)];
  }

  "search.key"(msg: Message, state: SearchBoxState): Effect[] {
    const key = msg.event?.key;
    if (key === "Escape") return [store.set("open", false)];
    if (key === "Enter" && state.results[0]) {
      return [
        store.set(
          "picked",
          state.items.find((i) => i.id === state.results[0].id)?.title ?? "",
        ),
        store.set("open", false),
      ];
    }
    return [];
  }
}

export const page = new SearchBoxPage();
