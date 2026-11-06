/**
 * The JSON API of Orbit as pure functions over a `Query` (no `http` here, so
 * the handlers are testable without a socket). `handleApi` takes the request
 * as plain data plus an optional context (the Bearer token, the query string)
 * and returns `{status, body}`.
 */
import { gradient } from "../../../framework/ui-kit/frontend/templates/orbit-social/pictures.ts";
import {
  closeSession,
  hashPassword,
  legacyHash,
  openSession,
  type Principal,
  principalOf,
  verifyPassword,
} from "./auth.ts";
import type { Query } from "./db/query.ts";
import {
  checkRow,
  getRow,
  isTable,
  loadTables,
  publicRow,
  type Row,
  removeRows,
  replaceAll,
  selectRows,
  TABLE_DEFS,
  TABLE_NAMES,
  type TableDef,
  upsertRows,
} from "./db/repo.ts";
import { seedDatabase } from "./db/reset.ts";

export type { Query };

export interface Reply {
  status: number;
  body: unknown;
}

/** What the transport knows about a request besides method, path and body. */
export interface ApiContext {
  /** the Bearer token, without the word "Bearer" */
  token?: string | null;
  /** the query string */
  params?: URLSearchParams;
}

const ok = (body: unknown, status = 200): Reply => ({ status, body });
const fail = (status: number, message: string, field?: string): Reply => ({
  status,
  body: field ? { error: message, field } : { error: message },
});

const GAMES = ["snake", "pacman", "tetris"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isId = (v: unknown): v is number =>
  typeof v === "number" && Number.isInteger(v) && v > 0 && v < 2147483647;

const stamp = (): string => new Date().toISOString().slice(0, 19);

/** `%text%` for ILIKE with the wildcards of the text itself escaped. */
const contains = (text: string): string =>
  `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

// ------------------------------------------------------------- parameters

class Bad extends Error {
  constructor(readonly reply: Reply) {
    super("bad request");
  }
}

function intParam(
  params: URLSearchParams,
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = params.get(name);
  if (raw === null || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max)
    throw new Bad(
      fail(400, `${name} must be an integer from ${min} to ${max}`, name),
    );
  return n;
}

function paging(params: URLSearchParams, size = 20) {
  const page = intParam(params, "page", 1, 1, 1_000_000);
  const sz = intParam(params, "size", size, 1, 200);
  return { page, size: sz, offset: (page - 1) * sz };
}

// ------------------------------------------------------------------ guards

type Role = Principal["role"];

/** The signed-in user, or the 401/403 reply. */
async function guard(
  db: Query,
  ctx: ApiContext,
  roles?: readonly Role[],
): Promise<Principal | Reply> {
  const me = await principalOf(db, ctx.token);
  if (!me) return fail(401, "Sign in first (Authorization: Bearer <token>)");
  if (roles && !roles.includes(me.role))
    return fail(403, `This needs the role ${roles.join(" or ")}`);
  return me;
}

const isReply = (v: Principal | Reply): v is Reply => "body" in v;

// ------------------------------------------------------------------- users

async function publicUser(db: Query, id: number): Promise<Row | undefined> {
  const row = await getRow(db, TABLE_DEFS.users, id);
  return row && publicRow(TABLE_DEFS.users, row);
}

async function nextId(db: Query, def: TableDef): Promise<number> {
  await db(`LOCK TABLE ${def.sql} IN SHARE ROW EXCLUSIVE MODE`);
  const [r] = await db<{ id: number }>(
    `SELECT coalesce(max(id), 0) + 1 AS id FROM ${def.sql}`,
  );
  return r.id;
}

// -------------------------------------------------------------------- auth

async function register(db: Query, body: unknown): Promise<Reply> {
  if (!isObject(body)) return fail(400, "the body must be a JSON object");
  const { name, email, password } = body;
  if (typeof name !== "string" || name.trim().length < 2)
    return fail(400, "name must be at least 2 letters", "name");
  if (typeof email !== "string" || !EMAIL.test(email.trim()))
    return fail(400, "email is not an email address", "email");
  if (typeof password !== "string" || password.length < 6)
    return fail(400, "password must be at least 6 characters", "password");
  const taken = await db(`SELECT 1 FROM users WHERE lower(email) = lower($1)`, [
    email.trim(),
  ]);
  if (taken.length) return fail(409, "Someone already has this email", "email");
  const hash = await hashPassword(password);
  const id = await db.transaction(async (tx) => {
    const id = await nextId(tx, TABLE_DEFS.users);
    const hue = (id * 47) % 360;
    const now = stamp();
    await upsertRows(tx, TABLE_DEFS.users, [
      {
        id,
        name: name.trim(),
        email: email.trim(),
        passwordHash: legacyHash(password),
        role: "user",
        status: "active",
        avatar: gradient(hue, hue + 40, name.trim().charAt(0).toUpperCase()),
        about: "",
        city: "",
        birthday: "2000-01-01",
        website: "",
        phone: "",
        interests: [],
        createdAt: now,
        lastSeen: now,
      },
    ]);
    await tx(`INSERT INTO credentials (user_id, hash) VALUES ($1, $2)`, [
      id,
      hash,
    ]);
    return id;
  });
  const session = await openSession(db, id);
  return ok({ ...session, user: await publicUser(db, id) }, 201);
}

async function login(db: Query, body: unknown): Promise<Reply> {
  if (!isObject(body)) return fail(400, "the body must be a JSON object");
  const { email, password } = body;
  if (typeof email !== "string" || !email.trim())
    return fail(400, "email is required", "email");
  if (typeof password !== "string" || !password)
    return fail(400, "password is required", "password");
  const wrong = fail(401, "The email or the password is wrong.");
  const [user] = await db<{
    id: number;
    status: string;
    legacy: string;
    hash: string | null;
  }>(
    `SELECT u.id, u.status, u.password_hash AS legacy, c.hash
       FROM users u LEFT JOIN credentials c ON c.user_id = u.id
      WHERE lower(u.email) = lower($1)`,
    [email.trim()],
  );
  if (!user) return wrong;
  if (user.hash) {
    if (!(await verifyPassword(password, user.hash))) return wrong;
  } else {
    // no scrypt hash yet (seeded or made by the frontend): check the template's
    // hash and upgrade on success
    if (legacyHash(password) !== user.legacy) return wrong;
    await db(
      `INSERT INTO credentials (user_id, hash) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET hash = EXCLUDED.hash, updated_at = now()`,
      [user.id, await hashPassword(password)],
    );
  }
  if (user.status === "banned") return fail(403, "This account is banned.");
  const session = await openSession(db, user.id);
  return ok({ ...session, user: await publicUser(db, user.id) });
}

// ------------------------------------------------------------------- sync

function tableOf(name: unknown): TableDef | Reply {
  if (typeof name !== "string" || !isTable(name))
    return fail(400, `table ${show(name)} is unknown`, "table");
  return TABLE_DEFS[name];
}

const show = (v: unknown): string => {
  const s = JSON.stringify(v);
  return s === undefined
    ? String(v)
    : s.length > 40
      ? s.slice(0, 37) + "..."
      : s;
};

/** Validates rows of one table; the first wrong field is the error. */
function checkRows(
  def: TableDef,
  rows: unknown[],
  where: string,
): Row[] | Reply {
  const out: Row[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = checkRow(def, rows[i], `${where}[${i}]`);
    if ("error" in r) return fail(400, r.error, where);
    out.push(r.row);
  }
  return out;
}

async function sync(db: Query, action: string, body: unknown): Promise<Reply> {
  switch (action) {
    case "load": {
      const names: string[] = TABLE_NAMES.slice();
      let wanted = names;
      if (isObject(body) && body.tables !== undefined) {
        if (!Array.isArray(body.tables))
          return fail(400, "tables must be an array of table names", "tables");
        for (const t of body.tables)
          if (typeof t !== "string" || !isTable(t))
            return fail(400, `table ${show(t)} is unknown`, "tables");
        wanted = body.tables as string[];
      }
      return ok({ data: await loadTables(db, wanted as never) });
    }
    case "put": {
      if (!isObject(body)) return fail(400, "the body must be a JSON object");
      const def = tableOf(body.table);
      if ("status" in def) return def;
      if (!Array.isArray(body.rows))
        return fail(400, "rows must be an array", "rows");
      const rows = checkRows(def, body.rows, "rows");
      if ("status" in rows) return rows;
      const saved = await db.transaction((tx) => upsertRows(tx, def, rows));
      return ok({ saved });
    }
    case "remove": {
      if (!isObject(body)) return fail(400, "the body must be a JSON object");
      const def = tableOf(body.table);
      if ("status" in def) return def;
      if (!Array.isArray(body.ids) || !body.ids.every(isId))
        return fail(400, "ids must be an array of positive integers", "ids");
      const removed = await db.transaction((tx) =>
        removeRows(tx, def, body.ids as number[]),
      );
      return ok({ removed });
    }
    case "replace": {
      if (!isObject(body) || !isObject(body.data))
        return fail(400, "data must be an object of tables", "data");
      const data: Record<string, Row[]> = {};
      for (const [name, rows] of Object.entries(body.data)) {
        const def = tableOf(name);
        if ("status" in def)
          return fail(400, `table ${show(name)} is unknown`, "data");
        if (!Array.isArray(rows))
          return fail(400, `data.${name} must be an array`, `data.${name}`);
        const clean = checkRows(def, rows, `data.${name}`);
        if ("status" in clean) return clean;
        data[name] = clean;
      }
      return ok({ rows: await replaceAll(db, data) });
    }
    case "reset":
      return ok({ rows: await seedDatabase(db) });
    default:
      return fail(404, `no route /api/sync/${action}`);
  }
}

// -------------------------------------------------------------- table CRUD

async function listTable(
  db: Query,
  def: TableDef,
  params: URLSearchParams,
): Promise<Reply> {
  const { page, size, offset } = paging(params);
  const sortable = new Map<string, string>([["id", "id"]]);
  for (const c of def.cols)
    if (!def.secret?.includes(c.f)) sortable.set(c.f, c.c);
  const sort = params.get("sort") || "id";
  const column = sortable.get(sort);
  if (!column)
    return fail(
      400,
      `sort must be one of ${[...sortable.keys()].join(", ")}`,
      "sort",
    );
  const dir = (params.get("dir") || "asc").toLowerCase();
  if (dir !== "asc" && dir !== "desc")
    return fail(400, "dir must be asc or desc", "dir");
  const values: unknown[] = [];
  let where = "";
  const qtext = params.get("q")?.trim();
  if (qtext) {
    values.push(contains(qtext));
    const parts = def.cols
      .filter((c) => c.search)
      .map((c) => `"${c.c}" ILIKE $1`);
    if (/^\d+$/.test(qtext) && qtext.length < 10) {
      values.push(Number(qtext));
      parts.push("id = $2");
    }
    where = `WHERE ${parts.join(" OR ")}`;
  }
  const [{ n }] = await db<{ n: number }>(
    `SELECT count(*)::int AS n FROM ${def.sql} ${where}`,
    values,
  );
  const rows = await selectRows(
    db,
    def,
    `${where} ORDER BY "${column}" ${dir}, id ${dir} LIMIT ${size} OFFSET ${offset}`,
    values,
  );
  return ok({
    rows: rows.map((r) => publicRow(def, r)),
    total: n,
    page,
    size,
  });
}

async function tableRoute(
  db: Query,
  method: string,
  def: TableDef,
  idText: string | undefined,
  body: unknown,
  ctx: ApiContext,
): Promise<Reply> {
  const writeRoles: Role[] =
    def.name === "users" ? ["admin"] : ["moderator", "admin"];
  if (idText === undefined) {
    if (method === "GET")
      return listTable(db, def, ctx.params ?? new URLSearchParams());
    if (method !== "POST") return fail(405, `${method} is not allowed here`);
    const me = await guard(db, ctx, writeRoles);
    if (isReply(me)) return me;
    const r = checkRow(def, body, "body", false);
    if ("error" in r) return fail(400, r.error);
    const row = await db.transaction(async (tx) => {
      let id = r.row.id as number | undefined;
      if (id === undefined) id = await nextId(tx, def);
      else if (await getRow(tx, def, id)) return null;
      await upsertRows(tx, def, [{ ...r.row, id }]);
      return getRow(tx, def, id);
    });
    if (!row) return fail(409, `${def.name} ${r.row.id} already exists`, "id");
    return ok(publicRow(def, row), 201);
  }
  const id = /^\d+$/.test(idText) ? Number(idText) : 0;
  if (!isId(id)) return fail(400, "the id must be a positive integer", "id");
  if (method === "GET") {
    const row = await getRow(db, def, id);
    return row ? ok(publicRow(def, row)) : fail(404, `no ${def.name} ${id}`);
  }
  if (method !== "PUT" && method !== "DELETE")
    return fail(405, `${method} is not allowed here`);
  const me = await guard(db, ctx, writeRoles);
  if (isReply(me)) return me;
  if (method === "DELETE") {
    const removed = await db.transaction((tx) => removeRows(tx, def, [id]));
    return removed ? ok({ removed }) : fail(404, `no ${def.name} ${id}`);
  }
  if (isObject(body) && body.id !== undefined && body.id !== id)
    return fail(400, "id in the body differs from the id in the path", "id");
  const r = checkRow(def, isObject(body) ? { ...body, id } : body, "body");
  if ("error" in r) return fail(400, r.error);
  const row = await db.transaction(async (tx) => {
    if (!(await getRow(tx, def, id))) return null;
    await upsertRows(tx, def, [r.row]);
    return getRow(tx, def, id);
  });
  return row ? ok(publicRow(def, row)) : fail(404, `no ${def.name} ${id}`);
}

// ---------------------------------------------- profile, feed, search, games

async function profile(db: Query, id: number): Promise<Reply> {
  const user = await publicUser(db, id);
  if (!user) return fail(404, `no user ${id}`);
  const [counts] = await db<Record<string, number>>(
    `SELECT
       (SELECT count(*) FROM friends WHERE status = 'accepted' AND (user_id = $1 OR friend_id = $1))::int AS friends,
       (SELECT count(*) FROM friends WHERE status = 'pending' AND friend_id = $1)::int AS requests,
       (SELECT count(*) FROM posts WHERE wall_id = $1)::int AS posts,
       (SELECT count(*) FROM articles WHERE author_id = $1)::int AS articles,
       (SELECT count(*) FROM photo_albums WHERE owner_id = $1)::int AS albums,
       (SELECT count(*) FROM photos WHERE owner_id = $1)::int AS photos,
       (SELECT count(*) FROM community_members WHERE user_id = $1)::int AS communities,
       (SELECT count(*) FROM playlists WHERE owner_id = $1)::int AS playlists,
       (SELECT count(*) FROM scores WHERE user_id = $1)::int AS scores`,
    [id],
  );
  return ok({ user, counts });
}

async function feed(db: Query, params: URLSearchParams): Promise<Reply> {
  const { page, size, offset } = paging(params);
  const raw = params.get("userId");
  let where = "WHERE wall_id IS NOT NULL";
  const values: unknown[] = [];
  if (raw !== null && raw !== "") {
    const userId = /^\d+$/.test(raw) ? Number(raw) : 0;
    if (!isId(userId))
      return fail(400, "userId must be a positive integer", "userId");
    if (!(await db(`SELECT 1 FROM users WHERE id = $1`, [userId])).length)
      return fail(404, `no user ${userId}`);
    where = "WHERE wall_id = $1";
    values.push(userId);
  }
  const [{ n }] = await db<{ n: number }>(
    `SELECT count(*)::int AS n FROM posts ${where}`,
    values,
  );
  const posts = await selectRows(
    db,
    TABLE_DEFS.posts,
    `${where} ORDER BY created_at DESC, id DESC LIMIT ${size} OFFSET ${offset}`,
    values,
  );
  const authors = posts.length
    ? await db<{ id: number; name: string; avatar: string }>(
        `SELECT id, name, avatar FROM users WHERE id = ANY($1::int[])`,
        [[...new Set(posts.map((p) => p.authorId as number))]],
      )
    : [];
  const byId = new Map(authors.map((a) => [a.id, a]));
  const counts = posts.length
    ? await db<{ id: number; n: number }>(
        `SELECT post_id AS id, count(*)::int AS n FROM comments WHERE post_id = ANY($1::int[]) GROUP BY post_id`,
        [posts.map((p) => p.id)],
      )
    : [];
  const commentCount = new Map(counts.map((c) => [c.id, c.n]));
  return ok({
    rows: posts.map((p) => ({
      ...p,
      author: byId.get(p.authorId as number) ?? null,
      commentCount: commentCount.get(p.id) ?? 0,
    })),
    total: n,
    page,
    size,
  });
}

async function searchSongs(db: Query, params: URLSearchParams): Promise<Reply> {
  const { page, size, offset } = paging(params);
  const values: unknown[] = [];
  const where: string[] = [];
  const add = (v: unknown): string => {
    values.push(v);
    return `$${values.length}`;
  };
  const q = params.get("q")?.trim();
  if (q) {
    const p = add(contains(q));
    where.push(
      `(s.title ILIKE ${p} OR a.name ILIKE ${p} OR al.title ILIKE ${p})`,
    );
  }
  const genre = params.get("genre")?.trim();
  if (genre) where.push(`lower(s.genre) = lower(${add(genre)})`);
  // artist / album: an id, or a part of the name
  const artist = params.get("artist")?.trim();
  if (artist)
    where.push(
      /^\d+$/.test(artist)
        ? `s.artist_id = ${add(Number(artist))}`
        : `a.name ILIKE ${add(contains(artist))}`,
    );
  const album = params.get("album")?.trim();
  if (album)
    where.push(
      /^\d+$/.test(album)
        ? `s.album_id = ${add(Number(album))}`
        : `al.title ILIKE ${add(contains(album))}`,
    );
  const from = `FROM songs s JOIN artists a ON a.id = s.artist_id JOIN albums al ON al.id = s.album_id
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}`;
  const [{ n }] = await db<{ n: number }>(
    `SELECT count(*)::int AS n ${from}`,
    values,
  );
  const rows = await db(
    `SELECT s.id, s.title, s.genre, s.duration, s.year, s.artist_id AS "artistId", a.name AS artist,
            s.album_id AS "albumId", al.title AS album
       ${from} ORDER BY s.title, s.id LIMIT ${size} OFFSET ${offset}`,
    values,
  );
  return ok({ rows, total: n, page, size });
}

async function leaderboard(
  db: Query,
  game: string,
  params: URLSearchParams,
): Promise<Reply> {
  if (!GAMES.includes(game)) return fail(404, `no game ${show(game)}`);
  const limit = intParam(params, "limit", 10, 1, 100);
  // the best score of each player
  const rows = await db(
    `SELECT row_number() OVER (ORDER BY b.score DESC, b.at, b.user_id)::int AS rank,
            b.user_id AS "userId", u.name, u.avatar, b.score,
            to_char(b.at, 'YYYY-MM-DD"T"HH24:MI:SS') AS at
       FROM (SELECT DISTINCT ON (user_id) user_id, score, at
               FROM scores WHERE game = $1
              ORDER BY user_id, score DESC, at) b
       JOIN users u ON u.id = b.user_id
      ORDER BY rank LIMIT ${limit}`,
    [game],
  );
  return ok({ game, rows });
}

// ------------------------------------------------------------------- admin

async function adminOverview(db: Query): Promise<Reply> {
  const entries = await Promise.all(
    TABLE_NAMES.map(async (t) => {
      const [r] = await db<{ n: number }>(
        `SELECT count(*)::int AS n FROM ${TABLE_DEFS[t].sql}`,
      );
      return [t, r.n] as const;
    }),
  );
  const newest = await selectRows(
    db,
    TABLE_DEFS.users,
    "ORDER BY created_at DESC, id DESC LIMIT 10",
    [],
  );
  const [stats] = await db<{
    banned: number;
    admins: number;
    moderators: number;
  }>(
    `SELECT count(*) FILTER (WHERE status = 'banned')::int AS banned,
            count(*) FILTER (WHERE role = 'admin')::int AS admins,
            count(*) FILTER (WHERE role = 'moderator')::int AS moderators
       FROM users`,
  );
  return ok({
    counts: Object.fromEntries(entries),
    ...stats,
    newestUsers: newest.map((u) => publicRow(TABLE_DEFS.users, u)),
  });
}

async function adminUserData(db: Query, id: number): Promise<Reply> {
  const user = await publicUser(db, id);
  if (!user) return fail(404, `no user ${id}`);
  const of = (name: keyof typeof TABLE_DEFS, tail: string) =>
    selectRows(db, TABLE_DEFS[name], `${tail} ORDER BY id`, [id]);
  const [
    friends,
    posts,
    comments,
    articles,
    photoAlbums,
    photos,
    conversations,
    messages,
    communities,
    playlists,
    scores,
  ] = await Promise.all([
    of("friends", "WHERE user_id = $1 OR friend_id = $1"),
    of("posts", "WHERE author_id = $1 OR wall_id = $1"),
    of("comments", "WHERE author_id = $1"),
    of("articles", "WHERE author_id = $1"),
    of("photoAlbums", "WHERE owner_id = $1"),
    of("photos", "WHERE owner_id = $1"),
    of(
      "conversations",
      "WHERE id IN (SELECT conversation_id FROM conversation_members WHERE user_id = $1)",
    ),
    of("messages", "WHERE author_id = $1"),
    of(
      "communities",
      `WHERE owner_id = $1
          OR id IN (SELECT community_id FROM community_members WHERE user_id = $1)
          OR id IN (SELECT community_id FROM community_moderators WHERE user_id = $1)`,
    ),
    of("playlists", "WHERE owner_id = $1"),
    of("scores", "WHERE user_id = $1"),
  ]);
  return ok({
    user,
    data: {
      friends,
      posts,
      comments,
      articles,
      photoAlbums,
      photos,
      conversations,
      messages,
      communities,
      playlists,
      scores,
    },
  });
}

// ------------------------------------------------------------------ errors

/** A database error as an HTTP reply, or undefined for the unexpected ones. */
function databaseError(e: unknown): Reply | undefined {
  const err = e as { code?: string; detail?: string; message?: string };
  const code = err?.code;
  if (typeof code !== "string") return undefined;
  const detail = err.detail ?? err.message ?? "";
  if (code === "23505") return fail(409, `already exists: ${detail}`);
  if (code === "23503") return fail(409, `a link is broken: ${detail}`);
  if (code === "23514" || code === "23502" || code.startsWith("22"))
    return fail(400, `invalid data: ${detail || err.message}`);
  return undefined;
}

// ------------------------------------------------------------------ router

/**
 * One request. `db` is the database; `ctx` carries the Bearer token and the
 * query string. 404 for an unknown route, 405 for a wrong verb, 400 for a bad
 * body (the message names the field), 401/403 from the guards, 409 for a
 * conflict.
 */
export async function handleApi(
  method: string,
  pathname: string,
  db: Query,
  body?: unknown,
  ctx: ApiContext = {},
): Promise<Reply> {
  try {
    return await route(method.toUpperCase(), pathname, db, body, ctx);
  } catch (e) {
    if (e instanceof Bad) return e.reply;
    const reply = databaseError(e);
    if (reply) return reply;
    throw e;
  }
}

async function route(
  method: string,
  pathname: string,
  db: Query,
  body: unknown,
  ctx: ApiContext,
): Promise<Reply> {
  const parts = pathname.replace(/\/+$/, "").split("/").filter(Boolean);
  if (parts[0] !== "api") return fail(404, `no route ${pathname}`);
  const [, a, b, c] = parts.map((p) => decodeURIComponent(p));
  const params = ctx.params ?? new URLSearchParams();
  const only = (
    verb: string,
    fn: () => Promise<Reply>,
  ): Promise<Reply> | Reply =>
    method === verb ? fn() : fail(405, `${method} is not allowed here`);
  const idOf = (text: string | undefined): number | undefined =>
    text !== undefined && /^\d+$/.test(text) && isId(Number(text))
      ? Number(text)
      : undefined;

  switch (a) {
    case "health":
      return only("GET", async () => {
        try {
          await db("SELECT 1");
          return ok({ ok: true, db: true });
        } catch {
          return { status: 503, body: { ok: false, db: false } };
        }
      });
    case "sync":
      if (!b) return fail(404, "no route /api/sync");
      if (parts.length > 3) return fail(404, `no route ${pathname}`);
      if (!["load", "put", "remove", "replace", "reset"].includes(b))
        return fail(404, `no route ${pathname}`);
      return only("POST", () => sync(db, b, body));
    case "auth":
      switch (b) {
        case "register":
          return only("POST", () => register(db, body));
        case "login":
          return only("POST", () => login(db, body));
        case "logout":
          return only("POST", async () => {
            const me = await guard(db, ctx);
            if (isReply(me)) return me;
            await closeSession(db, ctx.token!);
            return ok({ ok: true });
          });
        case "me":
          return only("GET", async () => {
            const me = await guard(db, ctx);
            if (isReply(me)) return me;
            return ok({ user: await publicUser(db, me.id) });
          });
        default:
          return fail(404, `no route ${pathname}`);
      }
    case "feed":
      return only("GET", () => feed(db, params));
    case "search":
      if (b !== "songs") return fail(404, `no route ${pathname}`);
      return only("GET", () => searchSongs(db, params));
    case "leaderboard":
      if (!b) return fail(404, "no route /api/leaderboard");
      return only("GET", () => leaderboard(db, b, params));
    case "admin": {
      const route404 = () => fail(404, `no route ${pathname}`);
      const isOverview = b === "overview" && parts.length === 3;
      const userId =
        b === "users" &&
        c !== undefined &&
        parts[4] === "data" &&
        parts.length === 5
          ? idOf(c)
          : undefined;
      if (
        !isOverview &&
        !(b === "users" && parts.length === 5 && parts[4] === "data")
      )
        return route404();
      if (method !== "GET") return fail(405, `${method} is not allowed here`);
      const me = await guard(db, ctx, ["admin"]);
      if (isReply(me)) return me;
      if (isOverview) return adminOverview(db);
      if (!userId) return fail(400, "the id must be a positive integer", "id");
      return adminUserData(db, userId);
    }
    case "users":
      if (parts[3] === "profile" && parts.length === 4) {
        const id = idOf(b);
        if (!id) return fail(400, "the id must be a positive integer", "id");
        return only("GET", () => profile(db, id));
      }
    // falls through to the generic table routes
    default: {
      if (a === undefined || !isTable(a))
        return fail(404, `no route ${pathname}`);
      if (parts.length > 3) return fail(404, `no route ${pathname}`);
      return tableRoute(db, method, TABLE_DEFS[a], b, body, ctx);
    }
  }
}
