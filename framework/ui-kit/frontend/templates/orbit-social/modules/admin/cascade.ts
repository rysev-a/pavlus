/**
 * What deleting a row does to the rest of the database. Pure: `planDelete`
 * looks at the database and says which rows of which tables go away and which
 * rows are rewritten (a member leaves a list, a song leaves a playlist...),
 * so that no row ever points at a row that does not exist.
 *
 * The rules:
 *  - user: friends (both directions), posts by them or on their wall, their
 *    comments, articles, albums and photos, dialogues they are in, their
 *    messages, playlists, scores, memberships (a community OWNER is refused),
 *    their likes; photo posts of their photos go too.
 *  - post: its comments and every repost of it (a repost without its original
 *    shows nothing), with their comments.
 *  - album of photos: its photos and the photo posts that show them.
 *  - photo: the photo posts that show it.
 *  - conversation: its messages. A user's chats: the user leaves a group chat;
 *    a dialogue or a chat left with fewer than 2 members is deleted.
 *  - community: its wall (posts, comments, reposts).
 *  - song: leaves every playlist; music posts of it go.
 *  - artist / album that still have albums / songs are REFUSED.
 */
import type { Db, TableName } from "../../schema.ts";

export type Removed = { [K in TableName]?: Set<number> };
export type Changed = { [K in TableName]?: Map<number, unknown> };

export interface Plan {
  /** non-empty when the delete is refused */
  refused: string;
  remove: Removed;
  /** rows rewritten, by table and id (never a row that is also removed) */
  put: Changed;
}

class Builder {
  remove: Removed = {};
  put: Changed = {};
  constructor(readonly db: Db) {}

  has(t: TableName, id: number): boolean {
    return this.remove[t]?.has(id) === true;
  }
  /** Marks rows for removal; returns the ids that were not marked yet. */
  take(t: TableName, ids: Iterable<number>): number[] {
    const set = (this.remove[t] ??= new Set());
    const fresh: number[] = [];
    for (const id of ids) {
      if (!set.has(id)) {
        set.add(id);
        fresh.push(id);
      }
    }
    return fresh;
  }
  rewrite(t: TableName, row: { id: number; [k: string]: unknown }): void {
    ((this.put[t] ??= new Map()) as Map<number, unknown>).set(row.id, row);
  }
  /** Posts, then their comments, then reposts of them, until nothing new turns up. */
  posts(ids: Iterable<number>): void {
    let fresh = this.take("posts", ids);
    while (fresh.length > 0) {
      const gone = new Set(fresh);
      this.take(
        "comments",
        this.db.comments.filter((c) => gone.has(c.postId)).map((c) => c.id),
      );
      fresh = this.take(
        "posts",
        this.db.posts
          .filter((p) => p.repostOf > 0 && gone.has(p.repostOf))
          .map((p) => p.id),
      );
    }
  }
  photos(ids: Iterable<number>): void {
    const fresh = this.take("photos", ids);
    const gone = new Set(fresh);
    if (gone.size > 0)
      this.posts(
        this.db.posts
          .filter((p) => p.photoId > 0 && gone.has(p.photoId))
          .map((p) => p.id),
      );
  }
  conversations(ids: Iterable<number>): void {
    const fresh = new Set(this.take("conversations", ids));
    if (fresh.size > 0)
      this.take(
        "messages",
        this.db.messages
          .filter((m) => fresh.has(m.conversationId))
          .map((m) => m.id),
      );
  }
}

const plural = (n: number, word: string): string =>
  `${n} ${word}${n === 1 ? "" : "s"}`;

/** Pure: the plan for deleting rows `ids` of `table`. */
export function planDelete(db: Db, table: TableName, ids: number[]): Plan {
  const b = new Builder(db);
  const set = new Set(ids);
  let refused = "";
  switch (table) {
    case "users": {
      const owned = db.communities.filter((c) => set.has(c.ownerId));
      if (owned.length > 0) {
        const names = owned
          .slice(0, 3)
          .map((c) => `“${c.name}”`)
          .join(", ");
        const user = db.users.find(
          (u) => set.has(u.id) && owned.some((c) => c.ownerId === u.id),
        );
        refused = `${user?.name ?? "A user"} is the owner of ${plural(owned.length, "community")} (${names}${owned.length > 3 ? ", ..." : ""}). Give the community to someone else or delete it first`;
        break;
      }
      b.take("users", ids);
      b.take(
        "friends",
        db.friends
          .filter((f) => set.has(f.userId) || set.has(f.friendId))
          .map((f) => f.id),
      );
      b.posts(
        db.posts
          .filter(
            (p) => set.has(p.authorId) || (p.wallId > 0 && set.has(p.wallId)),
          )
          .map((p) => p.id),
      );
      b.take(
        "comments",
        db.comments.filter((c) => set.has(c.authorId)).map((c) => c.id),
      );
      b.take(
        "articles",
        db.articles.filter((a) => set.has(a.authorId)).map((a) => a.id),
      );
      const albums = db.photoAlbums
        .filter((a) => set.has(a.ownerId))
        .map((a) => a.id);
      b.take("photoAlbums", albums);
      const albumSet = new Set(albums);
      b.photos(
        db.photos
          .filter((p) => set.has(p.ownerId) || albumSet.has(p.albumId))
          .map((p) => p.id),
      );
      for (const c of db.conversations) {
        if (!c.memberIds.some((m) => set.has(m))) continue;
        const rest = c.memberIds.filter((m) => !set.has(m));
        if (c.kind === "dm" || rest.length < 2) b.conversations([c.id]);
        else b.rewrite("conversations", { ...c, memberIds: rest });
      }
      b.take(
        "messages",
        db.messages.filter((m) => set.has(m.authorId)).map((m) => m.id),
      );
      b.take(
        "playlists",
        db.playlists.filter((p) => set.has(p.ownerId)).map((p) => p.id),
      );
      b.take(
        "scores",
        db.scores.filter((s) => set.has(s.userId)).map((s) => s.id),
      );
      for (const c of db.communities) {
        if (
          ![...c.memberIds, ...c.moderatorIds, ...c.contactIds].some((m) =>
            set.has(m),
          )
        )
          continue;
        const drop = (xs: number[]) => xs.filter((x) => !set.has(x));
        b.rewrite("communities", {
          ...c,
          memberIds: drop(c.memberIds),
          moderatorIds: drop(c.moderatorIds),
          contactIds: drop(c.contactIds),
        });
      }
      for (const p of db.posts) {
        if (p.likeIds.some((x) => set.has(x)))
          b.rewrite("posts", {
            ...p,
            likeIds: p.likeIds.filter((x) => !set.has(x)),
          });
      }
      for (const a of db.articles) {
        if (a.likeIds.some((x) => set.has(x)))
          b.rewrite("articles", {
            ...a,
            likeIds: a.likeIds.filter((x) => !set.has(x)),
          });
      }
      b.take(
        "session",
        db.session.filter((s) => set.has(s.userId)).map((s) => s.id),
      );
      break;
    }
    case "posts":
      b.posts(ids);
      break;
    case "photoAlbums": {
      b.take("photoAlbums", ids);
      b.photos(db.photos.filter((p) => set.has(p.albumId)).map((p) => p.id));
      break;
    }
    case "photos":
      b.photos(ids);
      break;
    case "conversations":
      b.conversations(ids);
      break;
    case "communities":
      b.take("communities", ids);
      b.posts(
        db.posts
          .filter((p) => p.communityId > 0 && set.has(p.communityId))
          .map((p) => p.id),
      );
      break;
    case "songs":
      b.take("songs", ids);
      for (const p of db.playlists) {
        if (p.songIds.some((s) => set.has(s)))
          b.rewrite("playlists", {
            ...p,
            songIds: p.songIds.filter((s) => !set.has(s)),
          });
      }
      b.posts(
        db.posts
          .filter((p) => p.songId > 0 && set.has(p.songId))
          .map((p) => p.id),
      );
      break;
    case "artists": {
      const albums = db.albums.filter((a) => set.has(a.artistId)).length;
      const songs = db.songs.filter((s) => set.has(s.artistId)).length;
      if (albums + songs > 0)
        refused = `This artist still has ${plural(albums, "album")} and ${plural(songs, "song")}. Delete or move them first`;
      else b.take("artists", ids);
      break;
    }
    case "albums": {
      const songs = db.songs.filter((s) => set.has(s.albumId)).length;
      if (songs > 0)
        refused = `This album still has ${plural(songs, "song")}. Delete or move them first`;
      else b.take("albums", ids);
      break;
    }
    default:
      // comments, articles, messages, playlists, friends, scores: nothing depends on them
      b.take(table, ids);
  }
  if (refused) return { refused, remove: {}, put: {} };
  // a rewritten row that is also removed is just removed
  for (const t of Object.keys(b.put) as TableName[]) {
    const map = b.put[t]!;
    for (const id of [...map.keys()]) if (b.remove[t]?.has(id)) map.delete(id);
  }
  return { refused: "", remove: b.remove, put: b.put };
}

const LABEL: Partial<Record<TableName, string>> = {
  friends: "contact",
  posts: "post",
  comments: "comment",
  articles: "article",
  photoAlbums: "album of photos",
  photos: "photo",
  conversations: "conversation",
  messages: "message",
  playlists: "playlist",
  scores: "score",
  songs: "song",
};

/** `3 posts, 12 comments`: what a plan deletes besides the rows asked for. */
export function describeSideEffects(
  plan: Plan,
  table: TableName,
  askedFor: number,
): string {
  const parts: string[] = [];
  for (const t of Object.keys(plan.remove) as TableName[]) {
    if (t === "session") continue;
    let n = plan.remove[t]?.size ?? 0;
    if (t === table) n -= askedFor;
    if (n > 0 && LABEL[t]) parts.push(plural(n, LABEL[t]!));
  }
  const changed =
    (plan.put.communities?.size ?? 0) +
    (plan.put.playlists?.size ?? 0) +
    (plan.put.conversations?.size ?? 0);
  if (changed > 0) parts.push(`${plural(changed, "list")} will be edited`);
  return parts.join(", ");
}

/** The ids in a plan as plain arrays, ready for an Update. */
export function removeOf(plan: Plan): { [K in TableName]?: number[] } {
  const out: { [K in TableName]?: number[] } = {};
  for (const t of Object.keys(plan.remove) as TableName[])
    out[t] = [...(plan.remove[t] ?? [])];
  return out;
}

export function putOf(plan: Plan): Record<string, unknown[]> {
  const out: Record<string, unknown[]> = {};
  for (const t of Object.keys(plan.put) as TableName[]) {
    const rows = [...(plan.put[t]?.values() ?? [])];
    if (rows.length > 0) out[t] = rows;
  }
  return out;
}
