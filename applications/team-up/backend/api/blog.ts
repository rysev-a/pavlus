// The blog (api): the public blog of the original teamUP — the list of the
// posts (with the tag filter and the order) and one post on its own page.
//
// The chips of the tags are built from ALL the posts, not from the filtered
// ones (the original's `routes.rs` does the same), and the order links keep
// the tag that is on.

import {
  type HttpReq,
  httpEffector,
  oneOf,
  requestsEffector,
  rowsOf,
  type ServerState,
} from "@pavlus/backend";
import type { Effect, Message } from "@pavlus/core";
import { BlogService, type PostRow } from "../db/services/blog-service.ts";
import { type Locale, localeOf, Tr } from "../i18n/mod.ts";
import { excerpt, formatDate } from "../lib/views.ts";

/** The first letter of a chip label upper-case (the tags are lower-cased in
 * the address, but shown as they are written). */
function capitalize(text: string): string {
  const first = text.charAt(0);
  return first ? first.toUpperCase() + text.slice(1) : text;
}

/** The card of a post (the list and the landing page). */
function cardOf(tr: Tr, post: PostRow) {
  return {
    pid: post.pid,
    date: formatDate(tr, post.date),
    title: post.title,
    excerpt: excerpt(post.content, 200),
    tags: post.tags ?? [],
  };
}

/** The text of a post, split at the blank lines: one paragraph each. */
function paragraphsOf(content: string): string[] {
  return content
    .split("\n\n")
    .map((p) => p.trim())
    .filter((p) => p !== "");
}

/** The language the request parked (the db reply carries the rows). */
const localeOfSlice = (message: Message, state: ServerState): Locale => {
  const rid = message.ctx?.rid;
  const slice = state.requests[typeof rid === "string" ? rid : ""] ?? {};
  return (slice.locale as Locale | undefined) ?? "en";
};

export class BlogAPI {
  /** GET /api/public/blog — the list of the posts. */
  "blog.list"(message: Message): Effect[] {
    const req = message.payload as HttpReq;
    return [requestsEffector.set("locale", localeOf(req)), BlogService.all()];
  }

  "blog.rows.onSuccess"(message: Message, state: ServerState): Effect[] {
    const tr = new Tr(localeOfSlice(message, state));
    const query = (message.payload as HttpReq).query ?? {};
    const tag = String(query.tag ?? "").trim();
    const sort = String(query.sort ?? "");
    const oldest = sort === "oldest";
    const all = rowsOf<PostRow>(message);
    // the chips are built from every post
    const tags = [
      ...new Set(
        all.flatMap((p) => (p.tags ?? []).map((t) => t.toLowerCase())),
      ),
    ].sort();
    const posts = all
      .filter((p) =>
        tag === ""
          ? true
          : (p.tags ?? []).some((t) => t.toLowerCase() === tag.toLowerCase()),
      )
      .sort((a, b) =>
        oldest ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date),
      );
    const sortQs = oldest ? "&sort=oldest" : "";
    const tagLinks = tags.map((title) => ({
      title: capitalize(title),
      href:
        title === tag.toLowerCase()
          ? "/blog"
          : `/blog?tag=${encodeURIComponent(title)}${sortQs}`,
      active: title === tag.toLowerCase(),
    }));
    const base = tag === "" ? "/blog" : `/blog?tag=${encodeURIComponent(tag)}`;
    const sorts = [
      {
        title: tr.tr("Newest first"),
        href: oldest
          ? base
          : tag === ""
            ? "/blog?sort=newest"
            : `${base}&sort=newest`,
        active: !oldest,
      },
      {
        title: tr.tr("Oldest first"),
        href: oldest
          ? base
          : tag === ""
            ? "/blog?sort=oldest"
            : `${base}&sort=oldest`,
        active: oldest,
      },
    ];
    return [
      httpEffector.makeResponse(200, {
        posts: posts.map((p) => cardOf(tr, p)),
        tags: tagLinks,
        sorts,
        strings: {
          title: tr.tr("Blog"),
          sort: tr.tr("Sort:"),
          tags: tr.tr("Tags:"),
          readMore: tr.tr("Read more"),
          empty: tr.tr(
            "Nothing matches these conditions. Try changing the query or resetting the filters.",
          ),
        },
      }),
    ];
  }

  /** GET /api/public/blog/:pid — one post. */
  "blog.get"(message: Message): Effect[] {
    const req = message.payload as HttpReq;
    const pid = String(req.params.pid ?? "");
    if (!pid)
      return [httpEffector.makeResponse(404, { error: "no such post" })];
    return [
      requestsEffector.set("locale", localeOf(req)),
      BlogService.byPid(pid),
    ];
  }

  "blog.row.onSuccess"(message: Message, state: ServerState): Effect[] {
    const tr = new Tr(localeOfSlice(message, state));
    const post = oneOf<PostRow>(message);
    if (!post)
      return [httpEffector.makeResponse(404, { error: "no such post" })];
    return [
      httpEffector.makeResponse(200, {
        post: {
          pid: post.pid,
          date: formatDate(tr, post.date),
          title: post.title,
          excerpt: excerpt(post.content, 200),
          tags: post.tags ?? [],
          paragraphs: paragraphsOf(post.content),
        },
        strings: { back: tr.tr("Back to the blog") },
      }),
    ];
  }

  "blog.failed"(): Effect[] {
    return [httpEffector.makeResponse(500, { error: "database error" })];
  }
}
