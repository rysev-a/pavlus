/**
 * The contract between the shell of Orbit (orbit-social.ts) and its feature
 * modules (modules/<name>/index.ts).
 *
 * The shell owns the database in memory (`state.db`), the signed-in user
 * (`state.me`), the screen, and the writes to IndexedDB. A module owns one slice
 * of the state (`state[module.key]`: its own UI state plus the view props it
 * derives) and is a set of PURE handlers:
 *
 *     handler(payload, event, state) => Update | void
 *
 * An `Update` says what changed in plain data (rows to upsert or remove, a slice
 * patch, a notice, a screen to go to); the shell applies it, writes the rows to
 * IndexedDB, recomputes the view props of the open module with `derive`, and sends
 * the changed fields to the store. Modules never build effects for storage, and
 * never touch the clock: `state.now` is the demo's clock (it moves a minute for
 * every content a user creates).
 *
 * A message from a module's view is `<key>.<event>` (the embed's name, then the
 * event), so the handler named `like` of the module `wall` is the message
 * `wall.like`. A block embedded by the view adds its own name: `wall.card.like`
 * is the handler `card.like`.
 */
import type { Effect, Message } from "@service-laboratory/pavlus";
import type {
  NavGroup,
  ShellAction,
  ShellUser,
} from "../../blocks/admin-shell/shell.ts";
import type { Db, TableName } from "./schema.ts";
import type { AdminState } from "./modules/admin/index.ts";
import type { BlogState } from "./modules/blog/index.ts";
import type { CommunitiesState } from "./modules/communities/index.ts";
import type { GamesState } from "./modules/games/index.ts";
import type { MessagesState } from "./modules/messages/index.ts";
import type { MusicState } from "./modules/music/index.ts";
import type { PhotosState } from "./modules/photos/index.ts";
import type { ProfileState } from "./modules/profile/index.ts";
import type { WallState } from "./modules/wall/index.ts";

export type Screen =
  | "wall"
  | "blog"
  | "profile"
  | "photos"
  | "messages"
  | "communities"
  | "games"
  | "music"
  | "admin";

export type SliceKey = Screen;

export type DomEvent = NonNullable<Message["event"]>;

export interface AuthState {
  email: string;
  password: string;
  name: string;
  confirm: string;
  error: string;
  /** per-field messages of the registration form */
  errors: Record<string, string>;
}

export interface OrbitState {
  status: "loading" | "ready" | "failed";
  error: string;
  db: Db;
  /** the signed-in user's id, 0 when nobody is signed in */
  me: number;
  /** the demo's clock, an ISO string */
  now: string;
  view: "loading" | "auth" | "app";
  screen: Screen;
  authView: "login" | "register";
  auth: AuthState;
  navOpen: boolean;
  notice: string;
  // derived for the shell
  groups: NavGroup[];
  user: ShellUser;
  actions: ShellAction[];
  title: string;
  subtitle: string;
  // the feature modules' slices, one per screen
  wall: WallState;
  blog: BlogState;
  profile: ProfileState;
  photos: PhotosState;
  messages: MessagesState;
  communities: CommunitiesState;
  games: GamesState;
  music: MusicState;
  admin: AdminState;
}

/** Rows to upsert (by `id`) per table; the shell keeps `db` and IndexedDB in step. */
export type PutRows = { [K in TableName]?: Db[K] };
/** Ids to delete per table. */
export type RemoveIds = { [K in TableName]?: number[] };

export interface Update {
  /** Merged into the module's own slice. */
  slice?: Record<string, unknown>;
  /** Whole tables replaced in memory only (no write). Rare: prefer `put` and `remove`. */
  db?: Partial<Db>;
  put?: PutRows;
  remove?: RemoveIds;
  /** Go to a screen; the module of that screen gets `enter(params)`. */
  go?: { screen: Screen; params?: Record<string, unknown> };
  /** A short message in the top bar. */
  notice?: string;
  /** Sign in (an id) or out (0). */
  me?: number;
  /** The whole database replaced and rewritten (an import, a reset). */
  replaceDb?: Db;
  /** Anything else: a timer of the time plugin, a file to download... */
  effects?: Effect[];
}

export type Handler = (
  payload: unknown,
  event: DomEvent | undefined,
  state: OrbitState,
) => Update | void;

export interface Module<S> {
  key: SliceKey;
  screens: Screen[];
  /** The slice before anything happens (no database yet: it must not read `state.db`). */
  initial: () => S;
  /**
   * The slice with its view props recomputed from the state. Pure. Called after
   * every update while the module's screen is open, and on entering it. The module
   * reads its own UI state from `state[key]` and returns the whole slice.
   */
  derive: (state: OrbitState) => S;
  /** Called when the screen is opened, with the params of a `go`. */
  enter?: (
    params: Record<string, unknown> | undefined,
    state: OrbitState,
  ) => Update | void;
  /** By event name, without the module's key. */
  handlers: Record<string, Handler>;
}

// ---- helpers for modules ----

const indexes = new WeakMap<object, Map<number, unknown>>();

/** A cached `id -> row` map of a table (the cache lives as long as the array). */
export function byId<T extends { id: number }>(rows: T[]): Map<number, T> {
  let map = indexes.get(rows) as Map<number, T> | undefined;
  if (!map) {
    map = new Map(rows.map((r) => [r.id, r]));
    indexes.set(rows, map);
  }
  return map;
}

/** The next free id of a table. */
export const nextId = (rows: { id: number }[]): number => {
  let max = 0;
  for (const r of rows) if (r.id > max) max = r.id;
  return max + 1;
};

/** Pure: the table with `rows` upserted by id (new rows go to the end). */
export function upsert<T extends { id: number }>(table: T[], rows: T[]): T[] {
  const incoming = new Map(rows.map((r) => [r.id, r]));
  const seen = new Set<number>();
  const merged = table.map((r) => {
    const n = incoming.get(r.id);
    if (n) seen.add(r.id);
    return n ?? r;
  });
  for (const r of rows) if (!seen.has(r.id)) merged.push(r);
  return merged;
}

/** Pure: the table without the rows with these ids. */
export function without<T extends { id: number }>(
  table: T[],
  ids: number[],
): T[] {
  if (ids.length === 0) return table;
  const gone = new Set(ids);
  return table.filter((r) => !gone.has(r.id));
}

/** The demo's clock a minute later. */
export function tick(now: string): string {
  const d = Number(now.slice(14, 16)) + 1;
  const h = Number(now.slice(11, 13)) + Math.floor(d / 60);
  const m = d % 60;
  if (h >= 24) return `${now.slice(0, 10)}T23:59:59`;
  return `${now.slice(0, 11)}${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
}

/** `2026-11-04T09:30:00` as `Nov 4, 09:30` (or `09:30` when it is today). */
export function when(iso: string, now: string): string {
  const MONTHS = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  if (iso.slice(0, 10) === now.slice(0, 10)) return iso.slice(11, 16);
  const month = MONTHS[Number(iso.slice(5, 7)) - 1] ?? "";
  const day = Number(iso.slice(8, 10));
  return iso.slice(0, 4) === now.slice(0, 4)
    ? `${month} ${day}, ${iso.slice(11, 16)}`
    : `${month} ${day}, ${iso.slice(0, 4)}`;
}

/** A page of a list: `items` of the 1-based `page`, and how many pages there are. */
export function paged<T>(
  items: T[],
  page: number,
  size: number,
): { items: T[]; page: number; pages: number } {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const p = Math.min(Math.max(1, page), pages);
  return { items: items.slice((p - 1) * size, p * size), page: p, pages };
}
