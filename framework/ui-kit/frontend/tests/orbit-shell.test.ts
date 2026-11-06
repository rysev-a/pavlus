import type { Effect, Message } from "@pavlus/frontend";
import { expect, test } from "vitest";
import {
  checkRegistration,
  DEMO_ADMIN,
  DEMO_PASSWORD,
  hashPassword,
  login,
  newUser,
} from "../templates/orbit-social/auth.ts";
import type { OrbitState } from "../templates/orbit-social/core.ts";
import {
  paged,
  tick,
  upsert,
  when,
  without,
} from "../templates/orbit-social/core.ts";
import {
  applyUpdate,
  initialState,
  page,
} from "../templates/orbit-social/orbit-social.ts";
import { emptyDb, NOW } from "../templates/orbit-social/schema.ts";
import { seedDb } from "../templates/orbit-social/seed.ts";

/** Runs a message through the page and applies its `store.set` effects, like the store plugin. */
function send(
  state: OrbitState,
  id: string,
  payload?: unknown,
  event?: { value?: string; checked?: boolean },
): { state: OrbitState; effects: Effect[] } {
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
  return { state: next as unknown as OrbitState, effects };
}
const plugin = (effects: Effect[], name: string) =>
  effects.filter(
    (e) => (e as { plugin: string }).plugin === name,
  ) as unknown as Record<string, unknown>[];

const ready = (): OrbitState =>
  send(initialState(), "loaded", { data: {}, empty: true }).state;

test("the helpers: upsert, without, tick, when, paged", () => {
  expect(
    upsert(
      [
        { id: 1, a: 1 },
        { id: 2, a: 2 },
      ],
      [
        { id: 2, a: 9 },
        { id: 3, a: 3 },
      ],
    ),
  ).toEqual([
    { id: 1, a: 1 },
    { id: 2, a: 9 },
    { id: 3, a: 3 },
  ]);
  expect(without([{ id: 1 }, { id: 2 }], [1])).toEqual([{ id: 2 }]);
  expect(tick("2026-11-04T12:59:00")).toBe("2026-11-04T13:00:00");
  expect(tick("2026-11-04T23:59:00")).toBe("2026-11-04T23:59:59");
  expect(when("2026-11-04T09:30:00", NOW)).toBe("09:30");
  expect(when("2026-03-14T09:30:00", NOW)).toBe("Mar 14, 09:30");
  expect(when("2024-03-14T09:30:00", NOW)).toBe("Mar 14, 2024");
  expect(paged([1, 2, 3, 4, 5], 9, 2)).toEqual({
    items: [5],
    page: 3,
    pages: 3,
  });
});

test("auth: hashing, login, registration rules", () => {
  expect(hashPassword("a")).not.toBe(hashPassword("b"));
  expect(hashPassword("orbit123")).toBe(hashPassword("orbit123"));
  const db = seedDb();
  expect(login(db, DEMO_ADMIN, DEMO_PASSWORD)).toMatchObject({ ok: true });
  expect(login(db, DEMO_ADMIN, "nope")).toMatchObject({ ok: false });
  expect(login(db, "nobody@example.com", DEMO_PASSWORD)).toMatchObject({
    ok: false,
  });
  const taken = db.users[1].email;
  expect(
    checkRegistration(db, {
      name: "A",
      email: "x",
      password: "123",
      confirm: "321",
    }),
  ).toEqual({
    name: "Tell us your name (at least 2 letters)",
    email: "That is not an email address",
    password: "At least 6 characters",
    confirm: "The passwords differ",
  });
  expect(
    checkRegistration(db, {
      name: "Zed Zed",
      email: taken.toUpperCase(),
      password: "secret1",
      confirm: "secret1",
    }).email,
  ).toBe("Someone already has this email");
  const u = newUser(
    db,
    {
      name: " Zed Zed ",
      email: "zed@example.com",
      password: "secret1",
      confirm: "secret1",
    },
    NOW,
  );
  expect(u).toMatchObject({
    name: "Zed Zed",
    role: "user",
    status: "active",
    id: Math.max(...db.users.map((x) => x.id)) + 1,
  });
  expect(
    login({ ...db, users: [...db.users, u] }, "zed@example.com", "secret1"),
  ).toMatchObject({ ok: true, userId: u.id });
});

test("the first visit seeds the database and writes it; nobody is signed in", () => {
  const { state, effects } = send(initialState(), "loaded", {
    data: {},
    empty: true,
  });
  expect(state.status).toBe("ready");
  expect(state.view).toBe("auth");
  expect(state.me).toBe(0);
  expect(state.db.users.length).toBeGreaterThan(2);
  expect(
    plugin(effects, "idb").find((e) => e.type === "replaceAll"),
  ).toBeTruthy();
});

test("sign in: a wrong password is explained, the right one opens the app and remembers the session", () => {
  let s = ready();
  s = send(s, "authField", "email", { value: DEMO_ADMIN }).state;
  s = send(s, "authField", "password", { value: "wrong" }).state;
  s = send(s, "authLogin").state;
  expect(s.view).toBe("auth");
  expect(s.auth.error).toMatch(/wrong/);
  s = send(s, "authField", "password", { value: DEMO_PASSWORD }).state;
  const r = send(s, "authLogin");
  expect(r.state.view).toBe("app");
  expect(r.state.me).toBe(1);
  expect(r.state.screen).toBe("wall");
  expect(
    plugin(r.effects, "idb").find(
      (e) => e.type === "put" && e.table === "session",
    ),
  ).toMatchObject({ rows: [{ id: 1, userId: 1 }] });
  // only the administrator sees the admin panel in the navigation
  expect(r.state.groups.flatMap((g) => g.items.map((i) => i.id))).toContain(
    "admin",
  );
  const member = send(ready(), "authDemo", "user").state;
  expect(member.me).toBeGreaterThan(1);
  expect(member.groups.flatMap((g) => g.items.map((i) => i.id))).not.toContain(
    "admin",
  );
});

test("a saved session is restored on the next visit, a banned user is not", () => {
  const db = seedDb();
  const loaded = (d: typeof db) =>
    send(initialState(), "loaded", { data: d, empty: false }).state;
  expect(loaded({ ...db, session: [{ id: 1, userId: 2 }] }).me).toBe(2);
  expect(loaded({ ...db, session: [{ id: 1, userId: 999999 }] }).me).toBe(0);
  const banned = {
    ...db,
    users: db.users.map((u) =>
      u.id === 2 ? { ...u, status: "banned" as const } : u,
    ),
    session: [{ id: 1, userId: 2 }],
  };
  expect(loaded(banned).me).toBe(0);
});

test("registration: errors per field, then the account exists and is signed in", () => {
  let s = send(ready(), "authSwitch", "register").state;
  expect(s.authView).toBe("register");
  s = send(s, "authRegister").state;
  expect(Object.keys(s.auth.errors)).toEqual(["name", "email", "password"]);
  for (const [f, v] of [
    ["name", "Zed Zed"],
    ["email", "zed@example.com"],
    ["password", "secret1"],
    ["confirm", "secret1"],
  ])
    s = send(s, "authField", f, { value: v }).state;
  const before = s.db.users.length;
  const r = send(s, "authRegister");
  expect(r.state.db.users).toHaveLength(before + 1);
  expect(r.state.me).toBe(r.state.db.users.at(-1)!.id);
  expect(
    plugin(r.effects, "idb").find(
      (e) => e.type === "put" && e.table === "users",
    ),
  ).toBeTruthy();
});

test("sign out clears the session", () => {
  const s = send(ready(), "authDemo", "user").state;
  const out = send(s, "top.action", "logout");
  expect(out.state.me).toBe(0);
  expect(out.state.view).toBe("auth");
  expect(
    plugin(out.effects, "idb").find(
      (e) => e.type === "remove" && e.table === "session",
    ),
  ).toBeTruthy();
});

test("an update from a module: rows are upserted and written, the clock moves, the screen changes", () => {
  const full = send(ready(), "authDemo", "user").state;
  // a small database of our own: the sample data has thousands of posts
  const s: OrbitState = { ...full, db: { ...emptyDb(), users: full.db.users } };
  const post = {
    id: 1,
    authorId: s.me,
    wallId: s.me,
    communityId: 0,
    kind: "text" as const,
    text: "hi",
    songId: 0,
    photoId: 0,
    picture: "",
    url: "",
    linkTitle: "",
    repostOf: 0,
    createdAt: s.now,
    likeIds: [],
  };
  const r = applyUpdate(s, "wall", {
    put: { posts: [post] },
    go: { screen: "music" },
    notice: "ok",
  });
  expect(r.state.db.posts).toEqual([post]);
  expect(r.state.now).toBe(tick(s.now));
  expect(r.state.screen).toBe("music");
  expect(r.state.title).toBe("Music");
  expect(
    plugin(r.effects, "idb").find(
      (e) => e.type === "put" && e.table === "posts",
    ),
  ).toBeTruthy();
  const del = applyUpdate(r.state, "wall", { remove: { posts: [1] } });
  expect(del.state.db.posts).toEqual([]);
  expect(
    plugin(del.effects, "idb").find((e) => e.type === "remove"),
  ).toMatchObject({ table: "posts", ids: [1] });
  // replacing the whole database rewrites it
  const re = applyUpdate(r.state, "admin", { replaceDb: emptyDb() });
  expect(
    plugin(re.effects, "idb").find((e) => e.type === "replaceAll"),
  ).toBeTruthy();
});
