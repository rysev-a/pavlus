/**
 * The pure logic of the "Posts" section (the blog): searching and filtering the
 * articles, the cards the blocks show, the article form and its validation,
 * and the permissions. Nothing here touches the state or the page.
 */
import { byId, nextId, when } from "../../core.ts";
import { glyphOf, initialsOf, isUpload, pictureStyle } from "../../pictures.ts";
import type { Article, Db, User } from "../../schema.ts";
import { isStaff, PICTURES, toggleId } from "../wall/posts.ts";

export const BLOG_PAGE = 6;
export const TAG_CHIPS = 12;
export const MIN_BODY = 20;
export const MAX_TAGS = 8;

// ---- caches (one per `db.articles` array) ----

interface Sorted {
  list: Article[];
  hay: string[];
  tags: { tag: string; count: number }[];
}
const caches = new WeakMap<Article[], Sorted>();

function sortedOf(articles: Article[]): Sorted {
  let c = caches.get(articles);
  if (!c) {
    const list = [...articles].sort((a, b) =>
      a.createdAt < b.createdAt
        ? 1
        : a.createdAt > b.createdAt
          ? -1
          : b.id - a.id,
    );
    const counts = new Map<string, number>();
    for (const a of list)
      for (const t of a.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    c = {
      list,
      hay: list.map((a) =>
        `${a.title}\n${a.body}\n${a.tags.join(" ")}`.toLowerCase(),
      ),
      tags: [...counts]
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag)),
    };
    caches.set(articles, c);
  }
  return c;
}

/** The twelve most used tags. */
export const topTags = (db: Db): { tag: string; count: number }[] =>
  sortedOf(db.articles).tags.slice(0, TAG_CHIPS);

export interface Filters {
  query: string;
  tag: string;
  mine: boolean;
}

/** The articles that match the search text, the tag and "my posts", newest first. */
export function filterArticles(db: Db, me: number, f: Filters): Article[] {
  const { list, hay } = sortedOf(db.articles);
  const q = f.query.trim().toLowerCase();
  if (!q && !f.tag && !f.mine) return list;
  const out: Article[] = [];
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (f.mine && a.authorId !== me) continue;
    if (f.tag && !a.tags.includes(f.tag)) continue;
    if (q && !hay[i].includes(q)) continue;
    out.push(a);
  }
  return out;
}

// ---- rules ----

export const canEditArticle = (me: number, a: Article): boolean =>
  me > 0 && a.authorId === me;

/** The author, and the moderators and administrators. */
export const canDeleteArticle = (db: Db, me: number, a: Article): boolean =>
  canEditArticle(me, a) || (me > 0 && isStaff(byId(db.users).get(me)));

export const toggleArticleLike = (a: Article, me: number): Article =>
  me > 0 ? { ...a, likeIds: toggleId(a.likeIds, me) } : a;

// ---- the form ----

export interface ArticleForm {
  /** 0 for a new article */
  id: number;
  title: string;
  tagsText: string;
  body: string;
  cover: string;
  errors: { title: string; body: string };
}

export const emptyForm = (): ArticleForm => ({
  id: 0,
  title: "",
  tagsText: "",
  body: "",
  cover: PICTURES[0],
  errors: { title: "", body: "" },
});

export const formOf = (a: Article): ArticleForm => ({
  id: a.id,
  title: a.title,
  tagsText: a.tags.join(", "),
  body: a.body,
  cover: a.cover,
  errors: { title: "", body: "" },
});

/** `Travel, art,  travel` as `["travel", "art"]` (lowercase, no repeats, at most eight). */
export function parseTags(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(",")) {
    const t = raw.trim().toLowerCase().replace(/\s+/g, "-").replace(/^#/, "");
    if (t && !out.includes(t)) out.push(t.slice(0, 24));
  }
  return out.slice(0, MAX_TAGS);
}

export function validateArticle(f: ArticleForm): {
  title: string;
  body: string;
} {
  return {
    title: f.title.trim()
      ? f.title.trim().length > 120
        ? "At most 120 characters"
        : ""
      : "The title is required",
    body:
      f.body.trim().length >= MIN_BODY
        ? ""
        : `Write at least ${MIN_BODY} characters (${f.body.trim().length} so far)`,
  };
}

/** The row a valid form makes: a new article, or the edited one (only its author may edit). */
export function saveArticle(
  db: Db,
  me: number,
  f: ArticleForm,
  now: string,
): { article?: Article; errors: ArticleForm["errors"] } {
  const errors = validateArticle(f);
  if (errors.title || errors.body) return { errors };
  const fields = {
    title: f.title.trim(),
    body: f.body.trim(),
    tags: parseTags(f.tagsText),
    cover: f.cover,
  };
  if (f.id > 0) {
    const old = byId(db.articles).get(f.id);
    if (!old || !canEditArticle(me, old))
      return { errors: { title: "You cannot edit this article", body: "" } };
    return { article: { ...old, ...fields }, errors };
  }
  if (me <= 0) return { errors: { title: "Sign in first", body: "" } };
  return {
    article: {
      id: nextId(db.articles),
      authorId: me,
      ...fields,
      createdAt: now,
      likeIds: [],
    },
    errors,
  };
}

// ---- the views ----

export interface ArticleCard {
  id: number;
  title: string;
  excerpt: string;
  coverStyle: string;
  coverGlyph: string;
  authorId: number;
  authorName: string;
  avatarStyle: string;
  avatarText: string;
  when: string;
  tags: string[];
  likes: number;
  liked: boolean;
}

export interface ArticleReaderView extends ArticleCard {
  paragraphs: string[];
  canEdit: boolean;
  canDelete: boolean;
}

export function excerptOf(body: string, max = 150): string {
  const flat = body.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max).replace(/\s+\S*$/, "")}...`;
}

const avatarText = (u: User | undefined): string =>
  u && !isUpload(u.avatar) ? glyphOf(u.avatar) || initialsOf(u.name) : "";

export function cardOf(
  db: Db,
  me: number,
  a: Article,
  now: string,
): ArticleCard {
  const author = byId(db.users).get(a.authorId);
  return {
    id: a.id,
    title: a.title,
    excerpt: excerptOf(a.body),
    coverStyle: pictureStyle(a.cover),
    coverGlyph: isUpload(a.cover) ? "" : glyphOf(a.cover),
    authorId: a.authorId,
    authorName: author?.name ?? "Deleted user",
    avatarStyle: author
      ? pictureStyle(author.avatar)
      : "background: var(--muted)",
    avatarText: avatarText(author),
    when: when(a.createdAt, now),
    tags: a.tags,
    likes: a.likeIds.length,
    liked: a.likeIds.includes(me),
  };
}

export function readerOf(
  db: Db,
  me: number,
  a: Article,
  now: string,
): ArticleReaderView {
  return {
    ...cardOf(db, me, a, now),
    paragraphs: a.body
      .split(/\n+/)
      .map((p) => p.trim())
      .filter(Boolean),
    canEdit: canEditArticle(me, a),
    canDelete: canDeleteArticle(db, me, a),
  };
}
