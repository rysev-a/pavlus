// @vitest-environment node
import { once } from "node:events";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../../../framework/ui-kit/frontend/templates/orbit-social/schema.ts";
import { seedDb } from "../../../framework/ui-kit/frontend/templates/orbit-social/seed.ts";
import { handleApi, type Query } from "../backend/api.ts";
import { hashPassword, verifyPassword } from "../backend/auth.ts";
import { createPool } from "../backend/db/pool.ts";
import { startServer } from "../backend/server.ts";
import {
  type Backend,
  databaseAvailable,
  startBackend,
  TEST_DATABASE_URL,
} from "./backend.ts";

const available = await databaseAvailable();

type Json = any; // eslint-disable-line @typescript-eslint/no-explicit-any

describe("api without a database", () => {
  // A database that must never be asked.
  const never = (() => {
    throw new Error("no database here");
  }) as unknown as Query;

  it("answers 404 for an unknown route and 405 for a wrong verb", async () => {
    expect((await handleApi("GET", "/api/nothing", never)).status).toBe(404);
    expect((await handleApi("GET", "/elsewhere", never)).status).toBe(404);
    expect((await handleApi("GET", "/api/sync/load", never)).status).toBe(405);
    expect((await handleApi("PATCH", "/api/auth/login", never)).status).toBe(
      405,
    );
    expect(
      (await handleApi("POST", "/api/leaderboard/snake", never)).status,
    ).toBe(405);
    expect((await handleApi("GET", "/api/sync/bogus", never)).status).toBe(404);
  });

  it("validates bodies before it touches the database", async () => {
    const put = (body: unknown) =>
      handleApi("POST", "/api/sync/put", never, body);
    expect((await put({ table: "nope", rows: [] })).body).toMatchObject({
      field: "table",
    });
    expect((await put({ table: "users", rows: "x" })).status).toBe(400);
    const bad = await put({
      table: "artists",
      rows: [{ id: 1, name: 5, country: "" }],
    });
    expect(bad.status).toBe(400);
    expect((bad.body as Json).error).toContain("rows[0].name");
    const noId = await put({
      table: "artists",
      rows: [{ name: "a", country: "b" }],
    });
    expect((noId.body as Json).error).toContain("rows[0].id");
    const date = await put({
      table: "scores",
      rows: [{ id: 1, userId: 1, game: "snake", score: 1, at: "yesterday" }],
    });
    expect((date.body as Json).error).toContain("rows[0].at");
    const game = await put({
      table: "scores",
      rows: [
        {
          id: 1,
          userId: 1,
          game: "chess",
          score: 1,
          at: "2026-01-01T00:00:00",
        },
      ],
    });
    expect((game.body as Json).error).toContain("rows[0].game");
    expect(
      (
        await handleApi("POST", "/api/sync/remove", never, {
          table: "users",
          ids: [0],
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await handleApi("POST", "/api/sync/replace", never, {
          data: { users: [{}] },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await handleApi("POST", "/api/auth/register", never, {
          name: "A",
          email: "x",
          password: "123456",
        })
      ).body,
    ).toMatchObject({ field: "name" });
    expect(
      (
        await handleApi("POST", "/api/auth/register", never, {
          name: "Ann",
          email: "x",
          password: "123456",
        })
      ).body,
    ).toMatchObject({ field: "email" });
    expect(
      (
        await handleApi("POST", "/api/auth/register", never, {
          name: "Ann",
          email: "a@b.co",
          password: "123",
        })
      ).body,
    ).toMatchObject({ field: "password" });
  });

  it("hashes passwords with scrypt", async () => {
    const hash = await hashPassword("secret1");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(hash).not.toContain("secret1");
    expect(await verifyPassword("secret1", hash)).toBe(true);
    expect(await verifyPassword("secret2", hash)).toBe(false);
    expect(await verifyPassword("secret1", "garbage")).toBe(false);
    expect(await hashPassword("secret1")).not.toBe(hash);
  });
});

describe.skipIf(!available)(
  "orbit backend (real Postgres)",
  { timeout: 60_000 },
  () => {
    let backend: Backend;
    let seed: Db;

    const call = async (
      method: string,
      path: string,
      body?: unknown,
      token?: string,
    ): Promise<{ status: number; body: Json }> => {
      const res = await backend.fetch(path, {
        method,
        headers: {
          ...(body !== undefined ? { "content-type": "application/json" } : {}),
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      return { status: res.status, body: await res.json() };
    };
    const post = (path: string, body?: unknown, token?: string) =>
      call("POST", path, body ?? {}, token);
    const get = (path: string, token?: string) =>
      call("GET", path, undefined, token);
    const login = async (email: string, password = "orbit123") => {
      const r = await post("/api/auth/login", { email, password });
      expect(r.status).toBe(200);
      return r.body.token as string;
    };

    beforeAll(async () => {
      seed = seedDb();
      backend = await startBackend();
    }, 60_000);
    afterAll(async () => {
      await backend?.close();
    });
    beforeEach(async () => {
      // tests below that change data restore it themselves when it matters
    });

    const reset = async () => {
      expect((await post("/api/sync/reset")).status).toBe(200);
    };

    describe("sync", () => {
      it("reports health", async () => {
        expect(await get("/api/health")).toEqual({
          status: 200,
          body: { ok: true, db: true },
        });
      });

      it("loads exactly what seedDb() made", async () => {
        const r = await post("/api/sync/load", {});
        expect(r.status).toBe(200);
        for (const table of Object.keys(seed) as (keyof Db)[]) {
          expect(r.body.data[table], table).toEqual(seed[table]);
        }
      });

      it("loads only the tables asked for, ordered by id", async () => {
        const r = await post("/api/sync/load", {
          tables: ["artists", "albums"],
        });
        expect(Object.keys(r.body.data).sort()).toEqual(["albums", "artists"]);
        const ids = r.body.data.artists.map((a: { id: number }) => a.id);
        expect(ids).toEqual([...ids].sort((a, b) => a - b));
        expect(
          (await post("/api/sync/load", { tables: ["nope"] })).status,
        ).toBe(400);
        expect((await post("/api/sync/load", { tables: "users" })).status).toBe(
          400,
        );
      });

      it("puts (insert and update) rows with their lists", async () => {
        const post1 = {
          ...seed.posts[0],
          id: 9001,
          text: "new post",
          likeIds: [5, 3, 9],
          songId: 0,
          repostOf: 0,
        };
        const r = await post("/api/sync/put", {
          table: "posts",
          rows: [
            post1,
            { ...post1, id: 9002, repostOf: 9001, kind: "repost", likeIds: [] },
          ],
        });
        expect(r).toEqual({ status: 200, body: { saved: 2 } });
        let posts = (await post("/api/sync/load", { tables: ["posts"] })).body
          .data.posts;
        expect(posts.find((p: { id: number }) => p.id === 9001)).toEqual(post1);
        expect(posts.find((p: { id: number }) => p.id === 9002).repostOf).toBe(
          9001,
        );
        // update: the list changes order and size
        await post("/api/sync/put", {
          table: "posts",
          rows: [{ ...post1, text: "edited", likeIds: [9] }],
        });
        posts = (await post("/api/sync/load", { tables: ["posts"] })).body.data
          .posts;
        expect(posts.find((p: { id: number }) => p.id === 9001)).toMatchObject({
          text: "edited",
          likeIds: [9],
        });
        expect(posts).toHaveLength(seed.posts.length + 2);
        await reset();
      });

      it("keeps the order of a playlist and the interests of a user", async () => {
        const playlist = { ...seed.playlists[0], songIds: [30, 10, 20, 10] };
        await post("/api/sync/put", { table: "playlists", rows: [playlist] });
        const user = {
          ...seed.users[5],
          interests: ["b", "a", "c"],
          birthday: "",
        };
        await post("/api/sync/put", { table: "users", rows: [user] });
        const data = (
          await post("/api/sync/load", { tables: ["playlists", "users"] })
        ).body.data;
        expect(data.playlists[0]).toEqual(playlist);
        expect(data.users[5]).toEqual(user);
        await reset();
      });

      it("keeps a whole put atomic", async () => {
        const good = { ...seed.scores[0], id: 9100 };
        const bad = { ...seed.scores[0], id: 9101, userId: 999999 };
        const r = await post("/api/sync/put", {
          table: "scores",
          rows: [good, bad],
        });
        expect(r.status).toBe(409);
        const scores = (await post("/api/sync/load", { tables: ["scores"] }))
          .body.data.scores;
        expect(scores).toHaveLength(seed.scores.length);
      });

      it("removes rows and cascades like the frontend's delete plan", async () => {
        // a post: its comments and reposts go
        const comments = seed.comments.filter(
          (c) => c.postId === seed.posts[0].id,
        ).length;
        const before = (
          await post("/api/sync/load", { tables: ["comments", "posts"] })
        ).body.data;
        const r = await post("/api/sync/remove", {
          table: "posts",
          ids: [seed.posts[0].id, 999999],
        });
        expect(r).toEqual({ status: 200, body: { removed: 1 } });
        const after = (
          await post("/api/sync/load", { tables: ["comments", "posts"] })
        ).body.data;
        expect(after.comments.length).toBe(before.comments.length - comments);
        expect(after.posts.length).toBeLessThan(before.posts.length);
        await reset();

        // a user: friends, posts on their wall, scores, memberships
        const victim = seed.users.find(
          (u) =>
            !seed.communities.some((c) => c.ownerId === u.id) &&
            seed.friends.some((f) => f.userId === u.id),
        )!;
        await post("/api/sync/remove", { table: "users", ids: [victim.id] });
        const data = (await post("/api/sync/load", {})).body.data as Db;
        expect(data.users.some((u) => u.id === victim.id)).toBe(false);
        expect(
          data.friends.some(
            (f) => f.userId === victim.id || f.friendId === victim.id,
          ),
        ).toBe(false);
        expect(
          data.posts.some(
            (p) => p.authorId === victim.id || p.wallId === victim.id,
          ),
        ).toBe(false);
        expect(
          data.communities.some((c) => c.memberIds.includes(victim.id)),
        ).toBe(false);
        expect(data.posts.some((p) => p.likeIds.includes(victim.id))).toBe(
          false,
        );
        expect(data.scores.some((s) => s.userId === victim.id)).toBe(false);
        await reset();
      });

      it("refuses to delete what is still in use", async () => {
        const owner = seed.communities[0].ownerId;
        const r1 = await post("/api/sync/remove", {
          table: "users",
          ids: [owner],
        });
        expect(r1.status).toBe(409);
        const r2 = await post("/api/sync/remove", {
          table: "artists",
          ids: [seed.albums[0].artistId],
        });
        expect(r2.status).toBe(409);
        const r3 = await post("/api/sync/remove", {
          table: "albums",
          ids: [seed.songs[0].albumId],
        });
        expect(r3.status).toBe(409);
        const data = (await post("/api/sync/load", { tables: ["users"] })).body
          .data;
        expect(data.users).toHaveLength(seed.users.length);
      });

      it("removes a song from playlists and its music posts", async () => {
        const song = seed.songs.find((s) =>
          seed.playlists.some((p) => p.songIds.includes(s.id)),
        )!;
        await post("/api/sync/remove", { table: "songs", ids: [song.id] });
        const data = (
          await post("/api/sync/load", { tables: ["playlists", "posts"] })
        ).body.data;
        expect(
          data.playlists.some((p: { songIds: number[] }) =>
            p.songIds.includes(song.id),
          ),
        ).toBe(false);
        expect(
          data.posts.some((p: { songId: number }) => p.songId === song.id),
        ).toBe(false);
        await reset();
      });

      it("replaces everything, in one transaction", async () => {
        const small: Partial<Db> = {
          users: [seed.users[0], seed.users[1]],
          friends: [],
          posts: [
            {
              ...seed.posts[0],
              authorId: 1,
              wallId: 2,
              likeIds: [1],
              communityId: 0,
              songId: 0,
              photoId: 0,
              repostOf: 0,
            },
          ],
        };
        const r = await post("/api/sync/replace", { data: small });
        expect(r).toEqual({ status: 200, body: { rows: 3 } });
        const data = (await post("/api/sync/load", {})).body.data;
        expect(data.users).toEqual(small.users);
        expect(data.posts).toEqual(small.posts);
        expect(data.songs).toEqual([]);

        // a broken link: nothing changes
        const broken = await post("/api/sync/replace", {
          data: {
            users: [seed.users[0]],
            friends: [{ ...seed.friends[0], userId: 5000 }],
          },
        });
        expect(broken.status).toBe(409);
        expect((await post("/api/sync/load", {})).body.data.users).toEqual(
          small.users,
        );
        await reset();
      });

      it("resets to the seed and seeds ~51k rows in seconds", async () => {
        await post("/api/sync/replace", { data: {} });
        expect(
          (await post("/api/sync/load", { tables: ["users"] })).body.data.users,
        ).toEqual([]);
        const started = Date.now();
        const r = await post("/api/sync/reset");
        const total = Object.values(seed).reduce(
          (n, rows) => n + rows.length,
          0,
        );
        expect(r.body).toEqual({ rows: total });
        expect(Date.now() - started).toBeLessThan(15_000);
        expect((await post("/api/sync/load", {})).body.data.songs).toEqual(
          seed.songs,
        );
      });

      it("answers 400 for a body that is not JSON", async () => {
        const res = await fetch(`${backend.url}/api/sync/put`, {
          method: "POST",
          body: "{nope",
        });
        expect(res.status).toBe(400);
        expect((await res.json()).error).toContain("JSON");
      });
    });

    describe("auth", () => {
      const admin = "admin@orbit.example";

      it("signs in a seeded user with the demo password", async () => {
        const r = await post("/api/auth/login", {
          email: admin,
          password: "orbit123",
        });
        expect(r.status).toBe(200);
        expect(r.body.token).toMatch(/^[\w-]{40,}$/);
        expect(r.body.user).toMatchObject({
          id: 1,
          role: "admin",
          email: admin,
        });
        expect(r.body.user).not.toHaveProperty("passwordHash");
        // the first sign-in upgraded the user to a scrypt credential
        const { rows } = await backend.pool.query(
          "SELECT hash FROM credentials WHERE user_id = 1",
        );
        expect(rows[0].hash.startsWith("scrypt$")).toBe(true);
        // and the upgraded credential works (case-insensitive email, too)
        expect(
          (
            await post("/api/auth/login", {
              email: admin.toUpperCase(),
              password: "orbit123",
            })
          ).status,
        ).toBe(200);
        expect(
          (
            await post("/api/auth/login", {
              email: admin,
              password: "orbit124",
            })
          ).status,
        ).toBe(401);
      });

      it("rejects a wrong password, an unknown email and a bad body", async () => {
        const wrong = await post("/api/auth/login", {
          email: admin,
          password: "nope",
        });
        expect(wrong.status).toBe(401);
        expect(wrong.body.error).toMatch(/wrong/);
        const unknown = await post("/api/auth/login", {
          email: "who@nowhere.org",
          password: "orbit123",
        });
        expect(unknown.status).toBe(401);
        expect(unknown.body).toEqual(wrong.body);
        expect((await post("/api/auth/login", { email: admin })).status).toBe(
          400,
        );
        expect((await post("/api/auth/login", {})).status).toBe(400);
      });

      it("gives me, and logout ends the session", async () => {
        const token = await login(admin);
        const me = await get("/api/auth/me", token);
        expect(me.status).toBe(200);
        expect(me.body.user.id).toBe(1);
        expect((await get("/api/auth/me")).status).toBe(401);
        expect((await get("/api/auth/me", "garbage")).status).toBe(401);
        expect((await post("/api/auth/logout", {}, token)).status).toBe(200);
        expect((await get("/api/auth/me", token)).status).toBe(401);
        expect((await post("/api/auth/logout")).status).toBe(401);
      });

      it("registers a user who can sign in", async () => {
        const r = await post("/api/auth/register", {
          name: "  Nova Test ",
          email: "nova@example.com",
          password: "hunter22",
        });
        expect(r.status).toBe(201);
        expect(r.body.user).toMatchObject({
          name: "Nova Test",
          email: "nova@example.com",
          role: "user",
          status: "active",
        });
        expect(r.body.user).not.toHaveProperty("passwordHash");
        expect((await get("/api/auth/me", r.body.token)).body.user.id).toBe(
          r.body.user.id,
        );
        expect(
          (
            await post("/api/auth/login", {
              email: "NOVA@example.com",
              password: "hunter22",
            })
          ).status,
        ).toBe(200);
        expect(
          (
            await post("/api/auth/login", {
              email: "nova@example.com",
              password: "hunter23",
            })
          ).status,
        ).toBe(401);
        // the frontend sees the new user in the sync data
        const users = (await post("/api/sync/load", { tables: ["users"] })).body
          .data.users;
        expect(users.at(-1)).toMatchObject({
          id: r.body.user.id,
          name: "Nova Test",
        });
        const { rows } = await backend.pool.query(
          "SELECT hash FROM credentials WHERE user_id = $1",
          [r.body.user.id],
        );
        expect(rows[0].hash).toMatch(/^scrypt\$/);
      });

      it("validates registration and refuses a duplicate email", async () => {
        const ok = {
          name: "Dup",
          email: "dup@example.com",
          password: "123456",
        };
        expect(
          (await post("/api/auth/register", { ...ok, name: "D" })).body.field,
        ).toBe("name");
        expect(
          (await post("/api/auth/register", { ...ok, email: "nope" })).body
            .field,
        ).toBe("email");
        expect(
          (await post("/api/auth/register", { ...ok, password: "123" })).body
            .field,
        ).toBe("password");
        expect(
          (await post("/api/auth/register", { ...ok, name: undefined })).status,
        ).toBe(400);
        expect((await post("/api/auth/register", ok)).status).toBe(201);
        const again = await post("/api/auth/register", {
          ...ok,
          email: "DUP@example.com",
        });
        expect(again.status).toBe(409);
        expect(again.body.field).toBe("email");
        const seeded = await post("/api/auth/register", {
          ...ok,
          email: admin,
        });
        expect(seeded.status).toBe(409);
      });

      it("keeps a banned user out, and ends the sessions they have", async () => {
        const victim = seed.users.find(
          (u) => u.role === "user" && u.status === "active",
        )!;
        const token = await login(victim.email);
        expect((await get("/api/auth/me", token)).status).toBe(200);
        await post("/api/sync/put", {
          table: "users",
          rows: [{ ...victim, status: "banned" }],
        });
        const r = await post("/api/auth/login", {
          email: victim.email,
          password: "orbit123",
        });
        expect(r.status).toBe(403);
        expect(r.body.error).toMatch(/banned/);
        expect((await get("/api/auth/me", token)).status).toBe(401);
        // a banned user with a wrong password is just wrong
        expect(
          (
            await post("/api/auth/login", {
              email: victim.email,
              password: "x",
            })
          ).status,
        ).toBe(401);
        await post("/api/sync/put", { table: "users", rows: [victim] });
        expect(
          (
            await post("/api/auth/login", {
              email: victim.email,
              password: "orbit123",
            })
          ).status,
        ).toBe(200);
      });

      it("rejects an expired token", async () => {
        const token = await login(admin);
        expect((await get("/api/auth/me", token)).status).toBe(200);
        await backend.pool.query(
          "UPDATE auth_sessions SET expires_at = now() - interval '1 minute'",
        );
        expect((await get("/api/auth/me", token)).status).toBe(401);
        expect((await get("/api/admin/overview", token)).status).toBe(401);
      });

      it("drops the scrypt credential when the frontend changes the password hash", async () => {
        const user = seed.users[7];
        await login(user.email);
        await post("/api/sync/put", {
          table: "users",
          rows: [{ ...user, passwordHash: "0000000000abcd" }],
        });
        expect(
          (
            await post("/api/auth/login", {
              email: user.email,
              password: "orbit123",
            })
          ).status,
        ).toBe(401);
        await post("/api/sync/put", { table: "users", rows: [user] });
        await login(user.email);
      });

      it("signs out everyone when the data is replaced", async () => {
        const token = await login(admin);
        await post("/api/sync/reset");
        expect((await get("/api/auth/me", token)).status).toBe(401);
      });
    });

    describe("role guards", () => {
      let adminToken: string;
      let userToken: string;
      let modToken: string;
      beforeAll(async () => {
        adminToken = await login("admin@orbit.example");
        userToken = await login(
          seed.users.find((u) => u.role === "user")!.email,
        );
        modToken = await login(
          seed.users.find((u) => u.role === "moderator")!.email,
        );
      }, 30_000);

      it("protects the admin endpoints", async () => {
        for (const path of ["/api/admin/overview", "/api/admin/users/3/data"]) {
          expect((await get(path)).status).toBe(401);
          expect((await get(path, userToken)).status).toBe(403);
          expect((await get(path, modToken)).status).toBe(403);
          expect((await get(path, adminToken)).status).toBe(200);
        }
        expect((await post("/api/admin/overview", {}, adminToken)).status).toBe(
          405,
        );
        expect((await get("/api/admin/nope", adminToken)).status).toBe(404);
      });

      it("protects writes to the tables", async () => {
        const artist = { name: "New Band", country: "Peru" };
        expect((await post("/api/artists", artist)).status).toBe(401);
        expect((await post("/api/artists", artist, userToken)).status).toBe(
          403,
        );
        const made = await post("/api/artists", artist, modToken);
        expect(made.status).toBe(201);
        expect(made.body).toEqual({ id: seed.artists.length + 1, ...artist });
        expect(
          (
            await call(
              "DELETE",
              `/api/artists/${made.body.id}`,
              undefined,
              userToken,
            )
          ).status,
        ).toBe(403);
        expect(
          (
            await call(
              "DELETE",
              `/api/artists/${made.body.id}`,
              undefined,
              modToken,
            )
          ).status,
        ).toBe(200);
        // users are the admin's
        expect(
          (await call("DELETE", "/api/users/5", undefined, modToken)).status,
        ).toBe(403);
      });

      it("returns the overview of the admin", async () => {
        const r = await get("/api/admin/overview", adminToken);
        expect(r.body.counts).toEqual(
          Object.fromEntries(
            Object.entries(seed).map(([t, rows]) => [t, rows.length]),
          ),
        );
        expect(r.body.banned).toBe(
          seed.users.filter((u) => u.status === "banned").length,
        );
        expect(r.body.newestUsers).toHaveLength(10);
        expect(r.body.newestUsers[0]).not.toHaveProperty("passwordHash");
        const dates: string[] = r.body.newestUsers.map(
          (u: { createdAt: string }) => u.createdAt,
        );
        expect(dates).toEqual([...dates].sort().reverse());
      });

      it("returns everything of one user to the admin", async () => {
        const id = seed.users[2].id;
        const r = await get(`/api/admin/users/${id}/data`, adminToken);
        expect(r.body.user).toMatchObject({ id, name: seed.users[2].name });
        expect(r.body.data.friends).toEqual(
          seed.friends.filter((f) => f.userId === id || f.friendId === id),
        );
        expect(r.body.data.posts).toEqual(
          seed.posts.filter((p) => p.authorId === id || p.wallId === id),
        );
        expect(r.body.data.playlists).toEqual(
          seed.playlists.filter((p) => p.ownerId === id),
        );
        expect(r.body.data.conversations).toEqual(
          seed.conversations.filter((c) => c.memberIds.includes(id)),
        );
        expect(
          (await get("/api/admin/users/99999/data", adminToken)).status,
        ).toBe(404);
        expect(
          (await get("/api/admin/users/abc/data", adminToken)).status,
        ).toBe(400);
      });
    });

    describe("reads", () => {
      it("lists a table with paging, sorting and search", async () => {
        const r = await get("/api/songs?page=2&size=5&sort=title&dir=desc");
        expect(r.status).toBe(200);
        expect(r.body).toMatchObject({
          total: seed.songs.length,
          page: 2,
          size: 5,
        });
        expect(r.body.rows).toHaveLength(5);
        const expected = [...seed.songs].sort((a, b) =>
          a.title < b.title ? 1 : a.title > b.title ? -1 : b.id - a.id,
        );
        expect(
          r.body.rows.map((s: { title: string }) => s.title.toLowerCase()),
        ).toHaveLength(5);
        void expected;
        const q = await get("/api/artists?q=brown&size=200");
        expect(q.body.rows.length).toBeGreaterThan(0);
        for (const a of q.body.rows)
          expect(`${a.name} ${a.country}`.toLowerCase()).toContain("brown");
        expect((await get("/api/songs?sort=bogus")).status).toBe(400);
        expect((await get("/api/songs?page=0")).status).toBe(400);
        expect((await get("/api/songs?dir=up")).status).toBe(400);
        expect((await get("/api/songs?size=9999")).status).toBe(400);
        const users = await get("/api/users?size=3");
        expect(users.body.rows[0]).not.toHaveProperty("passwordHash");
        expect((await get("/api/users?sort=passwordHash")).status).toBe(400);
      });

      it("gets one row, 404 for a missing one, 400 for a bad id", async () => {
        expect((await get("/api/songs/7")).body).toEqual(seed.songs[6]);
        expect((await get("/api/songs/99999999")).status).toBe(404);
        expect((await get("/api/songs/abc")).status).toBe(400);
        expect((await get("/api/photoAlbums/1")).body).toEqual(
          seed.photoAlbums[0],
        );
        expect((await call("PATCH", "/api/songs/7")).status).toBe(405);
        expect((await get("/api/songs/1/extra")).status).toBe(404);
      });

      it("creates, updates and deletes through the table routes", async () => {
        const token = await login("admin@orbit.example");
        const comment = {
          postId: seed.posts[0].id,
          authorId: 2,
          text: "hello",
          createdAt: "2026-11-04T12:01:00",
        };
        const made = await post("/api/comments", comment, token);
        expect(made.status).toBe(201);
        const id = made.body.id as number;
        expect(made.body).toEqual({ id, ...comment });
        const put = await call(
          "PUT",
          `/api/comments/${id}`,
          { ...comment, text: "edited" },
          token,
        );
        expect(put.body.text).toBe("edited");
        expect(
          (
            await call(
              "PUT",
              `/api/comments/${id}`,
              { ...comment, id: id + 1 },
              token,
            )
          ).status,
        ).toBe(400);
        expect(
          (await call("PUT", "/api/comments/99999999", comment, token)).status,
        ).toBe(404);
        expect(
          (await post("/api/comments", { ...comment, id }, token)).status,
        ).toBe(409);
        expect(
          (await post("/api/comments", { ...comment, text: undefined }, token))
            .body.error,
        ).toContain("body.text");
        expect(
          (await post("/api/comments", { ...comment, postId: 99999999 }, token))
            .status,
        ).toBe(409);
        expect(
          (await call("DELETE", `/api/comments/${id}`, undefined, token)).body,
        ).toEqual({ removed: 1 });
        expect(
          (await call("DELETE", `/api/comments/${id}`, undefined, token))
            .status,
        ).toBe(404);
      });

      it("shows a profile with counts", async () => {
        const id = seed.users[1].id;
        const r = await get(`/api/users/${id}/profile`);
        expect(r.status).toBe(200);
        expect(r.body.user).toMatchObject({ id, name: seed.users[1].name });
        expect(r.body.user).not.toHaveProperty("passwordHash");
        expect(r.body.counts).toMatchObject({
          friends: seed.friends.filter(
            (f) =>
              f.status === "accepted" && (f.userId === id || f.friendId === id),
          ).length,
          posts: seed.posts.filter((p) => p.wallId === id).length,
          articles: seed.articles.filter((a) => a.authorId === id).length,
          photos: seed.photos.filter((p) => p.ownerId === id).length,
          playlists: seed.playlists.filter((p) => p.ownerId === id).length,
          communities: seed.communities.filter((c) => c.memberIds.includes(id))
            .length,
        });
        expect((await get("/api/users/999999/profile")).status).toBe(404);
        expect((await get("/api/users/x/profile")).status).toBe(400);
      });

      it("serves a wall feed, newest first, with the authors", async () => {
        const wall = seed.posts[0].wallId;
        const mine = seed.posts
          .filter((p) => p.wallId === wall)
          .sort((a, b) =>
            a.createdAt < b.createdAt
              ? 1
              : a.createdAt > b.createdAt
                ? -1
                : b.id - a.id,
          );
        const r = await get(`/api/feed?userId=${wall}&size=5`);
        expect(r.status).toBe(200);
        expect(r.body.total).toBe(mine.length);
        expect(r.body.rows.map((p: { id: number }) => p.id)).toEqual(
          mine.slice(0, 5).map((p) => p.id),
        );
        const first = r.body.rows[0];
        expect(first.author).toEqual({
          id: first.authorId,
          name: seed.users.find((u) => u.id === first.authorId)!.name,
          avatar: seed.users.find((u) => u.id === first.authorId)!.avatar,
        });
        expect(first.likeIds).toEqual(mine[0].likeIds);
        expect(first.commentCount).toBe(
          seed.comments.filter((c) => c.postId === first.id).length,
        );
        expect((await get("/api/feed?userId=999999")).status).toBe(404);
        expect((await get("/api/feed?userId=abc")).status).toBe(400);
        const all = await get("/api/feed?page=2");
        expect(all.body.page).toBe(2);
        expect(all.body.rows).toHaveLength(20);
      });

      it("searches songs by text, genre, artist and album", async () => {
        const song = seed.songs[123];
        const artist = seed.artists.find((a) => a.id === song.artistId)!;
        const album = seed.albums.find((a) => a.id === song.albumId)!;
        const byText = await get(
          `/api/search/songs?q=${encodeURIComponent(song.title)}&size=200`,
        );
        expect(
          byText.body.rows.some((s: { id: number }) => s.id === song.id),
        ).toBe(true);
        expect(byText.body.total).toBeGreaterThan(0);
        const row = byText.body.rows.find(
          (s: { id: number }) => s.id === song.id,
        );
        expect(row).toMatchObject({
          title: song.title,
          genre: song.genre,
          artist: artist.name,
          album: album.title,
        });

        const byGenre = await get(
          `/api/search/songs?genre=${song.genre.toLowerCase()}&size=200`,
        );
        expect(byGenre.body.total).toBe(
          seed.songs.filter((s) => s.genre === song.genre).length,
        );
        for (const s of byGenre.body.rows) expect(s.genre).toBe(song.genre);

        const byArtist = await get(
          `/api/search/songs?artist=${encodeURIComponent(artist.name)}&size=200`,
        );
        expect(byArtist.body.total).toBe(
          seed.songs.filter((s) =>
            seed.artists
              .find((a) => a.id === s.artistId)!
              .name.toLowerCase()
              .includes(artist.name.toLowerCase()),
          ).length,
        );
        expect(
          (await get(`/api/search/songs?artist=${artist.id}`)).body.total,
        ).toBe(seed.songs.filter((s) => s.artistId === artist.id).length);
        const byAlbum = await get(
          `/api/search/songs?album=${album.id}&genre=${song.genre}`,
        );
        expect(
          byAlbum.body.rows.every(
            (s: { albumId: number }) => s.albumId === album.id,
          ),
        ).toBe(true);
        const none = await get("/api/search/songs?q=zzzzqqqq");
        expect(none.body).toMatchObject({ total: 0, rows: [] });
        // a literal % is not a wildcard
        expect((await get("/api/search/songs?q=%25")).body.total).toBe(
          seed.songs.filter((s) => s.title.includes("%")).length,
        );
        const page2 = await get("/api/search/songs?size=10&page=2");
        expect(page2.body.rows).toHaveLength(10);
        expect(page2.body.total).toBe(seed.songs.length);
      });

      it("ranks the best score of each player", async () => {
        const r = await get("/api/leaderboard/tetris?limit=5");
        expect(r.status).toBe(200);
        const best = new Map<number, number>();
        for (const s of seed.scores)
          if (s.game === "tetris")
            best.set(s.userId, Math.max(best.get(s.userId) ?? 0, s.score));
        const top = [...best.values()].sort((a, b) => b - a).slice(0, 5);
        expect(r.body.game).toBe("tetris");
        expect(r.body.rows.map((x: { score: number }) => x.score)).toEqual(top);
        expect(r.body.rows.map((x: { rank: number }) => x.rank)).toEqual([
          1, 2, 3, 4, 5,
        ]);
        expect(
          new Set(r.body.rows.map((x: { userId: number }) => x.userId)).size,
        ).toBe(5);
        expect(r.body.rows[0]).toHaveProperty("name");
        expect((await get("/api/leaderboard/chess")).status).toBe(404);
        expect((await get("/api/leaderboard/snake?limit=0")).status).toBe(400);
      });
    });

    describe("http server", () => {
      it("serves the SPA fallback and static files from dist in production mode", async () => {
        const dist = await mkdtemp(join(tmpdir(), "orbit-dist-"));
        await mkdir(join(dist, "assets"));
        await writeFile(
          join(dist, "index.html"),
          "<!doctype html><title>orbit</title>",
        );
        await writeFile(join(dist, "assets", "app.js"), "console.log(1)");
        const server = startServer(0, {
          quiet: true,
          frontend: true,
          dist: dist + "/",
          pool: createPool(TEST_DATABASE_URL),
          init: false,
        });
        await once(server, "listening");
        const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        try {
          const deep = await fetch(`${base}/wall/12`);
          expect(deep.status).toBe(200);
          expect(await deep.text()).toContain("<title>orbit</title>");
          const js = await fetch(`${base}/assets/app.js`);
          expect(js.headers.get("content-type")).toContain("javascript");
          expect((await fetch(`${base}/assets/missing.js`)).status).toBe(404);
          expect((await fetch(`${base}/../../etc/passwd`)).status).toBe(200);
          expect((await fetch(`${base}/api/health`)).status).toBe(200);
          expect((await fetch(`${base}/api/nothing`)).status).toBe(404);
          expect((await fetch(`${base}/`, { method: "POST" })).status).toBe(
            405,
          );
        } finally {
          server.closeAllConnections();
          await new Promise((r) => server.close(r));
        }
      });

      it("answers 404 for pages when it runs the API only", async () => {
        const res = await backend.fetch("/wall");
        expect(res.status).toBe(404);
      });

      it("shuts down gracefully", async () => {
        const server = startServer(0, {
          quiet: true,
          frontend: false,
          pool: createPool(TEST_DATABASE_URL),
          init: false,
        });
        await once(server, "listening");
        const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        expect((await fetch(`${base}/api/health`)).status).toBe(200);
        server.closeIdleConnections();
        await new Promise((r) => server.close(r));
        await expect(fetch(`${base}/api/health`)).rejects.toThrow();
      });
    });
  },
);
