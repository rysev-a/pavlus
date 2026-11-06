/**
 * A tiny git on top of the virtual file system. The repository lives in the
 * file system itself (`<root>/.git/HEAD` and `<root>/.git/store`, a JSON
 * file), so a `Fs` plus a folder is the whole state. Supported: init, status,
 * add, rm, restore, commit, log, branch, checkout / switch, merge (fast
 * forward only), diff, config (ignored) and --version.
 */
import {
  type Fs,
  compare,
  exists,
  filesBelow,
  isDir,
  joinPath,
  linesOf,
  parentOf,
  remove,
  resolve,
  write,
  mkdir,
} from "./fs.ts";

export type LineKind = "out" | "err" | "info";
export interface OutLine {
  kind: LineKind;
  text: string;
}
/** What a command gives back: the new state, what it printed, and whether it worked. */
export interface CmdResult {
  fs: Fs;
  cwd: string;
  out: OutLine[];
  ok: boolean;
}

export interface Commit {
  id: string;
  parent: string | null;
  message: string;
  /** The tracked files at this commit, by path relative to the repository. */
  tree: Record<string, string>;
}

export interface Store {
  commits: Commit[];
  /** Branch name to the id of its newest commit (`null` before the first one). */
  branches: Record<string, string | null>;
  /** The staging area: what the next commit will contain. */
  index: Record<string, string>;
  head: string;
}

const out = (text: string): OutLine => ({ kind: "out", text });
const err = (text: string): OutLine => ({ kind: "err", text });

const done = (
  ctx: { fs: Fs; cwd: string },
  lines: OutLine[],
  fs: Fs = ctx.fs,
  ok = true,
): CmdResult => ({ fs, cwd: ctx.cwd, out: lines, ok });

const fail = (ctx: { fs: Fs; cwd: string }, ...text: string[]): CmdResult =>
  done(ctx, text.map(err), ctx.fs, false);

/** Pure: a 40 character hex id from some text (a deterministic stand-in for SHA-1). */
export function hashId(text: string): string {
  let id = "";
  for (let round = 0; round < 5; round++) {
    let h = (0x811c9dc5 ^ (round * 0x9e3779b1)) >>> 0;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    id += h.toString(16).padStart(8, "0");
  }
  return id;
}

export const shortId = (id: string): string => id.slice(0, 7);

/** The repository root that holds `cwd`, or `null` outside a repository. */
export function repoRoot(fs: Fs, cwd: string): string | null {
  let dir = cwd;
  for (;;) {
    if (isDir(fs, joinPath(dir, ".git"))) return dir;
    if (dir === "/") return null;
    dir = parentOf(dir);
  }
}

export function readStore(fs: Fs, root: string): Store {
  const raw = fs[joinPath(root, ".git/store")];
  const head = (fs[joinPath(root, ".git/HEAD")] ?? "").replace(
    /^ref: refs\/heads\/|\s+$/g,
    "",
  );
  if (typeof raw === "string" && raw) {
    const parsed = JSON.parse(raw) as Omit<Store, "head">;
    return { ...parsed, head: head || "main" };
  }
  return { commits: [], branches: { main: null }, index: {}, head: "main" };
}

function writeStore(fs: Fs, root: string, store: Store): Fs {
  const { head, ...rest } = store;
  return write(
    write(fs, joinPath(root, ".git/HEAD"), `ref: refs/heads/${head}\n`),
    joinPath(root, ".git/store"),
    JSON.stringify(rest),
  );
}

export const commitOf = (store: Store, id: string | null): Commit | null =>
  (id && store.commits.find((c) => c.id === id)) || null;

/** The commit the current branch points at. */
export const headCommit = (store: Store): Commit | null =>
  commitOf(store, store.branches[store.head] ?? null);

export const headTree = (store: Store): Record<string, string> =>
  headCommit(store)?.tree ?? {};

/** Pure: the files of the working folder, by path relative to the root (without `.git`). */
export function workTree(fs: Fs, root: string): Record<string, string> {
  const tree: Record<string, string> = {};
  const prefix = root === "/" ? "/" : `${root}/`;
  for (const path of filesBelow(fs, root)) {
    const rel = path.slice(prefix.length);
    if (rel === ".git" || rel.startsWith(".git/")) continue;
    tree[rel] = fs[path] as string;
  }
  return tree;
}

export type Change = "new file" | "modified" | "deleted";

/** Pure: how a tree differs from a base, per path (sorted). */
export function changes(
  base: Record<string, string>,
  next: Record<string, string>,
): [string, Change][] {
  const result: [string, Change][] = [];
  for (const path of new Set([...Object.keys(base), ...Object.keys(next)])) {
    if (!(path in base)) result.push([path, "new file"]);
    else if (!(path in next)) result.push([path, "deleted"]);
    else if (base[path] !== next[path]) result.push([path, "modified"]);
  }
  return result.sort((a, b) => compare(a[0], b[0]));
}

export interface RepoStatus {
  branch: string;
  hasCommits: boolean;
  staged: [string, Change][];
  unstaged: [string, Change][];
  untracked: string[];
  clean: boolean;
}

/** Pure: what `git status` reports. */
export function statusOf(fs: Fs, root: string): RepoStatus {
  const store = readStore(fs, root);
  const work = workTree(fs, root);
  const staged = changes(headTree(store), store.index);
  const unstaged = changes(store.index, work).filter(
    ([path, kind]) => kind !== "new file" && path in store.index,
  );
  const untracked = Object.keys(work)
    .filter((p) => !(p in store.index))
    .sort(compare);
  return {
    branch: store.head,
    hasCommits: headCommit(store) !== null,
    staged,
    unstaged,
    untracked,
    clean: staged.length + unstaged.length + untracked.length === 0,
  };
}

/** Pure: lines of the changes in the working folder to tracked files, or staged ones. */
function diffLines(
  base: Record<string, string>,
  next: Record<string, string>,
  only: (path: string) => boolean,
): OutLine[] {
  const lines: OutLine[] = [];
  for (const [path, kind] of changes(base, next)) {
    if (!only(path)) continue;
    const before = linesOf(base[path] ?? "");
    const after = linesOf(next[path] ?? "");
    let head = 0;
    while (
      head < before.length &&
      head < after.length &&
      before[head] === after[head]
    )
      head++;
    let tail = 0;
    while (
      tail < before.length - head &&
      tail < after.length - head &&
      before[before.length - 1 - tail] === after[after.length - 1 - tail]
    )
      tail++;
    lines.push(out(`diff --git a/${path} b/${path}`));
    if (kind === "new file") lines.push(out("new file"));
    if (kind === "deleted") lines.push(out("deleted file"));
    lines.push(out(`--- a/${path}`), out(`+++ b/${path}`));
    lines.push(out(`@@ -${head + 1} +${head + 1} @@`));
    for (const l of before.slice(head, before.length - tail))
      lines.push(out(`-${l}`));
    for (const l of after.slice(head, after.length - tail))
      lines.push(out(`+${l}`));
  }
  return lines;
}

/** Replace the tracked files of the working folder by a tree (a checkout). */
function checkoutTree(
  fs: Fs,
  root: string,
  from: Record<string, string>,
  to: Record<string, string>,
): Fs {
  let next = fs;
  for (const path of Object.keys(from))
    if (!(path in to)) next = remove(next, joinPath(root, path));
  for (const [path, content] of Object.entries(to)) {
    const abs = joinPath(root, path);
    let dir = parentOf(abs);
    const made: string[] = [];
    while (!exists(next, dir)) {
      made.push(dir);
      dir = parentOf(dir);
    }
    for (const d of made) next = mkdir(next, d);
    next = write(next, abs, content);
  }
  return next;
}

const NO_REPO =
  "fatal: not a git repository (or any of the parent directories): .git";

/** Run `git <args>` in `cwd`. */
export function gitRun(
  ctx: { fs: Fs; cwd: string },
  args: string[],
): CmdResult {
  const [sub, ...rest] = args;
  const { fs, cwd } = ctx;
  if (!sub) {
    return done(ctx, [
      out("usage: git <command> [<args>]"),
      out(
        "commands here: init, status, add, rm, restore, commit, log, branch, checkout, switch, merge, diff",
      ),
    ]);
  }
  if (sub === "--version") return done(ctx, [out("git version 2.43.0")]);
  if (sub === "config") return done(ctx, []);
  if (sub === "init") {
    const target = resolve(cwd, rest.find((a) => !a.startsWith("-")) ?? ".");
    if (!isDir(fs, target))
      return fail(
        ctx,
        `fatal: cannot mkdir ${target}: No such file or directory`,
      );
    const had = isDir(fs, joinPath(target, ".git"));
    if (had) {
      return done(ctx, [
        out(`Reinitialized existing Git repository in ${target}/.git/`),
      ]);
    }
    const next = writeStore(mkdir(fs, joinPath(target, ".git")), target, {
      commits: [],
      branches: { main: null },
      index: {},
      head: "main",
    });
    return done(
      ctx,
      [out(`Initialized empty Git repository in ${target}/.git/`)],
      next,
    );
  }
  if (
    ![
      "status",
      "add",
      "rm",
      "restore",
      "commit",
      "log",
      "branch",
      "checkout",
      "switch",
      "merge",
      "diff",
    ].includes(sub)
  ) {
    return fail(
      ctx,
      `git: '${sub}' is not available in this sandbox (there is no network or remote here).`,
    );
  }
  const root = repoRoot(fs, cwd);
  if (!root) return fail(ctx, NO_REPO);
  const store = readStore(fs, root);
  const rel = (abs: string): string =>
    abs === root ? "" : abs.slice(root === "/" ? 1 : root.length + 1);

  switch (sub) {
    case "status": {
      const s = statusOf(fs, root);
      const lines: OutLine[] = [out(`On branch ${s.branch}`)];
      if (!s.hasCommits) lines.push(out(""), out("No commits yet"));
      const show = (kind: Change, path: string) =>
        out(`\t${(kind + ":").padEnd(12)}${path}`);
      if (s.staged.length) {
        lines.push(out(""), out("Changes to be committed:"));
        lines.push(out('  (use "git restore --staged <file>..." to unstage)'));
        for (const [p, k] of s.staged) lines.push(show(k, p));
      }
      if (s.unstaged.length) {
        lines.push(out(""), out("Changes not staged for commit:"));
        lines.push(
          out('  (use "git add <file>..." to update what will be committed)'),
        );
        for (const [p, k] of s.unstaged) lines.push(show(k, p));
      }
      if (s.untracked.length) {
        lines.push(out(""), out("Untracked files:"));
        lines.push(
          out(
            '  (use "git add <file>..." to include in what will be committed)',
          ),
        );
        for (const p of s.untracked) lines.push(out(`\t${p}`));
      }
      lines.push(out(""));
      if (s.clean) {
        lines.push(
          out(
            s.hasCommits
              ? "nothing to commit, working tree clean"
              : 'nothing to commit (create/copy files and use "git add" to track)',
          ),
        );
      } else if (!s.staged.length) {
        lines.push(
          out(
            s.unstaged.length
              ? 'no changes added to commit (use "git add" and/or "git commit -a")'
              : 'nothing added to commit but untracked files present (use "git add" to track)',
          ),
        );
      }
      return done(ctx, lines);
    }

    case "add": {
      const paths = rest.filter((a) => !a.startsWith("-") || a === "-A");
      if (!paths.length)
        return done(ctx, [out("Nothing specified, nothing added.")]);
      const work = workTree(fs, root);
      const index = { ...store.index };
      for (const p of paths) {
        const abs = p === "-A" ? root : resolve(cwd, p);
        const r = rel(abs);
        const inside = (path: string) =>
          r === "" || path === r || path.startsWith(`${r}/`);
        const matched = [
          ...Object.keys(work).filter(inside),
          ...Object.keys(index).filter(
            (path) => inside(path) && !(path in work),
          ),
        ];
        if (!matched.length)
          return fail(ctx, `fatal: pathspec '${p}' did not match any files`);
        for (const path of matched) {
          if (path in work) index[path] = work[path];
          else delete index[path];
        }
      }
      return done(ctx, [], writeStore(fs, root, { ...store, index }));
    }

    case "rm": {
      const flags = rest.filter((a) => a.startsWith("-"));
      const paths = rest.filter((a) => !a.startsWith("-"));
      if (!paths.length)
        return fail(
          ctx,
          "fatal: No pathspec was given. Which files should I remove?",
        );
      const index = { ...store.index };
      let next = fs;
      const lines: OutLine[] = [];
      for (const p of paths) {
        const abs = resolve(cwd, p);
        const r = rel(abs);
        const tracked = Object.keys(index).filter(
          (path) => path === r || path.startsWith(`${r}/`),
        );
        if (!tracked.length)
          return fail(ctx, `fatal: pathspec '${p}' did not match any files`);
        if (
          !flags.includes("--cached") &&
          isDir(fs, abs) &&
          !flags.includes("-r")
        )
          return fail(ctx, `fatal: not removing '${p}' recursively without -r`);
        for (const path of tracked) {
          delete index[path];
          if (!flags.includes("--cached"))
            next = remove(next, joinPath(root, path));
          lines.push(out(`rm '${path}'`));
        }
      }
      return done(ctx, lines, writeStore(next, root, { ...store, index }));
    }

    case "restore": {
      const staged = rest.includes("--staged");
      const paths = rest.filter((a) => !a.startsWith("-"));
      if (!paths.length)
        return fail(ctx, "fatal: you must specify path(s) to restore");
      const index = { ...store.index };
      let next = fs;
      const base = headTree(store);
      for (const p of paths) {
        const r = rel(resolve(cwd, p));
        const inside = (path: string) =>
          r === "" || path === r || path.startsWith(`${r}/`);
        const known = [
          ...new Set([...Object.keys(index), ...Object.keys(base)]),
        ].filter(inside);
        if (!known.length)
          return fail(
            ctx,
            `error: pathspec '${p}' did not match any file(s) known to git`,
          );
        for (const path of known) {
          if (staged) {
            if (path in base) index[path] = base[path];
            else delete index[path];
          } else if (path in index) {
            next = write(next, joinPath(root, path), index[path]);
          }
        }
      }
      return done(ctx, [], writeStore(next, root, { ...store, index }));
    }

    case "commit": {
      let message = "";
      let all = false;
      for (let i = 0; i < rest.length; i++) {
        const a = rest[i];
        if (a === "-m" || a === "-am" || a === "-a") {
          if (a !== "-m") all = true;
          if (a !== "-a") message = rest[++i] ?? "";
        } else if (a.startsWith("-m")) message = a.slice(2);
      }
      let index = { ...store.index };
      if (all) {
        const work = workTree(fs, root);
        for (const path of Object.keys(index)) {
          if (path in work) index[path] = work[path];
          else delete index[path];
        }
      }
      const base = headTree(store);
      const delta = changes(base, index);
      if (!delta.length) {
        const s = statusOf(fs, root);
        return done(
          ctx,
          [
            out(`On branch ${s.branch}`),
            out(
              s.unstaged.length || s.untracked.length
                ? 'no changes added to commit (use "git add" and/or "git commit -a")'
                : "nothing to commit, working tree clean",
            ),
          ],
          fs,
          false,
        );
      }
      if (!message.trim())
        return fail(ctx, "Aborting commit due to empty commit message.");
      const parent = store.branches[store.head] ?? null;
      const id = hashId(`${parent}|${message}|${JSON.stringify(index)}`);
      const commit: Commit = { id, parent, message, tree: index };
      const next: Store = {
        ...store,
        index,
        commits: [...store.commits, commit],
        branches: { ...store.branches, [store.head]: id },
      };
      const count = delta.length;
      return done(
        ctx,
        [
          out(
            `[${store.head}${parent ? "" : " (root-commit)"} ${shortId(id)}] ${message}`,
          ),
          out(` ${count} file${count === 1 ? "" : "s"} changed`),
        ],
        writeStore(fs, root, next),
      );
    }

    case "log": {
      const first = headCommit(store);
      if (!first)
        return fail(
          ctx,
          `fatal: your current branch '${store.head}' does not have any commits yet`,
        );
      const oneline = rest.includes("--oneline");
      const lines: OutLine[] = [];
      for (let c: Commit | null = first; c; c = commitOf(store, c.parent)) {
        const tags = Object.entries(store.branches)
          .filter(([, id]) => id === c!.id)
          .map(([name]) => (name === store.head ? `HEAD -> ${name}` : name))
          .sort(
            (a, b) =>
              Number(b.startsWith("HEAD")) - Number(a.startsWith("HEAD")),
          );
        const deco = tags.length ? ` (${tags.join(", ")})` : "";
        if (oneline) lines.push(out(`${shortId(c.id)}${deco} ${c.message}`));
        else {
          if (lines.length) lines.push(out(""));
          lines.push(
            out(`commit ${c.id}${deco}`),
            out("Author: You <you@example.com>"),
            out(""),
            out(`    ${c.message}`),
          );
        }
      }
      return done(ctx, lines);
    }

    case "branch": {
      const flagD = rest.includes("-d") || rest.includes("-D");
      const names = rest.filter((a) => !a.startsWith("-"));
      if (!names.length) {
        return done(
          ctx,
          Object.keys(store.branches)
            .sort(compare)
            .map((b) => out(`${b === store.head ? "* " : "  "}${b}`)),
        );
      }
      const name = names[0];
      if (flagD) {
        if (!(name in store.branches))
          return fail(ctx, `error: branch '${name}' not found.`);
        if (name === store.head)
          return fail(
            ctx,
            `error: cannot delete branch '${name}' used by worktree`,
          );
        const branches = { ...store.branches };
        delete branches[name];
        return done(
          ctx,
          [out(`Deleted branch ${name}.`)],
          writeStore(fs, root, { ...store, branches }),
        );
      }
      if (name in store.branches)
        return fail(ctx, `fatal: a branch named '${name}' already exists`);
      const at = store.branches[store.head] ?? null;
      if (!at)
        return fail(ctx, `fatal: not a valid object name: '${store.head}'`);
      return done(
        ctx,
        [],
        writeStore(fs, root, {
          ...store,
          branches: { ...store.branches, [name]: at },
        }),
      );
    }

    case "checkout":
    case "switch": {
      const create =
        rest.includes("-b") || rest.includes("-c") || rest.includes("-B");
      const name = rest.filter((a) => !a.startsWith("-"))[0];
      if (!name) return fail(ctx, `fatal: missing branch name`);
      if (!create && !(name in store.branches)) {
        return fail(
          ctx,
          sub === "switch"
            ? `fatal: invalid reference: ${name}`
            : `error: pathspec '${name}' did not match any file(s) known to git`,
        );
      }
      if (create && name in store.branches)
        return fail(ctx, `fatal: a branch named '${name}' already exists`);
      if (!create && name === store.head)
        return done(ctx, [out(`Already on '${name}'`)]);
      const s = statusOf(fs, root);
      const tracked = Object.keys(store.index);
      const dirty = s.staged.length > 0 || s.unstaged.length > 0;
      if (!create && dirty && tracked.length)
        return fail(
          ctx,
          "error: Your local changes would be overwritten by checkout.",
          "Please commit your changes or stash them before you switch branches.",
        );
      if (create) {
        const at = store.branches[store.head] ?? null;
        return done(
          ctx,
          [out(`Switched to a new branch '${name}'`)],
          writeStore(fs, root, {
            ...store,
            head: name,
            branches: { ...store.branches, [name]: at },
          }),
        );
      }
      const target = commitOf(store, store.branches[name]);
      const next = checkoutTree(fs, root, headTree(store), target?.tree ?? {});
      return done(
        ctx,
        [out(`Switched to branch '${name}'`)],
        writeStore(next, root, {
          ...store,
          head: name,
          index: { ...(target?.tree ?? {}) },
        }),
      );
    }

    case "merge": {
      const name = rest.filter((a) => !a.startsWith("-"))[0];
      if (!name) return fail(ctx, "fatal: no branch to merge was given");
      if (!(name in store.branches))
        return fail(ctx, `merge: ${name} - not something we can merge`);
      const theirs = commitOf(store, store.branches[name]);
      const mine = headCommit(store);
      const ancestors = (c: Commit | null): string[] => {
        const ids: string[] = [];
        for (let x = c; x; x = commitOf(store, x.parent)) ids.push(x.id);
        return ids;
      };
      if (!theirs || ancestors(mine).includes(theirs.id))
        return done(ctx, [out("Already up to date.")]);
      if (mine && !ancestors(theirs).includes(mine.id))
        return fail(
          ctx,
          "merge: the histories have diverged; this sandbox can only fast-forward.",
        );
      const s = statusOf(fs, root);
      if (s.staged.length || s.unstaged.length)
        return fail(
          ctx,
          "error: Your local changes would be overwritten by merge.",
        );
      const next = checkoutTree(fs, root, headTree(store), theirs.tree);
      const files = changes(headTree(store), theirs.tree).length;
      return done(
        ctx,
        [
          out(
            `Updating ${mine ? shortId(mine.id) : "0000000"}..${shortId(theirs.id)}`,
          ),
          out("Fast-forward"),
          out(` ${files} file${files === 1 ? "" : "s"} changed`),
        ],
        writeStore(next, root, {
          ...store,
          index: { ...theirs.tree },
          branches: { ...store.branches, [store.head]: theirs.id },
        }),
      );
    }

    default: {
      // diff
      const staged = rest.includes("--staged") || rest.includes("--cached");
      const paths = rest
        .filter((a) => !a.startsWith("-"))
        .map((p) => rel(resolve(cwd, p)));
      const only = (path: string) =>
        !paths.length ||
        paths.some((r) => path === r || path.startsWith(`${r}/`));
      const work = workTree(fs, root);
      const tracked: Record<string, string> = {};
      for (const k of Object.keys(store.index))
        if (k in work) tracked[k] = work[k];
      const lines = staged
        ? diffLines(headTree(store), store.index, only)
        : diffLines(store.index, tracked, only);
      return done(ctx, lines);
    }
  }
}
