/**
 * The reference of the "Template engine" page: for each stage of the way from
 * a template to DOM updates, every function, class and notable string the
 * stage uses, described from the real source (framework/src). The page shows
 * it next to a live run of the stage on the reader's own template.
 */

export type StageId =
  | "source"
  | "ast"
  | "expr"
  | "analyze"
  | "codegen"
  | "render"
  | "diff"
  | "module"
  | "instantiate"
  | "run"
  | "dom";

/** Text fields may use `code` (backticks) and **bold**; nothing else. */
export interface FnDoc {
  /** `parse`, `Builder.element`, `matchBrace`... */
  name: string;
  /** Path under framework/src, like `template/parser.ts`. */
  file: string;
  kind: "function" | "class" | "method" | "const" | "type";
  /** The signature as written in the source (one line). */
  signature: string;
  /** What it does, in 1–4 sentences: inputs, output, side effects, who calls it. */
  does: string;
}

export interface StepDoc {
  /** Short imperative title: "Split into lines". */
  title: string;
  /** What happens in this step and why (2–6 sentences). */
  text: string;
  /** An optional snippet that shows it (a few lines). */
  code?: string;
  lang?: "ts" | "pavlus" | "json" | "text";
}

export interface PatternDoc {
  /** A string, regular expression, constant or format as it appears in the source or in generated code. */
  text: string;
  /** What it means / why it is that way. */
  meaning: string;
  /** Where it comes from: function and file. */
  where: string;
}

export interface StageDoc {
  id: StageId;
  /** Same as the stage name on the page; do not change. */
  title: string;
  /** Paragraphs: what this stage takes in, what it gives out, why it exists. */
  intro: string[];
  /** The algorithm of the stage, in order. */
  steps: StepDoc[];
  /** Every function, class, method and constant of the stage. */
  functions: FnDoc[];
  /** The strings, patterns and formats worth knowing. */
  patterns: PatternDoc[];
  /** Surprises and pitfalls of this stage. */
  pitfalls: string[];
}
