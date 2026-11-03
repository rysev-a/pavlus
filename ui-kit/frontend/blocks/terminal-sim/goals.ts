/**
 * Goals: what a terminal exercise asks for, checked on the resulting state of
 * the file system (not on the commands typed), so any way of getting there
 * counts.
 */
import { type Fs, exists, isDir, isFile, trimmed } from "./fs.ts";
import { headCommit, headTree, readStore, repoRoot, statusOf } from "./git.ts";

export type Goal = { label: string } & (
  | { kind: "dir"; path: string }
  | { kind: "file"; path: string; equals?: string; contains?: string }
  | { kind: "missing"; path: string }
  | { kind: "cwd"; path: string }
  | { kind: "repo"; path: string }
  | { kind: "commits"; path: string; min: number }
  | { kind: "branch"; path: string; name: string; current?: boolean }
  | { kind: "tracked"; path: string; file: string }
  | { kind: "staged"; path: string; file: string }
  | { kind: "clean"; path: string }
  | { kind: "message"; path: string; contains: string }
);

export interface GoalResult {
  label: string;
  ok: boolean;
}

/** Pure: does the state satisfy one goal? */
export function met(fs: Fs, cwd: string, goal: Goal): boolean {
  switch (goal.kind) {
    case "dir":
      return isDir(fs, goal.path);
    case "file": {
      if (!isFile(fs, goal.path)) return false;
      const text = fs[goal.path] as string;
      if (goal.equals !== undefined && trimmed(text) !== trimmed(goal.equals))
        return false;
      if (goal.contains !== undefined && !text.includes(goal.contains))
        return false;
      return true;
    }
    case "missing":
      return !exists(fs, goal.path);
    case "cwd":
      return cwd === goal.path;
    case "repo":
      return repoRoot(fs, goal.path) === goal.path;
    default: {
      if (repoRoot(fs, goal.path) !== goal.path) return false;
      const store = readStore(fs, goal.path);
      switch (goal.kind) {
        case "commits":
          return store.commits.length >= goal.min;
        case "branch":
          return goal.current
            ? store.head === goal.name
            : goal.name in store.branches;
        case "tracked":
          return goal.file in headTree(store);
        case "staged":
          return (
            goal.file in store.index &&
            store.index[goal.file] !== headTree(store)[goal.file]
          );
        case "clean":
          return statusOf(fs, goal.path).clean;
        case "message":
          return (headCommit(store)?.message ?? "").includes(goal.contains);
      }
    }
  }
}

/** Pure: every goal with its result, for the checklist next to the terminal. */
export function verify(fs: Fs, cwd: string, goals: Goal[]): GoalResult[] {
  return goals.map((g) => ({ label: g.label, ok: met(fs, cwd, g) }));
}

export const allMet = (results: GoalResult[]): boolean =>
  results.length > 0 && results.every((r) => r.ok);
