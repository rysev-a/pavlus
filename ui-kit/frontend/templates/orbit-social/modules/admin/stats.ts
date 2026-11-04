/**
 * The numbers of the admin panel, pure: the overview (KPI cards, charts, the
 * most active users and communities) and the "all data" view of one user.
 */
import {
  type Area,
  areaChart,
  short,
} from "../../../../blocks/area-chart/area.ts";
import { type Column, columns } from "../../../../blocks/bar-chart/chart.ts";
import { type Item, item } from "../../../../blocks/progress-list/items.ts";
import { type Card, card } from "../../../../blocks/stat-cards/cards.ts";
import { byId } from "../../core.ts";
import { pictureStyle } from "../../pictures.ts";
import type { Db } from "../../schema.ts";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** `1234567` as `1,234,567` (no locale involved). */
export const group = (n: number): string =>
  String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** The last 12 months up to the month of `now`, as `2026-03`. */
export function lastMonths(now: string, n = 12): string[] {
  let y = Number(now.slice(0, 4));
  let m = Number(now.slice(5, 7));
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.unshift(`${y}-${String(m).padStart(2, "0")}`);
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
  }
  return out;
}

const labelOf = (month: string): string =>
  `${MONTHS[Number(month.slice(5, 7)) - 1]}${month.slice(5, 7) === "01" ? ` ${month.slice(2, 4)}` : ""}`;

function perMonth(rows: { createdAt: string }[], months: string[]): number[] {
  const index = new Map(months.map((m, i) => [m, i]));
  const out = months.map(() => 0);
  for (const r of rows) {
    const i = index.get(r.createdAt.slice(0, 7));
    if (i !== undefined) out[i] += 1;
  }
  return out;
}

export interface OverviewProps {
  kpis: Card[];
  usersChart: Area;
  postsCols: Column[];
  newUsers: number;
  newPosts: number;
  topUsers: Item[];
  topCommunities: Item[];
}

export function overview(db: Db, now: string): OverviewProps {
  const months = lastMonths(now);
  const users = perMonth(db.users, months);
  const posts = perMonth(db.posts, months);
  const banned = db.users.filter((u) => u.status === "banned").length;
  const admins = db.users.filter((u) => u.role === "admin").length;
  const kpis: Card[] = [
    card("users", "Users", group(db.users.length), {
      hint: `${group(db.users.length - banned)} active, ${banned} banned, ${admins} admin${admins === 1 ? "" : "s"}`,
      icon: "k-icon-user",
      tone: "info",
      series: users,
    }),
    card("posts", "Wall posts", group(db.posts.length), {
      hint: `${group(db.articles.length)} articles`,
      icon: "k-ai-home",
      tone: "default",
      series: posts,
    }),
    card("comments", "Comments", group(db.comments.length), {
      icon: "k-ai-file",
      tone: "teal",
    }),
    card("messages", "Messages", group(db.messages.length), {
      hint: `${group(db.conversations.length)} conversations`,
      icon: "k-icon-mail",
      tone: "success",
    }),
    card("photos", "Photos", group(db.photos.length), {
      hint: `${group(db.photoAlbums.length)} albums`,
      icon: "k-ai-sparkles",
      tone: "warning",
    }),
    card("songs", "Songs", group(db.songs.length), {
      hint: `${group(db.artists.length)} artists, ${group(db.albums.length)} albums`,
      icon: "k-ai-pulse",
      tone: "info",
    }),
    card("communities", "Communities", group(db.communities.length), {
      hint: `${group(db.playlists.length)} playlists`,
      icon: "k-ai-users",
      tone: "default",
    }),
    card("friends", "Contacts", group(db.friends.length), {
      hint: `${group(db.scores.length)} game scores`,
      icon: "k-ai-flag",
      tone: "teal",
    }),
  ];
  const usersChart = areaChart(
    months.map((m, i) => ({ id: m, label: labelOf(m), value: users[i] })),
    { format: (v) => short(v) },
  );
  const postsCols = columns(
    months.map((m, i) => ({
      id: m,
      label: labelOf(m),
      value: posts[i],
      show: true,
      tone: "info" as const,
    })),
  );

  // the most active users: posts + comments + messages
  const activity = new Map<
    number,
    { posts: number; comments: number; messages: number }
  >();
  const touch = (id: number, k: "posts" | "comments" | "messages"): void => {
    const a = activity.get(id) ?? { posts: 0, comments: 0, messages: 0 };
    a[k] += 1;
    activity.set(id, a);
  };
  for (const p of db.posts) touch(p.authorId, "posts");
  for (const c of db.comments) touch(c.authorId, "comments");
  for (const m of db.messages) touch(m.authorId, "messages");
  const total = (a: {
    posts: number;
    comments: number;
    messages: number;
  }): number => a.posts + a.comments + a.messages;
  const ranked = [...activity.entries()]
    .sort((a, b) => total(b[1]) - total(a[1]) || a[0] - b[0])
    .slice(0, 5);
  const userIndex = byId(db.users);
  const topMax = ranked.length > 0 ? total(ranked[0][1]) : 0;
  const topUsers = ranked.map(([id, a]) =>
    item(`u${id}`, userIndex.get(id)?.name ?? `user #${id}`, total(a), topMax, {
      tone: "default",
      text: `${group(total(a))} items`,
      sub: `${a.posts} posts, ${a.comments} comments, ${a.messages} messages`,
    }),
  );

  // the most active communities: members + their wall posts
  const wall = new Map<number, number>();
  for (const p of db.posts)
    if (p.communityId > 0)
      wall.set(p.communityId, (wall.get(p.communityId) ?? 0) + 1);
  const rankedC = db.communities
    .map((c) => ({ c, posts: wall.get(c.id) ?? 0 }))
    .sort(
      (a, b) =>
        b.posts + b.c.memberIds.length - (a.posts + a.c.memberIds.length) ||
        a.c.id - b.c.id,
    )
    .slice(0, 5);
  const cMax =
    rankedC.length > 0 ? rankedC[0].posts + rankedC[0].c.memberIds.length : 0;
  const topCommunities = rankedC.map(({ c, posts: n }) =>
    item(`c${c.id}`, c.name, n + c.memberIds.length, cMax, {
      tone: "success",
      text: `${group(c.memberIds.length)} members`,
      sub: `${n} wall posts`,
    }),
  );
  return {
    kpis,
    usersChart,
    postsCols,
    newUsers: users.reduce((a, b) => a + b, 0),
    newPosts: posts.reduce((a, b) => a + b, 0),
    topUsers,
    topCommunities,
  };
}

// ---- one user, all their data ----

export const DETAIL_PAGE = 5;

export interface DetailList {
  key: string;
  title: string;
  total: number;
  page: number;
  pages: number;
  empty: string;
  items: { id: number; title: string; sub: string; style: string }[];
}

export interface DetailProps {
  id: number;
  name: string;
  email: string;
  avatarStyle: string;
  role: string;
  status: string;
  fields: { label: string; value: string }[];
  counts: { label: string; value: string }[];
  lists: DetailList[];
}

const cut = (s: string, n = 90): string =>
  s.length > n ? `${s.slice(0, n - 1)}…` : s;

function listOf<T>(
  key: string,
  title: string,
  empty: string,
  rows: T[],
  pages: Record<string, number>,
  row: (r: T) => DetailList["items"][number],
): DetailList {
  const count = Math.max(1, Math.ceil(rows.length / DETAIL_PAGE));
  const page = Math.min(Math.max(1, pages[key] ?? 1), count);
  return {
    key,
    title,
    total: rows.length,
    page,
    pages: count,
    empty,
    items: rows.slice((page - 1) * DETAIL_PAGE, page * DETAIL_PAGE).map(row),
  };
}

/** Pure: everything the database knows about a user (never the password hash). */
export function userDetail(
  db: Db,
  id: number,
  pages: Record<string, number>,
): DetailProps | null {
  const u = byId(db.users).get(id);
  if (!u) return null;
  const posts = db.posts
    .filter((p) => p.authorId === id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const wallPosts = db.posts.filter(
    (p) => p.wallId === id && p.authorId !== id,
  ).length;
  const comments = db.comments.filter((c) => c.authorId === id).length;
  const articles = db.articles.filter((a) => a.authorId === id).length;
  const albums = db.photoAlbums.filter((a) => a.ownerId === id);
  const photos = db.photos.filter((p) => p.ownerId === id);
  const contacts = db.friends.filter(
    (f) => f.status === "accepted" && (f.userId === id || f.friendId === id),
  );
  const convs = db.conversations.filter((c) => c.memberIds.includes(id)).length;
  const messages = db.messages.filter((m) => m.authorId === id).length;
  const playlists = db.playlists.filter((p) => p.ownerId === id);
  const scores = db.scores
    .filter((s) => s.userId === id)
    .sort((a, b) => b.score - a.score);
  const joined = db.communities.filter((c) => c.memberIds.includes(id)).length;
  const owned = db.communities.filter((c) => c.ownerId === id).length;
  const users = byId(db.users);
  const albumIndex = byId(db.photoAlbums);
  const photosIn = new Map<number, number>();
  for (const p of db.photos)
    if (p.ownerId === id)
      photosIn.set(p.albumId, (photosIn.get(p.albumId) ?? 0) + 1);
  const none = { style: "" };
  return {
    id,
    name: u.name,
    email: u.email,
    avatarStyle: pictureStyle(u.avatar),
    role: u.role,
    status: u.status,
    fields: [
      { label: "Name", value: u.name },
      { label: "Email", value: u.email },
      { label: "Role", value: u.role },
      { label: "Status", value: u.status },
      { label: "City", value: u.city || "-" },
      { label: "Birthday", value: u.birthday || "-" },
      { label: "Website", value: u.website || "-" },
      { label: "Phone", value: u.phone || "-" },
      { label: "Interests", value: u.interests.join(", ") || "-" },
      { label: "Joined", value: u.createdAt.slice(0, 16).replace("T", " ") },
      { label: "Last seen", value: u.lastSeen.slice(0, 16).replace("T", " ") },
      { label: "About", value: u.about || "-" },
    ],
    counts: [
      { label: "Posts", value: group(posts.length) },
      { label: "Posts by others on their wall", value: group(wallPosts) },
      { label: "Comments", value: group(comments) },
      { label: "Articles", value: group(articles) },
      { label: "Albums", value: group(albums.length) },
      { label: "Photos", value: group(photos.length) },
      { label: "Friends", value: group(contacts.length) },
      { label: "Conversations", value: group(convs) },
      { label: "Messages", value: group(messages) },
      { label: "Playlists", value: group(playlists.length) },
      { label: "Scores", value: group(scores.length) },
      { label: "Communities joined", value: group(joined) },
      { label: "Communities owned", value: group(owned) },
    ],
    lists: [
      listOf("posts", "Posts", "No posts.", posts, pages, (p) => ({
        id: p.id,
        title: cut(p.text || p.linkTitle || `(${p.kind})`),
        sub: `${p.kind}, ${p.createdAt.slice(0, 10)}, ${p.likeIds.length} likes`,
        ...none,
      })),
      listOf("albums", "Albums", "No albums.", albums, pages, (a) => ({
        id: a.id,
        title: a.title,
        sub: `${photosIn.get(a.id) ?? 0} photos`,
        ...none,
      })),
      listOf("photos", "Photos", "No photos.", photos, pages, (p) => ({
        id: p.id,
        title: p.caption || `Photo #${p.id}`,
        sub: albumIndex.get(p.albumId)?.title ?? "",
        style: pictureStyle(p.src),
      })),
      listOf("friends", "Friends", "No friends yet.", contacts, pages, (f) => {
        const other = users.get(f.userId === id ? f.friendId : f.userId);
        return {
          id: f.id,
          title: other?.name ?? "(deleted)",
          sub: `since ${f.since.slice(0, 10)}`,
          style: other ? pictureStyle(other.avatar) : "",
        };
      }),
      listOf(
        "playlists",
        "Playlists",
        "No playlists.",
        playlists,
        pages,
        (p) => ({
          id: p.id,
          title: p.title,
          sub: `${p.songIds.length} songs`,
          ...none,
        }),
      ),
      listOf("scores", "Best scores", "No scores.", scores, pages, (s) => ({
        id: s.id,
        title: `${s.game}: ${group(s.score)}`,
        sub: s.at.slice(0, 10),
        ...none,
      })),
    ],
  };
}
