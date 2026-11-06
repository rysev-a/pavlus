import type { Effect, Message } from "@pavlus/frontend";
import { expect, test } from "vitest";
import type { OrbitState } from "../templates/orbit-social/core.ts";
import {
  captionFromName,
  checkAlbum,
  PAGE_SIZE,
} from "../templates/orbit-social/modules/photos/index.ts";
import {
  deriveShell,
  initialState,
  page,
} from "../templates/orbit-social/orbit-social.ts";
import {
  type Db,
  emptyDb,
  NOW,
  type Photo,
  type User,
} from "../templates/orbit-social/schema.ts";
import { seedDb } from "../templates/orbit-social/seed.ts";

/** Runs a message through the page and applies its `store.set` effects, like the store plugin. */
function send(
  state: OrbitState,
  id: string,
  payload?: unknown,
  event?: { value?: string; key?: string },
) {
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
const idbOps = (effects: Effect[]) =>
  plugin(effects, "idb").map((e) => `${e.type}:${e.table}`);

const user = (id: number, name: string): User => ({
  id,
  name,
  email: `${name.toLowerCase()}@example.com`,
  passwordHash: "x",
  role: "user",
  status: "active",
  avatar: "grad:1:2:A",
  about: "",
  city: "",
  birthday: "",
  website: "",
  phone: "",
  interests: [],
  createdAt: NOW,
  lastSeen: NOW,
});
const photo = (
  id: number,
  albumId: number,
  ownerId: number,
  caption = `p${id}`,
): Photo => ({
  id,
  albumId,
  ownerId,
  src: `grad:${id}:${id + 40}:🌅`,
  caption,
  createdAt: "2026-11-01T10:00:00",
});

function world(): Db {
  const db = emptyDb();
  db.users = [user(1, "Ann"), user(2, "Ben")];
  db.photoAlbums = [
    { id: 1, ownerId: 1, title: "Trip", description: "Lisbon", createdAt: NOW },
    { id: 2, ownerId: 1, title: "Pets", description: "", createdAt: NOW },
    { id: 3, ownerId: 2, title: "Bens", description: "", createdAt: NOW },
  ];
  db.photos = [photo(1, 1, 1), photo(2, 1, 1), photo(3, 1, 1), photo(4, 3, 2)];
  return db;
}

function open(
  db: Db,
  me: number,
  params?: Record<string, unknown>,
): OrbitState {
  let s: OrbitState = { ...initialState(), db, me, status: "ready" };
  s = { ...s, ...deriveShell(s) };
  s = send(s, "nav.go", "photos").state;
  if (params?.userId) {
    // another module's `go` with params
    s = send(
      { ...s, screen: "profile" },
      "profile.photos",
      params.userId,
    ).state;
  }
  return s;
}

test("the list of my albums: cards with cover, title, count", () => {
  const s = open(world(), 1);
  const p = s.photos;
  expect(p.own).toBe(true);
  expect(p.heading).toBe("My albums");
  expect(p.albums.map((a) => [a.title, a.count])).toEqual([
    ["Pets", 0],
    ["Trip", 3],
  ]);
  expect(p.albums[1].style).toContain("linear-gradient");
  expect(p.albums[1].glyph).toBe("🌅");
  expect(p.albums[0].countLabel).toBe("0 photos");
  expect(p.albums[1].countLabel).toBe("3 photos");
});

test("another user's albums are read-only", () => {
  let s = open(world(), 1, { userId: 2 });
  expect(s.screen).toBe("photos");
  expect(s.photos.own).toBe(false);
  expect(s.photos.heading).toBe("Albums of Ben");
  expect(s.photos.albums.map((a) => a.title)).toEqual(["Bens"]);
  // no editing of someone else's album, no new one, no upload
  expect(send(s, "photos.editAlbum", 3).state.photos.form.open).toBe(false);
  s = send(s, "photos.open", 3).state;
  expect(s.photos.album?.title).toBe("Bens");
  expect(plugin(send(s, "photos.upload").effects, "files")).toHaveLength(0);
  expect(send(s, "photos.askDelete", 3).state.photos.confirmAlbum).toBe(0);
  s = send(s, "photos.show", 4).state;
  expect(s.photos.viewer?.moveTargets).toEqual([]);
  // the handlers refuse writes even when called by hand
  for (const id of [
    "photos.askRemove",
    "photos.setAvatar",
    "photos.editCaption",
    "photos.remove",
  ]) {
    const r = send(s, id);
    expect(r.state.db).toEqual(s.db);
    expect(idbOps(r.effects)).toEqual([]);
  }
  const forged = send(
    {
      ...s,
      photos: {
        ...s.photos,
        form: { open: true, id: 3, title: "hack", description: "" },
      },
    },
    "photos.saveAlbum",
  );
  expect(forged.state.db.photoAlbums.find((a) => a.id === 3)?.title).toBe(
    "Bens",
  );
});

test("create, validate, edit and cancel an album", () => {
  let s = open(world(), 1);
  s = send(s, "photos.newAlbum").state;
  expect(s.photos.form.open).toBe(true);
  s = send(s, "photos.saveAlbum").state;
  expect(s.photos.errors.title).toBeTruthy();
  expect(s.db.photoAlbums).toHaveLength(3);
  s = send(s, "photos.field", "title", { value: "  Summer " }).state;
  expect(s.photos.errors.title).toBeUndefined();
  s = send(s, "photos.field", "description", { value: "Sun" }).state;
  const r = send(s, "photos.saveAlbum");
  expect(r.state.db.photoAlbums.at(-1)).toMatchObject({
    id: 4,
    ownerId: 1,
    title: "Summer",
    description: "Sun",
  });
  expect(r.state.photos.form.open).toBe(false);
  expect(idbOps(r.effects)).toContain("put:photoAlbums");
  expect(r.state.photos.albums[0].title).toBe("Summer"); // newest first
  // edit
  let e = send(r.state, "photos.editAlbum", 1).state;
  expect(e.photos.form).toMatchObject({ open: true, id: 1, title: "Trip" });
  e = send(e, "photos.field", "title", { value: "Trip 2" }).state;
  e = send(e, "photos.saveAlbum").state;
  expect(e.db.photoAlbums.find((a) => a.id === 1)?.title).toBe("Trip 2");
  expect(e.db.photoAlbums).toHaveLength(4);
  // cancel
  const c = send(
    send(open(world(), 1), "photos.newAlbum").state,
    "photos.cancelForm",
  ).state;
  expect(c.photos.form.open).toBe(false);
  expect(
    checkAlbum({ title: "x".repeat(61), description: "" }).title,
  ).toBeTruthy();
  expect(
    checkAlbum({ title: "ok", description: "y".repeat(301) }).description,
  ).toBeTruthy();
});

test("delete an album asks first and removes its photos", () => {
  let s = open(world(), 1);
  expect(send(s, "photos.confirmDelete", 1).state.db.photoAlbums).toHaveLength(
    3,
  ); // not without asking
  s = send(s, "photos.askDelete", 1).state;
  expect(s.photos.albums.find((a) => a.id === 1)?.confirming).toBe(true);
  expect(send(s, "photos.cancelDelete").state.photos.confirmAlbum).toBe(0);
  const r = send(s, "photos.confirmDelete", 1);
  expect(r.state.db.photoAlbums.map((a) => a.id)).toEqual([2, 3]);
  expect(r.state.db.photos.map((p) => p.id)).toEqual([4]);
  expect(idbOps(r.effects)).toEqual(
    expect.arrayContaining(["remove:photoAlbums", "remove:photos"]),
  );
  // another user's album cannot be asked about nor deleted
  const x = send(
    { ...s, photos: { ...s.photos, confirmAlbum: 3 } },
    "photos.confirmDelete",
    3,
  );
  expect(x.state.db.photoAlbums).toHaveLength(3);
});

test("an album page pages by 24 and upload goes through the files plugin", () => {
  const db = world();
  for (let i = 10; i < 70; i++) db.photos.push(photo(i, 2, 1));
  let s = send(open(db, 1), "photos.open", 2).state;
  expect(PAGE_SIZE).toBe(24);
  expect(s.photos.album?.count).toBe(60);
  expect(s.photos.photos).toHaveLength(24);
  expect(s.photos.pages).toBe(3);
  s = send(s, "photos.turn", 1).state;
  expect(s.photos.pageNo).toBe(2);
  s = send(s, "photos.turn", 9).state;
  expect(s.photos.pageNo).toBe(3);
  expect(s.photos.photos).toHaveLength(12);
  expect(s.photos.hasNext).toBe(false);
  // upload
  const up = send(s, "photos.upload");
  expect(plugin(up.effects, "files")[0]).toMatchObject({
    type: "pickImages",
    maxSide: 1280,
    multiple: true,
    onSuccess: "photos.picked",
    onError: "photos.pickFailed",
  });
  const src = "data:image/jpeg;base64,AAAA";
  const got = send(s, "photos.picked", {
    images: [
      { name: "IMG_0412.jpeg", src },
      { name: "evil.png", src: "javascript:alert(1)" },
      { name: "b-c.png", src },
    ],
  });
  const added = got.state.db.photos.slice(-2);
  expect(
    added.map((p) => [p.id, p.albumId, p.ownerId, p.caption, p.src]),
  ).toEqual([
    [70, 2, 1, "IMG 0412", src],
    [71, 2, 1, "b c", src],
  ]);
  expect(got.state.photos.album?.count).toBe(62);
  expect(
    got.state.photos.photos.some((p) => p.style.includes("background-image")),
  ).toBe(true);
  expect(idbOps(got.effects)).toContain("put:photos");
  expect(send(s, "photos.picked", { images: [] }).state.db.photos).toHaveLength(
    db.photos.length,
  );
  expect(send(s, "photos.pickFailed", "nope").state.notice).toContain("nope");
  // no album open: the reply is ignored
  expect(
    send(open(db, 1), "photos.picked", { images: [{ name: "a", src }] }).state
      .db.photos,
  ).toHaveLength(db.photos.length);
  expect(captionFromName("My_trip-2024.JPG")).toBe("My trip 2024");
});

test("the viewer: next, previous, keys, close", () => {
  let s = send(open(world(), 1), "photos.open", 1).state;
  const shown = send(s, "photos.show", 1);
  expect(plugin(shown.effects, "time")).toHaveLength(1);
  s = shown.state;
  expect(s.photos.viewer).toMatchObject({
    id: 1,
    position: "1 of 3",
    hasPrev: false,
    hasNext: true,
    albumTitle: "Trip",
  });
  expect(send(s, "photos.prev").state.photos.photoId).toBe(1);
  s = send(s, "photos.next").state;
  expect(s.photos.viewer?.id).toBe(2);
  s = send(s, "photos.key", undefined, { key: "ArrowRight" }).state;
  expect(s.photos.viewer?.id).toBe(3);
  expect(send(s, "photos.next").state.photos.viewer?.id).toBe(3);
  s = send(s, "photos.key", undefined, { key: "ArrowLeft" }).state;
  expect(s.photos.viewer?.id).toBe(2);
  expect(plugin(send(s, "photos.focusViewer").effects, "dom")).toHaveLength(1);
  expect(
    send(s, "photos.key", undefined, { key: "Escape" }).state.photos.viewer,
  ).toBeNull();
  expect(send(s, "photos.close").state.photos.viewer).toBeNull();
  // a photo of another album cannot be shown
  expect(send(s, "photos.show", 4).state.photos.photoId).toBe(2);
});

test("viewer: edit caption, move, set as avatar, delete", () => {
  let s = send(open(world(), 1), "photos.open", 1).state;
  s = send(s, "photos.show", 2).state;
  expect(s.photos.viewer?.moveTargets).toEqual([{ id: 2, title: "Pets" }]);
  // caption
  s = send(s, "photos.editCaption").state;
  expect(s.photos.captionText).toBe("p2");
  s = send(s, "photos.captionField", undefined, { value: "  Sunset " }).state;
  const cap = send(s, "photos.saveCaption");
  expect(cap.state.db.photos.find((p) => p.id === 2)?.caption).toBe("Sunset");
  expect(cap.state.photos.editingCaption).toBe(false);
  expect(
    send(s, "photos.cancelCaption").state.db.photos.find((p) => p.id === 2)
      ?.caption,
  ).toBe("p2");
  s = cap.state;
  // avatar
  const av = send(s, "photos.setAvatar").state;
  expect(av.db.users[0].avatar).toBe("grad:2:42:🌅");
  // move: to my other album only
  expect(
    send(s, "photos.move", undefined, { value: "3" }).state.db.photos.find(
      (p) => p.id === 2,
    )?.albumId,
  ).toBe(1);
  const mv = send(s, "photos.move", undefined, { value: "2" }).state;
  expect(mv.db.photos.find((p) => p.id === 2)?.albumId).toBe(2);
  expect(mv.photos.album?.count).toBe(2);
  expect(mv.photos.viewer?.id).toBe(3); // the neighbour is shown
  expect(mv.photos.albumId).toBe(1);
  // delete asks first
  expect(send(s, "photos.remove").state.db.photos).toHaveLength(4);
  const asked = send(s, "photos.askRemove").state;
  expect(asked.photos.confirmPhoto).toBe(true);
  expect(send(asked, "photos.cancelRemove").state.photos.confirmPhoto).toBe(
    false,
  );
  const del = send(asked, "photos.remove");
  expect(del.state.db.photos.map((p) => p.id)).toEqual([1, 3, 4]);
  expect(del.state.photos.viewer?.id).toBe(3);
  expect(idbOps(del.effects)).toContain("remove:photos");
  // deleting the last photo closes the viewer
  let one = send(open(world(), 2), "photos.open", 3).state;
  one = send(one, "photos.show", 4).state;
  one = send(one, "photos.askRemove").state;
  expect(send(one, "photos.remove").state.photos.viewer).toBeNull();
});

test("enter with a photoId opens it in its album, with an albumId opens the album", () => {
  const db = world();
  let s: OrbitState = { ...initialState(), db, me: 1, status: "ready" };
  s = { ...s, ...deriveShell(s) };
  const r = send(s, "profile.photos", 2); // userId 2 albums
  expect(r.state.photos.albums.map((a) => a.id)).toEqual([3]);
  const mod = page as unknown as {
    _apply(state: OrbitState, key: string, u: unknown): Effect[];
  };
  const eff = mod._apply(s, "wall", {
    go: { screen: "photos", params: { photoId: 4 } },
  });
  const next = { ...s } as Record<string, unknown>;
  for (const e of eff as unknown as {
    plugin: string;
    type: string;
    path: string;
    value: unknown;
  }[])
    if (e.plugin === "store") next[e.path] = e.value;
  const st = next as unknown as OrbitState;
  expect(st.photos.viewer?.id).toBe(4);
  expect(st.photos.own).toBe(false);
  const eff2 = mod._apply(s, "wall", {
    go: { screen: "photos", params: { albumId: 2 } },
  });
  const n2 = { ...s } as Record<string, unknown>;
  for (const e of eff2 as unknown as {
    plugin: string;
    type: string;
    path: string;
    value: unknown;
  }[])
    if (e.plugin === "store") n2[e.path] = e.value;
  expect((n2 as unknown as OrbitState).photos.album?.title).toBe("Pets");
});

test("against the sample data", () => {
  const db = seedDb();
  const owner = db.users.find(
    (u) => db.photoAlbums.some((a) => a.ownerId === u.id) && u.role === "user",
  )!;
  let s = open(db, owner.id);
  expect(s.photos.albums.length).toBeGreaterThan(0);
  const first = s.photos.albums[0];
  s = send(s, "photos.open", first.id).state;
  expect(s.photos.photos.length).toBe(Math.min(24, first.count));
  if (first.count > 0) {
    s = send(s, "photos.show", s.photos.photos[0].id).state;
    expect(s.photos.viewer).not.toBeNull();
  }
});
