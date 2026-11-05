import { describe, expect, test } from "vitest";
import type { Effect } from "@service-laboratory/pavlus";
import {
  applyUpdate,
  initialState,
} from "../templates/orbit-social/orbit-social.ts";
import type { OrbitState, Update } from "../templates/orbit-social/core.ts";
import {
  type Db,
  emptyDb,
  GENRES,
  NOW,
} from "../templates/orbit-social/schema.ts";
import { seedDb } from "../templates/orbit-social/seed.ts";
import {
  formatDuration,
  formatTotal,
  musicModule,
  songLabel,
  TIMER,
} from "../templates/orbit-social/modules/music/index.ts";
import { searchSongs } from "../templates/orbit-social/modules/music/library.ts";
import {
  following,
  nextSeed,
  shuffledAll,
  shuffledFrom,
} from "../templates/orbit-social/modules/music/player.ts";

// ---- a small hand-made library ----

function smallDb(): Db {
  const db = emptyDb();
  const user = (id: number, name: string) => ({
    id,
    name,
    email: `${name}@example.com`,
    passwordHash: "",
    role: "user" as const,
    status: "active" as const,
    avatar: "",
    about: "",
    city: "",
    birthday: "2000-01-01",
    website: "",
    phone: "",
    interests: [],
    createdAt: NOW,
    lastSeen: NOW,
  });
  db.users = [user(1, "Ann"), user(2, "Ben")];
  db.artists = [
    { id: 1, name: "Nova Lindqvist", country: "Sweden" },
    { id: 2, name: "The Quiet Orchard", country: "UK" },
    { id: 3, name: "Halden", country: "Norway" },
  ];
  db.albums = [
    {
      id: 1,
      artistId: 1,
      title: "Low Tide Letters",
      year: 2019,
      cover: "grad:10:50:A",
    },
    {
      id: 2,
      artistId: 1,
      title: "Night Lines",
      year: 2021,
      cover: "grad:20:60:B",
    },
    {
      id: 3,
      artistId: 2,
      title: "Small Hours",
      year: 2018,
      cover: "grad:30:70:C",
    },
    {
      id: 4,
      artistId: 3,
      title: "Glass Rooms",
      year: 2022,
      cover: "grad:40:80:D",
    },
  ];
  const song = (
    id: number,
    albumId: number,
    artistId: number,
    title: string,
    genre: string,
    duration: number,
    year: number,
  ) => ({ id, albumId, artistId, title, genre, duration, year });
  db.songs = [
    song(1, 1, 1, "Glass Harbour", "Indie", 214, 2019),
    song(2, 1, 1, "Paper Boats", "Indie", 187, 2019),
    song(3, 2, 1, "Midnight Tram", "Ambient", 243, 2021),
    song(4, 2, 1, "Copper Sun", "Ambient", 198, 2021),
    song(5, 3, 2, "Slow River Home", "Folk", 176, 2018),
    song(6, 3, 2, "Paper Lanterns", "Folk", 200, 2018),
    song(7, 3, 2, "Orchard Rain", "Folk", 150, 2018),
    song(8, 4, 3, "Glass Hours", "Jazz", 261, 2022),
    song(9, 4, 3, "Static Bloom", "Jazz", 3, 2022),
  ];
  db.playlists = [
    { id: 1, ownerId: 1, title: "Mine", songIds: [1, 2, 3], createdAt: NOW },
    { id: 2, ownerId: 2, title: "Ben's mix", songIds: [5, 6], createdAt: NOW },
  ];
  return db;
}

// ---- a way to send a message through the module and the shell's applyUpdate ----

interface Run {
  state: OrbitState;
  effects: Effect[];
}

function start(db: Db, me = 1): OrbitState {
  let s = initialState();
  s = { ...s, db, me, status: "ready", screen: "music", view: "app" };
  return { ...s, music: musicModule.derive(s) };
}

/** Runs the handler `name` of the module like the shell does: apply the update, derive. */
function send(
  state: OrbitState,
  name: string,
  payload?: unknown,
  event?: { value?: string; key?: string },
): Run {
  const handler = musicModule.handlers[name];
  expect(handler, `handler ${name}`).toBeTypeOf("function");
  const u: Update | void = handler(payload, event as never, state);
  if (!u) return { state, effects: [] };
  return applyUpdate(state, "music", u);
}

const effectsOf = (r: Run, plugin: string, type?: string) =>
  (r.effects as unknown as { plugin: string; type: string }[]).filter(
    (e) => e.plugin === plugin && (!type || e.type === type),
  );

const idbWrites = (r: Run) => effectsOf(r, "idb");
const m = (s: OrbitState) => s.music;
const titles = (s: OrbitState) => m(s).lib.table.rows.map((x) => x.title);

describe("helpers", () => {
  test("formatDuration", () => {
    expect(formatDuration(187)).toBe("3:07");
    expect(formatDuration(60)).toBe("1:00");
    expect(formatDuration(5)).toBe("0:05");
    expect(formatDuration(-3)).toBe("0:00");
    expect(formatDuration(Number.NaN)).toBe("0:00");
    expect(formatDuration(3725)).toBe("62:05");
  });
  test("formatTotal", () => {
    expect(formatTotal(600)).toBe("10 min");
    expect(formatTotal(3900)).toBe("1 h 05 min");
  });
  test("songLabel", () => {
    const db = smallDb();
    expect(songLabel(db, 1)).toBe("Glass Harbour - Nova Lindqvist");
    expect(songLabel(db, 5)).toBe("Slow River Home - The Quiet Orchard");
    expect(songLabel(db, 999)).toBe("");
  });
});

describe("library: search, filter, sort, paging", () => {
  test("starts with every song sorted by title", () => {
    const s = start(smallDb());
    expect(m(s).lib.count).toBe("9 songs");
    expect(titles(s)[0]).toBe("Copper Sun");
    expect(m(s).tabs.find((t) => t.active)?.id).toBe("library");
  });

  test("search matches title, artist and album", () => {
    let s = start(smallDb());
    s = send(s, "setQuery", undefined, { value: "paper" }).state;
    expect(titles(s).sort()).toEqual(["Paper Boats", "Paper Lanterns"]);
    s = send(s, "setQuery", undefined, { value: "halden" }).state;
    expect(titles(s).sort()).toEqual(["Glass Hours", "Static Bloom"]);
    s = send(s, "setQuery", undefined, { value: "small hours" }).state;
    expect(m(s).lib.count).toBe("3 songs");
    s = send(s, "setQuery", undefined, { value: "QUIET glass" }).state;
    expect(m(s).lib.count).toBe("0 songs");
    s = send(s, "setQuery", undefined, { value: "zzz" }).state;
    expect(m(s).lib.table.rows).toHaveLength(0);
    expect(m(s).lib.table.empty).toMatch(/No songs/);
  });

  test("genre, artist and album filters combine", () => {
    let s = start(smallDb());
    s = send(s, "setGenre", undefined, { value: "Folk" }).state;
    expect(m(s).lib.count).toBe("3 songs");
    s = send(s, "pickArtist", 1).state;
    expect(m(s).lib.count).toBe("0 songs");
    s = send(s, "setGenre", undefined, { value: "" }).state;
    expect(m(s).lib.count).toBe("4 songs");
    expect(m(s).lib.artistChip).toBe("Nova Lindqvist");
    s = send(s, "filterByAlbum", 2).state;
    expect(m(s).lib.albumChip).toBe("Night Lines");
    expect(m(s).lib.count).toBe("2 songs");
    s = send(s, "clearFilters").state;
    expect(m(s).lib.hasFilters).toBe(false);
    expect(m(s).lib.count).toBe("9 songs");
  });

  test("the artist typeahead needs 2 letters and gives at most 8", () => {
    let s = start(smallDb());
    s = send(s, "setArtistText", undefined, { value: "h" }).state;
    expect(m(s).lib.suggestions).toEqual([]);
    s = send(s, "setArtistText", undefined, { value: "ha" }).state;
    expect(m(s).lib.suggestions.map((a) => a.name)).toEqual([
      "The Quiet Orchard",
      "Halden",
    ]);
    const db = smallDb();
    db.artists = Array.from({ length: 20 }, (_, i) => ({
      id: i + 1,
      name: `Band ${i}`,
      country: "X",
    }));
    let t = start(db);
    t = send(t, "setArtistText", undefined, { value: "band" }).state;
    expect(m(t).lib.suggestions).toHaveLength(8);
  });

  test("sort by every key, both ways, ties by id", () => {
    let s = start(smallDb());
    s = send(s, "setSort", undefined, { value: "duration" }).state;
    expect(m(s).lib.table.rows[0].title).toBe("Static Bloom");
    s = send(s, "toggleDir").state;
    expect(m(s).lib.table.rows[0].title).toBe("Glass Hours");
    s = send(s, "setSort", undefined, { value: "artist" }).state;
    s = send(s, "toggleDir").state; // back to ascending
    expect(m(s).lib.table.rows[0].artist).toBe("Halden");
    s = send(s, "setSort", undefined, { value: "year" }).state;
    expect(m(s).lib.table.rows[0].year).toBe(2018);
    s = send(s, "setSort", undefined, { value: "album" }).state;
    expect(m(s).lib.table.rows[0].album).toBe("Glass Rooms");
    // the header buttons of the table: the same key twice flips the direction
    s = send(s, "songs.sort", "year").state;
    expect(m(s).sortKey).toBe("year");
    s = send(s, "songs.sort", "year").state;
    expect(m(s).sortDir).toBe("desc");
  });

  test("pages of 25 with a window of page numbers", () => {
    const db = smallDb();
    db.songs = Array.from({ length: 60 }, (_, i) => ({
      id: i + 1,
      albumId: 1,
      artistId: 1,
      title: `Song ${String(i).padStart(2, "0")}`,
      genre: "Indie",
      duration: 100,
      year: 2000,
    }));
    let s = start(db);
    expect(m(s).lib.table.rows).toHaveLength(25);
    expect(m(s).lib.pager.pages).toBe(3);
    expect(m(s).lib.pager.label).toBe("1-25 of 60 songs");
    s = send(s, "lpager.next").state;
    expect(m(s).lib.table.rows[0].title).toBe("Song 25");
    s = send(s, "lpager.goto", 3).state;
    expect(m(s).lib.table.rows).toHaveLength(10);
    expect(m(s).lib.pager.label).toBe("51-60 of 60 songs");
    s = send(s, "lpager.prev").state;
    expect(m(s).lib.pager.page).toBe(2);
    // a new search goes back to page 1
    s = send(s, "setQuery", undefined, { value: "song 4" }).state;
    expect(m(s).lib.pager.page).toBe(1);
    expect(m(s).lib.count).toBe("15 songs"); // "song" and "4" anywhere: 04, 14, 24, ... 40-49
  });

  test("genres, artists and albums panes", () => {
    let s = start(smallDb());
    s = send(s, "setTab", "genres").state;
    expect(m(s).pane).toBe("genres");
    expect(m(s).genreCards).toHaveLength(GENRES.length);
    expect(m(s).genreCards.find((g) => g.name === "Folk")?.count).toBe(3);
    expect(m(s).genreCards.reduce((n, g) => n + g.count, 0)).toBe(9);
    s = send(s, "pickGenre", "Jazz").state;
    expect(m(s).pane).toBe("library");
    expect(m(s).lib.count).toBe("2 songs");
    s = send(s, "setTab", "artists").state;
    expect(m(s).artistList.rows.map((a) => a.name)).toContain("Halden");
    expect(m(s).artistList.rows.find((a) => a.id === 1)).toMatchObject({
      albumsLabel: "2 albums",
      songsLabel: "4 songs",
    });
    s = send(s, "setArtistsQuery", undefined, { value: "nor" }).state; // Norway
    expect(m(s).artistList.rows.map((a) => a.name)).toEqual(["Halden"]);
    s = send(s, "openArtist", 1).state;
    expect(m(s).pane).toBe("artist");
    expect(m(s).artistPg.albums.map((a) => a.title)).toEqual([
      "Low Tide Letters",
      "Night Lines",
    ]);
    expect(m(s).artistPg.table.rows).toHaveLength(4);
    s = send(s, "setTab", "albums").state;
    expect(m(s).albumList.count).toBe("4 albums");
    s = send(s, "setAlbumsQuery", undefined, { value: "halden" }).state; // by artist
    expect(m(s).albumList.cards.map((a) => a.title)).toEqual(["Glass Rooms"]);
    s = send(s, "openAlbum", 3).state;
    expect(m(s).albumPg).toMatchObject({
      title: "Small Hours",
      artist: "The Quiet Orchard",
      year: 2018,
    });
    expect(m(s).albumPg.table.rows.map((r) => r.title)).toEqual([
      "Slow River Home",
      "Paper Lanterns",
      "Orchard Rain",
    ]);
    expect(m(s).albumPg.summary).toMatch(/3 tracks/);
  });
});

describe("playlists", () => {
  test("mine and others', with search", () => {
    let s = start(smallDb());
    s = send(s, "setTab", "playlists").state;
    expect(m(s).lists.mine.map((p) => p.title)).toEqual(["Mine"]);
    expect(m(s).lists.others.map((p) => p.title)).toEqual(["Ben's mix"]);
    s = send(s, "setPlQuery", undefined, { value: "ben" }).state;
    expect(m(s).lists.others).toHaveLength(1);
    s = send(s, "setPlQuery", undefined, { value: "nothing" }).state;
    expect(m(s).lists.others).toHaveLength(0);
  });

  test("create, rename, delete with confirmation", () => {
    let s = start(smallDb());
    s = send(s, "setTab", "playlists").state;
    // an empty title is refused
    let r = send(s, "createPlaylist");
    expect(r.state.db.playlists).toHaveLength(2);
    s = send(s, "setNewTitle", undefined, { value: "  Road trip " }).state;
    r = send(s, "createPlaylist");
    s = r.state;
    const created = s.db.playlists.find((p) => p.title === "Road trip")!;
    expect(created).toMatchObject({
      id: 3,
      ownerId: 1,
      songIds: [],
      createdAt: NOW,
    });
    expect(idbWrites(r)).toHaveLength(1);
    expect(m(s).newTitle).toBe("");
    // rename
    s = send(s, "startRename", 3).state;
    expect(m(s).lists.mine.find((p) => p.id === 3)?.renaming).toBe(true);
    s = send(s, "setDraft", undefined, { value: "Long drive" }).state;
    s = send(s, "saveRename").state;
    expect(s.db.playlists.find((p) => p.id === 3)?.title).toBe("Long drive");
    expect(m(s).renaming).toBe(0);
    // delete: first only the confirmation opens
    s = send(s, "askDelete", 3).state;
    expect(m(s).confirm.open).toBe(true);
    expect(s.db.playlists).toHaveLength(3);
    s = send(s, "confirm.cancel").state;
    expect(m(s).confirm.open).toBe(false);
    s = send(s, "askDelete", 3).state;
    r = send(s, "confirm.confirm");
    s = r.state;
    expect(s.db.playlists.map((p) => p.id)).toEqual([1, 2]);
    expect(
      idbWrites(r).some(
        (e) => (e as unknown as { type: string }).type === "remove",
      ),
    ).toBe(true);
    expect(m(s).confirm.open).toBe(false);
  });

  test("only the owner edits", () => {
    const s = start(smallDb()); // I am user 1; playlist 2 is Ben's
    for (const [name, payload] of [
      ["startRename", 2],
      ["askDelete", 2],
    ] as const) {
      const r = send(s, name, payload);
      expect(r.state.db.playlists).toEqual(s.db.playlists);
      expect(m(r.state).renaming).toBe(0);
      expect(m(r.state).confirm.open).toBe(false);
    }
    // a forged confirmation for somebody else's playlist does nothing
    const forged = {
      ...s,
      music: {
        ...s.music,
        confirm: {
          ...s.music.confirm,
          open: true,
          kind: "delete",
          subject: "2",
        },
      },
    };
    expect(send(forged, "confirm.confirm").state.db.playlists).toHaveLength(2);
    // the open page of another user's playlist has no editing
    let t = send(s, "openPlaylist", 2).state;
    expect(m(t).listPg.mine).toBe(false);
    expect(m(t).listPg.table.canEdit).toBe(false);
    for (const name of ["songs.remove", "songs.up", "songs.down"]) {
      t = send(t, name, 0).state;
      expect(t.db.playlists.find((p) => p.id === 2)?.songIds).toEqual([5, 6]);
    }
    // adding to it through the menu
    t = send(t, "songs.add", 9).state;
    expect(m(t).addOpen).toBe(true);
    t = send(t, "addPick", 2).state;
    expect(t.db.playlists.find((p) => p.id === 2)?.songIds).toEqual([5, 6]);
    // another user signed in cannot touch mine
    const ben = start(smallDb(), 2);
    expect(send(ben, "startRename", 1).state.music.renaming).toBe(0);
  });

  test("add songs from anywhere: to one of mine, or to a new playlist", () => {
    let s = start(smallDb());
    s = send(s, "songs.add", 9).state;
    expect(m(s).menu.lists.map((l) => l.title)).toEqual(["Mine"]);
    expect(m(s).menu.title).toBe('Add "Static Bloom - Halden" to a playlist');
    s = send(s, "addPick", 1).state;
    expect(s.db.playlists[0].songIds).toEqual([1, 2, 3, 9]);
    expect(m(s).addOpen).toBe(false);
    // already in it: nothing is added twice
    s = send(s, "songs.add", 9).state;
    s = send(s, "addPick", 1).state;
    expect(s.db.playlists[0].songIds).toEqual([1, 2, 3, 9]);
    // a new playlist, from the album page (all its tracks)
    s = send(s, "addAlbum", 3).state;
    expect(m(s).addSongs).toEqual([5, 6, 7]);
    s = send(s, "addNewStart").state;
    s = send(s, "addCreate").state; // no title yet
    expect(s.db.playlists).toHaveLength(2);
    s = send(s, "setAddTitle", undefined, { value: "Folk night" }).state;
    s = send(s, "addCreate").state;
    expect(s.db.playlists.find((p) => p.title === "Folk night")).toMatchObject({
      ownerId: 1,
      songIds: [5, 6, 7],
    });
    expect(m(s).addOpen).toBe(false);
    // cancel
    s = send(s, "songs.add", 1).state;
    s = send(s, "closeAdd").state;
    expect(m(s).addOpen).toBe(false);
    expect(m(s).addSongs).toEqual([]);
  });

  test("the open playlist: track list, total, remove, move up and down", () => {
    let s = start(smallDb());
    s = send(s, "openPlaylist", 1).state;
    expect(m(s).pane).toBe("playlist");
    expect(m(s).listPg.table.rows.map((r) => r.title)).toEqual([
      "Glass Harbour",
      "Paper Boats",
      "Midnight Tram",
    ]);
    expect(m(s).listPg.summary).toBe("3 songs · 11 min"); // 214 + 187 + 243 = 644 s
    expect(m(s).listPg.table.canEdit).toBe(true);
    expect(m(s).listPg.table.rows[2].last).toBe(true);
    s = send(s, "songs.down", 0).state;
    expect(s.db.playlists[0].songIds).toEqual([2, 1, 3]);
    s = send(s, "songs.up", 2).state;
    expect(s.db.playlists[0].songIds).toEqual([2, 3, 1]);
    s = send(s, "songs.up", 0).state; // the first cannot go up
    expect(s.db.playlists[0].songIds).toEqual([2, 3, 1]);
    s = send(s, "songs.down", 2).state; // nor the last go down
    expect(s.db.playlists[0].songIds).toEqual([2, 3, 1]);
    s = send(s, "songs.remove", 1).state;
    expect(s.db.playlists[0].songIds).toEqual([2, 1]);
    expect(m(s).listPg.summary).toBe("2 songs · 7 min");
  });
});

describe("player: queue, next, prev, shuffle, repeat", () => {
  const playing = (s: OrbitState) => m(s).player.title;

  test("playing a row queues the list it is in and starts a timer", () => {
    let s = start(smallDb());
    s = send(s, "openAlbum", 3).state;
    const r = send(s, "songs.play", 1);
    s = r.state;
    expect(m(s).queue).toEqual([5, 6, 7]);
    expect(playing(s)).toBe("Paper Lanterns");
    expect(m(s).playing).toBe(true);
    expect(m(s).queueLabel).toBe("Small Hours");
    // a timer is started (the old one cancelled first)
    expect(effectsOf(r, "time", "cancel")).toHaveLength(1);
    const iv = effectsOf(r, "time", "setInterval") as unknown as {
      id: string;
      ms: number;
    }[];
    expect(iv).toHaveLength(1);
    expect(iv[0]).toMatchObject({ id: TIMER });
    // the current row is marked
    expect(m(s).albumPg.table.rows.map((x) => x.current)).toEqual([
      false,
      true,
      false,
    ]);
    expect(m(s).albumPg.table.rows[1].playing).toBe(true);
  });

  test("the library results are the queue", () => {
    let s = start(smallDb());
    s = send(s, "setGenre", undefined, { value: "Folk" }).state;
    s = send(s, "songs.play", 0).state;
    expect(m(s).queue).toHaveLength(3);
    expect(m(s).queueLabel).toBe("Search results");
  });

  test("play / pause, next, previous", () => {
    let s = start(smallDb());
    s = send(s, "playPlaylist", 1).state;
    expect(m(s).queue).toEqual([1, 2, 3]);
    let r = send(s, "toggle");
    expect(m(r.state).playing).toBe(false);
    expect(effectsOf(r, "time", "cancel")).toHaveLength(1);
    expect(effectsOf(r, "time", "setInterval")).toHaveLength(0);
    r = send(r.state, "toggle");
    expect(m(r.state).playing).toBe(true);
    expect(effectsOf(r, "time", "setInterval")).toHaveLength(1);
    s = send(r.state, "next").state;
    expect(m(s).pos).toBe(1);
    s = send(s, "next").state;
    expect(m(s).pos).toBe(2);
    // the last one: Next does nothing, repeat off
    s = send(s, "next").state;
    expect(m(s).pos).toBe(2);
    // previous: with more than 3 seconds played it restarts the song, else goes back
    s = { ...s, music: { ...s.music, elapsed: 10 } };
    s = send(s, "prev").state;
    expect([m(s).pos, m(s).elapsed]).toEqual([2, 0]);
    s = send(s, "prev").state;
    expect(m(s).pos).toBe(1);
    s = send(s, "prev").state;
    s = send(s, "prev").state;
    expect(m(s).pos).toBe(0);
  });

  test("toggle with an empty queue starts the visible list", () => {
    let s = start(smallDb());
    s = send(s, "toggle").state;
    expect(m(s).playing).toBe(true);
    expect(m(s).queue).toHaveLength(9);
  });

  test("seek and jump", () => {
    let s = start(smallDb());
    s = send(s, "playPlaylist", 1).state;
    s = send(s, "seek", undefined, { value: "100" }).state;
    expect(m(s).elapsed).toBe(100);
    expect(m(s).player.elapsedLabel).toBe("1:40");
    s = send(s, "seek", undefined, { value: "99999" }).state;
    expect(m(s).elapsed).toBe(214);
    s = send(s, "jump", 2).state;
    expect([m(s).pos, m(s).elapsed]).toEqual([2, 0]);
    s = send(s, "jump", 77).state;
    expect(m(s).pos).toBe(2);
    s = send(s, "toggleQueue").state;
    expect(m(s).player.queueRows.map((r) => r.title)).toEqual([
      "Midnight Tram",
    ]);
  });

  test("shuffle is deterministic, keeps the current song first, and turning it off restores the order", () => {
    const ids = Array.from({ length: 30 }, (_, i) => i + 1);
    const a = shuffledFrom(ids, 4, 777);
    expect(a).toEqual(shuffledFrom(ids, 4, 777));
    expect(a[0]).toBe(5);
    expect([...a].sort((x, y) => x - y)).toEqual(ids);
    expect(a).not.toEqual(ids);
    expect(shuffledFrom(ids, 4, 778)).not.toEqual(a);
    expect([...shuffledAll(ids, 5)].sort((x, y) => x - y)).toEqual(ids);
    expect(shuffledFrom([], 0, 1)).toEqual([]);

    let s = start(smallDb());
    s = send(s, "setTab", "playlists").state;
    s = send(s, "openPlaylist", 1).state;
    s = send(s, "songs.play", 1).state; // Paper Boats (id 2)
    const seed0 = m(s).seed;
    s = send(s, "toggleShuffle").state;
    expect(m(s).shuffleOn).toBe(true);
    expect(m(s).seed).not.toBe(seed0);
    expect(m(s).queue[0]).toBe(2);
    expect(m(s).pos).toBe(0);
    expect([...m(s).queue].sort()).toEqual([1, 2, 3]);
    expect(m(s).baseQueue).toEqual([1, 2, 3]);
    s = send(s, "toggleShuffle").state;
    expect(m(s).queue).toEqual([1, 2, 3]);
    expect(m(s).pos).toBe(1); // still on Paper Boats
    // two identical runs from the same state give the same queue
    const x = send(send(s, "toggleShuffle").state, "next").state;
    const y = send(send(s, "toggleShuffle").state, "next").state;
    expect(m(x).queue).toEqual(m(y).queue);
    // a new playback with shuffle on starts with the chosen song
    const z = send(send(s, "toggleShuffle").state, "songs.play", 2).state;
    expect(m(z).queue[0]).toBe(3);
  });

  test("repeat: off, all, one", () => {
    let s = start(smallDb());
    expect(m(s).repeatMode).toBe("off");
    s = send(s, "cycleRepeat").state;
    expect(m(s).repeatMode).toBe("all");
    expect(m(s).player.repeatText).toBe("Repeat: all");
    s = send(s, "cycleRepeat").state;
    expect(m(s).repeatMode).toBe("one");
    s = send(s, "cycleRepeat").state;
    expect(m(s).repeatMode).toBe("off");
    expect(following(2, 3, "off", true)).toMatchObject({ end: true });
    expect(following(2, 3, "all", true)).toMatchObject({
      pos: 0,
      wrap: true,
      end: false,
    });
    expect(following(1, 3, "one", true)).toMatchObject({ pos: 1, end: false });
    expect(following(1, 3, "one", false)).toMatchObject({ pos: 2 });

    // repeat all wraps with Next, and Previous at the start goes to the end
    s = send(start(smallDb()), "playPlaylist", 1).state;
    s = send(send(s, "cycleRepeat").state, "next").state;
    s = send(s, "next").state;
    s = send(s, "next").state;
    expect(m(s).pos).toBe(0);
    s = send(s, "prev").state;
    expect(m(s).pos).toBe(2);
  });

  test("nextSeed is stable", () => {
    expect(nextSeed(1)).toBe(nextSeed(1));
    expect(nextSeed(1)).not.toBe(1);
  });

  test("enter: songId plays, artistId and albumId open pages", () => {
    const s = start(smallDb());
    let u = musicModule.enter!({ songId: 6 }, s) as Update;
    let r = applyUpdate(s, "music", u);
    expect(m(r.state).queue).toEqual([5, 6, 7]);
    expect(m(r.state).pos).toBe(1);
    expect(m(r.state).playing).toBe(true);
    expect(m(r.state).pane).toBe("album");
    expect(effectsOf(r, "time", "setInterval")).toHaveLength(1);
    u = musicModule.enter!({ artistId: 3 }, s) as Update;
    r = applyUpdate(s, "music", u);
    expect(m(r.state).pane).toBe("artist");
    expect(m(r.state).artistPg.name).toBe("Halden");
    u = musicModule.enter!({ albumId: 4 }, s) as Update;
    r = applyUpdate(s, "music", u);
    expect(m(r.state).albumPg.title).toBe("Glass Rooms");
    // an unknown song, and no params
    expect((musicModule.enter!({ songId: 999 }, s) as Update).notice).toMatch(
      /not in the library/,
    );
    expect(musicModule.enter!(undefined, s)).toBeUndefined();
    // through the shell: go to the music screen with a songId
    const away: OrbitState = { ...s, screen: "wall" };
    const via = applyUpdate(away, "wall", {
      go: { screen: "music", params: { songId: 8 } },
    });
    expect(via.state.screen).toBe("music");
    expect(via.state.music.player.title).toBe("Glass Hours");
  });
});

describe("tick and stop", () => {
  const playing = (): OrbitState =>
    send(start(smallDb()), "playPlaylist", 1).state;

  test("a tick advances the elapsed time", () => {
    let s = playing();
    const r = send(s, "tick");
    s = r.state;
    expect(m(s).elapsed).toBe(1);
    expect(effectsOf(r, "time")).toHaveLength(0);
    s = send(s, "tick").state;
    expect(m(s).player.elapsedLabel).toBe("0:02");
  });

  test("the song ends and the next one starts", () => {
    let s = playing();
    s = { ...s, music: { ...s.music, elapsed: 213 } };
    const r = send(s, "tick");
    expect([m(r.state).pos, m(r.state).elapsed, m(r.state).playing]).toEqual([
      1,
      0,
      true,
    ]);
    // no new timer: the running one goes on
    expect(effectsOf(r, "time", "setInterval")).toHaveLength(0);
    expect(effectsOf(r, "time", "cancel")).toHaveLength(0);
  });

  test("the end of the queue stops the player and cancels the timer", () => {
    let s = playing();
    s = { ...s, music: { ...s.music, pos: 2, elapsed: 242 } };
    const r = send(s, "tick");
    expect(m(r.state).playing).toBe(false);
    expect(m(r.state).elapsed).toBe(0);
    expect(effectsOf(r, "time", "cancel")).toHaveLength(1);
  });

  test("repeat one restarts the song, repeat all wraps", () => {
    let s = playing();
    s = {
      ...s,
      music: { ...s.music, repeatMode: "one", pos: 1, elapsed: 186 },
    };
    let r = send(s, "tick");
    expect([m(r.state).pos, m(r.state).elapsed, m(r.state).playing]).toEqual([
      1,
      0,
      true,
    ]);
    s = {
      ...s,
      music: { ...s.music, repeatMode: "all", pos: 2, elapsed: 242 },
    };
    r = send(s, "tick");
    expect([m(r.state).pos, m(r.state).elapsed, m(r.state).playing]).toEqual([
      0,
      0,
      true,
    ]);
  });

  test("wrapping with shuffle on makes a new shuffled queue from the seed", () => {
    let s = playing();
    s = send(s, "toggleShuffle").state;
    s = { ...s, music: { ...s.music, repeatMode: "all", pos: 2, elapsed: 1 } };
    const seed = m(s).seed;
    s = { ...s, music: { ...s.music, elapsed: 242 } };
    const r = send(s, "tick");
    expect(m(r.state).pos).toBe(0);
    expect(m(r.state).seed).not.toBe(seed);
    expect([...m(r.state).queue].sort()).toEqual([1, 2, 3]);
  });

  test("leaving the screen stops the player and cancels the timer", () => {
    const s = playing();
    const away: OrbitState = { ...s, screen: "wall" };
    const r = send(away, "tick");
    expect(m(r.state).playing).toBe(false);
    expect(m(r.state).elapsed).toBe(0); // it does not move
    const cancels = effectsOf(r, "time", "cancel") as unknown as {
      id: string;
    }[];
    expect(cancels).toHaveLength(1);
    expect(cancels[0].id).toBe(TIMER);
    // coming back: paused where it was, the button says Play
    const back = applyUpdate({ ...r.state, screen: "music" }, "music", {});
    expect(back.state.music.player.playing).toBe(false);
  });

  test("a tick with nothing playing cancels the timer", () => {
    const r = send(start(smallDb()), "tick");
    expect(effectsOf(r, "time", "cancel")).toHaveLength(1);
    expect(m(r.state).playing).toBe(false);
  });

  test("pausing cancels, starting again cancels the old timer first", () => {
    const s = playing();
    const paused = send(s, "toggle");
    expect(effectsOf(paused, "time", "cancel")).toHaveLength(1);
    const again = send(s, "playPlaylist", 1);
    const kinds = (
      effectsOf(again, "time") as unknown as { type: string }[]
    ).map((e) => e.type);
    expect(kinds).toEqual(["cancel", "setInterval"]);
  });
});

describe("the real sample data", () => {
  const db = seedDb();

  test("the library is 10,000 songs; genre counts add up", () => {
    expect(db.songs).toHaveLength(10000);
    const s = start(db);
    let s2 = send(s, "setTab", "genres").state;
    expect(m(s2).genreCards.reduce((n, g) => n + g.count, 0)).toBe(10000);
    expect(m(s2).genreCards.every((g) => g.count > 0)).toBe(true);
    s2 = send(s2, "setTab", "library").state;
    expect(m(s2).lib.count).toBe("10,000 songs");
  });

  test("search stays fast once the index is built", () => {
    const f = {
      query: "",
      genre: "",
      artistId: 0,
      albumId: 0,
      sortKey: "title" as const,
      sortDir: "asc" as const,
    };
    searchSongs(db, f); // builds the index and the default sort
    let worst = 0;
    for (const q of [
      "a",
      "an",
      "the",
      "lantern",
      "love",
      "mo",
      "x",
      "e l",
      "zzzzqq",
    ]) {
      const t0 = performance.now();
      searchSongs(db, { ...f, query: q });
      worst = Math.max(worst, performance.now() - t0);
    }
    expect(searchSongs(db, { ...f, query: "the" }).length).toBeGreaterThan(0);
    expect(worst).toBeLessThan(50);
    const t1 = performance.now();
    searchSongs(db, { ...f, genre: "Jazz", sortKey: "duration" });
    expect(performance.now() - t1).toBeLessThan(50);
  });

  test("a derive is cheap (it runs on every tick)", () => {
    let s = start(db);
    s = send(s, "setQuery", undefined, { value: "a" }).state;
    s = send(s, "songs.play", 0).state;
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) s = send(s, "tick").state;
    expect((performance.now() - t0) / 20).toBeLessThan(10);
    expect(m(s).elapsed).toBe(20);
  });

  test("playlists of the sample: mine are the signed-in user's", () => {
    const me = db.playlists[0].ownerId;
    let s = start(db, me);
    s = send(s, "setTab", "playlists").state;
    const mine = db.playlists.filter((p) => p.ownerId === me).length;
    expect(m(s).lists.mine).toHaveLength(mine);
    expect(m(s).lists.others.length).toBe(
      Math.min(12, db.playlists.length - mine),
    );
  });

  test("every album has tracks and its page lists them", () => {
    let s = start(db);
    s = send(s, "openAlbum", db.albums[0].id).state;
    expect(m(s).albumPg.table.rows.length).toBeGreaterThan(0);
    expect(m(s).albumPg.table.rows[0].n).toBe(1);
  });
});
