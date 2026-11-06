// The music screen of Orbit: a library of 10,000 songs (search, genres, artists,
// albums), playlists, and a simulated player (no audio: a timer of the time plugin
// advances the elapsed seconds). See core.ts for the module contract.
import { timeEffector as time } from "@pavlus/frontend/plugins";
import { jumpsOf } from "../../../../blocks/crud-table/table.ts";
import {
  askConfirm,
  type ConfirmProps,
  closedConfirm,
} from "../../../../blocks/danger-confirm/confirm.ts";
import {
  byId,
  type DomEvent,
  type Handler,
  type Module,
  nextId,
  type OrbitState,
  paged,
  type Update,
} from "../../core.ts";
import { glyphOf, pictureStyle } from "../../pictures.ts";
import {
  type Album,
  type Db,
  GENRES,
  type Playlist,
  type Song,
} from "../../schema.ts";
import {
  albumsPerArtist,
  albumTrackIds,
  artistSongIds,
  artistSuggestions,
  formatDuration,
  formatTotal,
  genreCounts,
  plural,
  SORT_KEYS,
  type SongFilter,
  type SortKey,
  searchSongs,
  songIndex,
  songLabel,
  thousands,
} from "./library.ts";
import {
  following,
  nextRepeat,
  nextSeed,
  type Repeat,
  repeatLabel,
  shuffledAll,
  shuffledFrom,
} from "./player.ts";

export { formatDuration, formatTotal, songLabel };

export type Tab = "library" | "genres" | "artists" | "albums" | "playlists";

export const TIMER = "music-tick";
export const SONG_PAGE = 25;
export const ARTIST_PAGE = 20;
export const ALBUM_PAGE = 24;
export const LIST_PAGE = 12;
const TOP_SONGS = 10;
const QUEUE_ROWS = 40;

// ---- the shapes of the view props ----

export interface SongRow {
  key: number;
  id: number;
  pos: number;
  n: number;
  title: string;
  artist: string;
  artistId: number;
  album: string;
  albumId: number;
  genre: string;
  year: number;
  length: string;
  current: boolean;
  playing: boolean;
  first: boolean;
  last: boolean;
}

export interface TableProps {
  rows: SongRow[];
  showNumber: boolean;
  showAlbum: boolean;
  showGenre: boolean;
  showYear: boolean;
  sortable: boolean;
  sortKey: string;
  sortDir: "asc" | "desc";
  canEdit: boolean;
  empty: string;
}

export interface PagerProps {
  label: string;
  page: number;
  pages: number;
  jumps: { n: number; active: boolean }[];
}

export interface CoverProps {
  style: string;
  glyph: string;
}

export interface AlbumCard {
  id: number;
  title: string;
  artist: string;
  artistId: number;
  year: number;
  tracksLabel: string;
  cover: CoverProps;
}

interface Option {
  value: string;
  label: string;
  active: boolean;
}

export interface LibraryView {
  query: string;
  genreOptions: Option[];
  sortOptions: Option[];
  dirLabel: string;
  artistText: string;
  suggestions: { id: number; name: string; country: string }[];
  artistChip: string;
  albumChip: string;
  hasFilters: boolean;
  count: string;
  table: TableProps;
  pager: PagerProps;
}

export interface PlaylistCard {
  id: number;
  title: string;
  owner: string;
  countLabel: string;
  duration: string;
  renaming: boolean;
}

export interface PlayerView {
  has: boolean;
  title: string;
  artist: string;
  album: string;
  cover: CoverProps;
  playing: boolean;
  elapsed: number;
  duration: number;
  elapsedLabel: string;
  durationLabel: string;
  shuffleOn: boolean;
  repeatMode: Repeat;
  repeatText: string;
  queueOpen: boolean;
  queueLabel: string;
  queueInfo: string;
  queueRows: {
    key: number;
    pos: number;
    title: string;
    artist: string;
    length: string;
    current: boolean;
  }[];
}

export interface MusicState {
  // ---- the UI state of the screen ----
  tab: Tab;
  query: string;
  genre: string;
  artistFilter: number;
  albumFilter: number;
  artistText: string;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  page: number;
  artistsQuery: string;
  artistsPage: number;
  artistId: number;
  albumsQuery: string;
  albumsPage: number;
  albumId: number;
  plQuery: string;
  plPage: number;
  playlistId: number;
  newTitle: string;
  renaming: number;
  draft: string;
  addSongs: number[];
  addOpen: boolean;
  addCreating: boolean;
  addTitle: string;
  confirm: ConfirmProps;
  // ---- the player ----
  /** the songs the queue was made from, in their own order */
  baseQueue: number[];
  /** the order they play in (shuffled when `shuffleOn`) */
  queue: number[];
  pos: number;
  playing: boolean;
  elapsed: number;
  shuffleOn: boolean;
  repeatMode: Repeat;
  seed: number;
  queueLabel: string;
  queueOpen: boolean;
  // ---- derived view props ----
  pane:
    | "library"
    | "genres"
    | "artists"
    | "artist"
    | "albums"
    | "album"
    | "playlists"
    | "playlist";
  tabs: { id: Tab; label: string; active: boolean }[];
  lib: LibraryView;
  genreCards: {
    name: string;
    count: number;
    countLabel: string;
    hue: number;
  }[];
  artistList: {
    query: string;
    count: string;
    rows: {
      id: number;
      name: string;
      country: string;
      albumsLabel: string;
      songsLabel: string;
    }[];
    pager: PagerProps;
  };
  artistPg: {
    name: string;
    country: string;
    summary: string;
    albums: AlbumCard[];
    table: TableProps;
  };
  albumList: {
    query: string;
    count: string;
    cards: AlbumCard[];
    pager: PagerProps;
  };
  albumPg: {
    id: number;
    title: string;
    artist: string;
    artistId: number;
    year: number;
    summary: string;
    cover: CoverProps;
    table: TableProps;
  };
  lists: {
    newTitle: string;
    mine: PlaylistCard[];
    query: string;
    othersCount: string;
    others: PlaylistCard[];
    pager: PagerProps;
  };
  listPg: {
    id: number;
    title: string;
    owner: string;
    mine: boolean;
    renaming: boolean;
    summary: string;
    table: TableProps;
  };
  player: PlayerView;
  menu: {
    title: string;
    lists: { id: number; title: string; countLabel: string }[];
    empty: boolean;
  };
}

// ---- helpers ----

const NO_COVER: CoverProps = { style: "background: var(--muted)", glyph: "" };
const NO_TABLE: TableProps = {
  rows: [],
  showNumber: false,
  showAlbum: true,
  showGenre: true,
  showYear: true,
  sortable: false,
  sortKey: "",
  sortDir: "asc",
  canEdit: false,
  empty: "",
};
const NO_PAGER: PagerProps = {
  label: "",
  page: 1,
  pages: 1,
  jumps: [{ n: 1, active: true }],
};

const coverOf = (album: Album | undefined): CoverProps =>
  album
    ? { style: pictureStyle(album.cover), glyph: glyphOf(album.cover) }
    : NO_COVER;

const pagerOf = (
  total: number,
  page: number,
  pages: number,
  size: number,
  noun: string,
): PagerProps => {
  const from = total === 0 ? 0 : (page - 1) * size + 1;
  const to = Math.min(total, page * size);
  return {
    label:
      total === 0
        ? `No ${noun}s`
        : `${thousands(from)}-${thousands(to)} of ${plural(total, noun)}`,
    page,
    pages,
    jumps: jumpsOf(page, pages),
  };
};

const filterOf = (m: MusicState): SongFilter => ({
  query: m.query,
  genre: m.genre,
  artistId: m.artistFilter,
  albumId: m.albumFilter,
  sortKey: m.sortKey,
  sortDir: m.sortDir,
});

const text = (e: DomEvent | undefined): string => String(e?.value ?? "");

/** The playlists of the signed-in user are the only ones that can be changed. */
function ownPlaylist(s: OrbitState, id: unknown): Playlist | undefined {
  const pl = byId(s.db.playlists).get(Number(id));
  return pl && s.me > 0 && pl.ownerId === s.me ? pl : undefined;
}

/** The ids of a playlist that still exist as songs. */
const playlistIds = (db: Db, pl: Playlist): number[] => {
  const songs = byId(db.songs);
  return pl.songIds.filter((id) => songs.has(id));
};

function totalSeconds(db: Db, ids: number[]): number {
  const songs = byId(db.songs);
  let t = 0;
  for (const id of ids) t += songs.get(id)?.duration ?? 0;
  return t;
}

/** The list the song rows on the screen come from, and what to call it. */
function contextOf(s: OrbitState): { ids: number[]; label: string } {
  const m = s.music;
  const db = s.db;
  if (m.tab === "artists" && m.artistId) {
    const name = byId(db.artists).get(m.artistId)?.name ?? "";
    return {
      ids: artistSongIds(db, m.artistId).slice(0, TOP_SONGS),
      label: `Top songs: ${name}`,
    };
  }
  if (m.tab === "albums" && m.albumId)
    return {
      ids: albumTrackIds(db, m.albumId),
      label: byId(db.albums).get(m.albumId)?.title ?? "Album",
    };
  if (m.tab === "playlists" && m.playlistId) {
    const pl = byId(db.playlists).get(m.playlistId);
    return pl
      ? { ids: playlistIds(db, pl), label: pl.title }
      : { ids: [], label: "" };
  }
  const label =
    m.query || m.genre || m.artistFilter || m.albumFilter
      ? "Search results"
      : "Library";
  return { ids: searchSongs(db, filterOf(m)), label };
}

function songRows(s: OrbitState, ids: number[], first: number): SongRow[] {
  const m = s.music;
  const songs = byId(s.db.songs);
  const artists = byId(s.db.artists);
  const albums = byId(s.db.albums);
  const cur = m.queue[m.pos] ?? 0;
  const rows: SongRow[] = [];
  ids.forEach((id, i) => {
    const song = songs.get(id);
    if (!song) return;
    const pos = first + i;
    rows.push({
      key: pos,
      id,
      pos,
      n: pos + 1,
      title: song.title,
      artist: artists.get(song.artistId)?.name ?? "",
      artistId: song.artistId,
      album: albums.get(song.albumId)?.title ?? "",
      albumId: song.albumId,
      genre: song.genre,
      year: song.year,
      length: formatDuration(song.duration),
      current: id === cur,
      playing: id === cur && m.playing,
      first: pos === 0,
      last: false,
    });
  });
  return rows;
}

// ---- the player ----

/** Start playing `ids` from `pos` (an update: the queue, a fresh timer). */
function startPlayback(
  s: OrbitState,
  ids: number[],
  pos: number,
  label: string,
): Update {
  if (ids.length === 0) return { notice: "Nothing to play" };
  const m = s.music;
  const seed = nextSeed(m.seed);
  const start = Math.min(Math.max(0, pos), ids.length - 1);
  return {
    slice: {
      baseQueue: ids,
      queue: m.shuffleOn ? shuffledFrom(ids, start, seed) : ids,
      pos: m.shuffleOn ? 0 : start,
      playing: true,
      elapsed: 0,
      seed,
      queueLabel: label,
    },
    effects: restartTimer(),
  };
}

/** A fresh one-second timer (a running one is cancelled first). */
const restartTimer = () => [
  time.cancel(TIMER),
  time.setInterval(TIMER, 1000, "music.tick"),
];

const currentSong = (s: OrbitState): Song | undefined =>
  byId(s.db.songs).get(s.music.queue[s.music.pos] ?? 0);

/** Next song: by itself (`natural`) or by the button. */
function advance(s: OrbitState, natural: boolean): Update {
  const m = s.music;
  const f = following(m.pos, m.queue.length, m.repeatMode, natural);
  if (f.end) {
    return natural
      ? { slice: { playing: false, elapsed: 0 }, effects: [time.cancel(TIMER)] }
      : { notice: "This is the last song of the queue" };
  }
  if (natural && m.repeatMode === "one") return { slice: { elapsed: 0 } };
  if (f.wrap && m.shuffleOn) {
    const seed = nextSeed(m.seed);
    return {
      slice: {
        queue: shuffledAll(m.baseQueue, seed),
        pos: 0,
        elapsed: 0,
        playing: true,
        seed,
      },
      effects: restartTimer(),
    };
  }
  return {
    slice: { pos: f.pos, elapsed: 0, playing: true },
    effects: natural ? [] : restartTimer(),
  };
}

function playerView(s: OrbitState): PlayerView {
  const m = s.music;
  const song = currentSong(s);
  const q = m.queue;
  const album = song ? byId(s.db.albums).get(song.albumId) : undefined;
  const songs = byId(s.db.songs);
  const artists = byId(s.db.artists);
  const queueRows: PlayerView["queueRows"] = [];
  if (m.queueOpen) {
    for (let i = m.pos; i < q.length && queueRows.length < QUEUE_ROWS; i++) {
      const sg = songs.get(q[i]);
      if (!sg) continue;
      queueRows.push({
        key: i,
        pos: i,
        title: sg.title,
        artist: artists.get(sg.artistId)?.name ?? "",
        length: formatDuration(sg.duration),
        current: i === m.pos,
      });
    }
  }
  return {
    has: !!song,
    title: song?.title ?? "Nothing playing",
    artist: song
      ? (artists.get(song.artistId)?.name ?? "")
      : "Pick a song and press Play",
    album: album?.title ?? "",
    cover: coverOf(album),
    playing: m.playing && !!song,
    elapsed: m.elapsed,
    duration: song?.duration ?? 0,
    elapsedLabel: formatDuration(m.elapsed),
    durationLabel: formatDuration(song?.duration ?? 0),
    shuffleOn: m.shuffleOn,
    repeatMode: m.repeatMode,
    repeatText: repeatLabel(m.repeatMode),
    queueOpen: m.queueOpen,
    queueLabel: m.queueLabel,
    queueInfo: q.length ? `${m.pos + 1} of ${thousands(q.length)}` : "",
    queueRows,
  };
}

// ---- the views, one per pane ----

function albumCards(s: OrbitState, albums: Album[]): AlbumCard[] {
  const idx = songIndex(s.db);
  const artists = byId(s.db.artists);
  return albums.map((a) => ({
    id: a.id,
    title: a.title,
    artist: artists.get(a.artistId)?.name ?? "",
    artistId: a.artistId,
    year: a.year,
    tracksLabel: plural(idx.byAlbum.get(a.id)?.length ?? 0, "track"),
    cover: coverOf(a),
  }));
}

function libView(s: OrbitState): LibraryView {
  const m = s.music;
  const db = s.db;
  const ids = searchSongs(db, filterOf(m));
  const pg = paged(ids, m.page, SONG_PAGE);
  const first = (pg.page - 1) * SONG_PAGE;
  const artistChip = m.artistFilter
    ? (byId(db.artists).get(m.artistFilter)?.name ?? "")
    : "";
  const albumChip = m.albumFilter
    ? (byId(db.albums).get(m.albumFilter)?.title ?? "")
    : "";
  return {
    query: m.query,
    genreOptions: [
      { value: "", label: "All genres", active: m.genre === "" },
      ...GENRES.map((g) => ({ value: g, label: g, active: m.genre === g })),
    ],
    sortOptions: SORT_KEYS.map((k) => ({
      value: k.value,
      label: k.label,
      active: m.sortKey === k.value,
    })),
    dirLabel: m.sortDir === "asc" ? "Ascending" : "Descending",
    artistText: m.artistText,
    suggestions: artistSuggestions(db, m.artistText).map((a) => ({
      id: a.id,
      name: a.name,
      country: a.country,
    })),
    artistChip,
    albumChip,
    hasFilters: !!(m.query || m.genre || m.artistFilter || m.albumFilter),
    count: plural(ids.length, "song"),
    table: {
      rows: songRows(s, pg.items, first),
      showNumber: false,
      showAlbum: true,
      showGenre: true,
      showYear: true,
      sortable: true,
      sortKey: m.sortKey,
      sortDir: m.sortDir,
      canEdit: false,
      empty: "No songs match. Clear a filter or search for something else.",
    },
    pager: pagerOf(ids.length, pg.page, pg.pages, SONG_PAGE, "song"),
  };
}

function artistsView(s: OrbitState): MusicState["artistList"] {
  const m = s.music;
  const q = m.artistsQuery.trim().toLowerCase();
  const idx = songIndex(s.db);
  const perArtist = albumsPerArtist(s.db);
  const found = q
    ? s.db.artists.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.country.toLowerCase().includes(q),
      )
    : s.db.artists;
  const pg = paged(found, m.artistsPage, ARTIST_PAGE);
  return {
    query: m.artistsQuery,
    count: plural(found.length, "artist"),
    rows: pg.items.map((a) => ({
      id: a.id,
      name: a.name,
      country: a.country,
      albumsLabel: plural(perArtist.get(a.id) ?? 0, "album"),
      songsLabel: plural(idx.byArtist.get(a.id)?.length ?? 0, "song"),
    })),
    pager: pagerOf(found.length, pg.page, pg.pages, ARTIST_PAGE, "artist"),
  };
}

function artistPageView(s: OrbitState): MusicState["artistPg"] {
  const m = s.music;
  const artist = byId(s.db.artists).get(m.artistId);
  if (!artist)
    return { name: "", country: "", summary: "", albums: [], table: NO_TABLE };
  const albums = s.db.albums.filter((a) => a.artistId === artist.id);
  const all = artistSongIds(s.db, artist.id);
  const top = all.slice(0, TOP_SONGS);
  return {
    name: artist.name,
    country: artist.country,
    summary: `${artist.country} · ${plural(albums.length, "album")} · ${plural(all.length, "song")}`,
    albums: albumCards(s, albums),
    table: {
      ...NO_TABLE,
      rows: songRows(s, top, 0),
      showNumber: true,
      showGenre: true,
      empty: "No songs yet",
    },
  };
}

function albumsView(s: OrbitState): MusicState["albumList"] {
  const m = s.music;
  const q = m.albumsQuery.trim().toLowerCase();
  const artists = byId(s.db.artists);
  const found = q
    ? s.db.albums.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          (artists.get(a.artistId)?.name ?? "").toLowerCase().includes(q),
      )
    : s.db.albums;
  const pg = paged(found, m.albumsPage, ALBUM_PAGE);
  return {
    query: m.albumsQuery,
    count: plural(found.length, "album"),
    cards: albumCards(s, pg.items),
    pager: pagerOf(found.length, pg.page, pg.pages, ALBUM_PAGE, "album"),
  };
}

function albumPageView(s: OrbitState): MusicState["albumPg"] {
  const album = byId(s.db.albums).get(s.music.albumId);
  if (!album)
    return {
      id: 0,
      title: "",
      artist: "",
      artistId: 0,
      year: 0,
      summary: "",
      cover: NO_COVER,
      table: NO_TABLE,
    };
  const ids = albumTrackIds(s.db, album.id);
  return {
    id: album.id,
    title: album.title,
    artist: byId(s.db.artists).get(album.artistId)?.name ?? "",
    artistId: album.artistId,
    year: album.year,
    summary: `${album.year} · ${plural(ids.length, "track")} · ${formatTotal(totalSeconds(s.db, ids))}`,
    cover: coverOf(album),
    table: {
      ...NO_TABLE,
      rows: songRows(s, ids, 0),
      showNumber: true,
      showAlbum: false,
      showGenre: true,
      showYear: false,
      empty: "This album has no tracks",
    },
  };
}

function listsView(s: OrbitState): MusicState["lists"] {
  const m = s.music;
  const users = byId(s.db.users);
  const card = (pl: Playlist): PlaylistCard => {
    const ids = playlistIds(s.db, pl);
    return {
      id: pl.id,
      title: pl.title,
      owner: users.get(pl.ownerId)?.name ?? "Unknown",
      countLabel: plural(ids.length, "song"),
      duration: formatTotal(totalSeconds(s.db, ids)),
      renaming: m.renaming === pl.id,
    };
  };
  const mine = s.db.playlists.filter((p) => p.ownerId === s.me).map(card);
  const q = m.plQuery.trim().toLowerCase();
  const others = s.db.playlists.filter(
    (p) =>
      p.ownerId !== s.me &&
      (!q ||
        p.title.toLowerCase().includes(q) ||
        (users.get(p.ownerId)?.name ?? "").toLowerCase().includes(q)),
  );
  const pg = paged(others, m.plPage, LIST_PAGE);
  return {
    newTitle: m.newTitle,
    mine,
    query: m.plQuery,
    othersCount: plural(others.length, "playlist"),
    others: pg.items.map(card),
    pager: pagerOf(others.length, pg.page, pg.pages, LIST_PAGE, "playlist"),
  };
}

function listPageView(s: OrbitState): MusicState["listPg"] {
  const m = s.music;
  const pl = byId(s.db.playlists).get(m.playlistId);
  if (!pl)
    return {
      id: 0,
      title: "",
      owner: "",
      mine: false,
      renaming: false,
      summary: "",
      table: NO_TABLE,
    };
  const ids = playlistIds(s.db, pl);
  const mine = s.me > 0 && pl.ownerId === s.me;
  const rows = songRows(s, ids, 0);
  if (rows.length) rows[rows.length - 1].last = true;
  return {
    id: pl.id,
    title: pl.title,
    owner: byId(s.db.users).get(pl.ownerId)?.name ?? "Unknown",
    mine,
    renaming: mine && m.renaming === pl.id,
    summary: `${plural(ids.length, "song")} · ${formatTotal(totalSeconds(s.db, ids))}`,
    table: {
      ...NO_TABLE,
      rows,
      showNumber: true,
      showAlbum: true,
      showGenre: false,
      showYear: false,
      canEdit: mine,
      empty: mine
        ? "The playlist is empty. Use Add to playlist on any song."
        : "The playlist is empty.",
    },
  };
}

const TABS: { id: Tab; label: string }[] = [
  { id: "library", label: "Library" },
  { id: "genres", label: "Genres" },
  { id: "artists", label: "Artists" },
  { id: "albums", label: "Albums" },
  { id: "playlists", label: "Playlists" },
];

const NO_LIB: LibraryView = {
  query: "",
  genreOptions: [],
  sortOptions: [],
  dirLabel: "",
  artistText: "",
  suggestions: [],
  artistChip: "",
  albumChip: "",
  hasFilters: false,
  count: "",
  table: NO_TABLE,
  pager: NO_PAGER,
};
const NO_ARTISTS: MusicState["artistList"] = {
  query: "",
  count: "",
  rows: [],
  pager: NO_PAGER,
};
const NO_ARTIST_PG: MusicState["artistPg"] = {
  name: "",
  country: "",
  summary: "",
  albums: [],
  table: NO_TABLE,
};
const NO_ALBUMS: MusicState["albumList"] = {
  query: "",
  count: "",
  cards: [],
  pager: NO_PAGER,
};
const NO_ALBUM_PG: MusicState["albumPg"] = {
  id: 0,
  title: "",
  artist: "",
  artistId: 0,
  year: 0,
  summary: "",
  cover: NO_COVER,
  table: NO_TABLE,
};
const NO_LISTS: MusicState["lists"] = {
  newTitle: "",
  mine: [],
  query: "",
  othersCount: "",
  others: [],
  pager: NO_PAGER,
};
const NO_LIST_PG: MusicState["listPg"] = {
  id: 0,
  title: "",
  owner: "",
  mine: false,
  renaming: false,
  summary: "",
  table: NO_TABLE,
};
const NO_PLAYER: PlayerView = {
  has: false,
  title: "Nothing playing",
  artist: "",
  album: "",
  cover: NO_COVER,
  playing: false,
  elapsed: 0,
  duration: 0,
  elapsedLabel: "0:00",
  durationLabel: "0:00",
  shuffleOn: false,
  repeatMode: "off",
  repeatText: "Repeat: off",
  queueOpen: false,
  queueLabel: "",
  queueInfo: "",
  queueRows: [],
};

function paneOf(m: MusicState): MusicState["pane"] {
  if (m.tab === "artists") return m.artistId ? "artist" : "artists";
  if (m.tab === "albums") return m.albumId ? "album" : "albums";
  if (m.tab === "playlists") return m.playlistId ? "playlist" : "playlists";
  return m.tab;
}

function menuView(s: OrbitState): MusicState["menu"] {
  const m = s.music;
  const one = m.addSongs.length === 1 ? songLabel(s.db, m.addSongs[0]) : "";
  const lists = s.db.playlists
    .filter((p) => p.ownerId === s.me)
    .map((p) => ({
      id: p.id,
      title: p.title,
      countLabel: plural(p.songIds.length, "song"),
    }));
  return {
    title: one
      ? `Add "${one}" to a playlist`
      : `Add ${plural(m.addSongs.length, "song")} to a playlist`,
    lists,
    empty: lists.length === 0,
  };
}

// ---- the module ----

function initialState(): MusicState {
  return {
    tab: "library",
    query: "",
    genre: "",
    artistFilter: 0,
    albumFilter: 0,
    artistText: "",
    sortKey: "title",
    sortDir: "asc",
    page: 1,
    artistsQuery: "",
    artistsPage: 1,
    artistId: 0,
    albumsQuery: "",
    albumsPage: 1,
    albumId: 0,
    plQuery: "",
    plPage: 1,
    playlistId: 0,
    newTitle: "",
    renaming: 0,
    draft: "",
    addSongs: [],
    addOpen: false,
    addCreating: false,
    addTitle: "",
    confirm: closedConfirm(),
    baseQueue: [],
    queue: [],
    pos: 0,
    playing: false,
    elapsed: 0,
    shuffleOn: false,
    repeatMode: "off",
    seed: 20261104,
    queueLabel: "",
    queueOpen: false,
    pane: "library",
    tabs: TABS.map((t) => ({ ...t, active: t.id === "library" })),
    lib: NO_LIB,
    genreCards: [],
    artistList: NO_ARTISTS,
    artistPg: NO_ARTIST_PG,
    albumList: NO_ALBUMS,
    albumPg: NO_ALBUM_PG,
    lists: NO_LISTS,
    listPg: NO_LIST_PG,
    player: NO_PLAYER,
    menu: { title: "", lists: [], empty: true },
  };
}

function derive(s: OrbitState): MusicState {
  const m = s.music;
  const pane = paneOf(m);
  const out: MusicState = {
    ...m,
    pane,
    tabs: TABS.map((t) => ({ ...t, active: t.id === m.tab })),
    player: playerView(s),
  };
  if (pane === "library") out.lib = libView(s);
  else if (pane === "genres") {
    const counts = genreCounts(s.db);
    out.genreCards = GENRES.map((g, i) => ({
      name: g,
      count: counts.get(g) ?? 0,
      countLabel: plural(counts.get(g) ?? 0, "song"),
      hue: (i * 18 + 200) % 360,
    }));
  } else if (pane === "artists") out.artistList = artistsView(s);
  else if (pane === "artist") out.artistPg = artistPageView(s);
  else if (pane === "albums") out.albumList = albumsView(s);
  else if (pane === "album") out.albumPg = albumPageView(s);
  else if (pane === "playlists") out.lists = listsView(s);
  else if (pane === "playlist") out.listPg = listPageView(s);
  if (m.addOpen) out.menu = menuView(s);
  return out;
}

const slice = (patch: Partial<MusicState>): Update => ({
  slice: patch as Record<string, unknown>,
});

/** `prev`, `next`, `goto` of a pager that keeps its page in `field`. */
function pagerHandlers(
  prefix: string,
  field: "page" | "artistsPage" | "albumsPage" | "plPage",
): Record<string, Handler> {
  return {
    [`${prefix}.prev`]: (_p, _e, s) =>
      slice({ [field]: Math.max(1, s.music[field] - 1) }),
    [`${prefix}.next`]: (_p, _e, s) => slice({ [field]: s.music[field] + 1 }),
    [`${prefix}.goto`]: (p) => slice({ [field]: Math.max(1, Number(p) || 1) }),
  };
}

const OPEN_NONE = {
  artistId: 0,
  albumId: 0,
  playlistId: 0,
  renaming: 0,
  draft: "",
};

export const musicModule: Module<MusicState> = {
  key: "music",
  screens: ["music"],
  initial: initialState,
  derive,

  enter(params, s) {
    if (!params) return;
    const songId = Number(params.songId ?? 0);
    if (songId) {
      const song = byId(s.db.songs).get(songId);
      if (!song) return { notice: "That song is not in the library" };
      const ids = albumTrackIds(s.db, song.albumId);
      const play = startPlayback(
        s,
        ids,
        Math.max(0, ids.indexOf(songId)),
        byId(s.db.albums).get(song.albumId)?.title ?? "Album",
      );
      return {
        ...play,
        slice: {
          ...play.slice,
          tab: "albums",
          ...OPEN_NONE,
          albumId: song.albumId,
        },
      };
    }
    const artistId = Number(params.artistId ?? 0);
    if (artistId && byId(s.db.artists).has(artistId))
      return slice({ tab: "artists", ...OPEN_NONE, artistId });
    const albumId = Number(params.albumId ?? 0);
    if (albumId && byId(s.db.albums).has(albumId))
      return slice({ tab: "albums", ...OPEN_NONE, albumId });
  },

  handlers: {
    // ---- tabs ----
    setTab: (p) =>
      slice({ tab: String(p) as Tab, ...OPEN_NONE, addOpen: false }),

    // ---- library ----
    setQuery: (_p, e) => slice({ query: text(e), page: 1 }),
    setGenre: (_p, e) => slice({ genre: text(e), page: 1 }),
    setSort: (_p, e) => slice({ sortKey: text(e) as SortKey, page: 1 }),
    toggleDir: (_p, _e, s) =>
      slice({ sortDir: s.music.sortDir === "asc" ? "desc" : "asc", page: 1 }),
    setArtistText: (_p, e) => slice({ artistText: text(e) }),
    pickArtist: (p) =>
      slice({ artistFilter: Number(p), artistText: "", page: 1 }),
    clearArtist: () => slice({ artistFilter: 0, artistText: "", page: 1 }),
    clearAlbum: () => slice({ albumFilter: 0, page: 1 }),
    clearFilters: () =>
      slice({
        query: "",
        genre: "",
        artistFilter: 0,
        albumFilter: 0,
        artistText: "",
        page: 1,
      }),
    ...pagerHandlers("lpager", "page"),

    // ---- genres ----
    pickGenre: (p) =>
      slice({
        tab: "library",
        genre: String(p),
        query: "",
        artistFilter: 0,
        albumFilter: 0,
        artistText: "",
        page: 1,
      }),

    // ---- artists ----
    setArtistsQuery: (_p, e) =>
      slice({ artistsQuery: text(e), artistsPage: 1 }),
    openArtist: (p) =>
      slice({ tab: "artists", ...OPEN_NONE, artistId: Number(p) }),
    closeArtist: () => slice({ artistId: 0 }),
    ...pagerHandlers("apager", "artistsPage"),

    // ---- albums ----
    setAlbumsQuery: (_p, e) => slice({ albumsQuery: text(e), albumsPage: 1 }),
    openAlbum: (p) =>
      slice({ tab: "albums", ...OPEN_NONE, albumId: Number(p) }),
    closeAlbum: () => slice({ albumId: 0 }),
    filterByAlbum: (p) =>
      slice({
        tab: "library",
        albumFilter: Number(p),
        artistFilter: 0,
        genre: "",
        query: "",
        page: 1,
      }),
    playAlbum: (p, _e, s) =>
      startPlayback(
        s,
        albumTrackIds(s.db, Number(p)),
        0,
        byId(s.db.albums).get(Number(p))?.title ?? "Album",
      ),
    addAlbum: (p, _e, s) => {
      const ids = albumTrackIds(s.db, Number(p));
      return ids.length
        ? slice({
            addSongs: ids,
            addOpen: true,
            addCreating: false,
            addTitle: "",
          })
        : { notice: "This album has no tracks" };
    },
    ...pagerHandlers("bpager", "albumsPage"),

    // ---- the table of songs (library, artist page, album page, playlist page) ----
    "songs.sort": (p, _e, s) => {
      const key = String(p) as SortKey;
      return slice(
        s.music.sortKey === key
          ? { sortDir: s.music.sortDir === "asc" ? "desc" : "asc", page: 1 }
          : { sortKey: key, sortDir: "asc", page: 1 },
      );
    },
    "songs.play": (p, _e, s) => {
      const ctx = contextOf(s);
      const pos = Number(p);
      const id = ctx.ids[pos];
      if (id === undefined) return;
      const m = s.music;
      if (m.queue[m.pos] === id && m.queue.length > 0)
        return musicModule.handlers.toggle(undefined, undefined, s);
      return startPlayback(s, ctx.ids, pos, ctx.label);
    },
    "songs.add": (p) =>
      slice({
        addSongs: [Number(p)],
        addOpen: true,
        addCreating: false,
        addTitle: "",
      }),
    "songs.artist": (p) =>
      slice({ tab: "artists", ...OPEN_NONE, artistId: Number(p) }),
    "songs.album": (p) =>
      slice({ tab: "albums", ...OPEN_NONE, albumId: Number(p) }),
    "songs.remove": (p, _e, s) =>
      editPlaylist(s, (ids) => ids.filter((_, i) => i !== Number(p))),
    "songs.up": (p, _e, s) =>
      editPlaylist(s, (ids) => swap(ids, Number(p), Number(p) - 1)),
    "songs.down": (p, _e, s) =>
      editPlaylist(s, (ids) => swap(ids, Number(p), Number(p) + 1)),

    // ---- playlists ----
    setNewTitle: (_p, e) => slice({ newTitle: text(e) }),
    newKey: (_p, e, s) =>
      e?.key === "Enter"
        ? musicModule.handlers.createPlaylist(undefined, undefined, s)
        : undefined,
    draftKey: (_p, e, s) =>
      e?.key === "Enter"
        ? musicModule.handlers.saveRename(undefined, undefined, s)
        : e?.key === "Escape"
          ? slice({ renaming: 0, draft: "" })
          : undefined,
    addKey: (_p, e, s) =>
      e?.key === "Enter"
        ? musicModule.handlers.addCreate(undefined, undefined, s)
        : undefined,
    createPlaylist: (_p, _e, s) => {
      const title = s.music.newTitle.trim();
      if (!title) return { notice: "Give the playlist a title" };
      if (s.me <= 0) return;
      const pl = newPlaylist(s, title, []);
      return {
        put: { playlists: [pl] },
        slice: { newTitle: "" },
        notice: `Created "${title}"`,
      };
    },
    setPlQuery: (_p, e) => slice({ plQuery: text(e), plPage: 1 }),
    openPlaylist: (p) =>
      slice({ tab: "playlists", ...OPEN_NONE, playlistId: Number(p) }),
    closePlaylist: () => slice({ playlistId: 0, renaming: 0, draft: "" }),
    startRename: (p, _e, s) => {
      const pl = ownPlaylist(s, p);
      return pl
        ? slice({ renaming: pl.id, draft: pl.title })
        : { notice: "Only the owner can rename a playlist" };
    },
    setDraft: (_p, e) => slice({ draft: text(e) }),
    cancelRename: () => slice({ renaming: 0, draft: "" }),
    saveRename: (_p, _e, s) => {
      const pl = ownPlaylist(s, s.music.renaming);
      if (!pl) return slice({ renaming: 0, draft: "" });
      const title = s.music.draft.trim();
      if (!title) return { notice: "A playlist needs a title" };
      return {
        put: { playlists: [{ ...pl, title }] },
        slice: { renaming: 0, draft: "" },
        notice: "Playlist renamed",
      };
    },
    askDelete: (p, _e, s) => {
      const pl = ownPlaylist(s, p);
      if (!pl) return { notice: "Only the owner can delete a playlist" };
      return slice({
        confirm: askConfirm(
          "delete",
          String(pl.id),
          "Delete this playlist?",
          `"${pl.title}" with ${plural(pl.songIds.length, "song")} will be removed. The songs stay in the library.`,
          { confirmLabel: "Delete playlist" },
        ),
      });
    },
    "confirm.cancel": () => slice({ confirm: closedConfirm() }),
    "confirm.type": (_p, e, s) =>
      slice({ confirm: { ...s.music.confirm, typed: text(e) } }),
    "confirm.confirm": (_p, _e, s) => {
      const c = s.music.confirm;
      const pl = c.kind === "delete" ? ownPlaylist(s, c.subject) : undefined;
      if (!pl) return slice({ confirm: closedConfirm() });
      return {
        remove: { playlists: [pl.id] },
        slice: {
          confirm: closedConfirm(),
          playlistId: s.music.playlistId === pl.id ? 0 : s.music.playlistId,
          renaming: 0,
        },
        notice: `Deleted "${pl.title}"`,
      };
    },
    playPlaylist: (p, _e, s) => {
      const pl = byId(s.db.playlists).get(Number(p));
      return pl
        ? startPlayback(s, playlistIds(s.db, pl), 0, pl.title)
        : undefined;
    },
    ...pagerHandlers("ppager", "plPage"),

    // ---- the "Add to playlist" menu ----
    closeAdd: () =>
      slice({ addOpen: false, addSongs: [], addCreating: false, addTitle: "" }),
    addPick: (p, _e, s) => {
      const pl = ownPlaylist(s, p);
      if (!pl) return { notice: "Only the owner can change a playlist" };
      const have = new Set(pl.songIds);
      const fresh = s.music.addSongs.filter(
        (id, i, all) => !have.has(id) && all.indexOf(id) === i,
      );
      const close = {
        addOpen: false,
        addSongs: [],
        addCreating: false,
        addTitle: "",
      };
      if (fresh.length === 0)
        return { slice: close, notice: `Already in "${pl.title}"` };
      return {
        put: { playlists: [{ ...pl, songIds: [...pl.songIds, ...fresh] }] },
        slice: close,
        notice: `Added ${plural(fresh.length, "song")} to "${pl.title}"`,
      };
    },
    addNewStart: () => slice({ addCreating: true, addTitle: "" }),
    setAddTitle: (_p, e) => slice({ addTitle: text(e) }),
    addCreate: (_p, _e, s) => {
      const title = s.music.addTitle.trim();
      if (!title) return { notice: "Give the new playlist a title" };
      if (s.me <= 0) return;
      const ids = s.music.addSongs.filter(
        (id, i, all) => all.indexOf(id) === i,
      );
      return {
        put: { playlists: [newPlaylist(s, title, ids)] },
        slice: {
          addOpen: false,
          addSongs: [],
          addCreating: false,
          addTitle: "",
        },
        notice: `Created "${title}" with ${plural(ids.length, "song")}`,
      };
    },

    // ---- the player ----
    toggle: (_p, _e, s) => {
      const m = s.music;
      if (!currentSong(s)) {
        const ctx = contextOf(s);
        return startPlayback(s, ctx.ids, 0, ctx.label);
      }
      if (m.playing)
        return { slice: { playing: false }, effects: [time.cancel(TIMER)] };
      return { slice: { playing: true }, effects: restartTimer() };
    },
    next: (_p, _e, s) => {
      if (!currentSong(s)) return;
      return advance(s, false);
    },
    prev: (_p, _e, s) => {
      const m = s.music;
      if (!currentSong(s)) return;
      if (m.elapsed > 3 || m.pos === 0) {
        if (
          m.pos === 0 &&
          m.repeatMode === "all" &&
          m.elapsed <= 3 &&
          m.queue.length > 1
        )
          return {
            slice: { pos: m.queue.length - 1, elapsed: 0, playing: true },
            effects: restartTimer(),
          };
        return { slice: { elapsed: 0 } };
      }
      return {
        slice: { pos: m.pos - 1, elapsed: 0, playing: true },
        effects: restartTimer(),
      };
    },
    toggleShuffle: (_p, _e, s) => {
      const m = s.music;
      if (!m.shuffleOn) {
        if (m.queue.length === 0) return slice({ shuffleOn: true });
        const seed = nextSeed(m.seed);
        return slice({
          shuffleOn: true,
          queue: shuffledFrom(m.queue, m.pos, seed),
          pos: 0,
          seed,
        });
      }
      const cur = m.queue[m.pos];
      const at = m.baseQueue.indexOf(cur);
      return slice({
        shuffleOn: false,
        queue: m.baseQueue,
        pos: at >= 0 ? at : 0,
      });
    },
    cycleRepeat: (_p, _e, s) =>
      slice({ repeatMode: nextRepeat(s.music.repeatMode) }),
    seek: (_p, e, s) => {
      const song = currentSong(s);
      if (!song) return;
      const to = Math.floor(Number(e?.value ?? 0));
      return slice({
        elapsed: Math.min(
          Math.max(0, Number.isFinite(to) ? to : 0),
          song.duration,
        ),
      });
    },
    toggleQueue: (_p, _e, s) => slice({ queueOpen: !s.music.queueOpen }),
    jump: (p, _e, s) => {
      const pos = Number(p);
      if (!(pos >= 0 && pos < s.music.queue.length)) return;
      return {
        slice: { pos, elapsed: 0, playing: true },
        effects: restartTimer(),
      };
    },
    /** The one-second tick of the timer. It stops itself when the screen is left. */
    tick: (_p, _e, s) => {
      const m = s.music;
      const song = currentSong(s);
      if (s.screen !== "music" || !m.playing || !song)
        return { slice: { playing: false }, effects: [time.cancel(TIMER)] };
      const elapsed = m.elapsed + 1;
      if (elapsed < song.duration) return slice({ elapsed });
      return advance(s, true);
    },
  },
};

function newPlaylist(
  s: OrbitState,
  title: string,
  songIds: number[],
): Playlist {
  return {
    id: nextId(s.db.playlists),
    ownerId: s.me,
    title: title.slice(0, 80),
    songIds,
    createdAt: s.now,
  };
}

function swap(ids: number[], a: number, b: number): number[] {
  if (a < 0 || b < 0 || a >= ids.length || b >= ids.length) return ids;
  const out = [...ids];
  [out[a], out[b]] = [out[b], out[a]];
  return out;
}

/** Change the open playlist's songs (the owner only). */
function editPlaylist(
  s: OrbitState,
  change: (ids: number[]) => number[],
): Update | void {
  const pl = ownPlaylist(s, s.music.playlistId);
  if (!pl) return { notice: "Only the owner can change a playlist" };
  const ids = change(playlistIds(s.db, pl));
  return { put: { playlists: [{ ...pl, songIds: ids }] } };
}
