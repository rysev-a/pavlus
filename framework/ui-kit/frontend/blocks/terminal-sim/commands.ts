/**
 * `run(fs, cwd, command)`: a small shell over the virtual file system. It
 * understands quotes, `~`, `*` globs, `&&` and `;`, and `>` / `>>`, and has
 * ls, cd, pwd, cat, mkdir, touch, rm, rmdir, cp, mv, echo, grep, head, tail,
 * wc, whoami, clear, help and git (see git.ts). Pure: a state in, a state out.
 */
import {
  type Fs,
  HOME,
  baseName,
  copyTree,
  exists,
  isDir,
  isFile,
  joinPath,
  linesOf,
  listDir,
  mkdir,
  parentOf,
  remove,
  resolve,
  write,
} from "./fs.ts";
import { type CmdResult, type OutLine, gitRun } from "./git.ts";

export type { OutLine } from "./git.ts";

export interface RunResult {
  fs: Fs;
  cwd: string;
  out: OutLine[];
  /** `clear` was run: the screen is emptied first. */
  clear: boolean;
  /** The last command worked. */
  ok: boolean;
}

export type Token =
  | { kind: "word"; text: string; quoted: boolean }
  | { kind: "op"; op: "&&" | ";" | ">" | ">>" | "|" };

/** Pure: split a command line into words (quotes and escapes resolved) and operators. */
export function tokenize(line: string): Token[] | string {
  const tokens: Token[] = [];
  let word = "";
  let has = false;
  let quoted = false;
  const flush = () => {
    if (has) tokens.push({ kind: "word", text: word, quoted });
    word = "";
    has = false;
    quoted = false;
  };
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === "'" || c === '"') {
      const end = line.indexOf(c, i + 1);
      if (end < 0)
        return "bash: unexpected EOF while looking for matching quote";
      let body = line.slice(i + 1, end);
      if (c === '"') body = body.replace(/\\(["\\$`])/g, "$1");
      word += body;
      has = true;
      quoted = true;
      i = end;
    } else if (c === "\\" && i + 1 < line.length) {
      word += line[++i];
      has = true;
      quoted = true;
    } else if (c === " " || c === "\t") {
      flush();
    } else if (c === "&" && line[i + 1] === "&") {
      flush();
      tokens.push({ kind: "op", op: "&&" });
      i++;
    } else if (c === ";") {
      flush();
      tokens.push({ kind: "op", op: ";" });
    } else if (c === "|") {
      flush();
      tokens.push({ kind: "op", op: "|" });
    } else if (c === ">") {
      flush();
      if (line[i + 1] === ">") {
        tokens.push({ kind: "op", op: ">>" });
        i++;
      } else tokens.push({ kind: "op", op: ">" });
    } else {
      word += c;
      has = true;
    }
  }
  flush();
  return tokens;
}

const out = (text: string): OutLine => ({ kind: "out", text });
const err = (text: string): OutLine => ({ kind: "err", text });

interface Ctx {
  fs: Fs;
  cwd: string;
}
const ok = (
  ctx: Ctx,
  lines: OutLine[] = [],
  fs: Fs = ctx.fs,
  cwd = ctx.cwd,
): CmdResult => ({
  fs,
  cwd,
  out: lines,
  ok: !lines.some((l) => l.kind === "err"),
});

/** Pure: does a name match a pattern with `*` and `?`? */
export function globMatch(pattern: string, name: string): boolean {
  const re = new RegExp(
    `^${pattern
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*")
      .replace(/\?/g, ".")}$`,
  );
  return re.test(name);
}

/** Expand `*` and `?` in the last part of a word (hidden files need an explicit dot). */
function expand(ctx: Ctx, word: string): string[] {
  if (!/[*?]/.test(word)) return [word];
  const slash = word.lastIndexOf("/");
  const dirPart = slash < 0 ? "" : word.slice(0, slash + 1);
  const pattern = word.slice(slash + 1);
  const dir = resolve(ctx.cwd, dirPart || ".");
  if (!isDir(ctx.fs, dir)) return [word];
  const found = listDir(ctx.fs, dir).filter(
    (n) =>
      globMatch(pattern, n) && (pattern.startsWith(".") || !n.startsWith(".")),
  );
  return found.length ? found.map((n) => dirPart + n) : [word];
}

const splitFlags = (args: string[]): { flags: string; rest: string[] } => {
  let flags = "";
  const rest: string[] = [];
  let ended = false;
  for (const a of args) {
    if (!ended && a === "--") ended = true;
    else if (!ended && /^-[A-Za-z]+$/.test(a)) flags += a.slice(1);
    else rest.push(a);
  }
  return { flags, rest };
};

const MODE = (dir: boolean) => (dir ? "drwxr-xr-x" : "-rw-r--r--");

function ls(ctx: Ctx, args: string[]): CmdResult {
  const { flags, rest } = splitFlags(args);
  const targets = rest.length ? rest : ["."];
  const lines: OutLine[] = [];
  const entry = (dir: string, name: string): string => {
    const path = joinPath(dir, name);
    if (!flags.includes("l")) return name;
    const size = isFile(ctx.fs, path) ? (ctx.fs[path] as string).length : 4096;
    return `${MODE(isDir(ctx.fs, path))} user user ${String(size).padStart(5)} ${name}`;
  };
  targets.forEach((t, i) => {
    const path = resolve(ctx.cwd, t);
    if (!exists(ctx.fs, path)) {
      lines.push(err(`ls: cannot access '${t}': No such file or directory`));
      return;
    }
    if (targets.length > 1) {
      if (i > 0) lines.push(out(""));
      lines.push(out(`${t}:`));
    }
    if (isFile(ctx.fs, path)) {
      lines.push(out(entry(parentOf(path), baseName(path))));
      return;
    }
    let names = listDir(ctx.fs, path);
    if (!flags.includes("a")) names = names.filter((n) => !n.startsWith("."));
    else names = [".", "..", ...names];
    if (flags.includes("l")) {
      for (const n of names) {
        lines.push(
          out(
            n === "." || n === ".."
              ? `${MODE(true)} user user  4096 ${n}`
              : entry(path, n),
          ),
        );
      }
    } else if (names.length) lines.push(out(names.join("  ")));
  });
  return ok(ctx, lines);
}

function cd(ctx: Ctx, args: string[]): CmdResult {
  const target = args[0] ?? "~";
  const path = target === "-" ? HOME : resolve(ctx.cwd, target);
  if (!exists(ctx.fs, path))
    return ok(ctx, [err(`bash: cd: ${target}: No such file or directory`)]);
  if (!isDir(ctx.fs, path))
    return ok(ctx, [err(`bash: cd: ${target}: Not a directory`)]);
  return ok(ctx, [], ctx.fs, path);
}

function cat(ctx: Ctx, args: string[]): CmdResult {
  const lines: OutLine[] = [];
  if (!args.length) return ok(ctx, [err("cat: missing file name")]);
  for (const a of args) {
    const path = resolve(ctx.cwd, a);
    if (!exists(ctx.fs, path))
      lines.push(err(`cat: ${a}: No such file or directory`));
    else if (isDir(ctx.fs, path)) lines.push(err(`cat: ${a}: Is a directory`));
    else for (const l of linesOf(ctx.fs[path] as string)) lines.push(out(l));
  }
  return ok(ctx, lines);
}

function mkdirCmd(ctx: Ctx, args: string[]): CmdResult {
  const { flags, rest } = splitFlags(args);
  if (!rest.length) return ok(ctx, [err("mkdir: missing operand")]);
  let fs = ctx.fs;
  const lines: OutLine[] = [];
  for (const a of rest) {
    const path = resolve(ctx.cwd, a);
    if (exists(fs, path)) {
      if (!flags.includes("p"))
        lines.push(err(`mkdir: cannot create directory '${a}': File exists`));
      continue;
    }
    const parent = parentOf(path);
    if (!exists(fs, parent)) {
      if (!flags.includes("p")) {
        lines.push(
          err(
            `mkdir: cannot create directory '${a}': No such file or directory`,
          ),
        );
        continue;
      }
      let dir = parent;
      const chain: string[] = [];
      while (!exists(fs, dir)) {
        chain.push(dir);
        dir = parentOf(dir);
      }
      for (const d of chain.reverse()) fs = mkdir(fs, d);
    } else if (!isDir(fs, parent)) {
      lines.push(err(`mkdir: cannot create directory '${a}': Not a directory`));
      continue;
    }
    fs = mkdir(fs, path);
  }
  return ok(ctx, lines, fs);
}

function touch(ctx: Ctx, args: string[]): CmdResult {
  if (!args.length) return ok(ctx, [err("touch: missing file operand")]);
  let fs = ctx.fs;
  const lines: OutLine[] = [];
  for (const a of args) {
    const path = resolve(ctx.cwd, a);
    if (exists(fs, path)) continue;
    if (!isDir(fs, parentOf(path))) {
      lines.push(err(`touch: cannot touch '${a}': No such file or directory`));
      continue;
    }
    fs = write(fs, path, "");
  }
  return ok(ctx, lines, fs);
}

function rm(ctx: Ctx, args: string[]): CmdResult {
  const { flags, rest } = splitFlags(args);
  if (!rest.length) return ok(ctx, [err("rm: missing operand")]);
  let fs = ctx.fs;
  const lines: OutLine[] = [];
  const recursive = flags.includes("r") || flags.includes("R");
  for (const a of rest) {
    const path = resolve(ctx.cwd, a);
    if (path === "/") {
      lines.push(err("rm: it is dangerous to operate recursively on '/'"));
      continue;
    }
    if (!exists(fs, path)) {
      if (!flags.includes("f"))
        lines.push(err(`rm: cannot remove '${a}': No such file or directory`));
      continue;
    }
    if (isDir(fs, path) && !recursive) {
      lines.push(err(`rm: cannot remove '${a}': Is a directory`));
      continue;
    }
    fs = remove(fs, path);
  }
  const cwd = exists(fs, ctx.cwd) ? ctx.cwd : "/";
  return ok(ctx, lines, fs, cwd);
}

function rmdir(ctx: Ctx, args: string[]): CmdResult {
  let fs = ctx.fs;
  const lines: OutLine[] = [];
  if (!args.length) return ok(ctx, [err("rmdir: missing operand")]);
  for (const a of args) {
    const path = resolve(ctx.cwd, a);
    if (!exists(fs, path))
      lines.push(
        err(`rmdir: failed to remove '${a}': No such file or directory`),
      );
    else if (!isDir(fs, path))
      lines.push(err(`rmdir: failed to remove '${a}': Not a directory`));
    else if (listDir(fs, path).length)
      lines.push(err(`rmdir: failed to remove '${a}': Directory not empty`));
    else fs = remove(fs, path);
  }
  return ok(ctx, lines, fs);
}

/** cp and mv: a file or a folder to a new name, or into a folder. */
function transfer(ctx: Ctx, args: string[], move: boolean): CmdResult {
  const name = move ? "mv" : "cp";
  const { flags, rest } = splitFlags(args);
  if (rest.length < 2)
    return ok(ctx, [err(`${name}: missing destination file operand`)]);
  const destArg = rest[rest.length - 1];
  const dest = resolve(ctx.cwd, destArg);
  const sources = rest.slice(0, -1);
  if (sources.length > 1 && !isDir(ctx.fs, dest))
    return ok(ctx, [err(`${name}: target '${destArg}' is not a directory`)]);
  let fs = ctx.fs;
  const lines: OutLine[] = [];
  for (const s of sources) {
    const from = resolve(ctx.cwd, s);
    if (!exists(fs, from)) {
      lines.push(err(`${name}: cannot stat '${s}': No such file or directory`));
      continue;
    }
    if (
      isDir(fs, from) &&
      !move &&
      !flags.includes("r") &&
      !flags.includes("R")
    ) {
      lines.push(err(`cp: -r not specified; omitting directory '${s}'`));
      continue;
    }
    const to = isDir(fs, dest) ? joinPath(dest, baseName(from)) : dest;
    if (to === from || to.startsWith(`${from}/`)) {
      lines.push(
        err(`${name}: cannot move '${s}' to a subdirectory of itself`),
      );
      continue;
    }
    if (!isDir(fs, parentOf(to))) {
      lines.push(
        err(`${name}: cannot create '${destArg}': No such file or directory`),
      );
      continue;
    }
    fs = copyTree(remove(fs, to), from, to);
    if (move) fs = remove(fs, from);
  }
  const cwd = exists(fs, ctx.cwd) ? ctx.cwd : "/";
  return ok(ctx, lines, fs, cwd);
}

function grep(ctx: Ctx, args: string[]): CmdResult {
  const { flags, rest } = splitFlags(args);
  const [pattern, ...files] = rest;
  if (pattern === undefined || !files.length)
    return ok(ctx, [err("usage: grep [-in] pattern file...")]);
  const needle = flags.includes("i") ? pattern.toLowerCase() : pattern;
  const lines: OutLine[] = [];
  for (const f of files) {
    const path = resolve(ctx.cwd, f);
    if (!isFile(ctx.fs, path)) {
      lines.push(err(`grep: ${f}: No such file or directory`));
      continue;
    }
    linesOf(ctx.fs[path] as string).forEach((l, i) => {
      const hay = flags.includes("i") ? l.toLowerCase() : l;
      if (!hay.includes(needle)) return;
      const prefix = `${files.length > 1 ? `${f}:` : ""}${flags.includes("n") ? `${i + 1}:` : ""}`;
      lines.push(out(prefix + l));
    });
  }
  return ok(ctx, lines);
}

function headTail(ctx: Ctx, args: string[], head: boolean): CmdResult {
  let count = 10;
  const files: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-n") count = Number(args[++i]) || 10;
    else if (/^-\d+$/.test(args[i])) count = Number(args[i].slice(1));
    else files.push(args[i]);
  }
  const lines: OutLine[] = [];
  for (const f of files) {
    const path = resolve(ctx.cwd, f);
    if (!isFile(ctx.fs, path)) {
      lines.push(
        err(
          `${head ? "head" : "tail"}: cannot open '${f}': No such file or directory`,
        ),
      );
      continue;
    }
    const all = linesOf(ctx.fs[path] as string);
    for (const l of head ? all.slice(0, count) : all.slice(-count))
      lines.push(out(l));
  }
  return ok(ctx, lines);
}

function wc(ctx: Ctx, args: string[]): CmdResult {
  const { flags, rest } = splitFlags(args);
  const lines: OutLine[] = [];
  for (const f of rest) {
    const path = resolve(ctx.cwd, f);
    if (!isFile(ctx.fs, path)) {
      lines.push(err(`wc: ${f}: No such file or directory`));
      continue;
    }
    const text = ctx.fs[path] as string;
    const n = linesOf(text).length;
    const words = text.split(/\s+/).filter(Boolean).length;
    lines.push(
      out(
        flags.includes("l") ? `${n} ${f}` : `${n} ${words} ${text.length} ${f}`,
      ),
    );
  }
  return ok(ctx, lines);
}

const HELP = [
  "ls [-la] [path]     list files",
  "cd [path]           change folder (cd .. goes up, cd alone goes home)",
  "pwd                 print the current folder",
  "cat file            print a file",
  "mkdir [-p] name     make a folder",
  "touch name          make an empty file",
  "rm [-rf] name       remove files or folders",
  "cp, mv              copy or move/rename",
  "echo text > file    write text to a file (>> appends)",
  "grep, head, tail, wc",
  "git                 init, status, add, commit, log, branch, checkout, diff",
  "clear               clear the screen",
];

/** One command (already split into words and expanded). */
function exec(
  ctx: Ctx,
  name: string,
  args: string[],
): CmdResult & { clear?: boolean } {
  switch (name) {
    case "ls":
    case "dir":
      return ls(ctx, args);
    case "cd":
      return cd(ctx, args);
    case "pwd":
      return ok(ctx, [out(ctx.cwd)]);
    case "cat":
      return cat(ctx, args);
    case "mkdir":
      return mkdirCmd(ctx, args);
    case "touch":
      return touch(ctx, args);
    case "rm":
      return rm(ctx, args);
    case "rmdir":
      return rmdir(ctx, args);
    case "cp":
      return transfer(ctx, args, false);
    case "mv":
      return transfer(ctx, args, true);
    case "echo": {
      const noNewline = args[0] === "-n";
      return ok(ctx, [out((noNewline ? args.slice(1) : args).join(" "))]);
    }
    case "grep":
      return grep(ctx, args);
    case "head":
      return headTail(ctx, args, true);
    case "tail":
      return headTail(ctx, args, false);
    case "wc":
      return wc(ctx, args);
    case "whoami":
      return ok(ctx, [out("user")]);
    case "hostname":
      return ok(ctx, [out("learn-box")]);
    case "clear":
      return { ...ok(ctx), clear: true };
    case "help":
      return ok(ctx, HELP.map(out));
    case "git":
      return gitRun(ctx, args);
    case "sudo":
      return ok(ctx, [
        err("user is not in the sudoers file. This incident will be reported."),
      ]);
    default:
      return ok(ctx, [err(`bash: ${name}: command not found`)]);
  }
}

/** Write (or append) the output of a command to a file. */
function redirect(
  ctx: Ctx,
  target: string,
  append: boolean,
  lines: OutLine[],
): { fs: Fs; errors: OutLine[] } {
  const path = resolve(ctx.cwd, target);
  if (isDir(ctx.fs, path))
    return { fs: ctx.fs, errors: [err(`bash: ${target}: Is a directory`)] };
  if (!isDir(ctx.fs, parentOf(path)))
    return {
      fs: ctx.fs,
      errors: [err(`bash: ${target}: No such file or directory`)],
    };
  const text = lines.map((l) => `${l.text}\n`).join("");
  const before = append && isFile(ctx.fs, path) ? (ctx.fs[path] as string) : "";
  return { fs: write(ctx.fs, path, before + text), errors: [] };
}

/** Pure: run a command line in a folder of a file system. */
export function run(fs: Fs, cwd: string, command: string): RunResult {
  const result: RunResult = { fs, cwd, out: [], clear: false, ok: true };
  const tokens = tokenize(command.trim());
  if (typeof tokens === "string") {
    return { ...result, out: [err(tokens)], ok: false };
  }
  // split into commands at && and ;
  const parts: { words: Token[]; sep: "&&" | ";" | "" }[] = [];
  let current: Token[] = [];
  for (const t of tokens) {
    if (t.kind === "op" && (t.op === "&&" || t.op === ";")) {
      parts.push({ words: current, sep: t.op });
      current = [];
    } else current.push(t);
  }
  parts.push({ words: current, sep: "" });

  let state: Ctx = { fs, cwd };
  const lines: OutLine[] = [];
  let clear = false;
  let last = true;
  for (let i = 0; i < parts.length; i++) {
    const { words } = parts[i];
    const sepBefore = i > 0 ? parts[i - 1].sep : "";
    if (sepBefore === "&&" && !last) break;
    if (!words.length) {
      if (parts.length > 1 && words.length === 0 && parts[i].sep !== "") {
        lines.push(err("bash: syntax error near unexpected token"));
        last = false;
      }
      continue;
    }
    // redirection and pipes
    const args: string[] = [];
    let target: { path: string; append: boolean } | null = null;
    let broken = "";
    for (let w = 0; w < words.length; w++) {
      const t = words[w];
      if (t.kind === "op") {
        if (t.op === "|") {
          broken = "bash: pipes are not supported in this sandbox";
          break;
        }
        const next = words[w + 1];
        if (!next || next.kind !== "word") {
          broken = "bash: syntax error near unexpected token `newline'";
          break;
        }
        target = { path: next.text, append: t.op === ">>" };
        w++;
      } else if (t.quoted) args.push(t.text);
      else args.push(...expand(state, t.text));
    }
    if (broken) {
      lines.push(err(broken));
      last = false;
      continue;
    }
    if (!args.length) continue;
    const [name, ...rest] = args;
    const res = exec(state, name, rest);
    let nextFs = res.fs;
    let shown = res.out;
    let success = res.ok;
    if (target) {
      const written = redirect(
        { fs: res.fs, cwd: res.cwd },
        target.path,
        target.append,
        res.out.filter((l) => l.kind !== "err"),
      );
      nextFs = written.fs;
      shown = [...res.out.filter((l) => l.kind === "err"), ...written.errors];
      if (written.errors.length) success = false;
    }
    if (res.clear) clear = true;
    state = { fs: nextFs, cwd: res.cwd };
    lines.push(...shown);
    last = success;
  }
  return { fs: state.fs, cwd: state.cwd, out: lines, clear, ok: last };
}
