/**
 * Pure rules of the profile module: validation of the forms, the friend
 * relation, the avatar presets and the cascade of deleting an account.
 * Nothing here reads the state of the page: everything is a function of a `Db`.
 */
import { gradient, initialsOf } from "../../pictures.ts";
import { hashPassword } from "../../auth.ts";
import type { Db, Friend, User } from "../../schema.ts";
import type { PutRows, RemoveIds } from "../../core.ts";

export interface ProfileForm {
  name: string;
  city: string;
  birthday: string;
  about: string;
  /** comma separated */
  interests: string;
  website: string;
  phone: string;
}

export const formOf = (u: User): ProfileForm => ({
  name: u.name,
  city: u.city,
  birthday: u.birthday,
  about: u.about,
  interests: u.interests.join(", "),
  website: u.website,
  phone: u.phone,
});

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /^https?:\/\/[^\s/$.?#][^\s]*\.[^\s]{2,}$/i;
const PHONE = /^\+?[0-9][0-9 ()\-.]{4,19}$/;

export const isUrl = (s: string): boolean => URL_RE.test(s.trim());
export const isEmail = (s: string): boolean => EMAIL.test(s.trim());

/** `YYYY-MM-DD` that exists in the calendar, from 1900 on, not after `today`. */
export function isValidDate(s: string, today: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  if (
    t.getUTCFullYear() !== y ||
    t.getUTCMonth() !== mo - 1 ||
    t.getUTCDate() !== d
  )
    return false;
  return y >= 1900 && s <= today.slice(0, 10);
}

/** "a, b ,, A" -> ["a", "b"]: trimmed, no empty, no duplicates, at most 12. */
export function parseInterests(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(",")) {
    const t = raw.trim();
    if (!t || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    out.push(t);
  }
  return out.slice(0, 12);
}

/** An error message per wrong field of the profile form (`{}` when it is valid). */
export function checkProfile(
  f: ProfileForm,
  today: string,
): Record<string, string> {
  const e: Record<string, string> = {};
  if (f.name.trim().length === 0) e.name = "Your name is required";
  else if (f.name.trim().length > 60) e.name = "At most 60 characters";
  if (f.city.trim().length > 60) e.city = "At most 60 characters";
  if (f.birthday.trim() !== "" && !isValidDate(f.birthday.trim(), today))
    e.birthday = "That is not a valid date";
  if (f.about.length > 600) e.about = "At most 600 characters";
  if (f.website.trim() !== "" && !isUrl(f.website))
    e.website = "A web address like https://example.com, or leave it empty";
  if (f.phone.trim() !== "" && !PHONE.test(f.phone.trim()))
    e.phone = "A phone number like +1 555 0100, or leave it empty";
  if (parseInterests(f.interests).some((i) => i.length > 30))
    e.interests = "Each interest is at most 30 characters";
  return e;
}

export interface AccountForm {
  name: string;
  email: string;
}

export function checkAccount(
  db: Db,
  userId: number,
  f: AccountForm,
): Record<string, string> {
  const e: Record<string, string> = {};
  if (f.name.trim().length === 0) e.name = "Your name is required";
  else if (f.name.trim().length > 60) e.name = "At most 60 characters";
  const email = f.email.trim().toLowerCase();
  if (!isEmail(f.email)) e.email = "That is not an email address";
  else if (
    db.users.some((u) => u.id !== userId && u.email.toLowerCase() === email)
  )
    e.email = "Someone already has this email";
  return e;
}

export interface PasswordForm {
  current: string;
  next: string;
  confirm: string;
}

export function checkPassword(
  user: User,
  f: PasswordForm,
): Record<string, string> {
  const e: Record<string, string> = {};
  if (f.current === "") e.current = "Enter your current password";
  else if (hashPassword(f.current) !== user.passwordHash)
    e.current = "The current password is wrong";
  if (f.next.length < 6) e.next = "At least 6 characters";
  else if (f.next === f.current)
    e.next = "Choose a password different from the current one";
  if (f.confirm !== f.next) e.confirm = "The passwords differ";
  return e;
}

// ---- friends ----

export type Relation = "self" | "none" | "friends" | "sent" | "received";

/** The row that connects two users (any direction), if there is one. */
export function friendRow(db: Db, a: number, b: number): Friend | undefined {
  return db.friends.find(
    (f) =>
      (f.userId === a && f.friendId === b) ||
      (f.userId === b && f.friendId === a),
  );
}

export function relationOf(db: Db, me: number, other: number): Relation {
  if (me === other) return "self";
  const row = friendRow(db, me, other);
  if (!row) return "none";
  if (row.status === "accepted") return "friends";
  return row.userId === me ? "sent" : "received";
}

// ---- avatars ----

const GLYPHS = [
  "🦊",
  "🐼",
  "🦁",
  "🐙",
  "🌵",
  "🚀",
  "🎧",
  "🌈",
  "🍕",
  "⚡",
  "🌙",
  "🎸",
  "🦄",
  "🐳",
  "🔥",
  "🍀",
];

export interface Preset {
  i: number;
  src: string;
}

/** Sixteen generated avatars (a gradient and an emoji). */
export const PRESETS: Preset[] = GLYPHS.map((g, i) => ({
  i,
  src: gradient(i * 22.5, i * 22.5 + 50, g),
}));

/** The generated avatar of a user without a photo: a gradient and the initial. */
export function defaultAvatar(u: Pick<User, "id" | "name">): string {
  const hue = (u.id * 47) % 360;
  return gradient(hue, hue + 40, initialsOf(u.name).charAt(0) || "?");
}

// ---- deleting an account ----

/** The communities this user owns: they block the deletion. */
export const ownedCommunities = (db: Db, userId: number) =>
  db.communities.filter((c) => c.ownerId === userId);

/**
 * Everything that goes when `userId` leaves: friends, posts (own, on the wall and
 * reposts of them), comments, articles, albums and photos, messages (a dialogue
 * goes whole), playlists and scores. The user is also taken out of group chats,
 * community lists and likes. Returns the `remove` and `put` of an Update.
 */
export function deletionOf(
  db: Db,
  userId: number,
): { remove: RemoveIds; put: PutRows } {
  const posts = db.posts
    .filter((p) => p.authorId === userId || p.wallId === userId)
    .map((p) => p.id);
  const gone = new Set(posts);
  // reposts of the removed posts go too (they would show nothing)
  for (const p of db.posts)
    if (p.repostOf > 0 && gone.has(p.repostOf)) gone.add(p.id);
  const comments = db.comments
    .filter((c) => c.authorId === userId || gone.has(c.postId))
    .map((c) => c.id);
  const albums = db.photoAlbums
    .filter((a) => a.ownerId === userId)
    .map((a) => a.id);
  const albumSet = new Set(albums);
  const photos = db.photos
    .filter((p) => p.ownerId === userId || albumSet.has(p.albumId))
    .map((p) => p.id);
  const dms = new Set(
    db.conversations
      .filter((c) => c.kind === "dm" && c.memberIds.includes(userId))
      .map((c) => c.id),
  );
  const messages = db.messages
    .filter((m) => m.authorId === userId || dms.has(m.conversationId))
    .map((m) => m.id);
  const remove: RemoveIds = {
    friends: db.friends
      .filter((f) => f.userId === userId || f.friendId === userId)
      .map((f) => f.id),
    posts: [...gone],
    comments,
    articles: db.articles.filter((a) => a.authorId === userId).map((a) => a.id),
    photoAlbums: albums,
    photos,
    conversations: [...dms],
    messages,
    playlists: db.playlists
      .filter((p) => p.ownerId === userId)
      .map((p) => p.id),
    scores: db.scores.filter((s) => s.userId === userId).map((s) => s.id),
    users: [userId],
  };
  const put: PutRows = {};
  const groups = db.conversations.filter(
    (c) => c.kind === "chat" && c.memberIds.includes(userId),
  );
  if (groups.length)
    put.conversations = groups.map((c) => ({
      ...c,
      memberIds: c.memberIds.filter((m) => m !== userId),
    }));
  const comms = db.communities.filter(
    (c) =>
      c.moderatorIds.includes(userId) ||
      c.memberIds.includes(userId) ||
      c.contactIds.includes(userId),
  );
  if (comms.length) {
    put.communities = comms.map((c) => ({
      ...c,
      moderatorIds: c.moderatorIds.filter((m) => m !== userId),
      memberIds: c.memberIds.filter((m) => m !== userId),
      contactIds: c.contactIds.filter((m) => m !== userId),
    }));
  }
  const likedPosts = db.posts.filter(
    (p) => !gone.has(p.id) && p.likeIds.includes(userId),
  );
  if (likedPosts.length)
    put.posts = likedPosts.map((p) => ({
      ...p,
      likeIds: p.likeIds.filter((x) => x !== userId),
    }));
  const likedArticles = db.articles.filter(
    (a) => a.authorId !== userId && a.likeIds.includes(userId),
  );
  if (likedArticles.length)
    put.articles = likedArticles.map((a) => ({
      ...a,
      likeIds: a.likeIds.filter((x) => x !== userId),
    }));
  return { remove, put };
}
