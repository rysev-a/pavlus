import { describe, expect, test } from "vitest";
import type { Effect, Message } from "@service-laboratory/pavlus";
import { run } from "../blocks/terminal-sim/commands.ts";
import { allMet, verify } from "../blocks/terminal-sim/goals.ts";
import { solvedCounts } from "../templates/it-course-exercises/progress.ts";
import { courseProgress } from "../blocks/lesson-outline/outline.ts";
import { levelOf } from "../blocks/xp-bar/xp.ts";
import {
  type Answer,
  type Exercise,
  checkExercise,
} from "../templates/it-course-exercises/checks.ts";
import {
  COURSE,
  LESSONS,
  MODULES,
  TOTAL_XP,
  lessonAfter,
  lessonById,
  startOf,
} from "../templates/it-course-exercises/course-data.ts";
import {
  type CourseState,
  ItCourse,
  answerOf,
  canCheck,
  derive,
  doneCards,
  exerciseOf,
  initial,
  newSession,
  termFor,
} from "../templates/it-course-exercises/it-course-exercises.ts";
import {
  freshProgress,
  isSolved,
  solve,
} from "../templates/it-course-exercises/progress.ts";

/** The right answers, by exercise id. */
const CHOICE: Record<string, string[]> = {
  "where-1": ["b"],
  "making-1": ["b"],
  "moving-1": ["a", "c"],
  "repo-1": ["b"],
  "commit-3": ["b"],
  "branches-1": ["b"],
};
const GAPS: Record<string, Record<string, string>> = {
  "where-2": { g0: "cd", g1: "ls", g2: "cd" },
  "making-3": { g0: "mkdir", g1: "touch", g2: "cat" },
  "moving-2": { g0: "mv", g1: "cp", g2: "rm" },
  "commit-1": { g0: "add", g1: "commit", g2: "log" },
  "branches-2": { g0: "checkout", g1: "merge", g2: "branch" },
};
const ORDER: Record<string, string[]> = {
  "making-2": ["mk", "cd", "echo", "cat"],
  "repo-2": ["mk", "cd", "init", "st"],
  "commit-2": ["edit", "add", "status", "commit"],
};
const TERMINAL: Record<string, string[]> = {
  "where-3": ["cd projects/site"],
  "making-4": ["mkdir docs", "echo Hello > docs/readme.md"],
  "moving-3": ["mv draft.txt final.txt", "rm -r old"],
  "repo-3": ["cd site", "git init"],
  "commit-4": ["git add post.md", 'git commit -m "First post"'],
  "branches-3": [
    "git checkout -b feature",
    "touch feature.txt",
    "git add feature.txt",
    'git commit -m "Add feature"',
  ],
};

const all: Exercise[] = LESSONS.flatMap((l) => l.exercises);

/** The right answer to an exercise. */
function solution(ex: Exercise): Answer {
  switch (ex.kind) {
    case "choice":
      return { kind: "choice", selected: CHOICE[ex.id] };
    case "gaps":
      return { kind: "gaps", answers: GAPS[ex.id] };
    case "order":
      return { kind: "order", order: ORDER[ex.id] };
    case "terminal": {
      let { fs, cwd } = startOf(ex);
      for (const c of TERMINAL[ex.id]) {
        const r = run(fs, cwd, c);
        fs = r.fs;
        cwd = r.cwd;
      }
      return { kind: "terminal", fs, cwd };
    }
  }
}

/** A plainly wrong answer to an exercise. */
function wrong(ex: Exercise): Answer {
  switch (ex.kind) {
    case "choice":
      return { kind: "choice", selected: ["zzz"] };
    case "gaps":
      return { kind: "gaps", answers: { g0: "nope" } };
    case "order":
      return { kind: "order", order: [...ORDER[ex.id]].reverse() };
    case "terminal": {
      const { fs, cwd } = startOf(ex);
      return { kind: "terminal", fs, cwd };
    }
  }
}

describe("course data", () => {
  test("ids are unique and every exercise has a known solution", () => {
    const ids = all.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const ex of all) {
      const known =
        CHOICE[ex.id] ?? GAPS[ex.id] ?? ORDER[ex.id] ?? TERMINAL[ex.id];
      expect(known, ex.id).toBeDefined();
    }
  });
  test("lessons mix the four kinds and end with the practice", () => {
    const kinds = new Set(all.map((e) => e.kind));
    expect([...kinds].sort()).toEqual(["choice", "gaps", "order", "terminal"]);
    for (const lesson of LESSONS) {
      expect(lesson.exercises.length).toBeGreaterThanOrEqual(3);
      expect(lesson.exercises[lesson.exercises.length - 1].kind).toBe(
        "terminal",
      );
      expect(lesson.theory.some((p) => p.kind === "code")).toBe(true);
    }
  });
  test("every exercise has hints, an explanation and a worth", () => {
    for (const ex of all) {
      expect(ex.hints.length, ex.id).toBeGreaterThan(0);
      expect(ex.explain.length, ex.id).toBeGreaterThan(5);
      expect(ex.xp, ex.id).toBeGreaterThan(0);
    }
  });
  test("the outline modules hold every lesson once", () => {
    const inModules = MODULES.flatMap((m) => m.lessons.map((l) => l.id));
    expect(inModules).toEqual(LESSONS.map((l) => l.id));
    expect(MODULES[0].lessons[0].xp).toBe(50);
    expect(TOTAL_XP).toBe(all.reduce((n, e) => n + e.xp, 0));
  });
  test("lessonAfter walks the course", () => {
    expect(lessonAfter("where")?.id).toBe("making");
    expect(lessonAfter("branches")).toBeNull();
    expect(lessonAfter("nope")).toBeNull();
    expect(lessonById("nope")).toBeUndefined();
  });
});

describe("checkers", () => {
  test("the right answer passes, a wrong one does not", () => {
    for (const ex of all) {
      const good = checkExercise(ex, solution(ex));
      expect(good.ok, `${ex.id} solved`).toBe(true);
      expect(good.message).toBe(ex.explain);
      const bad = checkExercise(ex, wrong(ex));
      expect(bad.ok, `${ex.id} wrong`).toBe(false);
      expect(bad.message).not.toBe(ex.explain);
    }
  });
  test("an answer for another kind of exercise never scores", () => {
    const choice = all.find((e) => e.kind === "choice")!;
    const r = checkExercise(choice, { kind: "order", order: [] });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/another exercise/);
  });
  test("an empty choice asks for an answer", () => {
    const choice = all.find((e) => e.kind === "choice")!;
    expect(
      checkExercise(choice, { kind: "choice", selected: [] }).message,
    ).toMatch(/Pick/);
  });
  test("gaps say how many are right, or ask to fill them", () => {
    const ex = all.find((e) => e.id === "making-3")!;
    const part = checkExercise(ex, {
      kind: "gaps",
      answers: { g0: "mkdir", g1: "x", g2: "cat" },
    });
    expect(part).toMatchObject({ ok: false, right: 2, total: 3 });
    expect(part.message).toMatch(/2 of 3/);
    expect(checkExercise(ex, { kind: "gaps", answers: {} }).message).toMatch(
      /Fill in/,
    );
  });
  test("a terminal reports the goals reached", () => {
    const ex = all.find((e) => e.id === "making-4")!;
    let { fs, cwd } = startOf(ex as never);
    const r = run(fs, cwd, "mkdir docs");
    fs = r.fs;
    const part = checkExercise(ex, { kind: "terminal", fs, cwd });
    expect(part).toMatchObject({ ok: false, right: 1, total: 3 });
    expect(part.message).toMatch(/1 of 3 goals/);
  });
  test("no terminal task starts already solved", () => {
    for (const ex of all) {
      if (ex.kind !== "terminal") continue;
      const { fs, cwd } = startOf(ex);
      expect(allMet(verify(fs, cwd, ex.goals)), ex.id).toBe(false);
    }
  });
  test("the setup of a terminal task builds the repository it promises", () => {
    const ex = all.find((e) => e.id === "branches-3")!;
    if (ex.kind !== "terminal") throw new Error("terminal expected");
    const { fs, cwd } = startOf(ex);
    expect(run(fs, cwd, "git log --oneline").out[0].text).toMatch(/Start$/);
    expect(
      run(fs, cwd, "git status")
        .out.map((l) => l.text)
        .join("\n"),
    ).toContain("On branch main");
  });
  test("any route to the goal counts, not a fixed command", () => {
    const ex = all.find((e) => e.id === "moving-3")!;
    if (ex.kind !== "terminal") throw new Error("terminal expected");
    let { fs, cwd } = startOf(ex);
    for (const c of ["cp draft.txt final.txt", "rm draft.txt", "rm -rf old"]) {
      const r = run(fs, cwd, c);
      fs = r.fs;
    }
    expect(checkExercise(ex, { kind: "terminal", fs, cwd }).ok).toBe(true);
  });
});

describe("progress", () => {
  test("solving gives XP once and counts the solve", () => {
    const first = solve(freshProgress(), "l", "e1", 20);
    expect(first.gained).toBe(20);
    expect(first.progress.xp).toBe(20);
    expect(first.progress.solved.l).toEqual(["e1"]);
    expect(isSolved(first.progress, "l", "e1")).toBe(true);
    const again = solve(first.progress, "l", "e1", 20);
    expect(again.gained).toBe(0);
    expect(again.progress).toBe(first.progress);
  });
  test("the first solve of a day grows the streak, the next ones do not", () => {
    const start = { ...freshProgress(), streak: 4 };
    const a = solve(start, "l", "e1", 5);
    expect(a.streakUp).toBe(true);
    expect(a.progress.streak).toBe(5);
    const b = solve(a.progress, "l", "e2", 5);
    expect(b.streakUp).toBe(false);
    expect(b.progress.streak).toBe(5);
  });
  test("crossing a level is reported", () => {
    const p = { ...freshProgress(), xp: 45 };
    const g = solve(p, "l", "e", 10);
    expect(g.levelUp).toBe(2);
    expect(solve(g.progress, "l", "f", 5).levelUp).toBe(0);
  });
  test("solvedCounts counts per lesson", () => {
    expect(
      solvedCounts({ ...freshProgress(), solved: { a: ["1", "2"], b: ["3"] } }),
    ).toEqual({
      a: 2,
      b: 1,
    });
  });
});

describe("views", () => {
  test("the seeded learner is level 2 with one lesson done", () => {
    expect(initial.xp.level).toBe(2);
    expect(initial.xp.streak).toBe(4);
    expect(initial.info).toMatchObject({
      done: 1,
      total: 6,
      nextId: "making",
      complete: false,
    });
    const outline = initial.modules[0].lessons.map((l) => l.status);
    expect(outline).toEqual(["done", "current", "open"]);
  });
  test("newSession scrambles an order exercise and canCheck follows the answers", () => {
    const order = all.find((e) => e.kind === "order")!;
    const s = newSession(order, 4);
    expect(s.ids).toHaveLength(4);
    expect(canCheck(order, s)).toBe(true);
    const choice = all.find((e) => e.kind === "choice")!;
    expect(canCheck(choice, newSession(choice, 1))).toBe(false);
    expect(canCheck(choice, { ...newSession(choice, 1), sel: ["a"] })).toBe(
      true,
    );
    const gaps = all.find((e) => e.kind === "gaps")!;
    expect(
      canCheck(gaps, { ...newSession(gaps, 1), answers: { g0: "  " } }),
    ).toBe(false);
    expect(
      canCheck(gaps, { ...newSession(gaps, 1), answers: { g0: "x" } }),
    ).toBe(true);
    expect(canCheck(undefined, s)).toBe(false);
    expect(
      canCheck(choice, {
        ...newSession(choice, 1),
        sel: ["a"],
        verdict: "correct",
      }),
    ).toBe(false);
  });
  test("answerOf picks the answer by kind", () => {
    const term = termFor(undefined);
    for (const ex of all) {
      expect(answerOf(ex, newSession(ex, 1), term).kind).toBe(ex.kind);
    }
  });
  test("termFor starts a terminal task where the task says", () => {
    const ex = all.find((e) => e.id === "commit-4")!;
    const t = termFor(ex);
    expect(t.cwd).toMatch(/blog$/);
    expect(t.lines.length).toBe(2);
    expect(termFor(undefined).lines).toEqual([]);
  });
  test("the lesson-complete cards", () => {
    const cards = doneCards({ gained: 39, hints: 1, wrong: 2, solved: 4 }, 4);
    expect(cards.map((c) => c.value)).toEqual(["+39", "4 of 4", "1"]);
    expect(
      doneCards({ gained: 0, hints: 0, wrong: 0, solved: 0 }, 3)[2].hint,
    ).toMatch(/none/);
  });
  test("exerciseOf maps stages to exercises", () => {
    const lesson = lessonById("making");
    expect(exerciseOf(lesson, 0)).toBeUndefined();
    expect(exerciseOf(lesson, 1)?.id).toBe("making-1");
    expect(exerciseOf(lesson, 99)).toBeUndefined();
  });
});

// ---- the whole course through the real handlers ----

/** Drive the component's handlers like the app would, applying the store effects. */
function player() {
  const page = new ItCourse();
  let state: CourseState = initial;
  const send = (id: string, payload?: unknown, event?: Message["event"]) => {
    const handler = (page as unknown as Record<string, unknown>)[id];
    if (typeof handler !== "function") throw new Error(`no handler ${id}`);
    const effects = handler.call(page, { id, payload, event }, state, {
      send: () => [],
    }) as Effect[];
    for (const e of effects) {
      const fx = e as unknown as {
        type: string;
        path?: string;
        value?: unknown;
      };
      if (fx.type === "set" && fx.path) {
        state = { ...state, [fx.path]: fx.value } as CourseState;
      }
    }
  };
  return { send, get: () => state };
}

function solveInUi(p: ReturnType<typeof player>, ex: Exercise): void {
  const { send } = p;
  if (ex.kind === "choice") {
    for (const id of CHOICE[ex.id]) send("quiz.choose", id);
  } else if (ex.kind === "gaps") {
    for (const [id, value] of Object.entries(GAPS[ex.id]))
      send("gaps.fill", id, { type: "input", value });
  } else if (ex.kind === "order") {
    const want = ORDER[ex.id];
    for (let pass = 0; pass < 30; pass++) {
      const ids = p.get().session.ids;
      const wrongAt = want.findIndex((id, i) => ids[i] !== id);
      if (wrongAt < 0) break;
      send("order.move", [want[wrongAt], -1]);
    }
  } else {
    for (const c of TERMINAL[ex.id]) {
      send("term.type", undefined, { type: "input", value: c });
      send("term.submit");
    }
  }
}

describe("the course, played through", () => {
  test("a wrong check costs XP, a hint costs XP, a right one gives the rest", () => {
    const p = player();
    p.send("outline.open", "where");
    p.send("startExercises");
    expect(p.get().stage).toBe(1);
    // already solved in the seed: no XP at all
    p.send("quiz.choose", "b");
    p.send("foot.check");
    expect(p.get().session.verdict).toBe("correct");
    expect(p.get().session.awarded).toBe(0);
    expect(p.get().xp.xp).toBe(75);
  });

  test("a fresh learner earns exactly the worth minus hints and wrong checks", () => {
    const p = player();
    p.send("outline.open", "repo");
    p.send("startExercises");
    // repo-1 is worth 10: one wrong check, one hint -> 10 - 3 - 1 = 6
    p.send("quiz.choose", "a");
    p.send("foot.check");
    expect(p.get().session).toMatchObject({ verdict: "wrong", wrong: 1 });
    p.send("foot.hint");
    expect(p.get().footer.hints).toHaveLength(1);
    p.send("quiz.choose", "b");
    expect(p.get().session.verdict).toBe("");
    p.send("foot.check");
    expect(p.get().session).toMatchObject({ verdict: "correct", awarded: 6 });
    expect(p.get().xp.xp).toBe(81);
    expect(p.get().footer.xpText).toBe("+6 XP");
    // a second check changes nothing
    p.send("foot.check");
    expect(p.get().xp.xp).toBe(81);
  });

  test("every lesson can be finished, ending with a certificate", () => {
    const p = player();
    for (const lesson of LESSONS) {
      p.send("outline.open", lesson.id);
      expect(p.get().screen).toBe("lesson");
      p.send("startExercises");
      lesson.exercises.forEach((ex, i) => {
        expect(p.get().stage).toBe(i + 1);
        expect(p.get().exKind).toBe(ex.kind);
        solveInUi(p, ex);
        p.send("foot.check");
        expect(p.get().session.verdict, ex.id).toBe("correct");
        p.send("foot.next");
      });
      expect(p.get().screen).toBe("done");
    }
    const s = p.get();
    expect(s.info).toMatchObject({
      complete: true,
      done: 6,
      total: 6,
      pct: 100,
    });
    expect(s.doneView.courseDone).toBe(true);
    expect(courseProgress(MODULES, solvedCounts(s.progress)).pct).toBe(100);
    // the seed had 75 XP of the course, the rest was earned now
    expect(s.progress.xp).toBe(TOTAL_XP);
    expect(levelOf(s.progress.xp)).toBe(s.xp.level);
    p.send("openCertificate");
    expect(p.get().screen).toBe("certificate");
    expect(p.get().cert.course).toBe(COURSE.title);
    p.send("nameInput", undefined, { type: "input", value: "Ada Lovelace" });
    expect(p.get().cert.name).toBe("Ada Lovelace");
    expect(p.get().cert.facts.map((f) => f.value)).toEqual([
      String(TOTAL_XP),
      String(s.xp.level),
      "6 of 6",
    ]);
  });

  test("the terminal keeps its goals up to date and can be reset", () => {
    const p = player();
    p.send("outline.open", "making");
    p.send("startExercises");
    for (let i = 0; i < 3; i++) p.send("foot.next");
    expect(p.get().exKind).toBe("terminal");
    expect(p.get().goals.filter((g) => g.ok)).toHaveLength(0);
    p.send("term.type", undefined, { type: "input", value: "mkdir docs" });
    p.send("term.submit");
    expect(p.get().goals.filter((g) => g.ok)).toHaveLength(1);
    expect(p.get().term.runs).toBe(1);
    p.send("foot.reset");
    expect(p.get().goals.filter((g) => g.ok)).toHaveLength(0);
    expect(p.get().term.runs).toBe(0);
  });

  test("the lesson text can be shown again while practising", () => {
    const p = player();
    p.send("outline.open", "where");
    p.send("startExercises");
    expect(p.get().showTheory).toBe(false);
    p.send("toggleTheory");
    expect(p.get().showTheory).toBe(true);
    p.send("backToCourse");
    expect(p.get().screen).toBe("course");
  });

  test("the outline folds and the course continues where it stopped", () => {
    const p = player();
    p.send("outline.toggle", "shell");
    expect(p.get().modules[0].open).toBe(false);
    p.send("continueCourse");
    expect(p.get().lessonId).toBe("making");
  });
});
