import { TABLES, type Db, type Snapshot, type TableName } from "./schema.ts";

/**
 * Export and import of the whole database as one JSON file. All pure:
 * `parseSnapshot` trusts nothing and says exactly what is wrong.
 */

export function snapshotOf(db: Db, now: string): Snapshot {
  return { app: "orbit-social", version: 1, exportedAt: now, data: db };
}

/** Compact JSON: the file is big. */
export const snapshotText = (snapshot: Snapshot): string =>
  JSON.stringify(snapshot);

/** The size of a text as a file (UTF-8 bytes). */
export const bytesOf = (text: string): number =>
  new TextEncoder().encode(text).length;

export function dbCounts(db: Db): Record<TableName, number> {
  const out = {} as Record<TableName, number>;
  for (const t of TABLES) out[t] = db[t].length;
  return out;
}

// ---- field specs: one small table per entity ----

type Kind =
  | "string"
  | "number"
  | "int"
  | "boolean"
  | "numbers" // an array of integers
  | "strings" // an array of strings
  | readonly string[]; // one of these strings

type Spec = Record<string, Kind>;

const ROLES = ["user", "moderator", "admin"] as const;
const STATUSES = ["active", "banned"] as const;
const FRIEND_STATUSES = ["accepted", "pending"] as const;
const POST_KINDS = [
  "text",
  "music",
  "photo",
  "picture",
  "link",
  "repost",
] as const;
const CONVERSATION_KINDS = ["dm", "chat"] as const;
const GAME_NAMES = ["snake", "pacman", "tetris"] as const;

const SPECS: Record<TableName, Spec> = {
  users: {
    name: "string",
    email: "string",
    passwordHash: "string",
    role: ROLES,
    status: STATUSES,
    avatar: "string",
    about: "string",
    city: "string",
    birthday: "string",
    website: "string",
    phone: "string",
    interests: "strings",
    createdAt: "string",
    lastSeen: "string",
  },
  friends: {
    userId: "int",
    friendId: "int",
    status: FRIEND_STATUSES,
    since: "string",
  },
  posts: {
    authorId: "int",
    wallId: "int",
    communityId: "int",
    kind: POST_KINDS,
    text: "string",
    songId: "int",
    photoId: "int",
    picture: "string",
    url: "string",
    linkTitle: "string",
    repostOf: "int",
    createdAt: "string",
    likeIds: "numbers",
  },
  comments: {
    postId: "int",
    authorId: "int",
    text: "string",
    createdAt: "string",
  },
  articles: {
    authorId: "int",
    title: "string",
    body: "string",
    tags: "strings",
    cover: "string",
    createdAt: "string",
    likeIds: "numbers",
  },
  photoAlbums: {
    ownerId: "int",
    title: "string",
    description: "string",
    createdAt: "string",
  },
  photos: {
    albumId: "int",
    ownerId: "int",
    src: "string",
    caption: "string",
    createdAt: "string",
  },
  conversations: {
    kind: CONVERSATION_KINDS,
    title: "string",
    memberIds: "numbers",
    createdAt: "string",
  },
  messages: {
    conversationId: "int",
    authorId: "int",
    text: "string",
    createdAt: "string",
  },
  communities: {
    name: "string",
    description: "string",
    wallpaper: "string",
    ownerId: "int",
    moderatorIds: "numbers",
    memberIds: "numbers",
    contactIds: "numbers",
    createdAt: "string",
  },
  artists: { name: "string", country: "string" },
  albums: { artistId: "int", title: "string", year: "int", cover: "string" },
  songs: {
    albumId: "int",
    artistId: "int",
    title: "string",
    genre: "string",
    duration: "int",
    year: "int",
  },
  playlists: {
    ownerId: "int",
    title: "string",
    songIds: "numbers",
    createdAt: "string",
  },
  scores: { userId: "int", game: GAME_NAMES, score: "int", at: "string" },
  session: { userId: "int" },
};

type Row = Record<string, unknown>;

const isObject = (v: unknown): v is Row =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const show = (v: unknown): string => {
  const s = JSON.stringify(v);
  return s === undefined
    ? String(v)
    : s.length > 40
      ? s.slice(0, 37) + "..."
      : s;
};

/** Checks one scalar value against a kind; the error says what was expected. */
function wrong(value: unknown, kind: Kind): string | null {
  if (Array.isArray(kind))
    return kind.includes(value as string)
      ? null
      : `${show(value)} is not one of ${kind.join(", ")}`;
  switch (kind) {
    case "string":
      return typeof value === "string"
        ? null
        : `${show(value)} is not a string`;
    case "boolean":
      return typeof value === "boolean"
        ? null
        : `${show(value)} is not true or false`;
    case "number":
      return typeof value === "number" && Number.isFinite(value)
        ? null
        : `${show(value)} is not a number`;
    case "int":
      return Number.isInteger(value)
        ? null
        : `${show(value)} is not an integer`;
    default:
      return null;
  }
}

type Fail = { ok: false; error: string };
const fail = (error: string): Fail => ({ ok: false, error });

/** Copies the fields of the spec out of `row`, checking each; unknown fields are dropped. */
function pick(
  row: Row,
  entries: [string, Kind][],
  where: string,
): { ok: true; value: Row } | Fail {
  const out: Row = {};
  for (const [field, kind] of entries) {
    const path = `${where}.${field}`;
    if (!(field in row)) return fail(`${path} is missing`);
    const value = row[field];
    if (kind === "numbers" || kind === "strings") {
      if (!Array.isArray(value))
        return fail(`${path} ${show(value)} is not an array`);
      for (let i = 0; i < value.length; i++) {
        const bad = wrong(value[i], kind === "numbers" ? "int" : "string");
        if (bad) return fail(`${path}[${i}] ${bad}`);
      }
      out[field] = value.slice();
    } else {
      const bad = wrong(value, kind);
      if (bad) return fail(`${path} ${bad}`);
      out[field] = value;
    }
  }
  return { ok: true, value: out };
}

const SPEC_ENTRIES = Object.fromEntries(
  TABLES.map((t) => [t, Object.entries(SPECS[t])]),
) as Record<TableName, [string, Kind][]>;

/** What one row of a table is called in an error message. */
const ONE: Record<TableName, string> = {
  users: "user",
  friends: "friend",
  posts: "post",
  comments: "comment",
  articles: "article",
  photoAlbums: "photo album",
  photos: "photo",
  conversations: "conversation",
  messages: "message",
  communities: "community",
  artists: "artist",
  albums: "album",
  songs: "song",
  playlists: "playlist",
  scores: "score",
  session: "session",
};

const a = (word: string): string => (/^(?!us)[aeiou]/.test(word) ? "an" : "a");

/** A single foreign key; `zeroOk` means 0 is "none". */
const LINKS: [TableName, string, TableName, boolean?][] = [
  ["friends", "userId", "users"],
  ["friends", "friendId", "users"],
  ["posts", "authorId", "users"],
  ["posts", "wallId", "users", true],
  ["posts", "communityId", "communities", true],
  ["posts", "songId", "songs", true],
  ["posts", "photoId", "photos", true],
  ["posts", "repostOf", "posts", true],
  ["comments", "postId", "posts"],
  ["comments", "authorId", "users"],
  ["articles", "authorId", "users"],
  ["photoAlbums", "ownerId", "users"],
  ["photos", "albumId", "photoAlbums"],
  ["photos", "ownerId", "users"],
  ["messages", "conversationId", "conversations"],
  ["messages", "authorId", "users"],
  ["communities", "ownerId", "users"],
  ["albums", "artistId", "artists"],
  ["songs", "albumId", "albums"],
  ["songs", "artistId", "artists"],
  ["playlists", "ownerId", "users"],
  ["scores", "userId", "users"],
  ["session", "userId", "users"],
];

/** Arrays of foreign keys. */
const LINK_LISTS: [TableName, string, TableName][] = [
  ["posts", "likeIds", "users"],
  ["articles", "likeIds", "users"],
  ["conversations", "memberIds", "users"],
  ["communities", "moderatorIds", "users"],
  ["communities", "memberIds", "users"],
  ["communities", "contactIds", "users"],
  ["playlists", "songIds", "songs"],
];

export function parseSnapshot(
  text: string,
): { ok: true; db: Db } | { ok: false; error: string } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    return fail(
      `not valid JSON (${e instanceof Error ? e.message : String(e)})`,
    );
  }
  if (!isObject(json)) return fail("the file is not a JSON object");
  if (json.app !== "orbit-social")
    return fail(`not an Orbit export (app is ${show(json.app)})`);
  if (json.version !== 1)
    return fail(
      `unsupported version ${show(json.version)} (this app reads version 1)`,
    );
  if (!isObject(json.data)) return fail('"data" is missing or not an object');

  const db = {} as Record<TableName, Row[]>;
  const has = {} as Record<TableName, Set<number>>;
  for (const table of TABLES) {
    const rows = json.data[table];
    if (rows === undefined) return fail(`table "${table}" is missing`);
    if (!Array.isArray(rows)) return fail(`table "${table}" is not an array`);
    const seen = new Set<number>();
    const clean: Row[] = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!isObject(row)) return fail(`${table}[${i}] is not an object`);
      const id = row.id;
      if (!Number.isInteger(id) || (id as number) <= 0)
        return fail(`${table}[${i}].id ${show(id)} is not a positive integer`);
      if (seen.has(id as number))
        return fail(`${table}: id ${id} appears twice`);
      seen.add(id as number);
      const r = pick(row, SPEC_ENTRIES[table], `${table}[${id}]`);
      if (!r.ok) return r;
      clean.push({ id, ...r.value });
    }
    db[table] = clean;
    has[table] = seen;
  }

  // ---- links between tables ----
  for (const [table, field, target, zeroOk] of LINKS) {
    const ok = has[target];
    for (const row of db[table]) {
      const v = row[field] as number;
      if (zeroOk && v === 0) continue;
      if (!ok.has(v))
        return fail(
          `${table}[${row.id}].${field} ${v} is not ${a(ONE[target])} ${ONE[target]}`,
        );
    }
  }
  for (const [table, field, target] of LINK_LISTS) {
    const ok = has[target];
    for (const row of db[table]) {
      const list = row[field] as number[];
      for (let i = 0; i < list.length; i++) {
        if (!ok.has(list[i]))
          return fail(
            `${table}[${row.id}].${field}[${i}] ${list[i]} is not ${a(ONE[target])} ${ONE[target]}`,
          );
      }
    }
  }

  // ---- rules that span fields ----
  const albumArtist = new Map<number, number>();
  for (const al of db.albums)
    albumArtist.set(al.id as number, al.artistId as number);
  for (const s of db.songs) {
    if (albumArtist.get(s.albumId as number) !== s.artistId)
      return fail(
        `songs[${s.id}].albumId ${s.albumId} belongs to another artist than ${s.artistId}`,
      );
  }
  for (const f of db.friends) {
    if (f.userId === f.friendId)
      return fail(`friends[${f.id}] links user ${f.userId} to themselves`);
  }
  for (const p of db.posts) {
    if (!p.wallId && !p.communityId)
      return fail(
        `posts[${p.id}] is on no wall (wallId and communityId are both 0)`,
      );
    if (p.wallId && p.communityId)
      return fail(
        `posts[${p.id}] is on a user wall and a community wall at once`,
      );
  }
  const photoAlbum = new Map<number, number>();
  for (const ph of db.photoAlbums)
    photoAlbum.set(ph.id as number, ph.ownerId as number);
  for (const ph of db.photos) {
    if (photoAlbum.get(ph.albumId as number) !== ph.ownerId)
      return fail(
        `photos[${ph.id}].ownerId ${ph.ownerId} is not the owner of album ${ph.albumId}`,
      );
  }
  for (const c of db.conversations) {
    if (c.kind === "dm" && (c.memberIds as number[]).length !== 2)
      return fail(
        `conversations[${c.id}] is a dm and needs exactly two members`,
      );
  }
  return { ok: true, db: db as unknown as Db };
}
