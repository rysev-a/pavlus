/**
 * A virtual file system as plain data: a map from an absolute path to the
 * content of a file, or to `null` for a directory. Every function is pure and
 * returns a new map; nothing here touches a real disk.
 */
export type Fs = Readonly<Record<string, string | null>>;

export const HOME = "/home/user";

/** Pure: an absolute path with `.`, `..` and repeated slashes resolved. */
export function norm(path: string): string {
  const out: string[] = [];
  for (const part of path.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return `/${out.join("/")}`;
}

/** Pure: the absolute path of `path` seen from `cwd` (`~` is the home folder). */
export function resolve(cwd: string, path: string): string {
  if (path === "~" || path.startsWith("~/")) return norm(HOME + path.slice(1));
  return norm(path.startsWith("/") ? path : `${cwd}/${path}`);
}

export const parentOf = (path: string): string =>
  path === "/" ? "/" : norm(path.slice(0, path.lastIndexOf("/")) || "/");

export const baseName = (path: string): string =>
  path.slice(path.lastIndexOf("/") + 1);

export const joinPath = (dir: string, name: string): string =>
  norm(`${dir}/${name}`);

/** Pure: a path for the prompt: the home folder is `~`. */
export function shortPath(path: string): string {
  if (path === HOME) return "~";
  if (path.startsWith(`${HOME}/`)) return `~${path.slice(HOME.length)}`;
  return path;
}

export const exists = (fs: Fs, path: string): boolean => path in fs;
export const isDir = (fs: Fs, path: string): boolean => fs[path] === null;
export const isFile = (fs: Fs, path: string): boolean =>
  typeof fs[path] === "string";

/** A plain code point comparison: the same order everywhere, with no locale. */
export const compare = (a: string, b: string): number =>
  a < b ? -1 : a > b ? 1 : 0;

/** Pure: a file system from a plain list; the folders above every path are created. */
export function makeFs(files: Record<string, string | null>): Fs {
  const fs: Record<string, string | null> = { "/": null };
  for (const [raw, content] of Object.entries(files)) {
    const path = norm(raw);
    let dir = parentOf(path);
    while (dir !== "/" && !(dir in fs)) {
      fs[dir] = null;
      dir = parentOf(dir);
    }
    fs[path] = content;
  }
  return fs;
}

/** Pure: the names directly inside a folder, sorted. */
export function listDir(fs: Fs, dir: string): string[] {
  const prefix = dir === "/" ? "/" : `${dir}/`;
  const names: string[] = [];
  for (const path of Object.keys(fs)) {
    if (path === dir || !path.startsWith(prefix)) continue;
    const rest = path.slice(prefix.length);
    if (!rest.includes("/")) names.push(rest);
  }
  return names.sort(compare);
}

/** Every path at or below `path`, the path itself first. */
export function subtree(fs: Fs, path: string): string[] {
  const prefix = path === "/" ? "/" : `${path}/`;
  return Object.keys(fs)
    .filter((p) => p === path || p.startsWith(prefix))
    .sort(compare);
}

/** Pure: the files (not folders) below a folder. */
export const filesBelow = (fs: Fs, dir: string): string[] =>
  subtree(fs, dir).filter((p) => isFile(fs, p));

export const write = (fs: Fs, path: string, content: string): Fs => ({
  ...fs,
  [path]: content,
});

export const mkdir = (fs: Fs, path: string): Fs => ({ ...fs, [path]: null });

/** Pure: the map without a path and everything below it. */
export function remove(fs: Fs, path: string): Fs {
  const gone = new Set(subtree(fs, path));
  const next: Record<string, string | null> = {};
  for (const [p, c] of Object.entries(fs)) if (!gone.has(p)) next[p] = c;
  return next;
}

/** Pure: copy a path and everything below it to another place. */
export function copyTree(fs: Fs, from: string, to: string): Fs {
  const next: Record<string, string | null> = { ...fs };
  for (const p of subtree(fs, from)) next[to + p.slice(from.length)] = fs[p];
  return next;
}

/** Pure: the content as the lines `cat` prints (a final newline adds no empty line). */
export function linesOf(content: string): string[] {
  if (content === "") return [];
  const lines = content.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/** Pure: a file's text without trailing whitespace, to compare content. */
export const trimmed = (content: string | null | undefined): string =>
  (content ?? "").replace(/\s+$/, "");
