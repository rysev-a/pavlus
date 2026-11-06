import { describe, expect, test } from "vitest";
import { run, tokenize, globMatch } from "../blocks/terminal-sim/commands.ts";
import {
  HOME,
  baseName,
  linesOf,
  listDir,
  makeFs,
  norm,
  parentOf,
  resolve,
  shortPath,
  type Fs,
} from "../blocks/terminal-sim/fs.ts";
import {
  hashId,
  readStore,
  repoRoot,
  statusOf,
} from "../blocks/terminal-sim/git.ts";
import { allMet, met, verify } from "../blocks/terminal-sim/goals.ts";
import {
  newTerm,
  promptOf,
  recall,
  stepTerm,
  submit,
  typeInto,
} from "../blocks/terminal-sim/session.ts";

const base = (): Fs =>
  makeFs({
    [`${HOME}/notes.txt`]: "one\ntwo\nthree\n",
    [`${HOME}/docs/a.md`]: "# A\n",
    [`${HOME}/.hidden`]: "x",
  });

/** Run several commands in a row, like a person typing. */
function session(commands: string[], fs: Fs = base(), cwd: string = HOME) {
  let state = { fs, cwd };
  const outputs: string[][] = [];
  for (const c of commands) {
    const r = run(state.fs, state.cwd, c);
    state = { fs: r.fs, cwd: r.cwd };
    outputs.push(r.out.map((l) => l.text));
  }
  return { ...state, outputs, last: outputs[outputs.length - 1] };
}

describe("paths", () => {
  test("norm resolves dots and slashes", () => {
    expect(norm("/a/b/../c//d/.")).toBe("/a/c/d");
    expect(norm("/../..")).toBe("/");
    expect(norm("")).toBe("/");
  });
  test("resolve handles ~, absolute and relative", () => {
    expect(resolve("/x", "~")).toBe(HOME);
    expect(resolve("/x", "~/docs")).toBe(`${HOME}/docs`);
    expect(resolve("/x", "/etc")).toBe("/etc");
    expect(resolve("/x/y", "../z")).toBe("/x/z");
  });
  test("parent, base name, short path", () => {
    expect(parentOf("/a/b")).toBe("/a");
    expect(parentOf("/a")).toBe("/");
    expect(parentOf("/")).toBe("/");
    expect(baseName("/a/b.txt")).toBe("b.txt");
    expect(shortPath(HOME)).toBe("~");
    expect(shortPath(`${HOME}/x`)).toBe("~/x");
    expect(shortPath("/etc")).toBe("/etc");
  });
  test("makeFs creates the folders above", () => {
    const fs = makeFs({ "/a/b/c.txt": "x" });
    expect(fs["/a"]).toBeNull();
    expect(fs["/a/b"]).toBeNull();
    expect(listDir(fs, "/a")).toEqual(["b"]);
  });
  test("linesOf drops the final newline only", () => {
    expect(linesOf("a\nb\n")).toEqual(["a", "b"]);
    expect(linesOf("a\n\nb")).toEqual(["a", "", "b"]);
    expect(linesOf("")).toEqual([]);
  });
});

describe("tokenizer", () => {
  test("words, quotes and operators", () => {
    const t = tokenize(`echo "hello world" > out.txt && ls`);
    expect(t).toEqual([
      { kind: "word", text: "echo", quoted: false },
      { kind: "word", text: "hello world", quoted: true },
      { kind: "op", op: ">" },
      { kind: "word", text: "out.txt", quoted: false },
      { kind: "op", op: "&&" },
      { kind: "word", text: "ls", quoted: false },
    ]);
  });
  test("an open quote is an error", () => {
    expect(tokenize(`echo "oops`)).toMatch(/unexpected EOF/);
  });
  test(">> is one operator", () => {
    expect(tokenize("a >> b")).toContainEqual({ kind: "op", op: ">>" });
  });
  test("glob matching", () => {
    expect(globMatch("*.txt", "a.txt")).toBe(true);
    expect(globMatch("*.txt", "a.md")).toBe(false);
    expect(globMatch("f?le", "file")).toBe(true);
  });
});

describe("ls cd pwd", () => {
  test("ls lists sorted and hides dotfiles", () => {
    expect(session(["ls"]).last).toEqual(["docs  notes.txt"]);
  });
  test("ls -a shows hidden files and dots", () => {
    expect(session(["ls -a"]).last).toEqual([
      ".  ..  .hidden  docs  notes.txt",
    ]);
  });
  test("ls -l marks folders", () => {
    const lines = session(["ls -l"]).last;
    expect(lines[0]).toMatch(/^drwxr-xr-x .* docs$/);
    expect(lines[1]).toMatch(/^-rw-r--r-- .* notes\.txt$/);
  });
  test("ls of a missing path is an error", () => {
    expect(session(["ls nope"]).last).toEqual([
      "ls: cannot access 'nope': No such file or directory",
    ]);
  });
  test("ls of several folders prints headers", () => {
    expect(session(["ls docs ."]).last).toEqual([
      "docs:",
      "a.md",
      "",
      ".:",
      "docs  notes.txt",
    ]);
  });
  test("cd, pwd and cd ..", () => {
    const s = session(["cd docs", "pwd", "cd ..", "pwd", "cd", "cd /", "pwd"]);
    expect(s.outputs[1]).toEqual([`${HOME}/docs`]);
    expect(s.outputs[3]).toEqual([HOME]);
    expect(s.outputs[6]).toEqual(["/"]);
  });
  test("cd to a file or a missing folder fails", () => {
    const s = session(["cd notes.txt", "cd nope"]);
    expect(s.outputs[0][0]).toMatch(/Not a directory/);
    expect(s.outputs[1][0]).toMatch(/No such file or directory/);
    expect(s.cwd).toBe(HOME);
  });
});

describe("files", () => {
  test("cat prints a file and fails on a folder", () => {
    expect(session(["cat notes.txt"]).last).toEqual(["one", "two", "three"]);
    expect(session(["cat docs"]).last[0]).toMatch(/Is a directory/);
    expect(session(["cat nope"]).last[0]).toMatch(/No such file/);
  });
  test("mkdir and mkdir -p", () => {
    const s = session(["mkdir work", "mkdir -p a/b/c", "mkdir x/y"]);
    expect(s.fs[`${HOME}/work`]).toBeNull();
    expect(s.fs[`${HOME}/a/b/c`]).toBeNull();
    expect(s.outputs[2][0]).toMatch(/No such file or directory/);
  });
  test("mkdir on an existing folder complains, -p does not", () => {
    expect(session(["mkdir docs"]).last[0]).toMatch(/File exists/);
    expect(session(["mkdir -p docs"]).last).toEqual([]);
  });
  test("touch creates an empty file and leaves existing ones alone", () => {
    const s = session(["touch new.txt", "touch notes.txt"]);
    expect(s.fs[`${HOME}/new.txt`]).toBe("");
    expect(s.fs[`${HOME}/notes.txt`]).toBe("one\ntwo\nthree\n");
  });
  test("rm needs -r for folders and reports missing files", () => {
    const s = session([
      "rm docs",
      "rm nope",
      "rm -f nope",
      "rm notes.txt",
      "rm -r docs",
    ]);
    expect(s.outputs[0][0]).toMatch(/Is a directory/);
    expect(s.outputs[1][0]).toMatch(/No such file/);
    expect(s.outputs[2]).toEqual([]);
    expect(`${HOME}/notes.txt` in s.fs).toBe(false);
    expect(`${HOME}/docs` in s.fs).toBe(false);
    expect(`${HOME}/docs/a.md` in s.fs).toBe(false);
  });
  test("rm refuses the root", () => {
    expect(session(["rm -rf /"]).last[0]).toMatch(/dangerous/);
  });
  test("rmdir only removes empty folders", () => {
    const s = session(["rmdir docs", "mkdir e", "rmdir e"]);
    expect(s.outputs[0][0]).toMatch(/not empty/);
    expect(`${HOME}/e` in s.fs).toBe(false);
  });
  test("cp copies files and folders, mv renames and moves", () => {
    const s = session([
      "cp notes.txt copy.txt",
      "cp -r docs docs2",
      "mv copy.txt docs",
      "mv notes.txt todo.txt",
    ]);
    expect(s.fs[`${HOME}/docs/copy.txt`]).toBe("one\ntwo\nthree\n");
    expect(s.fs[`${HOME}/docs2/a.md`]).toBe("# A\n");
    expect(`${HOME}/copy.txt` in s.fs).toBe(false);
    expect(s.fs[`${HOME}/todo.txt`]).toBe("one\ntwo\nthree\n");
    expect(`${HOME}/notes.txt` in s.fs).toBe(false);
  });
  test("cp of a folder needs -r", () => {
    expect(session(["cp docs x"]).last[0]).toMatch(/-r not specified/);
  });
  test("globs expand", () => {
    const s = session(["touch a.log b.log", "rm *.log", "ls"]);
    expect(s.last).toEqual(["docs  notes.txt"]);
  });
  test("grep, head, tail, wc", () => {
    expect(session(["grep t notes.txt"]).last).toEqual(["two", "three"]);
    expect(session(["grep -n tw notes.txt"]).last).toEqual(["2:two"]);
    expect(session(["head -n 1 notes.txt"]).last).toEqual(["one"]);
    expect(session(["tail -n 1 notes.txt"]).last).toEqual(["three"]);
    expect(session(["wc -l notes.txt"]).last).toEqual(["3 notes.txt"]);
  });
});

describe("echo and redirection", () => {
  test("echo prints", () => {
    expect(session(["echo hello   world"]).last).toEqual(["hello world"]);
    expect(session(['echo "a  b"']).last).toEqual(["a  b"]);
  });
  test("> writes and >> appends", () => {
    const s = session([
      "echo hi > greeting.txt",
      "echo again >> greeting.txt",
      "cat greeting.txt",
    ]);
    expect(s.fs[`${HOME}/greeting.txt`]).toBe("hi\nagain\n");
    expect(s.last).toEqual(["hi", "again"]);
  });
  test("> overwrites", () => {
    const s = session(["echo one > f", "echo two > f"]);
    expect(s.fs[`${HOME}/f`]).toBe("two\n");
  });
  test("redirect into a missing folder fails", () => {
    const s = session(["echo x > nope/f"]);
    expect(s.last[0]).toMatch(/No such file or directory/);
  });
  test("redirect works for any command", () => {
    const s = session(["ls > list.txt"]);
    expect(s.fs[`${HOME}/list.txt`]).toBe("docs  notes.txt\n");
    expect(s.last).toEqual([]);
  });
  test("&& stops at the first failure, ; does not", () => {
    const a = session(["cat nope && echo after"]);
    expect(a.last.join()).not.toContain("after");
    const b = session(["cat nope ; echo after"]);
    expect(b.last).toContain("after");
    const c = session(["mkdir w && cd w && pwd"]);
    expect(c.last).toEqual([`${HOME}/w`]);
  });
  test("unknown commands and pipes", () => {
    expect(session(["frobnicate"]).last).toEqual([
      "bash: frobnicate: command not found",
    ]);
    expect(session(["ls | wc"]).last[0]).toMatch(/pipes are not supported/);
    expect(session(["echo >"]).last[0]).toMatch(/syntax error/);
  });
  test("clear and help", () => {
    expect(run(base(), HOME, "clear").clear).toBe(true);
    expect(run(base(), HOME, "help").out.length).toBeGreaterThan(5);
  });
  test("an empty line does nothing", () => {
    expect(run(base(), HOME, "   ").out).toEqual([]);
  });
});

describe("git", () => {
  const repo = (extra: string[] = []) =>
    session([
      "mkdir proj",
      "cd proj",
      "git init",
      "echo hello > a.txt",
      ...extra,
    ]);

  test("outside a repository", () => {
    expect(session(["git status"]).last[0]).toMatch(/not a git repository/);
  });
  test("init creates .git and is idempotent", () => {
    const s = repo();
    expect(s.outputs[2][0]).toMatch(/^Initialized empty Git repository/);
    expect(repoRoot(s.fs, s.cwd)).toBe(`${HOME}/proj`);
    expect(session(["git init", "git init"]).last[0]).toMatch(/^Reinitialized/);
  });
  test("status of a new repo lists untracked files", () => {
    const s = repo(["git status"]);
    const text = s.last.join("\n");
    expect(text).toContain("On branch main");
    expect(text).toContain("No commits yet");
    expect(text).toContain("Untracked files:");
    expect(text).toContain("a.txt");
  });
  test("add stages, commit records, status is clean", () => {
    const s = repo([
      "git add a.txt",
      "git status",
      'git commit -m "first"',
      "git status",
    ]);
    expect(s.outputs[5].join("\n")).toContain("new file:   a.txt");
    expect(s.outputs[6][0]).toMatch(
      /^\[main \(root-commit\) [0-9a-f]{7}\] first$/,
    );
    expect(s.last.join("\n")).toContain(
      "nothing to commit, working tree clean",
    );
    expect(statusOf(s.fs, `${HOME}/proj`).clean).toBe(true);
  });
  test("git add . stages everything below the folder", () => {
    const s = repo(["touch b.txt", "git add .", "git commit -m two"]);
    expect(readStore(s.fs, `${HOME}/proj`).commits[0].tree).toHaveProperty(
      "b.txt",
    );
  });
  test("add of a missing file fails", () => {
    expect(repo(["git add nope"]).last[0]).toMatch(/did not match any files/);
  });
  test("commit without a message or with nothing staged fails", () => {
    expect(repo(["git add a.txt", "git commit"]).last[0]).toMatch(
      /empty commit message/,
    );
    const none = repo(["git commit -m x"]);
    expect(none.last.join("\n")).toContain("no changes added");
  });
  test("modified files appear as unstaged, then staged", () => {
    const s = repo([
      "git add a.txt",
      "git commit -m one",
      "echo more >> a.txt",
      "git status",
      "git diff",
      "git add a.txt",
      "git status",
      "git diff --staged",
    ]);
    expect(s.outputs[7].join("\n")).toContain("Changes not staged for commit");
    expect(s.outputs[7].join("\n")).toContain("modified:   a.txt");
    expect(s.outputs[8]).toContain("+more");
    expect(s.outputs[10].join("\n")).toContain("Changes to be committed");
    expect(s.outputs[11]).toContain("+more");
  });
  test("commit -am takes tracked changes", () => {
    const s = repo([
      "git add a.txt",
      "git commit -m one",
      "echo more >> a.txt",
      'git commit -am "two"',
    ]);
    const store = readStore(s.fs, `${HOME}/proj`);
    expect(store.commits).toHaveLength(2);
    expect(store.commits[1].tree["a.txt"]).toBe("hello\nmore\n");
  });
  test("log and log --oneline", () => {
    const s = repo([
      "git add a.txt",
      "git commit -m one",
      "echo b > b.txt",
      "git add b.txt",
      "git commit -m two",
      "git log --oneline",
      "git log",
    ]);
    expect(s.outputs[9][0]).toMatch(/^[0-9a-f]{7} \(HEAD -> main\) two$/);
    expect(s.outputs[9][1]).toMatch(/^[0-9a-f]{7} one$/);
    expect(s.last[0]).toMatch(/^commit [0-9a-f]{40} \(HEAD -> main\)$/);
    expect(s.last.join("\n")).toContain("    two");
  });
  test("log of an empty repo fails", () => {
    expect(repo(["git log"]).last[0]).toMatch(/does not have any commits/);
  });
  test("branch, checkout -b, checkout, switch", () => {
    const s = repo([
      "git add a.txt",
      "git commit -m one",
      "git branch dev",
      "git branch",
      "git checkout -b feature",
      "echo f > f.txt",
      "git add f.txt",
      "git commit -m feat",
      "git checkout main",
      "ls",
      "git switch feature",
      "ls",
    ]);
    expect(s.outputs[7]).toEqual(["  dev", "* main"]);
    expect(s.outputs[8]).toEqual(["Switched to a new branch 'feature'"]);
    expect(s.outputs[12]).toEqual(["Switched to branch 'main'"]);
    expect(s.outputs[13]).toEqual(["a.txt"]);
    expect(s.last).toEqual(["a.txt  f.txt"]);
    expect(readStore(s.fs, `${HOME}/proj`).head).toBe("feature");
  });
  test("a branch before the first commit is an error; checkout of an unknown name too", () => {
    expect(repo(["git branch dev"]).last[0]).toMatch(/not a valid object name/);
    const s = repo(["git add a.txt", "git commit -m one", "git checkout nope"]);
    expect(s.last[0]).toMatch(/did not match/);
  });
  test("checkout refuses to lose local changes", () => {
    const s = repo([
      "git add a.txt",
      "git commit -m one",
      "git branch dev",
      "echo changed > a.txt",
      "git add a.txt",
      "git checkout dev",
    ]);
    expect(s.last[0]).toMatch(/local changes would be overwritten/);
  });
  test("merge fast-forwards", () => {
    const s = repo([
      "git add a.txt",
      "git commit -m one",
      "git checkout -b dev",
      "echo d > d.txt",
      "git add d.txt",
      "git commit -m two",
      "git checkout main",
      "git merge dev",
      "ls",
      "git merge dev",
    ]);
    expect(s.outputs[11]).toContain("Fast-forward");
    expect(s.outputs[12]).toEqual(["a.txt  d.txt"]);
    expect(s.last).toEqual(["Already up to date."]);
  });
  test("restore --staged unstages", () => {
    const s = repo([
      "git add a.txt",
      "git restore --staged a.txt",
      "git status",
    ]);
    expect(s.last.join("\n")).toContain("Untracked files");
  });
  test("rm removes from disk and index", () => {
    const s = repo([
      "git add a.txt",
      "git commit -m one",
      "git rm a.txt",
      "git status",
    ]);
    expect(`${HOME}/proj/a.txt` in s.fs).toBe(false);
    expect(s.last.join("\n")).toContain("deleted:    a.txt");
  });
  test("unsupported subcommands say so", () => {
    expect(repo(["git push"]).last[0]).toMatch(/not available/);
  });
  test("commit ids are deterministic", () => {
    expect(hashId("x")).toBe(hashId("x"));
    expect(hashId("x")).not.toBe(hashId("y"));
    expect(hashId("x")).toMatch(/^[0-9a-f]{40}$/);
  });
  test("git works from a subfolder of the repo", () => {
    const s = repo([
      "mkdir sub",
      "cd sub",
      "echo s > s.txt",
      "git add .",
      "git status",
    ]);
    expect(s.last.join("\n")).toContain("new file:   sub/s.txt");
  });
});

describe("goals", () => {
  test("file, dir, missing and cwd goals", () => {
    const s = session([
      "mkdir docs2",
      "echo hello > docs2/readme.md",
      "cd docs2",
    ]);
    expect(
      met(s.fs, s.cwd, { kind: "dir", path: `${HOME}/docs2`, label: "" }),
    ).toBe(true);
    expect(
      met(s.fs, s.cwd, {
        kind: "file",
        path: `${HOME}/docs2/readme.md`,
        label: "",
      }),
    ).toBe(true);
    expect(
      met(s.fs, s.cwd, {
        kind: "file",
        path: `${HOME}/docs2/readme.md`,
        equals: "hello",
        label: "",
      }),
    ).toBe(true);
    expect(
      met(s.fs, s.cwd, {
        kind: "file",
        path: `${HOME}/docs2/readme.md`,
        contains: "bye",
        label: "",
      }),
    ).toBe(false);
    expect(
      met(s.fs, s.cwd, { kind: "missing", path: `${HOME}/nope`, label: "" }),
    ).toBe(true);
    expect(
      met(s.fs, s.cwd, { kind: "cwd", path: `${HOME}/docs2`, label: "" }),
    ).toBe(true);
    expect(
      met(s.fs, s.cwd, { kind: "dir", path: `${HOME}/readme.md`, label: "" }),
    ).toBe(false);
  });
  test("git goals", () => {
    const root = `${HOME}/p`;
    const s = session([
      "mkdir p",
      "cd p",
      "git init",
      "echo a > a.txt",
      "git add a.txt",
      "git checkout -b dev",
      'git commit -m "add a"',
    ]);
    const g = (goal: Parameters<typeof met>[2]) => met(s.fs, s.cwd, goal);
    expect(g({ kind: "repo", path: root, label: "" })).toBe(true);
    expect(g({ kind: "commits", path: root, min: 1, label: "" })).toBe(true);
    expect(g({ kind: "commits", path: root, min: 2, label: "" })).toBe(false);
    expect(
      g({ kind: "branch", path: root, name: "dev", current: true, label: "" }),
    ).toBe(true);
    expect(g({ kind: "branch", path: root, name: "main", label: "" })).toBe(
      true,
    );
    expect(g({ kind: "tracked", path: root, file: "a.txt", label: "" })).toBe(
      true,
    );
    expect(g({ kind: "clean", path: root, label: "" })).toBe(true);
    expect(
      g({ kind: "message", path: root, contains: "add a", label: "" }),
    ).toBe(true);
    expect(g({ kind: "staged", path: root, file: "a.txt", label: "" })).toBe(
      false,
    );
    expect(g({ kind: "repo", path: `${HOME}/docs`, label: "" })).toBe(false);
  });
  test("verify lists results and allMet needs all", () => {
    const s = session(["mkdir docs2"]);
    const results = verify(s.fs, s.cwd, [
      { kind: "dir", path: `${HOME}/docs2`, label: "folder" },
      { kind: "file", path: `${HOME}/docs2/readme.md`, label: "file" },
    ]);
    expect(results).toEqual([
      { label: "folder", ok: true },
      { label: "file", ok: false },
    ]);
    expect(allMet(results)).toBe(false);
    expect(allMet([])).toBe(false);
    expect(allMet([{ label: "x", ok: true }])).toBe(true);
  });
});

describe("terminal session", () => {
  const t0 = () => newTerm(base(), HOME, ["hello"]);
  test("prompt shows the folder", () => {
    expect(promptOf(t0())).toBe("user@learn-box:~$");
    expect(promptOf({ ...t0(), cwd: `${HOME}/docs` })).toBe(
      "user@learn-box:~/docs$",
    );
  });
  test("typing and submitting adds lines and clears the input", () => {
    const t = submit(typeInto(t0(), "ls"));
    expect(t.value).toBe("");
    expect(t.lines.map((l) => [l.kind, l.text])).toEqual([
      ["info", "hello"],
      ["cmd", "ls"],
      ["out", "docs  notes.txt"],
    ]);
    expect(t.history).toEqual(["ls"]);
    expect(t.runs).toBe(1);
  });
  test("cd changes the prompt, lines have unique ids", () => {
    const t = submit(typeInto(submit(typeInto(t0(), "cd docs")), "ls"));
    expect(promptOf(t)).toBe("user@learn-box:~/docs$");
    expect(new Set(t.lines.map((l) => l.id)).size).toBe(t.lines.length);
  });
  test("clear empties the screen", () => {
    const t = submit(typeInto(submit(typeInto(t0(), "ls")), "clear"));
    expect(t.lines).toEqual([]);
  });
  test("the arrows walk the history", () => {
    let t = submit(typeInto(t0(), "ls"));
    t = submit(typeInto(t, "pwd"));
    t = recall(t, "ArrowUp");
    expect(t.value).toBe("pwd");
    t = recall(t, "ArrowUp");
    expect(t.value).toBe("ls");
    t = recall(t, "ArrowUp");
    expect(t.value).toBe("ls");
    t = recall(t, "ArrowDown");
    expect(t.value).toBe("pwd");
    t = recall(t, "ArrowDown");
    expect(t.value).toBe("");
    expect(recall(t, "a")).toBe(t);
  });
  test("an empty line only echoes the prompt", () => {
    const t = submit(t0());
    expect(t.lines).toHaveLength(2);
    expect(t.runs).toBe(0);
  });
  test("stepTerm maps the three messages", () => {
    let t = stepTerm(t0(), "type", { value: "echo hi" });
    expect(t.value).toBe("echo hi");
    t = stepTerm(t, "submit", undefined);
    expect(t.lines[t.lines.length - 1].text).toBe("hi");
    t = stepTerm(t, "key", { key: "ArrowUp" });
    expect(t.value).toBe("echo hi");
  });
  test("a custom runner can add commands", () => {
    const t = submit(typeInto(t0(), "magic"), (fs, cwd, cmd) =>
      cmd === "magic"
        ? {
            fs,
            cwd,
            out: [{ kind: "out", text: "abracadabra" }],
            clear: false,
            ok: true,
          }
        : run(fs, cwd, cmd),
    );
    expect(t.lines[t.lines.length - 1].text).toBe("abracadabra");
  });
});
