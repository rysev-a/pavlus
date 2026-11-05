/**
 * The repository: the sixteen Db tables of the Orbit frontend
 * (ui-kit/frontend/templates/orbit-social/schema.ts) <-> normalized SQL
 * (schema.sql). Rows go in and out in EXACTLY the frontend shape (camelCase,
 * "0" for "none", ISO dates, arrays), so `loadTables` reproduces what
 * `seedDb()` made.
 *
 * Writes are bulk: one `INSERT ... SELECT FROM unnest(...) ON CONFLICT` per
 * chunk of rows (a handful of array parameters, however many rows), so the
 * ~51k seed rows take a second or two.
 */
import type {
  Db,
  TableName,
} from "../../../ui-kit/frontend/templates/orbit-social/schema.ts";
import type { Query } from "./query.ts";

export type Row = Record<string, unknown> & { id: number };

/**
 * int: integer; nint: integer where 0 is NULL (a link that may be "none");
 * text; ts: `YYYY-MM-DDTHH:MM:SS`; date: `YYYY-MM-DD`; dateopt: a date or "";
 * texts: a text[] column.
 */
type ColType = "int" | "nint" | "text" | "ts" | "date" | "dateopt" | "texts";

interface Col {
  /** the Db field */
  f: string;
  /** the SQL column */
  c: string;
  t: ColType;
  enum?: readonly string[];
  /** looked at by the `q` of a list */
  search?: boolean;
}

/** A list of integers kept in a child table (parent, position, value). */
interface Child {
  table: string;
  parent: string;
  value: string;
  /** the Db field */
  f: string;
}

export interface TableDef {
  name: TableName;
  sql: string;
  cols: Col[];
  children: Child[];
  /** fields never sent by the list/profile endpoints (sync keeps them) */
  secret?: string[];
  /** rows point at rows of the same table (one statement, no chunks) */
  selfRef?: boolean;
}

const int = (f: string, c: string): Col => ({ f, c, t: "int" });
const nint = (f: string, c: string): Col => ({ f, c, t: "nint" });
const text = (f: string, c: string, search = false): Col => ({
  f,
  c,
  t: "text",
  search,
});
const ts = (f: string, c: string): Col => ({ f, c, t: "ts" });
const oneOf = (f: string, c: string, values: readonly string[]): Col => ({
  f,
  c,
  t: "text",
  enum: values,
});
const list = (
  table: string,
  parent: string,
  value: string,
  f: string,
): Child => ({
  table,
  parent,
  value,
  f,
});

export const TABLE_DEFS: Record<TableName, TableDef> = {
  users: {
    name: "users",
    sql: "users",
    secret: ["passwordHash"],
    cols: [
      text("name", "name", true),
      text("email", "email", true),
      text("passwordHash", "password_hash"),
      oneOf("role", "role", ["user", "moderator", "admin"]),
      oneOf("status", "status", ["active", "banned"]),
      text("avatar", "avatar"),
      text("about", "about"),
      text("city", "city", true),
      { f: "birthday", c: "birthday", t: "dateopt" },
      text("website", "website"),
      text("phone", "phone"),
      { f: "interests", c: "interests", t: "texts" },
      ts("createdAt", "created_at"),
      ts("lastSeen", "last_seen"),
    ],
    children: [],
  },
  friends: {
    name: "friends",
    sql: "friends",
    cols: [
      int("userId", "user_id"),
      int("friendId", "friend_id"),
      oneOf("status", "status", ["accepted", "pending"]),
      ts("since", "since"),
    ],
    children: [],
  },
  posts: {
    name: "posts",
    sql: "posts",
    selfRef: true,
    cols: [
      int("authorId", "author_id"),
      nint("wallId", "wall_id"),
      nint("communityId", "community_id"),
      oneOf("kind", "kind", [
        "text",
        "music",
        "photo",
        "picture",
        "link",
        "repost",
      ]),
      text("text", "text", true),
      nint("songId", "song_id"),
      nint("photoId", "photo_id"),
      text("picture", "picture"),
      text("url", "url"),
      text("linkTitle", "link_title"),
      nint("repostOf", "repost_of"),
      ts("createdAt", "created_at"),
    ],
    children: [list("post_likes", "post_id", "user_id", "likeIds")],
  },
  comments: {
    name: "comments",
    sql: "comments",
    cols: [
      int("postId", "post_id"),
      int("authorId", "author_id"),
      text("text", "text", true),
      ts("createdAt", "created_at"),
    ],
    children: [],
  },
  articles: {
    name: "articles",
    sql: "articles",
    cols: [
      int("authorId", "author_id"),
      text("title", "title", true),
      text("body", "body"),
      { f: "tags", c: "tags", t: "texts" },
      text("cover", "cover"),
      ts("createdAt", "created_at"),
    ],
    children: [list("article_likes", "article_id", "user_id", "likeIds")],
  },
  photoAlbums: {
    name: "photoAlbums",
    sql: "photo_albums",
    cols: [
      int("ownerId", "owner_id"),
      text("title", "title", true),
      text("description", "description"),
      ts("createdAt", "created_at"),
    ],
    children: [],
  },
  photos: {
    name: "photos",
    sql: "photos",
    cols: [
      int("albumId", "album_id"),
      int("ownerId", "owner_id"),
      text("src", "src"),
      text("caption", "caption", true),
      ts("createdAt", "created_at"),
    ],
    children: [],
  },
  conversations: {
    name: "conversations",
    sql: "conversations",
    cols: [
      oneOf("kind", "kind", ["dm", "chat"]),
      text("title", "title", true),
      ts("createdAt", "created_at"),
    ],
    children: [
      list("conversation_members", "conversation_id", "user_id", "memberIds"),
    ],
  },
  messages: {
    name: "messages",
    sql: "messages",
    cols: [
      int("conversationId", "conversation_id"),
      int("authorId", "author_id"),
      text("text", "text", true),
      ts("createdAt", "created_at"),
    ],
    children: [],
  },
  communities: {
    name: "communities",
    sql: "communities",
    cols: [
      text("name", "name", true),
      text("description", "description"),
      text("wallpaper", "wallpaper"),
      int("ownerId", "owner_id"),
      ts("createdAt", "created_at"),
    ],
    children: [
      list("community_moderators", "community_id", "user_id", "moderatorIds"),
      list("community_members", "community_id", "user_id", "memberIds"),
      list("community_contacts", "community_id", "user_id", "contactIds"),
    ],
  },
  artists: {
    name: "artists",
    sql: "artists",
    cols: [text("name", "name", true), text("country", "country", true)],
    children: [],
  },
  albums: {
    name: "albums",
    sql: "albums",
    cols: [
      int("artistId", "artist_id"),
      text("title", "title", true),
      int("year", "year"),
      text("cover", "cover"),
    ],
    children: [],
  },
  songs: {
    name: "songs",
    sql: "songs",
    cols: [
      int("albumId", "album_id"),
      int("artistId", "artist_id"),
      text("title", "title", true),
      text("genre", "genre", true),
      int("duration", "duration"),
      int("year", "year"),
    ],
    children: [],
  },
  playlists: {
    name: "playlists",
    sql: "playlists",
    cols: [
      int("ownerId", "owner_id"),
      text("title", "title", true),
      ts("createdAt", "created_at"),
    ],
    children: [list("playlist_songs", "playlist_id", "song_id", "songIds")],
  },
  scores: {
    name: "scores",
    sql: "scores",
    cols: [
      int("userId", "user_id"),
      oneOf("game", "game", ["snake", "pacman", "tetris"]),
      int("score", "score"),
      ts("at", "at"),
    ],
    children: [],
  },
  session: {
    name: "session",
    sql: "ui_session",
    cols: [int("userId", "user_id")],
    children: [],
  },
};

/** Every table, parents before children (the order rows are written in). */
export const TABLE_NAMES: TableName[] = [
  "users",
  "artists",
  "albums",
  "songs",
  "photoAlbums",
  "photos",
  "communities",
  "conversations",
  "friends",
  "posts",
  "comments",
  "articles",
  "messages",
  "playlists",
  "scores",
  "session",
];

export const isTable = (name: string): name is TableName =>
  Object.prototype.hasOwnProperty.call(TABLE_DEFS, name);

export const fieldsOf = (def: TableDef): string[] => [
  "id",
  ...def.cols.map((c) => c.f),
  ...def.children.map((c) => c.f),
];

// ------------------------------------------------------------ validation

const TS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const show = (v: unknown): string => {
  const s = JSON.stringify(v);
  if (s === undefined) return String(v);
  return s.length > 40 ? s.slice(0, 37) + "..." : s;
};

const isInt = (v: unknown): v is number =>
  typeof v === "number" && Number.isInteger(v) && Math.abs(v) < 2147483647;

function badValue(col: Col, v: unknown): string | null {
  if (col.enum) {
    return typeof v === "string" && col.enum.includes(v)
      ? null
      : `${show(v)} is not one of ${col.enum.join(", ")}`;
  }
  switch (col.t) {
    case "int":
      return isInt(v) ? null : `${show(v)} is not an integer`;
    case "nint":
      return isInt(v) && v >= 0
        ? null
        : `${show(v)} is not an integer of 0 or more`;
    case "text":
      return typeof v === "string" ? null : `${show(v)} is not a string`;
    case "ts":
      return typeof v === "string" && TS.test(v)
        ? null
        : `${show(v)} is not a date like 2026-03-14T09:30:00`;
    case "date":
      return typeof v === "string" && DATE.test(v)
        ? null
        : `${show(v)} is not a date like 2026-03-14`;
    case "dateopt":
      return typeof v === "string" && (v === "" || DATE.test(v))
        ? null
        : `${show(v)} is not a date like 2026-03-14`;
    case "texts":
      return Array.isArray(v) && v.every((x) => typeof x === "string")
        ? null
        : `${show(v)} is not an array of strings`;
  }
}

/**
 * Checks one row against the table's shape. Unknown fields are dropped.
 * `where` names the row in the message (`rows[3]`); the message names the field.
 */
export function checkRow(
  def: TableDef,
  input: unknown,
  where: string,
  needId = true,
): { row: Row } | { error: string } {
  if (typeof input !== "object" || input === null || Array.isArray(input))
    return { error: `${where} is not an object` };
  const src = input as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  if (needId || src.id !== undefined) {
    if (!isInt(src.id) || src.id <= 0)
      return { error: `${where}.id ${show(src.id)} is not a positive integer` };
    out.id = src.id;
  }
  for (const col of def.cols) {
    if (!(col.f in src)) return { error: `${where}.${col.f} is missing` };
    const bad = badValue(col, src[col.f]);
    if (bad) return { error: `${where}.${col.f} ${bad}` };
    out[col.f] = src[col.f];
  }
  for (const ch of def.children) {
    const v = src[ch.f];
    if (!Array.isArray(v))
      return {
        error: `${where}.${ch.f} ${v === undefined ? "is missing" : `${show(v)} is not an array`}`,
      };
    for (let i = 0; i < v.length; i++) {
      if (!isInt(v[i]) || (v[i] as number) <= 0)
        return {
          error: `${where}.${ch.f}[${i}] ${show(v[i])} is not a positive integer`,
        };
    }
    out[ch.f] = v.slice();
  }
  return { row: out as Row };
}

// ---------------------------------------------------------------- reading

const q = (name: string): string => `"${name}"`;

function selectExpr(col: Col): string {
  const c = q(col.c);
  switch (col.t) {
    case "nint":
      return `coalesce(${c}, 0)::int AS ${q(col.f)}`;
    case "ts":
      return `to_char(${c}, 'YYYY-MM-DD"T"HH24:MI:SS') AS ${q(col.f)}`;
    case "date":
      return `to_char(${c}, 'YYYY-MM-DD') AS ${q(col.f)}`;
    case "dateopt":
      return `coalesce(to_char(${c}, 'YYYY-MM-DD'), '') AS ${q(col.f)}`;
    default:
      return `${c} AS ${q(col.f)}`;
  }
}

/** `id, "col" AS "field", ...`: the select list of a table. */
export const selectList = (def: TableDef, alias = ""): string => {
  const prefix = alias ? `${alias}.` : "";
  return [
    `${prefix}id`,
    ...def.cols.map((c) => {
      const e = selectExpr(c);
      return alias ? e.replace(q(c.c), `${prefix}${q(c.c)}`) : e;
    }),
  ].join(", ");
};

/** Adds the list fields (likes, members, songs...) to rows of `def`. */
export async function withChildren(
  run: Query,
  def: TableDef,
  rows: Row[],
  all = false,
): Promise<Row[]> {
  for (const ch of def.children) {
    const found = all
      ? await run<{ pid: number; v: number }>(
          `SELECT ${q(ch.parent)} AS pid, ${q(ch.value)} AS v FROM ${ch.table} ORDER BY ${q(ch.parent)}, position`,
        )
      : rows.length === 0
        ? []
        : await run<{ pid: number; v: number }>(
            `SELECT ${q(ch.parent)} AS pid, ${q(ch.value)} AS v FROM ${ch.table}
              WHERE ${q(ch.parent)} = ANY($1::int[]) ORDER BY ${q(ch.parent)}, position`,
            [rows.map((r) => r.id)],
          );
    const by = new Map<number, number[]>();
    for (const { pid, v } of found) {
      const l = by.get(pid);
      if (l) l.push(v);
      else by.set(pid, [v]);
    }
    for (const r of rows) r[ch.f] = by.get(r.id) ?? [];
  }
  return rows;
}

/** Rows of one table (with their lists); `tail` is `WHERE ... ORDER BY ... LIMIT ...`. */
export async function selectRows(
  run: Query,
  def: TableDef,
  tail = "ORDER BY id",
  params: unknown[] = [],
): Promise<Row[]> {
  const rows = await run<Row>(
    `SELECT ${selectList(def)} FROM ${def.sql} ${tail}`,
    params,
  );
  return withChildren(run, def, rows, tail === "ORDER BY id" && !params.length);
}

/** Every row of the given tables (all of them when none are named), by id. */
export async function loadTables(
  run: Query,
  tables: readonly TableName[] = TABLE_NAMES,
): Promise<Partial<Record<TableName, Row[]>>> {
  const out: Partial<Record<TableName, Row[]>> = {};
  await Promise.all(
    tables.map(async (t) => {
      out[t] = await selectRows(run, TABLE_DEFS[t]);
    }),
  );
  return out;
}

export async function getRow(
  run: Query,
  def: TableDef,
  id: number,
): Promise<Row | undefined> {
  return (await selectRows(run, def, "WHERE id = $1", [id]))[0];
}

/** Drops the fields a list must not show (password hashes). */
export function publicRow(def: TableDef, row: Row): Row {
  if (!def.secret) return row;
  const copy = { ...row };
  for (const f of def.secret) delete copy[f];
  return copy;
}

// ---------------------------------------------------------------- writing

const CHUNK = 5000;

function toDb(col: Col, v: unknown): unknown {
  switch (col.t) {
    case "nint":
      return v === 0 ? null : v;
    case "dateopt":
      return v === "" ? null : v;
    case "texts":
      return JSON.stringify(v);
    default:
      return v;
  }
}

const pgArray = (col: Col): string =>
  col.t === "int" || col.t === "nint" ? "int[]" : "text[]";

function insertExpr(col: Col): string {
  const v = `v.${q(col.c)}`;
  switch (col.t) {
    case "ts":
      return `${v}::timestamp`;
    case "date":
    case "dateopt":
      return `${v}::date`;
    case "texts":
      return `ARRAY(SELECT jsonb_array_elements_text(${v}::jsonb))`;
    default:
      return v;
  }
}

/** Inserts or updates rows by id (last one wins on a repeated id); returns how many. */
export async function upsertRows(
  run: Query,
  def: TableDef,
  input: readonly Row[],
): Promise<number> {
  const byId = new Map<number, Row>();
  for (const r of input) byId.set(r.id, r);
  const rows = [...byId.values()];
  if (rows.length === 0) return 0;
  const size = def.selfRef ? rows.length : CHUNK;
  const columns = ["id", ...def.cols.map((c) => c.c)];
  const sql = `INSERT INTO ${def.sql} (${columns.map(q).join(", ")})
    SELECT v.id, ${def.cols.map(insertExpr).join(", ")}
      FROM unnest($1::int[], ${def.cols.map((c, i) => `$${i + 2}::${pgArray(c)}`).join(", ")})
           AS v(${columns.map(q).join(", ")})
    ON CONFLICT (id) DO UPDATE SET ${def.cols.map((c) => `${q(c.c)} = EXCLUDED.${q(c.c)}`).join(", ")}`;
  for (let i = 0; i < rows.length; i += size) {
    const part = rows.slice(i, i + size);
    if (def.name === "users") {
      // a changed password hash (the frontend's) retires the API credential
      await run(
        `DELETE FROM credentials c USING users u, unnest($1::int[], $2::text[]) AS v(id, ph)
          WHERE u.id = v.id AND c.user_id = u.id AND u.password_hash <> v.ph`,
        [part.map((r) => r.id), part.map((r) => r.passwordHash)],
      );
    }
    await run(sql, [
      part.map((r) => r.id),
      ...def.cols.map((c) => part.map((r) => toDb(c, r[c.f]))),
    ]);
    for (const ch of def.children) {
      await run(
        `DELETE FROM ${ch.table} WHERE ${q(ch.parent)} = ANY($1::int[])`,
        [part.map((r) => r.id)],
      );
      const parents: number[] = [];
      const positions: number[] = [];
      const values: number[] = [];
      for (const r of part) {
        (r[ch.f] as number[]).forEach((v, p) => {
          parents.push(r.id);
          positions.push(p);
          values.push(v);
        });
      }
      for (let k = 0; k < parents.length; k += 50000) {
        await run(
          `INSERT INTO ${ch.table} (${q(ch.parent)}, position, ${q(ch.value)})
           SELECT * FROM unnest($1::int[], $2::int[], $3::int[])`,
          [
            parents.slice(k, k + 50000),
            positions.slice(k, k + 50000),
            values.slice(k, k + 50000),
          ],
        );
      }
    }
  }
  return rows.length;
}

/** Deletes rows by id (the database cascades); returns how many were there. */
export async function removeRows(
  run: Query,
  def: TableDef,
  ids: readonly number[],
): Promise<number> {
  if (ids.length === 0) return 0;
  const gone = await run<{ id: number }>(
    `DELETE FROM ${def.sql} WHERE id = ANY($1::int[]) RETURNING id`,
    [ids],
  );
  return gone.length;
}

/** Clears every table and writes `data` (missing tables stay empty), in one transaction. */
export async function replaceAll(
  run: Query,
  data: Partial<Record<TableName, readonly Row[]>>,
): Promise<number> {
  return run.transaction(async (tx) => {
    // users and artists reach every other table through foreign keys
    await tx(`TRUNCATE users, artists CASCADE`);
    let n = 0;
    for (const t of TABLE_NAMES) {
      n += await upsertRows(tx, TABLE_DEFS[t], data[t] ?? []);
    }
    return n;
  });
}

export type { Db };
