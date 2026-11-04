// Real URLs of Orbit: pure functions between a path and a screen of the template.
import type {
  OrbitState,
  Screen,
} from "../../ui-kit/frontend/templates/orbit-social/core.ts";

export const SCREENS: Screen[] = [
  "wall",
  "blog",
  "profile",
  "photos",
  "messages",
  "communities",
  "games",
  "music",
  "admin",
];

export const PATHS: Record<Screen, string> = Object.fromEntries(
  SCREENS.map((s) => [s, `/${s}`]),
) as Record<Screen, string>;

/** The name of the id a screen takes in its path (`/profile/12`), as `enter` reads it. */
export const PARAM: Partial<Record<Screen, string>> = {
  wall: "userId",
  blog: "articleId",
  profile: "userId",
  photos: "userId",
  messages: "userId",
  communities: "communityId",
  admin: "userId",
};

export type Parsed =
  | { kind: "root" }
  | { kind: "auth"; view: "login" | "register" }
  | { kind: "screen"; screen: Screen; params: Record<string, number> }
  | { kind: "unknown" };

/** What a path means. `/profile/12` is the profile screen with `{ userId: 12 }`. */
export function parsePath(path: string): Parsed {
  const parts = path.split("/").filter(Boolean);
  if (parts.length === 0) return { kind: "root" };
  const [head, id, ...rest] = parts;
  if (rest.length) return { kind: "unknown" };
  if (head === "login" || head === "register")
    return id === undefined
      ? { kind: "auth", view: head }
      : { kind: "unknown" };
  const screen = SCREENS.find((s) => s === head);
  if (!screen) return { kind: "unknown" };
  if (id === undefined) return { kind: "screen", screen, params: {} };
  const name = PARAM[screen];
  const n = Number(id);
  if (!name || !Number.isInteger(n) || n <= 0) return { kind: "unknown" };
  return { kind: "screen", screen, params: { [name]: n } };
}

/** The id that the open screen shows, if it has one in its path; 0 = none, undefined = not tracked. */
function paramOf(s: OrbitState): number | undefined {
  switch (s.screen) {
    case "wall":
      return s.wall.userId;
    case "profile":
      return s.profile.userId;
    case "photos":
      return s.photos.userId;
    case "blog":
      return s.blog.mode === "read" ? s.blog.articleId : 0;
    case "communities":
      return s.communities.mode === "page" ? s.communities.communityId : 0;
    case "admin":
      return s.admin.mode === "detail" ? s.admin.detailId : 0;
    default:
      return undefined;
  }
}

/** The path of the screen that is open. */
export function pathOf(s: OrbitState): string {
  if (s.view === "auth")
    return s.authView === "register" ? "/register" : "/login";
  const id = paramOf(s);
  return id ? `${PATHS[s.screen]}/${id}` : PATHS[s.screen];
}

/** Does `path` already show what `s` shows? (A path with an id the state does not track counts.) */
export function showsPath(s: OrbitState, path: string): boolean {
  const p = parsePath(path);
  if (s.view === "auth") return p.kind === "auth" && p.view === s.authView;
  if (p.kind !== "screen" || p.screen !== s.screen) return false;
  const have = paramOf(s);
  if (have === undefined) return true;
  const want = Number(Object.values(p.params)[0] ?? 0);
  return want === have || (want === s.me && have === 0 && s.screen !== "admin");
}

export const TITLES: Record<Screen, string> = {
  wall: "Wall",
  blog: "Posts",
  profile: "Profile",
  photos: "Photos",
  messages: "Messages",
  communities: "Communities",
  games: "Games",
  music: "Music",
  admin: "Admin panel",
};

export function titleOf(s: OrbitState): string {
  if (s.view === "loading") return "Orbit";
  if (s.view === "auth")
    return `${s.authView === "register" ? "Register" : "Sign in"} · Orbit`;
  return `${TITLES[s.screen]} · Orbit`;
}

/** `?next=/music` of a sign-in link, when it is a path of the app. */
export function nextOf(search: string): string {
  const next = new URLSearchParams(search).get("next") ?? "";
  return parsePath(next.split("?")[0]).kind === "screen" ? next : "";
}
