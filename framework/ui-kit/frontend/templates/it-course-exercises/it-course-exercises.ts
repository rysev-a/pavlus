// An interactive IT course: an outline with progress, lessons with theory and
// four kinds of exercises (choice, gaps, order, a real terminal), hints that cost
// XP, a streak, a lesson-complete screen and a certificate. Every check is a
// pure function (checks.ts); the template only moves the state.
import { Component, type Effect, type Message } from "@pavlus/frontend";
import {
  DomPlugin,
  storeEffector as store,
  timeEffector as time,
} from "@pavlus/frontend/plugins";
import {
  type CertificateProps,
  props as certificateProps,
} from "../../blocks/certificate/certificate.ts";
import {
  type CodeLine,
  codeLines,
} from "../../blocks/code-block/code-block.ts";
import {
  type FooterProps,
  footerProps,
} from "../../blocks/exercise-footer/footer.ts";
import {
  checkGaps,
  type GapMark,
  type GapProps,
  gapProps,
  parseGaps,
} from "../../blocks/exercise-gaps/gaps.ts";
import {
  moveItem,
  type OrderProps,
  orderProps,
  scramble,
} from "../../blocks/exercise-order/order.ts";
import {
  type ChoiceProps,
  choiceProps,
  toggleChoice,
  type Verdict,
} from "../../blocks/exercise-quiz/quiz.ts";
import {
  buildOutline,
  courseProgress,
  exercisePct,
  type ModuleView,
  nextLesson,
  toggleModule,
} from "../../blocks/lesson-outline/outline.ts";
import type { Card } from "../../blocks/stat-cards/cards.ts";
import { card } from "../../blocks/stat-cards/cards.ts";
import { HOME, makeFs } from "../../blocks/terminal-sim/fs.ts";
import { type GoalResult, verify } from "../../blocks/terminal-sim/goals.ts";
import {
  newTerm,
  promptOf,
  stepTerm,
  type Term,
} from "../../blocks/terminal-sim/session.ts";
import {
  awardXp,
  levelOf,
  levelTitle,
  type XpProps,
  xpProps,
} from "../../blocks/xp-bar/xp.ts";
import { type Answer, checkExercise, type Exercise } from "./checks.ts";
import {
  COURSE,
  LESSONS,
  type Lesson,
  lessonAfter,
  lessonById,
  MODULES,
  startOf,
} from "./course-data.ts";
import view from "./it-course-exercises.pavlus";
import {
  freshProgress,
  isSolved,
  type Progress,
  solve,
  solvedCounts,
} from "./progress.ts";

export const TERM_ID = "course-term-input";

/** What happens in the exercise on the screen. */
export interface Session {
  sel: string[];
  answers: Record<string, string>;
  ids: string[];
  hints: number;
  wrong: number;
  verdict: Verdict;
  feedback: string;
  awarded: number;
  marks: Record<string, GapMark>;
  orderChecked: boolean;
}

export interface LessonStats {
  gained: number;
  hints: number;
  wrong: number;
  solved: number;
}

export interface Core {
  screen: "course" | "lesson" | "done" | "certificate";
  lessonId: string;
  /** 0 is the theory, 1 and up are the exercises. */
  stage: number;
  showTheory: boolean;
  progress: Progress;
  openModules: string[];
  session: Session;
  stats: LessonStats;
  name: string;
}

export interface TheoryView {
  id: number;
  kind: "p" | "h" | "list" | "code" | "note";
  text: string;
  items: string[];
  lines: CodeLine[];
  title: string;
  lang: string;
  tone: string;
}

export interface LessonView {
  id: string;
  title: string;
  summary: string;
  moduleTitle: string;
  position: string;
  theory: TheoryView[];
  inTheory: boolean;
  stepText: string;
  stepPct: number;
  kindLabel: string;
  worth: string;
  task: string;
}

export interface DoneView {
  title: string;
  text: string;
  cards: Card[];
  nextTitle: string;
  courseDone: boolean;
}

export interface CourseInfo {
  done: number;
  total: number;
  pct: number;
  complete: boolean;
  nextId: string;
  nextTitle: string;
  doneText: string;
}

export interface Views {
  xp: XpProps;
  modules: ModuleView[];
  info: CourseInfo;
  lesson: LessonView;
  exKind: string;
  choice: ChoiceProps;
  gaps: GapProps;
  order: OrderProps;
  goals: GoalResult[];
  footer: FooterProps;
  doneView: DoneView;
  cert: CertificateProps;
}

export interface CourseState extends Core, Views {
  term: Term;
  prompt: string;
  toast: string;
  seed: number;
  courseTitle: string;
  courseBlurb: string;
}

const KIND_LABEL: Record<string, string> = {
  choice: "Multiple choice",
  gaps: "Fill the gaps",
  order: "Put in order",
  terminal: "Terminal task",
};

export const exerciseOf = (
  lesson: Lesson | undefined,
  stage: number,
): Exercise | undefined =>
  lesson && stage > 0 ? lesson.exercises[stage - 1] : undefined;

/** Pure: a fresh session for an exercise. */
export function newSession(ex: Exercise | undefined, seed: number): Session {
  return {
    sel: [],
    answers: {},
    ids: ex?.kind === "order" ? scramble(ex.ex, seed) : [],
    hints: 0,
    wrong: 0,
    verdict: "",
    feedback: "",
    awarded: 0,
    marks: {},
    orderChecked: false,
  };
}

/** Pure: the terminal of an exercise (an empty one for the other kinds). */
export function termFor(ex: Exercise | undefined): Term {
  if (ex?.kind === "terminal") {
    const start = startOf(ex);
    return newTerm(start.fs, start.cwd, ex.intro, {
      user: "learner",
      host: "course",
    });
  }
  return newTerm(makeFs({}), HOME, []);
}

const NO_GAPS = { prompt: "", template: "" };
const EMPTY_CHOICE = choiceProps(
  { prompt: "", options: [], correct: [] },
  [],
  "",
);
const EMPTY_GAPS = gapProps(NO_GAPS, {}, {}, false);
const EMPTY_ORDER = orderProps({ prompt: "", items: [] }, [], false, false);

/** Pure: the answer of the exercise on the screen, to check it. */
export function answerOf(ex: Exercise, s: Session, term: Term): Answer {
  switch (ex.kind) {
    case "choice":
      return { kind: "choice", selected: s.sel };
    case "gaps":
      return { kind: "gaps", answers: s.answers };
    case "order":
      return { kind: "order", order: s.ids };
    case "terminal":
      return { kind: "terminal", fs: term.fs, cwd: term.cwd };
  }
}

/** Pure: can the Check button work yet? */
export function canCheck(ex: Exercise | undefined, s: Session): boolean {
  if (!ex || s.verdict === "correct") return false;
  if (ex.kind === "choice") return s.sel.length > 0;
  if (ex.kind === "gaps")
    return Object.values(s.answers).some((a) => a.trim() !== "");
  return true;
}

/** Pure: the numbers on the "lesson complete" screen. */
export function doneCards(stats: LessonStats, total: number): Card[] {
  return [
    card("gained", "XP earned", `+${stats.gained}`, {
      icon: "k-ai-sparkles",
      tone: "success",
      hint: "in this lesson",
    }),
    card("solved", "Exercises", `${stats.solved} of ${total}`, {
      icon: "k-ai-clipboard",
      tone: "info",
      hint: "solved this time",
    }),
    card("hints", "Hints used", String(stats.hints), {
      icon: "k-ai-flag",
      tone: stats.hints > 0 ? "warning" : "default",
      hint: stats.hints > 0 ? "each cost 3 XP" : "none, well done",
    }),
  ];
}

/** Pure: every view the screen shows, from the core and the terminal. */
export function derive(c: Core, term: Term): Views {
  const lesson = lessonById(c.lessonId);
  const ex = exerciseOf(lesson, c.stage);
  const counts = solvedCounts(c.progress);
  const prog = courseProgress(MODULES, counts);
  const next = nextLesson(MODULES, counts);
  const nextLessonData = next ? lessonById(next) : undefined;
  const n = lesson?.exercises.length ?? 0;
  const s = c.session;
  const solvedNow = s.verdict === "correct";
  const lessonIndex = lesson ? LESSONS.indexOf(lesson) : 0;

  const choice =
    ex?.kind === "choice" ? choiceProps(ex.ex, s.sel, s.verdict) : EMPTY_CHOICE;
  const gaps =
    ex?.kind === "gaps"
      ? gapProps(ex.ex, s.answers, s.marks, solvedNow)
      : EMPTY_GAPS;
  const order =
    ex?.kind === "order"
      ? orderProps(ex.ex, s.ids, s.orderChecked && !solvedNow, solvedNow)
      : EMPTY_ORDER;

  const lessonView: LessonView = {
    id: lesson?.id ?? "",
    title: lesson?.title ?? "",
    summary: lesson?.summary ?? "",
    moduleTitle: MODULES.find((m) => m.id === lesson?.module)?.title ?? "",
    position: `Lesson ${lessonIndex + 1} of ${LESSONS.length}`,
    theory: (lesson?.theory ?? []).map((p, id) => ({
      id,
      kind: p.kind,
      text: "text" in p ? p.text : "",
      items: p.kind === "list" ? p.items : [],
      lines: p.kind === "code" ? codeLines(p.code, p.lang) : [],
      title: p.kind === "code" || p.kind === "note" ? p.title : "",
      lang: p.kind === "code" ? p.lang : "",
      tone: p.kind === "note" ? p.tone : "",
    })),
    inTheory: c.stage === 0,
    stepText: c.stage === 0 ? "Read the lesson" : `Exercise ${c.stage} of ${n}`,
    stepPct:
      n === 0
        ? 0
        : Math.round(
            ((c.stage === 0 ? 0 : c.stage - 1 + (solvedNow ? 1 : 0)) / n) * 100,
          ),
    kindLabel: ex ? KIND_LABEL[ex.kind] : "",
    worth: ex
      ? isSolved(c.progress, c.lessonId, ex.id)
        ? "solved before"
        : `worth ${ex.xp} XP`
      : "",
    task: ex?.kind === "terminal" ? ex.prompt : "",
  };

  const footer = footerProps({
    status: s.verdict,
    feedback: s.feedback,
    hints: ex?.hints ?? [],
    hintsShown: s.hints,
    xp: solvedNow && s.awarded > 0 ? s.awarded : undefined,
    canCheck: canCheck(ex, s),
    checkLabel: ex?.kind === "terminal" ? "Check my work" : "Check",
    last: c.stage === n,
    resetLabel: ex?.kind === "terminal" ? "Reset the terminal" : "",
  });

  const complete = prog.done === prog.total;
  return {
    xp: xpProps(c.progress.xp, c.progress.streak),
    modules: buildOutline(MODULES, counts, c.openModules),
    info: {
      done: prog.done,
      total: prog.total,
      pct: exercisePct(MODULES, counts),
      complete,
      nextId: next ?? "",
      nextTitle: nextLessonData?.title ?? "",
      doneText: `${prog.done} of ${prog.total} lessons`,
    },
    lesson: lessonView,
    exKind: ex?.kind ?? "",
    choice,
    gaps,
    order,
    goals: ex?.kind === "terminal" ? verify(term.fs, term.cwd, ex.goals) : [],
    footer,
    doneView: {
      title: complete ? "Course complete" : "Lesson complete",
      text: lesson
        ? complete
          ? `You finished ${COURSE.title}. Your certificate is ready.`
          : `${lesson.title} is done. ${lessonAfter(lesson.id) ? `Next: ${lessonAfter(lesson.id)?.title}.` : ""}`
        : "",
      cards: doneCards(c.stats, n),
      nextTitle: lessonAfter(c.lessonId)?.title ?? "",
      courseDone: complete,
    },
    cert: certificateProps(c.name, COURSE.title, COURSE.date, [
      { label: "XP", value: String(c.progress.xp) },
      { label: "Level", value: String(levelOf(c.progress.xp)) },
      { label: "Lessons", value: `${prog.done} of ${prog.total}` },
    ]),
  };
}

/** The learner starts with the first lesson done and the second one half done. */
const seedProgress = (): Progress => ({
  xp: 75,
  streak: 4,
  today: false,
  solved: {
    where: ["where-1", "where-2", "where-3"],
    making: ["making-1", "making-2"],
  },
});

const core: Core = {
  screen: "course",
  lessonId: "making",
  stage: 0,
  showTheory: false,
  progress: seedProgress(),
  openModules: ["shell", "git"],
  session: newSession(undefined, 0),
  stats: { gained: 0, hints: 0, wrong: 0, solved: 0 },
  name: "Alex Rivera",
};

const startTerm = termFor(undefined);

export const initial: CourseState = {
  ...core,
  ...derive(core, startTerm),
  term: startTerm,
  prompt: promptOf(startTerm),
  toast: "",
  seed: 1,
  courseTitle: COURSE.title,
  courseBlurb: COURSE.blurb,
};

const patch = (values: Record<string, unknown>): Effect[] =>
  Object.entries(values).map(([k, v]) => store.set(k, v));

export class ItCourse extends Component<CourseState> {
  view = view;

  /** The page was left: the toast timer stops. */
  leave(): Effect[] {
    return [time.cancelAll()];
  }

  /** Change the core and show everything again. */
  _commit(
    state: CourseState,
    changes: Partial<Core>,
    more: Record<string, unknown> = {},
  ): Effect[] {
    const next = { ...state, ...changes } as CourseState;
    const term = (more.term as Term | undefined) ?? state.term;
    return patch({ ...changes, ...derive(next, term), ...more });
  }

  _toast(text: string): Effect[] {
    return [
      store.set("toast", text),
      time.setTimeout("toast", 4200, "clearToast"),
    ];
  }

  clearToast(): Effect[] {
    return [store.set("toast", "")];
  }

  // ---- the course

  _open(state: CourseState, id: string): Effect[] {
    const lesson = lessonById(id);
    if (!lesson) return [];
    const ex = lesson.exercises[0];
    const term = termFor(undefined);
    return this._commit(
      state,
      {
        screen: "lesson",
        lessonId: id,
        stage: 0,
        showTheory: false,
        session: newSession(ex, state.seed),
        stats: { gained: 0, hints: 0, wrong: 0, solved: 0 },
      },
      { term, prompt: promptOf(term), seed: state.seed + 1 },
    );
  }

  "outline.open"(msg: Message, state: CourseState): Effect[] {
    return this._open(state, msg.payload as string);
  }

  "outline.toggle"(msg: Message, state: CourseState): Effect[] {
    return this._commit(state, {
      openModules: toggleModule(state.openModules, msg.payload as string),
    });
  }

  continueCourse(_msg: Message, state: CourseState): Effect[] {
    return this._open(state, state.info.nextId || state.lessonId);
  }

  backToCourse(_msg: Message, state: CourseState): Effect[] {
    return this._commit(state, { screen: "course" });
  }

  toggleTheory(_msg: Message, state: CourseState): Effect[] {
    return this._commit(state, { showTheory: !state.showTheory });
  }

  // ---- exercises

  /** Show exercise number `stage` of the open lesson, or the theory for 0. */
  _stage(state: CourseState, stage: number): Effect[] {
    const lesson = lessonById(state.lessonId);
    const ex = exerciseOf(lesson, stage);
    const term = termFor(ex);
    return this._commit(
      state,
      {
        stage,
        showTheory: false,
        session: newSession(ex, state.seed),
      },
      { term, prompt: promptOf(term), seed: state.seed + 1 },
    );
  }

  startExercises(_msg: Message, state: CourseState): Effect[] {
    return this._stage(state, 1);
  }

  "quiz.choose"(msg: Message, state: CourseState): Effect[] {
    const ex = exerciseOf(lessonById(state.lessonId), state.stage);
    if (ex?.kind !== "choice" || state.session.verdict === "correct") return [];
    const sel = toggleChoice(ex.ex, state.session.sel, msg.payload as string);
    return this._commit(state, {
      session: { ...state.session, sel, verdict: "", feedback: "" },
    });
  }

  "gaps.fill"(msg: Message, state: CourseState): Effect[] {
    if (state.session.verdict === "correct") return [];
    const answers = {
      ...state.session.answers,
      [msg.payload as string]: msg.event?.value ?? "",
    };
    return this._commit(state, {
      session: {
        ...state.session,
        answers,
        verdict: "",
        feedback: "",
        marks: {},
      },
    });
  }

  "order.move"(msg: Message, state: CourseState): Effect[] {
    if (state.session.verdict === "correct") return [];
    const [id, dir] = msg.payload as [string, -1 | 1];
    return this._commit(state, {
      session: {
        ...state.session,
        ids: moveItem(state.session.ids, id, dir),
        verdict: "",
        feedback: "",
        orderChecked: false,
      },
    });
  }

  // the terminal: the keys only touch the terminal, a command also the goals
  _term(
    state: CourseState,
    kind: "type" | "submit" | "key",
    msg: Message,
  ): Effect[] {
    const term = stepTerm(state.term, kind, msg.event);
    if (kind === "submit") {
      return this._commit(state, {}, { term, prompt: promptOf(term) });
    }
    return patch({ term, prompt: promptOf(term) });
  }

  "term.type"(msg: Message, state: CourseState): Effect[] {
    return this._term(state, "type", msg);
  }
  "term.submit"(msg: Message, state: CourseState): Effect[] {
    return this._term(state, "submit", msg);
  }
  "term.key"(msg: Message, state: CourseState): Effect[] {
    return this._term(state, "key", msg);
  }
  "term.focus"(): Effect[] {
    return [DomPlugin.focus(`#${TERM_ID}`)];
  }

  // the footer
  "foot.hint"(_msg: Message, state: CourseState): Effect[] {
    const ex = exerciseOf(lessonById(state.lessonId), state.stage);
    if (!ex || state.session.hints >= ex.hints.length) return [];
    return this._commit(state, {
      session: { ...state.session, hints: state.session.hints + 1 },
      stats: { ...state.stats, hints: state.stats.hints + 1 },
    });
  }

  "foot.check"(_msg: Message, state: CourseState): Effect[] {
    const lesson = lessonById(state.lessonId);
    const ex = exerciseOf(lesson, state.stage);
    if (!lesson || !ex || state.session.verdict === "correct") return [];
    const s = state.session;
    const result = checkExercise(ex, answerOf(ex, s, state.term));
    if (!result.ok) {
      const marks =
        ex.kind === "gaps"
          ? checkGaps(parseGaps(ex.ex.template).gaps, s.answers).marks
          : s.marks;
      return this._commit(state, {
        session: {
          ...s,
          verdict: "wrong",
          feedback: result.message,
          wrong: s.wrong + 1,
          marks,
          orderChecked: ex.kind === "order",
        },
        stats: { ...state.stats, wrong: state.stats.wrong + 1 },
      });
    }
    const before = isSolved(state.progress, lesson.id, ex.id);
    const award = before ? 0 : awardXp(ex.xp, s.hints, s.wrong);
    const gain = solve(state.progress, lesson.id, ex.id, award);
    const toast = gain.levelUp
      ? `Level up! You are now level ${gain.levelUp}, ${levelTitle(gain.levelUp)}.`
      : gain.streakUp
        ? `Streak extended: ${gain.progress.streak} days in a row.`
        : "";
    return [
      ...this._commit(state, {
        progress: gain.progress,
        session: {
          ...s,
          verdict: "correct",
          feedback: before
            ? `${result.message} You solved this one before, so there is no new XP.`
            : result.message,
          awarded: gain.gained,
          marks:
            ex.kind === "gaps"
              ? checkGaps(parseGaps(ex.ex.template).gaps, s.answers).marks
              : s.marks,
        },
        stats: {
          ...state.stats,
          gained: state.stats.gained + gain.gained,
          solved: state.stats.solved + 1,
        },
      }),
      ...(toast ? this._toast(toast) : []),
    ];
  }

  "foot.next"(_msg: Message, state: CourseState): Effect[] {
    const lesson = lessonById(state.lessonId);
    if (!lesson) return [];
    if (state.stage < lesson.exercises.length)
      return this._stage(state, state.stage + 1);
    return this._commit(state, { screen: "done" });
  }

  "foot.reset"(_msg: Message, state: CourseState): Effect[] {
    const ex = exerciseOf(lessonById(state.lessonId), state.stage);
    if (ex?.kind !== "terminal") return [];
    const term = termFor(ex);
    return this._commit(
      state,
      { session: { ...state.session, verdict: "", feedback: "" } },
      { term, prompt: promptOf(term) },
    );
  }

  // ---- the end of a lesson and the certificate

  nextLessonNow(_msg: Message, state: CourseState): Effect[] {
    const next = lessonAfter(state.lessonId);
    return next
      ? this._open(state, next.id)
      : this._commit(state, { screen: "course" });
  }

  openCertificate(_msg: Message, state: CourseState): Effect[] {
    return this._commit(state, { screen: "certificate" });
  }

  nameInput(msg: Message, state: CourseState): Effect[] {
    return this._commit(state, { name: msg.event?.value ?? "" });
  }
}

export const page = new ItCourse();
