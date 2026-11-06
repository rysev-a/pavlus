import { Component, type Effect, type Message } from "@pavlus/frontend";
import { storeEffector as store } from "@pavlus/frontend/plugins";
import { type Inline, parseInline } from "../blocks/docs-layout/docs.ts";
import { docsEffector } from "../docs/plugin.ts";
import { highlight, type Line } from "../source.ts";
import view from "./engine.pavlus";
import { PRESETS } from "./presets.ts";
import { STAGES } from "./reference.ts";
import { emptyTrace, type Trace } from "./trace.ts";
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
  missing: boolean;
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
      missing: true,
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
    missing: false,
  };
}

export interface EngineState {
  tpl: string;
  prevState: string;
  nextState: string;
  preset: string;
  trace: Trace;
  status: "idle" | "running" | "failed";
  stage: number;
  stages: {
    id: StageId;
    n: number;
    title: string;
    takes: string;
    gives: string;
    active: boolean;
    done: boolean;
  }[];
  stageId: StageId;
  stageTitle: string;
  stageTakes: string;
  stageGives: string;
  ref: StageView;
  /** The template line the reader picked: its generated code is lit. */
  focus: number;
  presets: { id: string; name: string; active: boolean }[];
  hasPrev: boolean;
  hasNext: boolean;
}

const navOf = (stage: number) => ({
  stages: STAGE_LIST.map((s, i) => ({
    ...s,
    n: i + 1,
    active: i === stage,
    done: i < stage,
  })),
  stageId: STAGE_LIST[stage].id,
  stageTitle: STAGE_LIST[stage].title,
  stageTakes: STAGE_LIST[stage].takes,
  stageGives: STAGE_LIST[stage].gives,
  ref: stageView(STAGE_LIST[stage].id),
  hasPrev: stage > 0,
  hasNext: stage < STAGE_LIST.length - 1,
});

export function engineState(): EngineState {
  const p = PRESETS[0];
  return {
    tpl: p.template,
    prevState: p.prev,
    nextState: p.next,
    preset: p.id,
    trace: emptyTrace(),
    status: "idle",
    stage: 0,
    focus: 0,
    presets: PRESETS.map((x) => ({
      id: x.id,
      name: x.name,
      active: x.id === p.id,
    })),
    ...navOf(0),
  };
}

/**
 * The Template engine page: a template and two states you can edit, and the
 * eleven stages from the text to the DOM updates, each run for real (the
 * `docs` plugin loads the compiler and calls `traceTemplate`) next to the
 * reference of the functions behind it.
 */
export class EnginePage extends Component<EngineState> {
  view = view;

  enter(_msg: Message, state: EngineState): Effect[] {
    return this._run(state.tpl, state.prevState, state.nextState);
  }

  _run(tpl: string, prev: string, next: string): Effect[] {
    return [
      store.set("status", "running"),
      docsEffector.trace(tpl, prev, next, "traced", "traceFailed"),
    ];
  }

  traced(msg: Message): Effect[] {
    return [
      store.set("trace", msg.payload as Trace),
      store.set("status", "idle"),
    ];
  }

  traceFailed(): Effect[] {
    return [store.set("status", "failed")];
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
      ...this._run(next.tpl, next.prevState, next.nextState),
    ];
  }

  loadPreset(msg: Message): Effect[] {
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
        PRESETS.map((x) => ({ id: x.id, name: x.name, active: x.id === p.id })),
      ),
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

  step(msg: Message, state: EngineState): Effect[] {
    return this.go({ id: "go", payload: state.stage + Number(msg.payload) });
  }

  /** Click a template line (or a generated line that came from one): light the lines tied to it. */
  pick(msg: Message, state: EngineState): Effect[] {
    const n = Number(msg.payload);
    return [store.set("focus", n > 0 && n !== state.focus ? n : 0)];
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
