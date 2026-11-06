/**
 * The state of one terminal pane (the lines on the screen, the input and the
 * history) and the pure steps that change it. The command runner is a
 * parameter, so a template can add its own commands in front of `run`.
 */
import { type RunResult, run } from "./commands.ts";
import { type Fs, shortPath } from "./fs.ts";
import type { LineKind } from "./git.ts";

export interface TermLine {
  id: number;
  /** `cmd` is a typed command (with its prompt); the others are output. */
  kind: "cmd" | LineKind;
  prompt: string;
  text: string;
}

export interface Term {
  fs: Fs;
  cwd: string;
  lines: TermLine[];
  nextId: number;
  history: string[];
  /** Where the arrow keys are in the history (`history.length` is "a new line"). */
  cursor: number;
  value: string;
  user: string;
  host: string;
  /** How many commands have been run (for a "you ran N commands" summary). */
  runs: number;
}

export type Runner = (fs: Fs, cwd: string, command: string) => RunResult;

export const MAX_LINES = 400;

export const promptOf = (t: Pick<Term, "user" | "host" | "cwd">): string =>
  `${t.user}@${t.host}:${shortPath(t.cwd)}$`;

/** Pure: a fresh terminal with a few lines of greeting. */
export function newTerm(
  fs: Fs,
  cwd: string,
  intro: string[] = [],
  who: { user?: string; host?: string } = {},
): Term {
  return {
    fs,
    cwd,
    lines: intro.map((text, id) => ({ id, kind: "info", prompt: "", text })),
    nextId: intro.length,
    history: [],
    cursor: 0,
    value: "",
    user: who.user ?? "user",
    host: who.host ?? "learn-box",
    runs: 0,
  };
}

export const typeInto = (t: Term, value: string): Term => ({
  ...t,
  value,
  cursor: t.history.length,
});

/** Pure: press Enter: run the command, add the lines, remember it, clear the input. */
export function submit(t: Term, runner: Runner = run): Term {
  const command = t.value.trim();
  const prompt = promptOf(t);
  const echoed: TermLine = { id: t.nextId, kind: "cmd", prompt, text: t.value };
  if (!command) {
    return { ...t, lines: trim([...t.lines, echoed]), nextId: t.nextId + 1 };
  }
  const result = runner(t.fs, t.cwd, command);
  const printed: TermLine[] = result.out.map((l, i) => ({
    id: t.nextId + 1 + i,
    kind: l.kind,
    prompt: "",
    text: l.text,
  }));
  const base = result.clear ? [] : [...t.lines, echoed];
  return {
    ...t,
    fs: result.fs,
    cwd: result.cwd,
    lines: trim([...base, ...printed]),
    nextId: t.nextId + 1 + printed.length,
    history:
      t.history[t.history.length - 1] === command
        ? t.history
        : [...t.history, command],
    cursor:
      t.history[t.history.length - 1] === command
        ? t.history.length
        : t.history.length + 1,
    value: "",
    runs: t.runs + 1,
  };
}

const trim = (lines: TermLine[]): TermLine[] =>
  lines.length > MAX_LINES ? lines.slice(lines.length - MAX_LINES) : lines;

/** Pure: the up and down keys walk through the history. */
export function recall(t: Term, key: string): Term {
  if (key === "ArrowUp") {
    if (t.history.length === 0) return t;
    const cursor = Math.max(0, t.cursor - 1);
    return { ...t, cursor, value: t.history[cursor] };
  }
  if (key === "ArrowDown") {
    const cursor = Math.min(t.history.length, t.cursor + 1);
    return {
      ...t,
      cursor,
      value: cursor >= t.history.length ? "" : t.history[cursor],
    };
  }
  return t;
}

/** What the DOM plugin adds to a message (`msg.event`). */
export interface InputEvent {
  value?: string;
  key?: string;
}

/**
 * Pure: the three messages of the terminal view as one step: `type` (the
 * input changed), `submit` (Enter) and `key` (the arrows). A host calls this
 * from its `<name>.type`, `<name>.submit` and `<name>.key` handlers.
 */
export function stepTerm(
  t: Term,
  action: "type" | "submit" | "key",
  event: InputEvent | undefined,
  runner: Runner = run,
): Term {
  if (action === "type") return typeInto(t, event?.value ?? "");
  if (action === "submit") return submit(t, runner);
  return recall(t, event?.key ?? "");
}
