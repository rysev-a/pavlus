import { describe, expect, test } from "vitest";
import {
  displayName,
  props as certProps,
  serialOf,
} from "../blocks/certificate/certificate.ts";
import { footerProps } from "../blocks/exercise-footer/footer.ts";
import {
  checkGaps,
  gapProps,
  normalize,
  parseGaps,
  solutionOf,
} from "../blocks/exercise-gaps/gaps.ts";
import {
  type OrderExercise,
  checkOrder,
  moveItem,
  orderProps,
  scramble,
  seeded,
  shuffleSeeded,
} from "../blocks/exercise-order/order.ts";
import {
  type ChoiceExercise,
  checkChoice,
  choiceProps,
  isMultiple,
  toggleChoice,
} from "../blocks/exercise-quiz/quiz.ts";
import {
  type OutlineModule,
  buildOutline,
  courseProgress,
  exercisePct,
  nextLesson,
  toggleModule,
} from "../blocks/lesson-outline/outline.ts";
import {
  HINT_COST,
  awardXp,
  levelOf,
  levelTitle,
  xpAt,
  xpProps,
} from "../blocks/xp-bar/xp.ts";

describe("xp and levels", () => {
  test("the XP a level asks for grows", () => {
    expect([1, 2, 3, 4].map(xpAt)).toEqual([0, 50, 150, 300]);
  });
  test("levelOf follows the thresholds", () => {
    expect(levelOf(0)).toBe(1);
    expect(levelOf(49)).toBe(1);
    expect(levelOf(50)).toBe(2);
    expect(levelOf(149)).toBe(2);
    expect(levelOf(150)).toBe(3);
    expect(levelOf(300)).toBe(4);
  });
  test("level titles stop at the last one", () => {
    expect(levelTitle(1)).toBe("Newcomer");
    expect(levelTitle(99)).toBe("Guru");
  });
  test("awardXp takes off hints and wrong checks but keeps a floor", () => {
    expect(awardXp(20, 0, 0)).toBe(20);
    expect(awardXp(20, 1, 0)).toBe(20 - HINT_COST);
    expect(awardXp(20, 0, 2)).toBe(18);
    expect(awardXp(20, 2, 3)).toBe(11);
    expect(awardXp(20, 9, 9)).toBe(5);
    expect(awardXp(2, 5, 5)).toBe(1);
  });
  test("xpProps works out the bar", () => {
    const p = xpProps(120, 4);
    expect(p).toMatchObject({
      level: 2,
      into: 70,
      need: 100,
      pct: 70,
      toNext: 30,
      streak: 4,
      streakLabel: "4 days",
    });
    expect(xpProps(0, 0).streakLabel).toBe("No streak yet");
    expect(xpProps(0, 1).streakLabel).toBe("1 day");
    expect(xpProps(50, 0)).toMatchObject({ level: 2, into: 0, pct: 0 });
  });
});

describe("exercise: multiple choice", () => {
  const single: ChoiceExercise = {
    prompt: "?",
    options: [
      { id: "a", text: "A" },
      { id: "b", text: "B" },
      { id: "c", text: "C" },
    ],
    correct: ["b"],
  };
  const multi: ChoiceExercise = { ...single, correct: ["a", "c"] };

  test("single choice replaces, several toggle in option order", () => {
    expect(isMultiple(single)).toBe(false);
    expect(toggleChoice(single, ["a"], "b")).toEqual(["b"]);
    expect(isMultiple(multi)).toBe(true);
    expect(toggleChoice(multi, ["c"], "a")).toEqual(["a", "c"]);
    expect(toggleChoice(multi, ["a", "c"], "a")).toEqual(["c"]);
    expect(toggleChoice(multi, ["a"], "zzz")).toEqual(["a"]);
  });
  test("checkChoice needs exactly the right set", () => {
    expect(checkChoice(single, ["b"])).toBe(true);
    expect(checkChoice(single, ["a"])).toBe(false);
    expect(checkChoice(single, [])).toBe(false);
    expect(checkChoice(multi, ["c", "a"])).toBe(true);
    expect(checkChoice(multi, ["a"])).toBe(false);
    expect(checkChoice(multi, ["a", "b", "c"])).toBe(false);
  });
  test("a failed check marks the wrong picks but not the answer", () => {
    const p = choiceProps(multi, ["a", "b"], "wrong");
    expect(p.options.map((o) => o.mark)).toEqual(["", "wrong", ""]);
    expect(p.locked).toBe(false);
  });
  test("a solved exercise marks the right ones and locks", () => {
    const p = choiceProps(single, ["b"], "correct");
    expect(p.options.map((o) => o.mark)).toEqual(["", "correct", ""]);
    expect(p.locked).toBe(true);
    expect(choiceProps(single, [], "").options.every((o) => !o.selected)).toBe(
      true,
    );
  });
});

describe("exercise: gaps", () => {
  const template = 'git [[commit|ci]] -m "x"\nthen [[push]]';
  test("parseGaps splits text, gaps and line breaks", () => {
    const { segments, gaps } = parseGaps(template);
    expect(segments.map((s) => s.kind)).toEqual([
      "text",
      "gap",
      "text",
      "br",
      "text",
      "gap",
    ]);
    expect(gaps).toEqual([
      { id: "g0", accepted: ["commit", "ci"] },
      { id: "g1", accepted: ["push"] },
    ]);
  });
  test("normalize trims and collapses spaces", () => {
    expect(normalize("  git   add  ")).toBe("git add");
  });
  test("checkGaps accepts alternatives and marks each gap", () => {
    const { gaps } = parseGaps(template);
    expect(checkGaps(gaps, { g0: "ci", g1: "push" })).toMatchObject({
      ok: true,
      right: 2,
    });
    const r = checkGaps(gaps, { g0: "commits", g1: "" });
    expect(r.ok).toBe(false);
    expect(r.marks).toEqual({ g0: "bad", g1: "empty" });
    expect(checkGaps(gaps, { g0: " commit ", g1: "push" }).ok).toBe(true);
  });
  test("answers are case sensitive", () => {
    const { gaps } = parseGaps("[[ls]]");
    expect(checkGaps(gaps, { g0: "LS" }).ok).toBe(false);
  });
  test("a template without gaps is never solved", () => {
    expect(checkGaps([], {}).ok).toBe(false);
  });
  test("gapProps carries values, widths and marks", () => {
    const ex = { prompt: "p", template };
    const props = gapProps(ex, { g0: "ci" }, { g0: "ok" }, false);
    const gap = props.segments.find((s) => s.id === "g0")!;
    expect(gap).toMatchObject({ value: "ci", mark: "ok", width: 8 });
    expect(props.segments.find((s) => s.id === "g1")!.value).toBe("");
  });
  test("solutionOf gives the first accepted answer", () => {
    expect(solutionOf({ prompt: "", template })).toEqual({
      g0: "commit",
      g1: "push",
    });
  });
});

describe("exercise: order", () => {
  const ex: OrderExercise = {
    prompt: "?",
    items: [
      { id: "a", text: "A" },
      { id: "b", text: "B" },
      { id: "c", text: "C" },
      { id: "d", text: "D" },
    ],
    alternatives: [["a", "c", "b", "d"]],
  };
  test("the seeded generator repeats", () => {
    const a = seeded(5);
    const b = seeded(5);
    expect([a(), a()]).toEqual([b(), b()]);
    const x = a();
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x).toBeLessThan(1);
  });
  test("shuffleSeeded keeps the items and does not change the input", () => {
    const list = [1, 2, 3, 4, 5];
    const out = shuffleSeeded(list, 9);
    expect([...out].sort()).toEqual(list);
    expect(list).toEqual([1, 2, 3, 4, 5]);
    expect(shuffleSeeded(list, 9)).toEqual(out);
  });
  test("scramble never starts solved, for any seed", () => {
    for (let seed = 0; seed < 60; seed++) {
      const order = scramble(ex, seed);
      expect([...order].sort()).toEqual(["a", "b", "c", "d"]);
      expect(checkOrder(ex, order)).toBe(false);
    }
  });
  test("moveItem swaps neighbours and stops at the ends", () => {
    expect(moveItem(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
    expect(moveItem(["a", "b", "c"], "b", 1)).toEqual(["a", "c", "b"]);
    expect(moveItem(["a", "b", "c"], "a", -1)).toEqual(["a", "b", "c"]);
    expect(moveItem(["a", "b", "c"], "c", 1)).toEqual(["a", "b", "c"]);
    expect(moveItem(["a", "b", "c"], "x", 1)).toEqual(["a", "b", "c"]);
  });
  test("checkOrder accepts the order and its alternatives", () => {
    expect(checkOrder(ex, ["a", "b", "c", "d"])).toBe(true);
    expect(checkOrder(ex, ["a", "c", "b", "d"])).toBe(true);
    expect(checkOrder(ex, ["b", "a", "c", "d"])).toBe(false);
  });
  test("orderProps numbers the rows and marks them after a check", () => {
    const p = orderProps(ex, ["b", "a", "c", "d"], true, false);
    expect(p.rows.map((r) => r.pos)).toEqual([1, 2, 3, 4]);
    expect(p.rows.map((r) => r.mark)).toEqual(["bad", "bad", "ok", "ok"]);
    expect(p.rows[0].first).toBe(true);
    expect(p.rows[3].last).toBe(true);
    expect(
      orderProps(ex, ["b", "a", "c", "d"], false, false).rows[0].mark,
    ).toBe("");
  });
});

describe("exercise footer", () => {
  test("hints shown so far and the ones left", () => {
    const p = footerProps({
      status: "",
      hints: ["a", "b", "c"],
      hintsShown: 2,
    });
    expect(p.hints.map((h) => h.text)).toEqual(["a", "b"]);
    expect(p.hintsLeft).toBe(1);
    expect(p.hintLabel).toBe(`Hint (-${HINT_COST} XP)`);
    expect(p.checkLabel).toBe("Check");
    expect(p.xpText).toBe("");
  });
  test("a solved exercise shows its XP and no more hints", () => {
    const p = footerProps({
      status: "correct",
      hints: ["a", "b"],
      hintsShown: 0,
      xp: 12,
      last: true,
    });
    expect(p.xpText).toBe("+12 XP");
    expect(p.hintsLeft).toBe(0);
    expect(p.nextLabel).toBe("Finish lesson");
    expect(
      footerProps({ status: "", hints: [], hintsShown: 5 }).nextLabel,
    ).toBe("Next exercise");
  });
  test("more hints asked than there are", () => {
    const p = footerProps({ status: "wrong", hints: ["a"], hintsShown: 4 });
    expect(p.hints).toHaveLength(1);
    expect(p.hintsLeft).toBe(0);
  });
});

describe("lesson outline", () => {
  const modules: OutlineModule[] = [
    {
      id: "m1",
      title: "One",
      summary: "",
      lessons: [
        { id: "l1", title: "L1", exercises: 3, xp: 30 },
        { id: "l2", title: "L2", exercises: 2, xp: 20 },
      ],
    },
    {
      id: "m2",
      title: "Two",
      summary: "",
      lessons: [{ id: "l3", title: "L3", exercises: 1, xp: 10 }],
    },
  ];
  test("the next lesson is the first unfinished one", () => {
    expect(nextLesson(modules, {})).toBe("l1");
    expect(nextLesson(modules, { l1: 3 })).toBe("l2");
    expect(nextLesson(modules, { l1: 3, l2: 2, l3: 1 })).toBeNull();
  });
  test("progress counts finished lessons", () => {
    expect(courseProgress(modules, { l1: 3, l2: 1 })).toEqual({
      done: 1,
      total: 3,
      pct: 33,
    });
    expect(exercisePct(modules, { l1: 3, l2: 1 })).toBe(67);
    expect(exercisePct(modules, { l1: 99 })).toBe(50);
  });
  test("statuses, meta and module progress", () => {
    const out = buildOutline(modules, { l1: 3, l2: 1 }, ["m1"], ["l3"]);
    expect(out[0].lessons.map((l) => l.status)).toEqual(["done", "current"]);
    expect(out[1].lessons[0].status).toBe("locked");
    expect(out[0]).toMatchObject({
      open: true,
      done: 1,
      total: 2,
      pct: 50,
      complete: false,
    });
    expect(out[1].open).toBe(false);
    expect(out[0].lessons[0].meta).toBe("3 exercises · 30 XP");
    expect(out[0].lessons[1].meta).toBe("1 of 2 exercises solved");
    expect(out[0].lessons[1].pct).toBe(50);
    expect(buildOutline(modules, { l1: 3, l2: 2 }, [])[0].complete).toBe(true);
  });
  test("toggleModule opens and closes", () => {
    expect(toggleModule([], "m1")).toEqual(["m1"]);
    expect(toggleModule(["m1", "m2"], "m1")).toEqual(["m2"]);
  });
});

describe("certificate", () => {
  test("the serial is stable and depends on the name and the course", () => {
    expect(serialOf("Ann", "Git")).toBe(serialOf(" ann ", "Git"));
    expect(serialOf("Ann", "Git")).not.toBe(serialOf("Bob", "Git"));
    expect(serialOf("Ann", "Git")).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}$/);
  });
  test("a blank name gets a fallback", () => {
    expect(displayName("   ")).toBe("A curious learner");
    expect(displayName("  Ann   Lee ")).toBe("Ann Lee");
    expect(certProps("", "Git", "1 May 2026", []).name).toBe(
      "A curious learner",
    );
  });
});
