import { Component, type Effect, type Message } from "@pavlus/client";
import { storeEffector as store } from "@pavlus/client/plugins";
import { type Inline, parseInline } from "../blocks/docs-layout/docs.ts";
import { highlight, type Line } from "../source.ts";
import view from "./engine.pavlus";
import { engineEffector } from "./engine-plugin.ts";
import { PRESETS } from "./presets.ts";
import { STAGES } from "./reference.ts";
import {
  emptyTrace,
  type GLine,
  type SourceLine,
  type Trace,
} from "./trace.ts";
import type { StageId } from "./types.ts";

/** The stages in order, with what goes in and what comes out (for the strip at the top). */
export const STAGE_LIST: {
  id: StageId;
  title: string;
  takes: string;
  gives: string;
}[] = [
  {
    id: "source",
    title: "Source text and lines",
    takes: "template text",
    gives: "numbered lines",
  },
  {
    id: "ast",
    title: "Parsing lines into an AST",
    takes: "lines",
    gives: "AST",
  },
  {
    id: "expr",
    title: "Expressions",
    takes: "{…} text",
    gives: "expression trees",
  },
  {
    id: "analyze",
    title: "Dependency analysis",
    takes: "AST",
    gives: "reads per node",
  },
  {
    id: "codegen",
    title: "Code generation: the generator",
    takes: "AST + reads",
    gives: "code text",
  },
  { id: "render", title: "Generated render", takes: "state", gives: "vnodes" },
  {
    id: "diff",
    title: "Generated diff",
    takes: "prev, next",
    gives: "patches",
  },
  {
    id: "module",
    title: "The module: compileTemplate",
    takes: "code text",
    gives: "ES module",
  },
  {
    id: "instantiate",
    title: "From text to a function",
    takes: "code text",
    gives: "{ render, diff }",
  },
  {
    id: "run",
    title: "Running render and diff",
    takes: "states",
    gives: "vnodes + patches",
  },
  {
    id: "dom",
    title: "Applying patches: the DOM plugin",
    takes: "patches",
    gives: "DOM changes",
  },
];

interface StepView {
  n: number;
  title: string;
  runs: Inline[];
  code: Line[] | null;
}
export interface StageView {
  title: string;
  intro: Inline[][];
  steps: StepView[];
  functions: {
    name: string;
    file: string;
    kind: string;
    signature: string;
    runs: Inline[];
  }[];
  patterns: { text: string; runs: Inline[]; where: string }[];
  pitfalls: Inline[][];
  /** The reference is written (its sections are shown). */
  present: boolean;
  /** Whether the patterns and pitfalls sections have entries. */
  hasPatterns: boolean;
  hasPitfalls: boolean;
}

const LANG_FILE = {
  ts: "x.ts",
  pavlus: "x.pavlus",
  json: "x.ts",
  text: "x.txt",
} as const;

/** Pure: the reference of a stage, with its text cut into runs for the template. */
export function stageView(id: StageId): StageView {
  const doc = STAGES.find((s) => s.id === id);
  const title = STAGE_LIST.find((s) => s.id === id)?.title ?? "";
  if (!doc)
    return {
      title,
      intro: [],
      steps: [],
      functions: [],
      patterns: [],
      pitfalls: [],
      present: false,
      hasPatterns: false,
      hasPitfalls: false,
    };
  return {
    title: doc.title,
    intro: doc.intro.map(parseInline),
    steps: doc.steps.map((s, i) => ({
      n: i + 1,
      title: s.title,
      runs: parseInline(s.text),
      code: s.code ? highlight(LANG_FILE[s.lang ?? "ts"], s.code) : null,
    })),
    functions: doc.functions.map((f) => ({
      name: f.name,
      file: f.file,
      kind: f.kind,
      signature: f.signature,
      runs: parseInline(f.does),
    })),
    patterns: doc.patterns.map((p) => ({
      text: p.text,
      runs: parseInline(p.meaning),
      where: p.where,
    })),
    pitfalls: doc.pitfalls.map(parseInline),
    present: true,
    hasPatterns: doc.patterns.length > 0,
    hasPitfalls: doc.pitfalls.length > 0,
  };
}

export interface EngineState {
  tpl: string;
  prevState: string;
  nextState: string;
  preset: string;
  trace: Trace;
  status: "idle" | "running" | "failed";
  /** What the strip reads of `status` (no comparisons in templates). */
  running: boolean;
  stage: number;
  stages: {
    id: StageId;
    n: number;
    /** The index `go` takes (`n` is 1-based, for display). */
    idx: number;
    title: string;
    takes: string;
    gives: string;
    active: boolean;
    done: boolean;
  }[];
  stageId: StageId;
  /** The stage's number as the heading shows it. */
  stageNo: number;
  /** Which stage is shown, by id: the template reads one flag per branch. */
  stageIs: Record<StageId, boolean>;
  stageTitle: string;
  stageTakes: string;
  stageGives: string;
  ref: StageView;
  /** The template line the reader picked: its generated code is lit. */
  focus: number;
  presets: { id: string; name: string; active: boolean; inactive: boolean }[];
  hasPrev: boolean;
  hasNext: boolean;
  /** The pager's stage titles (`stages[stage - 1]` is not a template path). */
  prevTitle: string;
  nextTitle: string;
  /** The listings the template shows, with the picked line marked. */
  lines: (SourceLine & { hit: boolean })[];
  render: MarkedLine[];
  diff: MarkedLine[];
  module: MarkedLine[];
  body: MarkedLine[];
  /** Emptiness the template branches on (no `.length === 0` in templates). */
  noHelpers: boolean;
  noPatches: boolean;
  noMutations: boolean;
}

/** A generated line as GCode shows it: the marks of the picked template line. */
export interface MarkedLine extends GLine {
  /** Came from the picked template line. */
  hit: boolean;
  /** Came from some template line. */
  hasSrc: boolean;
  /** "T3" for a line of template line 3, "" for none. */
  srcLabel: string;
}

const marked = (lines: GLine[], focus: number): MarkedLine[] =>
  lines.map((l) => ({
    ...l,
    hit: l.src > 0 && l.src === focus,
    hasSrc: l.src > 0,
    srcLabel: l.src > 0 ? `T${l.src}` : "",
  }));

/** Every listing the template reads, from the trace and the picked line. */
function marksOf(trace: Trace, focus: number) {
  return {
    lines: trace.lines.map((l) => ({ ...l, hit: l.n === focus })),
    render: marked(trace.render, focus),
    diff: marked(trace.diff, focus),
    module: marked(trace.module, focus),
    body: marked(trace.newFunction.body, focus),
    noHelpers: trace.helpersUsed.length === 0,
    noPatches: trace.patches.length === 0,
    noMutations: trace.mutations.length === 0,
  };
}

/** The marks as effects: a child's writes go through `set`, one path each. */
const markSets = (trace: Trace, focus: number): Effect[] =>
  Object.entries(marksOf(trace, focus)).map(([k, v]) => store.set(k, v));

/** The status with the flag the template reads of it, kept in step. */
const statusSets = (status: EngineState["status"]): Effect[] => [
  store.set("status", status),
  store.set("running", status === "running"),
];

const navOf = (stage: number) => ({
  stages: STAGE_LIST.map((s, i) => ({
    ...s,
    n: i + 1,
    idx: i,
    active: i === stage,
    done: i < stage,
  })),
  stageId: STAGE_LIST[stage].id,
  stageNo: stage + 1,
  stageIs: Object.fromEntries(
    STAGE_LIST.map((s, i) => [s.id, i === stage]),
  ) as Record<StageId, boolean>,
  stageTitle: STAGE_LIST[stage].title,
  stageTakes: STAGE_LIST[stage].takes,
  stageGives: STAGE_LIST[stage].gives,
  ref: stageView(STAGE_LIST[stage].id),
  hasPrev: stage > 0,
  hasNext: stage < STAGE_LIST.length - 1,
  prevTitle: stage > 0 ? STAGE_LIST[stage - 1].title : "",
  nextTitle: stage < STAGE_LIST.length - 1 ? STAGE_LIST[stage + 1].title : "",
});

export function engineState(): EngineState {
  const p = PRESETS[0];
  const trace = emptyTrace();
  return {
    tpl: p.template,
    prevState: p.prev,
    nextState: p.next,
    preset: p.id,
    trace,
    status: "idle",
    running: false,
    stage: 0,
    focus: 0,
    presets: PRESETS.map((x) => ({
      id: x.id,
      name: x.name,
      active: x.id === p.id,
      inactive: x.id !== p.id,
    })),
    ...navOf(0),
    ...marksOf(trace, 0),
  };
}

/**
 * The Template engine page: a template and two states you can edit, and the
 * eleven stages from the text to the DOM updates, each run for real (the
 * `engine` plugin loads the compiler and calls `traceTemplate`) next to the
 * reference of the functions behind it.
 */
export class EnginePage extends Component<EngineState> {
  view = view;

  enter(_msg: Message, state: EngineState): Effect[] {
    return this._run(state.tpl, state.prevState, state.nextState);
  }

  _run(tpl: string, prev: string, next: string): Effect[] {
    return [
      ...statusSets("running"),
      engineEffector.trace(tpl, prev, next, "traced", "traceFailed"),
    ];
  }

  traced(msg: Message, state: EngineState): Effect[] {
    const trace = msg.payload as Trace;
    return [
      store.set("trace", trace),
      ...markSets(trace, state.focus),
      ...statusSets("idle"),
    ];
  }

  traceFailed(): Effect[] {
    return statusSets("failed");
  }

  /** Typing in one of the three editors. */
  edit(msg: Message, state: EngineState): Effect[] {
    const value = String(msg.event?.value ?? "");
    const field = String(msg.payload);
    const next = {
      tpl: field === "tpl" ? value : state.tpl,
      prevState: field === "prev" ? value : state.prevState,
      nextState: field === "next" ? value : state.nextState,
    };
    return [
      store.set("tpl", next.tpl),
      store.set("prevState", next.prevState),
      store.set("nextState", next.nextState),
      store.set("focus", 0),
      ...markSets(state.trace, 0),
      ...this._run(next.tpl, next.prevState, next.nextState),
    ];
  }

  loadPreset(msg: Message, state: EngineState): Effect[] {
    const p = PRESETS.find((x) => x.id === msg.payload);
    if (!p) return [];
    return [
      store.set("tpl", p.template),
      store.set("prevState", p.prev),
      store.set("nextState", p.next),
      store.set("preset", p.id),
      store.set("focus", 0),
      store.set(
        "presets",
        PRESETS.map((x) => ({
          id: x.id,
          name: x.name,
          active: x.id === p.id,
          inactive: x.id !== p.id,
        })),
      ),
      ...markSets(state.trace, 0),
      ...this._run(p.template, p.prev, p.next),
    ];
  }

  go(msg: Message): Effect[] {
    const i = Number(msg.payload);
    if (!(i >= 0 && i < STAGE_LIST.length)) return [];
    return Object.entries(navOf(i))
      .map(([k, v]) => store.set(k, v))
      .concat([store.set("stage", i)]);
  }

  stepPrev(_msg: Message, state: EngineState): Effect[] {
    return this.go({ id: "go", payload: state.stage - 1 });
  }

  stepNext(_msg: Message, state: EngineState): Effect[] {
    return this.go({ id: "go", payload: state.stage + 1 });
  }

  /** Click a template line (or a generated line that came from one): light the lines tied to it. */
  pick(msg: Message, state: EngineState): Effect[] {
    const n = Number(msg.payload);
    const focus = n > 0 && n !== state.focus ? n : 0;
    return [store.set("focus", focus), ...markSets(state.trace, focus)];
  }

  // the code listings are embedded, so their clicks arrive prefixed
  "src.pick"(msg: Message, state: EngineState): Effect[] {
    return this.pick(msg, state);
  }
  "gen.pick"(msg: Message, state: EngineState): Effect[] {
    return this.pick(msg, state);
  }
}

export const enginePage = new EnginePage();
