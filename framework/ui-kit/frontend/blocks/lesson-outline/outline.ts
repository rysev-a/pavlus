/** A course outline: modules of lessons, with the progress of each. */

export interface OutlineLesson {
  id: string;
  title: string;
  /** How many exercises the lesson has, and the XP they give in total. */
  exercises: number;
  xp: number;
}

export interface OutlineModule {
  id: string;
  title: string;
  summary: string;
  lessons: OutlineLesson[];
}

export type LessonStatus = "done" | "current" | "open" | "locked";

export interface LessonView {
  id: string;
  title: string;
  meta: string;
  status: LessonStatus;
  /** 0 to 100: how much of the lesson is solved. */
  pct: number;
}

export interface ModuleView {
  id: string;
  title: string;
  summary: string;
  open: boolean;
  done: number;
  total: number;
  pct: number;
  complete: boolean;
  lessons: LessonView[];
}

/** How many exercises are solved in each lesson, by lesson id. */
export type Solved = Record<string, number>;

const plural = (n: number, word: string): string =>
  `${n} ${word}${n === 1 ? "" : "s"}`;

export const isDone = (lesson: OutlineLesson, solved: Solved): boolean =>
  lesson.exercises > 0 && (solved[lesson.id] ?? 0) >= lesson.exercises;

/** Pure: the first lesson that is not finished, in course order. */
export function nextLesson(
  modules: OutlineModule[],
  solved: Solved,
): string | null {
  for (const m of modules)
    for (const l of m.lessons) if (!isDone(l, solved)) return l.id;
  return null;
}

/** Pure: lessons finished, lessons in total and the percentage, for the whole course. */
export function courseProgress(
  modules: OutlineModule[],
  solved: Solved,
): { done: number; total: number; pct: number } {
  const lessons = modules.flatMap((m) => m.lessons);
  const done = lessons.filter((l) => isDone(l, solved)).length;
  return {
    done,
    total: lessons.length,
    pct: lessons.length ? Math.round((done / lessons.length) * 100) : 0,
  };
}

/** Pure: the exercises solved in a whole course, as a share of all of them. */
export function exercisePct(modules: OutlineModule[], solved: Solved): number {
  const lessons = modules.flatMap((m) => m.lessons);
  const all = lessons.reduce((n, l) => n + l.exercises, 0);
  const got = lessons.reduce(
    (n, l) => n + Math.min(l.exercises, solved[l.id] ?? 0),
    0,
  );
  return all ? Math.round((got / all) * 100) : 0;
}

/**
 * Pure: what the outline shows. A finished lesson is `done`, the next one to
 * take is `current`, the others are `open`; `locked` lessons are those listed
 * in `locked`.
 */
export function buildOutline(
  modules: OutlineModule[],
  solved: Solved,
  open: string[],
  locked: string[] = [],
): ModuleView[] {
  const next = nextLesson(modules, solved);
  return modules.map((m) => {
    const done = m.lessons.filter((l) => isDone(l, solved)).length;
    return {
      id: m.id,
      title: m.title,
      summary: m.summary,
      open: open.includes(m.id),
      done,
      total: m.lessons.length,
      pct: m.lessons.length ? Math.round((done / m.lessons.length) * 100) : 0,
      complete: done === m.lessons.length,
      lessons: m.lessons.map((l): LessonView => {
        const got = Math.min(l.exercises, solved[l.id] ?? 0);
        const status: LessonStatus = locked.includes(l.id)
          ? "locked"
          : isDone(l, solved)
            ? "done"
            : l.id === next
              ? "current"
              : "open";
        return {
          id: l.id,
          title: l.title,
          status,
          pct: l.exercises ? Math.round((got / l.exercises) * 100) : 0,
          meta:
            got > 0 && got < l.exercises
              ? `${got} of ${plural(l.exercises, "exercise")} solved`
              : `${plural(l.exercises, "exercise")} · ${l.xp} XP`,
        };
      }),
    };
  });
}

/** Pure: open or close one module. */
export const toggleModule = (open: string[], id: string): string[] =>
  open.includes(id) ? open.filter((m) => m !== id) : [...open, id];
