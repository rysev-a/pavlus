/**
 * The "blog" module (the screen is titled "Posts"): a list of articles with search, tag
 * chips, "My posts" and pages; an article page; and a form to write, edit and delete
 * my own articles. The rules and the cards are in articles.ts.
 */
import {
  byId,
  type Handler,
  type Module,
  type OrbitState,
  type Update,
} from "../../core.ts";
import { glyphOf, pictureStyle } from "../../pictures.ts";
import { type PagerView, pagerView, PICTURES } from "../wall/posts.ts";
import {
  type ArticleCard,
  type ArticleForm,
  type ArticleReaderView,
  BLOG_PAGE,
  cardOf,
  canDeleteArticle,
  emptyForm,
  filterArticles,
  formOf,
  MIN_BODY,
  readerOf,
  saveArticle,
  toggleArticleLike,
  topTags,
} from "./articles.ts";

export type BlogMode = "list" | "read" | "form";

export interface FormView {
  heading: string;
  saveLabel: string;
  editing: boolean;
  title: string;
  tagsText: string;
  body: string;
  errors: { title: string; body: string };
  bodyCount: string;
  covers: { i: number; style: string; glyph: string; selected: boolean }[];
}

export interface BlogState {
  mode: BlogMode;
  query: string;
  tag: string;
  mine: boolean;
  page: number;
  articleId: number;
  form: ArticleForm;
  // derived
  chips: { tag: string; label: string; active: boolean }[];
  cards: ArticleCard[];
  pager: PagerView;
  total: number;
  empty: string;
  filtersOn: boolean;
  canWrite: boolean;
  reader: ArticleReaderView | null;
  formView: FormView;
}

const NO_PAGER: PagerView = {
  page: 1,
  pages: 1,
  total: 0,
  label: "0 articles",
  hasPrev: false,
  hasNext: false,
  prevLabel: "Previous",
  nextLabel: "Next",
};
const NO_FORM: FormView = {
  heading: "",
  saveLabel: "",
  editing: false,
  title: "",
  tagsText: "",
  body: "",
  errors: { title: "", body: "" },
  bodyCount: "",
  covers: [],
};

export const initialBlog = (): BlogState => ({
  mode: "list",
  query: "",
  tag: "",
  mine: false,
  page: 1,
  articleId: 0,
  form: emptyForm(),
  chips: [],
  cards: [],
  pager: NO_PAGER,
  total: 0,
  empty: "",
  filtersOn: false,
  canWrite: false,
  reader: null,
  formView: NO_FORM,
});

export function formView(f: ArticleForm): FormView {
  const len = f.body.trim().length;
  return {
    heading: f.id > 0 ? "Edit the article" : "Write an article",
    saveLabel: f.id > 0 ? "Save changes" : "Publish",
    editing: f.id > 0,
    title: f.title,
    tagsText: f.tagsText,
    body: f.body,
    errors: f.errors,
    bodyCount:
      len >= MIN_BODY
        ? `${len} characters`
        : `${len} of at least ${MIN_BODY} characters`,
    covers: PICTURES.map((src, i) => ({
      i,
      style: pictureStyle(src),
      glyph: glyphOf(src),
      selected: src === f.cover,
    })),
  };
}

function derive(state: OrbitState): BlogState {
  const s = state.blog;
  const { db, me } = state;
  const found = filterArticles(db, me, {
    query: s.query,
    tag: s.tag,
    mine: s.mine,
  });
  const pager = pagerView(
    s.page,
    BLOG_PAGE,
    found.length,
    found.length === 1 ? "article" : "articles",
    ["Previous", "Next"],
  );
  const rows = found.slice(
    (pager.page - 1) * BLOG_PAGE,
    pager.page * BLOG_PAGE,
  );
  const open =
    s.mode === "read" ? byId(db.articles).get(s.articleId) : undefined;
  const filtersOn = s.query.trim() !== "" || s.tag !== "" || s.mine;
  // an article that is gone (deleted elsewhere) sends the page back to the list
  const mode: BlogMode = s.mode === "read" && !open ? "list" : s.mode;
  return {
    ...s,
    mode,
    page: pager.page,
    chips: topTags(db).map((t) => ({
      tag: t.tag,
      label: `#${t.tag} ${t.count}`,
      active: t.tag === s.tag,
    })),
    cards: rows.map((a) => cardOf(db, me, a, state.now)),
    pager,
    total: found.length,
    empty: filtersOn
      ? "No articles match. Clear the filters to see everything."
      : "No articles yet. Write the first one.",
    filtersOn,
    canWrite: me > 0,
    reader: open ? readerOf(db, me, open, state.now) : null,
    formView: mode === "form" ? formView(s.form) : NO_FORM,
  };
}

const text = (e: { value?: string } | undefined): string =>
  String(e?.value ?? "");
const list = (): Update => ({ slice: { mode: "list", articleId: 0 } });

/** Likes an article (list and page). */
function like(id: unknown, s: OrbitState): Update | void {
  const a = byId(s.db.articles).get(Number(id));
  if (!a || s.me <= 0) return;
  return { put: { articles: [toggleArticleLike(a, s.me)] } };
}

function removeArticle(id: unknown, s: OrbitState): Update {
  const a = byId(s.db.articles).get(Number(id));
  if (!a || !canDeleteArticle(s.db, s.me, a))
    return { notice: "You cannot delete this article" };
  return {
    remove: { articles: [a.id] },
    slice: { mode: "list", articleId: 0, form: emptyForm() },
    notice: "Article deleted",
  };
}

const filter = (patch: Partial<BlogState>): Update => ({
  slice: { page: 1, mode: "list", ...patch },
});

const handlers: Record<string, Handler> = {
  search: (_p, e) => filter({ query: text(e) }),
  tag: (t, _e, s) => filter({ tag: s.blog.tag === t ? "" : String(t) }),
  "card.tag": (t, _e, s) => filter({ tag: s.blog.tag === t ? "" : String(t) }),
  "reader.tag": (t) => filter({ tag: String(t) }),
  toggleMine: (_p, _e, s) => filter({ mine: !s.blog.mine }),
  clear: () => filter({ query: "", tag: "", mine: false }),
  "pager.prev": (_p, _e, s) => ({
    slice: { page: Math.max(1, s.blog.page - 1) },
  }),
  "pager.next": (_p, _e, s) => ({ slice: { page: s.blog.page + 1 } }),

  "card.open": (id) => ({ slice: { mode: "read", articleId: Number(id) } }),
  "card.author": (id) => ({
    go: { screen: "wall", params: { userId: Number(id) } },
  }),
  "card.like": (id, _e, s) => like(id, s),
  "reader.back": () => list(),
  "reader.author": (id) => ({
    go: { screen: "wall", params: { userId: Number(id) } },
  }),
  "reader.like": (id, _e, s) => like(id, s),
  "reader.edit": (id, _e, s) => {
    const a = byId(s.db.articles).get(Number(id));
    if (!a || a.authorId !== s.me)
      return { notice: "Only the author can edit this article" };
    return { slice: { mode: "form", form: formOf(a) } };
  },
  "reader.remove": (id, _e, s) => removeArticle(id, s),

  create: (_p, _e, s) =>
    s.me > 0 ? { slice: { mode: "form", form: emptyForm() } } : undefined,
  setTitle: (_p, e, s) => ({
    slice: {
      form: {
        ...s.blog.form,
        title: text(e),
        errors: { ...s.blog.form.errors, title: "" },
      },
    },
  }),
  setTags: (_p, e, s) => ({
    slice: { form: { ...s.blog.form, tagsText: text(e) } },
  }),
  setBody: (_p, e, s) => ({
    slice: {
      form: {
        ...s.blog.form,
        body: text(e),
        errors: { ...s.blog.form.errors, body: "" },
      },
    },
  }),
  pickCover: (i, _e, s) => ({
    slice: {
      form: { ...s.blog.form, cover: PICTURES[Number(i)] ?? s.blog.form.cover },
    },
  }),
  save: (_p, _e, s) => {
    const r = saveArticle(s.db, s.me, s.blog.form, s.now);
    if (!r.article)
      return { slice: { form: { ...s.blog.form, errors: r.errors } } };
    return {
      put: { articles: [r.article] },
      slice: { mode: "read", articleId: r.article.id, form: emptyForm() },
      notice: s.blog.form.id > 0 ? "Article saved" : "Article published",
    };
  },
  cancel: (_p, _e, s) => ({
    slice:
      s.blog.form.id > 0
        ? { mode: "read", articleId: s.blog.form.id, form: emptyForm() }
        : { mode: "list", form: emptyForm() },
  }),
  removeArticle: (_p, _e, s) => removeArticle(s.blog.form.id, s),
};

export const blogModule: Module<BlogState> = {
  key: "blog",
  screens: ["blog"],
  initial: initialBlog,
  derive,
  enter: (params) => {
    const id = Number(params?.articleId) || 0;
    return {
      slice: { ...initialBlog(), mode: id ? "read" : "list", articleId: id },
    };
  },
  handlers,
};
