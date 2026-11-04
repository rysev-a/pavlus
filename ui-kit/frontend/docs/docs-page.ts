import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import {
  domEffector as dom,
  routerEffector as router,
  storeEffector as store,
} from "@service-laboratory/pavlus/plugins";
import type { DemoView } from "./demo.ts";
import view from "./docs.pavlus";
import {
  docPath,
  type Lang,
  LANG_NAMES,
  LANGS,
  type Neighbour,
  neighbours,
  pageInfo,
  slugOf,
} from "./pages.ts";
import { PLAYGROUND_STATE, PLAYGROUND_TEMPLATE } from "./playground.ts";
import { docsEffector, type DocView } from "./plugin.ts";
import { UI, type Ui } from "./ui.ts";

/** The state of the Docs page, under `docs` in the shell's state. */
export interface DocsState {
  lang: Lang;
  ui: Ui;
  langs: { code: Lang; name: string }[];
  slug: string;
  title: string;
  summary: string;
  prev: Neighbour | null;
  next: Neighbour | null;
  doc: DocView | null;
  status: "idle" | "loading" | "failed" | "ready";
  pgTemplate: string;
  pgState: string;
  pgView: DemoView | null;
  pgError: string;
  /** Set by the router (the route this page is shown for). */
  route?: { path: string };
  /** The base path of the site, passed in by the shell. */
  root?: string;
}

export function docsState(lang: Lang): DocsState {
  return {
    lang,
    ui: UI[lang],
    langs: LANGS.map((code) => ({ code, name: LANG_NAMES[code] })),
    slug: "overview",
    title: "",
    summary: "",
    prev: null,
    next: null,
    doc: null,
    status: "idle",
    pgTemplate: PLAYGROUND_TEMPLATE,
    pgState: PLAYGROUND_STATE,
    pgView: null,
    pgError: "",
  };
}

/**
 * The Docs: every `/docs/<slug>` route is this component. It loads the page
 * (a Markdown file of the language, with its demos compiled) through the docs
 * plugin, keeps the language, and runs the playground.
 */
export class DocsPage extends Component<DocsState> {
  view = view;

  /** The route shows this page: load it. */
  enter(msg: Message, state: DocsState): Effect[] {
    // the payload is the route of this page: its base is the pattern matched
    const r = msg.payload as { base?: string; path?: string };
    const full = `${r.base ?? ""}${r.path && r.path !== "/" ? r.path : ""}`;
    return this._open(slugOf(full || "/docs"), state.lang);
  }

  _open(slug: string, lang: Lang): Effect[] {
    const { prev, next } = neighbours(slug, lang);
    return [
      store.set("slug", slug),
      store.set("title", pageInfo(slug)?.title[lang] ?? ""),
      store.set("summary", ""),
      store.set("prev", prev),
      store.set("next", next),
      store.set("doc", null),
      store.set("status", "loading"),
      docsEffector.load(slug, lang, "docLoaded", "docFailed"),
    ];
  }

  docLoaded(msg: Message, state: DocsState): Effect[] {
    const doc = msg.payload as DocView;
    // an answer for a page or a language the visitor has already left
    if (doc.slug !== state.slug || doc.lang !== state.lang) return [];
    return [
      store.set("doc", doc),
      store.set("summary", doc.summary),
      store.set("status", "ready"),
      dom.focus("#docs-title"),
    ];
  }

  docFailed(): Effect[] {
    return [store.set("status", "failed")];
  }

  setLang(msg: Message, state: DocsState): Effect[] {
    const lang = msg.payload as Lang;
    if (!LANGS.includes(lang) || lang === state.lang) return [];
    return [
      store.set("lang", lang),
      store.set("ui", UI[lang]),
      docsEffector.remember(lang),
      ...this._open(state.slug, lang),
    ];
  }

  /** A link to another page: the pager, or a link inside the text. */
  openDoc(msg: Message): Effect[] {
    return [router.navigate(docPath(String(msg.payload)))];
  }

  "runs.open"(msg: Message): Effect[] {
    return this.openDoc(msg);
  }

  /** A link of the table of contents: focus the heading, the browser scrolls to it. */
  jump(msg: Message): Effect[] {
    return [dom.focus(`#${String(msg.payload)}`)];
  }

  /** The playground: the editors, Run, Reset and the compiler's answer. */
  pgInput(msg: Message): Effect[] {
    const value = String(msg.event?.value ?? "");
    return [store.set(msg.payload === "state" ? "pgState" : "pgTemplate", value)];
  }

  pgRun(_msg: Message, state: DocsState): Effect[] {
    return [docsEffector.run(state.pgTemplate, state.pgState, "pgDone")];
  }

  pgReset(): Effect[] {
    return [
      store.set("pgTemplate", PLAYGROUND_TEMPLATE),
      store.set("pgState", PLAYGROUND_STATE),
      store.set("pgView", null),
      store.set("pgError", ""),
    ];
  }

  pgDone(msg: Message): Effect[] {
    const r = msg.payload as { stateError: string; view: DemoView | null };
    return [store.set("pgError", r.stateError), store.set("pgView", r.view)];
  }
}

export const docsPage = new DocsPage();
