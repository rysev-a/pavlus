import { expect, test } from "vitest";
import type { Message } from "@service-laboratory/pavlus";
import type { OrbitState } from "../templates/orbit-social/core.ts";
import { initialState, page } from "../templates/orbit-social/orbit-social.ts";
import { gradient } from "../templates/orbit-social/pictures.ts";
import {
  type Article,
  type Db,
  type User,
  emptyDb,
  NOW,
} from "../templates/orbit-social/schema.ts";
import { seedDb } from "../templates/orbit-social/seed.ts";
import { PICTURES } from "../templates/orbit-social/modules/wall/posts.ts";
import {
  BLOG_PAGE,
  excerptOf,
  filterArticles,
  parseTags,
  saveArticle,
  emptyForm,
  topTags,
  validateArticle,
} from "../templates/orbit-social/modules/blog/articles.ts";

/** Runs a message through the page and applies its `store.set` effects, like the store plugin. */
function send(
  state: OrbitState,
  id: string,
  payload?: unknown,
  event?: { value?: string; checked?: boolean },
): OrbitState {
  const effects = page.dispatch(
    {
      id,
      payload,
      event: event && { type: "input", value: "", ...event },
    } as Message,
    state,
  );
  const next = { ...state } as Record<string, unknown>;
  for (const e of effects) {
    const x = e as unknown as {
      plugin: string;
      type: string;
      path: string;
      value: unknown;
    };
    if (x.plugin === "store" && x.type === "set") next[x.path] = x.value;
  }
  return next as unknown as OrbitState;
}

const user = (id: number, name: string, role: User["role"] = "user"): User => ({
  id,
  name,
  email: `${name.toLowerCase()}@example.com`,
  passwordHash: "",
  role,
  status: "active",
  avatar: gradient(id * 50, id * 50 + 40, name.charAt(0)),
  about: "",
  city: "Lisbon",
  birthday: "1990-01-01",
  website: "",
  phone: "",
  interests: [],
  createdAt: "2025-01-01T10:00:00",
  lastSeen: NOW,
});

const article = (
  id: number,
  authorId: number,
  extra: Partial<Article> = {},
): Article => ({
  id,
  authorId,
  title: `Article ${id}`,
  body: `Body of the article number ${id}, long enough to count.\n\nSecond paragraph ${id}.`,
  tags: ["travel"],
  cover: PICTURES[id % PICTURES.length],
  createdAt: `2026-09-${String(1 + (id % 28)).padStart(2, "0")}T10:00:00`,
  likeIds: [],
  ...extra,
});

function world(articles: Article[]): Db {
  const db = emptyDb();
  db.users = [
    user(1, "Ann"),
    user(2, "Ben"),
    user(3, "Mia", "moderator"),
    user(4, "Root", "admin"),
  ];
  db.articles = articles;
  return db;
}

function openBlog(db: Db, me = 1): OrbitState {
  const s: OrbitState = {
    ...initialState(),
    db,
    me,
    status: "ready",
    view: "app",
    screen: "wall",
    now: NOW,
  };
  return send(s, "nav.go", "blog");
}

test("the list shows the newest articles first, six per page, with the twelve most used tags", () => {
  const list = Array.from({ length: 14 }, (_, i) =>
    article(i + 1, 1 + (i % 2), {
      tags: i < 13 ? [`tag${i}`] : ["travel", "food"],
      createdAt: `2026-09-01T10:${String(i).padStart(2, "0")}:00`,
    }),
  );
  const s = openBlog(world(list));
  expect(s.screen).toBe("blog");
  expect(BLOG_PAGE).toBe(6);
  expect(s.blog.cards.map((c) => c.id)).toEqual([14, 13, 12, 11, 10, 9]);
  expect(s.blog.pager).toMatchObject({
    page: 1,
    pages: 3,
    total: 14,
    hasNext: true,
    hasPrev: false,
  });
  expect(s.blog.chips).toHaveLength(12);
  expect(topTags(s.db)[0].count).toBe(1);
  const p2 = send(s, "blog.pager.next");
  expect(p2.blog.cards.map((c) => c.id)).toEqual([8, 7, 6, 5, 4, 3]);
  const p3 = send(send(p2, "blog.pager.next"), "blog.pager.next");
  expect(p3.blog.cards.map((c) => c.id)).toEqual([2, 1]);
  expect(p3.blog.page).toBe(3);
  expect(send(p3, "blog.pager.prev").blog.page).toBe(2);
});

test("search by title or text, filter by tag and by 'My posts'", () => {
  const db = world([
    article(1, 1, { title: "Walls of Lisbon", tags: ["art", "travel"] }),
    article(2, 2, {
      title: "Bread",
      body: "A long text about sourdough and the wall of flavour.",
      tags: ["food"],
    }),
    article(3, 2, { title: "Trains", tags: ["travel"] }),
  ]);
  let s = openBlog(db);
  s = send(s, "blog.search", undefined, { value: "WALL" });
  expect(s.blog.cards.map((c) => c.id).sort()).toEqual([1, 2]);
  s = send(s, "blog.search", undefined, { value: "" });
  s = send(s, "blog.tag", "travel");
  expect(s.blog.cards.map((c) => c.id).sort()).toEqual([1, 3]);
  expect(s.blog.chips.find((c) => c.tag === "travel")?.active).toBe(true);
  s = send(s, "blog.toggleMine");
  expect(s.blog.cards.map((c) => c.id)).toEqual([1]);
  expect(s.blog.filtersOn).toBe(true);
  s = send(s, "blog.card.tag", "travel"); // the same tag again clears it
  expect(s.blog.tag).toBe("");
  expect(s.blog.cards.map((c) => c.id)).toEqual([1]);
  s = send(s, "blog.clear");
  expect(s.blog.cards).toHaveLength(3);
  expect(
    filterArticles(db, 1, { query: "nothing", tag: "", mine: false }),
  ).toEqual([]);
  s = send(s, "blog.search", undefined, { value: "zzz" });
  expect(s.blog.cards).toEqual([]);
  expect(s.blog.empty).toMatch(/No articles match/);
});

test("opening an article shows the paragraphs; the author name opens the wall; back returns to the list", () => {
  const db = world([article(1, 2)]);
  let s = openBlog(db);
  s = send(s, "blog.card.open", 1);
  expect(s.blog.mode).toBe("read");
  expect(s.blog.reader?.paragraphs).toHaveLength(2);
  expect(s.blog.reader).toMatchObject({
    authorName: "Ben",
    canEdit: false,
    canDelete: false,
  });
  const wall = send(s, "blog.reader.author", 2);
  expect(wall.screen).toBe("wall");
  expect(wall.wall.header.title).toBe("Ben");
  s = send(s, "blog.reader.back");
  expect(s.blog.mode).toBe("list");
});

test("like toggles on the list and on the article page", () => {
  const db = world([article(1, 2)]);
  let s = openBlog(db);
  s = send(s, "blog.card.like", 1);
  expect(s.db.articles[0].likeIds).toEqual([1]);
  expect(s.blog.cards[0]).toMatchObject({ likes: 1, liked: true });
  s = send(s, "blog.card.open", 1);
  s = send(s, "blog.reader.like", 1);
  expect(s.db.articles[0].likeIds).toEqual([]);
  expect(s.blog.reader?.liked).toBe(false);
});

test("the form validates: a title is required and the text needs 20 characters", () => {
  const f = { ...emptyForm(), title: "  ", body: "short" };
  expect(validateArticle(f).title).toMatch(/required/);
  expect(validateArticle(f).body).toMatch(/at least 20/);
  expect(validateArticle({ ...f, title: "T", body: "x".repeat(20) })).toEqual({
    title: "",
    body: "",
  });
  let s = openBlog(world([]));
  s = send(s, "blog.create");
  expect(s.blog.mode).toBe("form");
  expect(s.blog.formView.covers).toHaveLength(12);
  s = send(s, "blog.save");
  expect(s.db.articles).toHaveLength(0);
  expect(s.blog.formView.errors.title).toMatch(/required/);
  expect(s.blog.formView.errors.body).toMatch(/at least 20/);
  // typing clears the message of that field
  s = send(s, "blog.setTitle", undefined, { value: "My trip" });
  expect(s.blog.formView.errors.title).toBe("");
  expect(s.blog.formView.errors.body).not.toBe("");
});

test("create: tags are comma separated, the cover is chosen, the new article opens", () => {
  expect(parseTags("Travel, art,  Food Truck ,travel, #Fun")).toEqual([
    "travel",
    "art",
    "food-truck",
    "fun",
  ]);
  let s = openBlog(world([]));
  s = send(s, "blog.create");
  s = send(s, "blog.setTitle", undefined, { value: "My trip" });
  s = send(s, "blog.setTags", undefined, { value: "Travel, Art" });
  s = send(s, "blog.setBody", undefined, {
    value: "A long enough text about the trip.\nAnother line.",
  });
  s = send(s, "blog.pickCover", 5);
  expect(s.blog.formView.covers[5].selected).toBe(true);
  s = send(s, "blog.save");
  expect(s.db.articles).toHaveLength(1);
  expect(s.db.articles[0]).toMatchObject({
    authorId: 1,
    title: "My trip",
    tags: ["travel", "art"],
    cover: PICTURES[5],
    createdAt: NOW,
    likeIds: [],
  });
  expect(s.blog.mode).toBe("read");
  expect(s.blog.reader?.title).toBe("My trip");
  // My posts now has it
  s = send(s, "blog.reader.back");
  s = send(s, "blog.toggleMine");
  expect(s.blog.cards.map((c) => c.title)).toEqual(["My trip"]);
});

test("edit keeps the article's id and author; only the author may edit", () => {
  const db = world([article(1, 1), article(2, 2)]);
  let s = openBlog(db);
  s = send(s, "blog.card.open", 2);
  const denied = send(s, "blog.reader.edit", 2);
  expect(denied.blog.mode).toBe("read");
  expect(
    saveArticle(
      db,
      1,
      { ...emptyForm(), id: 2, title: "Hacked", body: "x".repeat(30) },
      NOW,
    ).article,
  ).toBeUndefined();
  s = send(s, "blog.reader.back");
  s = send(s, "blog.card.open", 1);
  s = send(s, "blog.reader.edit", 1);
  expect(s.blog.mode).toBe("form");
  expect(s.blog.formView).toMatchObject({
    editing: true,
    title: "Article 1",
    tagsText: "travel",
  });
  s = send(s, "blog.setTitle", undefined, { value: "Renamed" });
  s = send(s, "blog.save");
  expect(s.db.articles.find((a) => a.id === 1)).toMatchObject({
    title: "Renamed",
    authorId: 1,
    createdAt: db.articles[0].createdAt,
  });
  expect(s.db.articles).toHaveLength(2);
  expect(s.blog.mode).toBe("read");
  // cancel from an edit goes back to the article
  s = send(s, "blog.reader.edit", 1);
  s = send(s, "blog.cancel");
  expect(s.blog.mode).toBe("read");
});

test("delete: the author deletes their own, moderators and admins any, others none", () => {
  const db = world([article(1, 1), article(2, 2)]);
  let s = openBlog(db);
  s = send(s, "blog.card.open", 2);
  expect(s.blog.reader?.canDelete).toBe(false);
  expect(send(s, "blog.reader.remove", 2).db.articles).toHaveLength(2);
  s = send(s, "blog.reader.back");
  s = send(s, "blog.card.open", 1);
  expect(s.blog.reader?.canDelete).toBe(true);
  s = send(s, "blog.reader.remove", 1);
  expect(s.db.articles.map((a) => a.id)).toEqual([2]);
  expect(s.blog.mode).toBe("list");
  for (const staff of [3, 4]) {
    const t = send(openBlog(db, staff), "blog.card.open", 1);
    expect(t.blog.reader).toMatchObject({ canDelete: true, canEdit: false });
    expect(
      send(t, "blog.reader.remove", 1).db.articles.map((a) => a.id),
    ).toEqual([2]);
  }
  // from the edit form
  let f = send(send(openBlog(db), "blog.card.open", 1), "blog.reader.edit", 1);
  f = send(f, "blog.removeArticle");
  expect(f.db.articles.map((a) => a.id)).toEqual([2]);
});

test("excerpt, and an article that vanishes sends the page back to the list", () => {
  expect(excerptOf("short")).toBe("short");
  expect(excerptOf("word ".repeat(60)).endsWith("...")).toBe(true);
  expect(excerptOf("word ".repeat(60)).length).toBeLessThan(160);
  const db = world([article(1, 2)]);
  const s = send(openBlog(db), "blog.card.open", 1);
  const gone = send(
    { ...s, db: { ...s.db, articles: [] } },
    "blog.reader.back",
  );
  expect(gone.blog.mode).toBe("list");
});

test("on the real sample data the list, a search and an article derive", () => {
  const db = seedDb();
  expect(db.articles.length).toBeGreaterThan(0);
  const me = db.users.find((u) => u.role === "user")!.id;
  let s = openBlog(db, me);
  expect(s.blog.cards).toHaveLength(BLOG_PAGE);
  expect(s.blog.chips.length).toBeGreaterThan(0);
  s = send(s, "blog.tag", s.blog.chips[0].tag);
  expect(s.blog.cards.length).toBeGreaterThan(0);
  for (const c of s.blog.cards) expect(c.tags).toContain(s.blog.tag);
  s = send(s, "blog.card.open", s.blog.cards[0].id);
  expect(s.blog.reader?.paragraphs.length).toBeGreaterThan(0);
});
