// The music library: pure helpers that read the tables (10,000 songs, 600 artists,
// 1500 albums). Everything heavy is built once per array and kept in WeakMaps, so
// typing in the search box and the one-second tick of the player stay instant.
import { byId } from "../../core.ts";
import type { Album, Artist, Db, Song } from "../../schema.ts";

// ---- small formatters ----

/** `187` as `3:07` (a negative number or NaN is `0:00`; an hour is `61:05`). */
export function formatDuration(seconds: number): string {
  const s = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** A total time in words: `42 min`, `1 h 05 min`. */
export function formatTotal(seconds: number): string {
  const min = Math.round(Math.max(0, seconds) / 60);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")} min`;
}

/** `2413` as `2,413`. */
export const thousands = (n: number): string =>
  String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** `1 song`, `2,413 songs`. */
export const plural = (n: number, one: string, many = `${one}s`): string =>
  `${thousands(n)} ${n === 1 ? one : many}`;

/** `Title - Artist` of a song ("" when the song is unknown). */
export function songLabel(db: Db, songId: number): string {
  const song = byId(db.songs).get(songId);
  if (!song) return "";
  const artist = byId(db.artists).get(song.artistId);
  return artist ? `${song.title} - ${artist.name}` : song.title;
}

// ---- the index ----

export interface SongIndex {
  artists: Artist[];
  albums: Album[];
  /** per song (same position as `db.songs`): lowercase "title artist album" */
  hay: string[];
  titleL: string[];
  artistL: string[];
  albumL: string[];
  /** artist id / album id -> positions of its songs in `db.songs` */
  byArtist: Map<number, number[]>;
  byAlbum: Map<number, number[]>;
  genreCount: Map<string, number>;
}

const indexes = new WeakMap<Song[], SongIndex>();

/** The search index of the songs: built once per `db.songs` array. */
export function songIndex(db: Db): SongIndex {
  const cached = indexes.get(db.songs);
  if (cached && cached.artists === db.artists && cached.albums === db.albums)
    return cached;
  const artists = byId(db.artists);
  const albums = byId(db.albums);
  const n = db.songs.length;
  const hay = new Array<string>(n);
  const titleL = new Array<string>(n);
  const artistL = new Array<string>(n);
  const albumL = new Array<string>(n);
  const byArtist = new Map<number, number[]>();
  const byAlbum = new Map<number, number[]>();
  const genreCount = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const s = db.songs[i];
    const t = s.title.toLowerCase();
    const a = (artists.get(s.artistId)?.name ?? "").toLowerCase();
    const b = (albums.get(s.albumId)?.title ?? "").toLowerCase();
    titleL[i] = t;
    artistL[i] = a;
    albumL[i] = b;
    hay[i] = `${t} ${a} ${b}`;
    const ba = byArtist.get(s.artistId);
    if (ba) ba.push(i);
    else byArtist.set(s.artistId, [i]);
    const bb = byAlbum.get(s.albumId);
    if (bb) bb.push(i);
    else byAlbum.set(s.albumId, [i]);
    genreCount.set(s.genre, (genreCount.get(s.genre) ?? 0) + 1);
  }
  // the tracks of an album are in the order of their ids
  for (const list of byAlbum.values())
    list.sort((x, y) => db.songs[x].id - db.songs[y].id);
  const index: SongIndex = {
    artists: db.artists,
    albums: db.albums,
    hay,
    titleL,
    artistL,
    albumL,
    byArtist,
    byAlbum,
    genreCount,
  };
  indexes.set(db.songs, index);
  return index;
}

// ---- search, filter, sort ----

export type SortKey = "title" | "artist" | "album" | "year" | "duration";
export const SORT_KEYS: { value: SortKey; label: string }[] = [
  { value: "title", label: "Title" },
  { value: "artist", label: "Artist" },
  { value: "album", label: "Album" },
  { value: "year", label: "Year" },
  { value: "duration", label: "Duration" },
];

export interface SongFilter {
  query: string;
  /** "" = every genre */
  genre: string;
  /** 0 = every artist */
  artistId: number;
  /** 0 = every album */
  albumId: number;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
}

let lastSearch: { songs: Song[]; key: string; ids: number[] } | null = null;

/** The ids of the songs that match, sorted. Cached for the last filter. */
export function searchSongs(db: Db, f: SongFilter): number[] {
  const key = [
    f.query.trim().toLowerCase(),
    f.genre,
    f.artistId,
    f.albumId,
    f.sortKey,
    f.sortDir,
  ].join("\u0001");
  if (lastSearch && lastSearch.songs === db.songs && lastSearch.key === key)
    return lastSearch.ids;
  const idx = songIndex(db);
  const songs = db.songs;
  const words = f.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const pool = f.albumId
    ? (idx.byAlbum.get(f.albumId) ?? [])
    : f.artistId
      ? (idx.byArtist.get(f.artistId) ?? [])
      : null;
  const hit: number[] = [];
  const test = (i: number): void => {
    if (f.albumId && songs[i].albumId !== f.albumId) return;
    if (f.artistId && songs[i].artistId !== f.artistId) return;
    if (f.genre && songs[i].genre !== f.genre) return;
    for (let w = 0; w < words.length; w++)
      if (!idx.hay[i].includes(words[w])) return;
    hit.push(i);
  };
  if (pool) for (const i of pool) test(i);
  else for (let i = 0; i < songs.length; i++) test(i);
  const sign = f.sortDir === "asc" ? 1 : -1;
  const text =
    f.sortKey === "title"
      ? idx.titleL
      : f.sortKey === "artist"
        ? idx.artistL
        : f.sortKey === "album"
          ? idx.albumL
          : null;
  hit.sort((x, y) => {
    let c: number;
    if (text) c = text[x] < text[y] ? -1 : text[x] > text[y] ? 1 : 0;
    else if (f.sortKey === "year") c = songs[x].year - songs[y].year;
    else c = songs[x].duration - songs[y].duration;
    return c * sign || songs[x].id - songs[y].id;
  });
  const ids = hit.map((i) => songs[i].id);
  lastSearch = { songs, key, ids };
  return ids;
}

// ---- counts ----

/** Songs per genre. */
export function genreCounts(db: Db): Map<string, number> {
  return songIndex(db).genreCount;
}

/** The songs of an album in track order. */
export function albumTrackIds(db: Db, albumId: number): number[] {
  const idx = songIndex(db);
  return (idx.byAlbum.get(albumId) ?? []).map((i) => db.songs[i].id);
}

/** The songs of an artist in catalogue order. */
export function artistSongIds(db: Db, artistId: number): number[] {
  const idx = songIndex(db);
  return (idx.byArtist.get(artistId) ?? []).map((i) => db.songs[i].id);
}

const albumCounts = new WeakMap<Album[], Map<number, number>>();

/** Albums per artist. */
export function albumsPerArtist(db: Db): Map<number, number> {
  let m = albumCounts.get(db.albums);
  if (!m) {
    m = new Map();
    for (const a of db.albums) m.set(a.artistId, (m.get(a.artistId) ?? 0) + 1);
    albumCounts.set(db.albums, m);
  }
  return m;
}

const artistNames = new WeakMap<Artist[], string[]>();

/** The first `limit` artists whose name contains `text` (2+ letters), for the typeahead. */
export function artistSuggestions(db: Db, text: string, limit = 8): Artist[] {
  const q = text.trim().toLowerCase();
  if (q.length < 2) return [];
  let names = artistNames.get(db.artists);
  if (!names) {
    names = db.artists.map((a) => a.name.toLowerCase());
    artistNames.set(db.artists, names);
  }
  const out: Artist[] = [];
  for (let i = 0; i < names.length && out.length < limit; i++)
    if (names[i].includes(q)) out.push(db.artists[i]);
  return out;
}
