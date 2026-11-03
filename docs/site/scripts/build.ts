/**
 * Builds the pavlus site — three generated pages plus the SVG diagrams.
 *
 * - compiles every example in examples.ts with the REAL compiler
 * - runs the real render/diff for every example step (and for the two demo
 *   apps of part II), so all data shown is genuine framework output
 * - generates the SVG diagrams (docs/diagrams/*.svg) and inlines them into
 *   the three pages it writes next to docs/site: index.html (start),
 *   docs.html (docs) and about.html (about)
 *
 * Run: npm run docs:build   (or: node docs/site/scripts/build.ts)
 */

import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { compileAll, patchOneLine } from "./run.ts";
import { compileToView } from "../../../framework/src/compiler/mod.ts";
import {
  compilePipelineSvg,
  counterScenarioSvg,
  FLOW_STEPS,
  pureConceptFlowSvg,
  pureConceptSvg,
  templatePipelineSvg,
  usersScenarioSvg,
} from "./diagrams.ts";
import { renderAboutPage, renderDocsPage, renderStartPage } from "./page.ts";
import {
  afterRemoveState,
  bootState,
  counterApp,
  counterTemplate,
  loadingState,
  readyState,
  usersApp,
  usersTemplate,
} from "./demos.ts";

// this file lives in docs/site/scripts; the generated pages go to docs/site
const here = dirname(fileURLToPath(import.meta.url));
const siteDir = join(here, "..");
const root = join(here, "..", "..", "..");
const diagramsDir = join(root, "docs", "diagrams");
mkdirSync(diagramsDir, { recursive: true });

/* ---- part I: compile and run every example */

const compiled = compileAll();
for (const c of compiled) {
  const total = c.steps.reduce((n, s) => n + s.patches.length, 0);
  console.log(
    `example ${c.ex.id.padEnd(10)} render: ${c.vnodes.length} top nodes · diff: ${total} patches over ${c.steps.length} step(s)`,
  );
}

/* ---- part II: the two demo apps — real patches for the scenarios */

const counterView = compileToView(counterTemplate);
const counterPatches = counterView.diff({ count: 0 }, { count: 1 });
const counterPatchLines = counterPatches.map(patchOneLine);

const usersView = compileToView(usersTemplate);
const usersLoading = usersView.diff(bootState, loadingState).map(patchOneLine);
const usersReady = usersView.diff(loadingState, readyState).map(patchOneLine);
const usersRemove = usersView
  .diff(readyState, afterRemoveState)
  .map(patchOneLine);

console.log(
  `demo counter: ${counterPatches.length} patches · demo users: ${usersLoading.length}+${usersReady.length}+${usersRemove.length} patches`,
);

/* ---- diagrams */

const pipeline = compilePipelineSvg();
const exampleSvgs = compiled.map((c) => ({
  c,
  svg: templatePipelineSvg(c).toString(),
}));
const pureConcept = pureConceptSvg().toString();
const pureFlow = pureConceptFlowSvg();
const counterSvg = counterScenarioSvg(counterPatchLines.join("\n")).toString();
const usersSvg = usersScenarioSvg(
  usersLoading,
  usersReady,
  usersRemove,
).toString();

/* ---- source excerpts (always in sync with the code) */

const rel = (p: string) => join(root, "framework", "src", p);
const appRel = (p: string) => join(root, "admin-app", "frontend", p);
const sliceIn =
  (base: (p: string) => string) =>
  (p: string, from: number, to: number): string =>
    readFileSync(base(p), "utf8")
      .split("\n")
      .slice(from - 1, to)
      .join("\n");
const slice = sliceIn(rel);
const sliceApp = sliceIn(appRel);

const excerpts = {
  core: { code: slice("core/mod.ts", 46, 107), from: 46 },
  storeApply: { code: slice("plugins/store/mod.ts", 108, 124), from: 108 },
  storeChange: { code: slice("plugins/store/mod.ts", 178, 197), from: 178 },
  httpType: { code: slice("plugins/http/mod.ts", 6, 23), from: 6 },
  httpRun: { code: slice("plugins/http/mod.ts", 66, 98), from: 66 },
  domHandler: { code: slice("plugins/dom/mod.ts", 91, 105), from: 91 },
  domApply: { code: slice("plugins/dom/mod.ts", 244, 258), from: 244 },
  domOnState: { code: slice("plugins/dom/mod.ts", 364, 371), from: 364 },
  loggerType: { code: slice("plugins/logger/mod.ts", 3, 11), from: 3 },
  loggerPlugin: { code: slice("plugins/logger/mod.ts", 18, 31), from: 18 },
  timeType: { code: slice("plugins/time/mod.ts", 3, 24), from: 3 },
  wsType: { code: slice("plugins/ws/mod.ts", 3, 16), from: 3 },
  wsFrames: { code: slice("plugins/ws/mod.ts", 59, 70), from: 59 },
  embedNamed: { code: sliceApp("pages/admin/admin.pavlus", 3, 8), from: 3 },
  embedValue: {
    code: sliceApp("pages/dashboard/overview/overview.pavlus", 1, 7),
    from: 1,
  },
  childrenDecl: { code: sliceApp("pages/admin/admin.ts", 22, 33), from: 22 },
  pluginCtx: { code: slice("core/types.ts", 24, 35), from: 24 },
  pluginType: { code: slice("core/types.ts", 47, 54), from: 47 },
};

/* ---- write outputs */

const docsHtml = renderDocsPage({
  pipeline: pipeline.toString(),
  examples: exampleSvgs,
  pureConcept,
  counter: {
    svg: counterSvg,
    patches: {
      label: "one click",
      json: JSON.stringify(counterPatches, null, 2),
    },
    template: counterTemplate,
    app: counterApp,
  },
  users: {
    svg: usersSvg,
    patches: [
      {
        label: "mounted: boot → loading",
        json: JSON.stringify(usersView.diff(bootState, loadingState), null, 2),
      },
      {
        label: "loaded: loading → ready",
        json: JSON.stringify(usersView.diff(loadingState, readyState), null, 2),
      },
      {
        label: "click: remove Clara",
        json: JSON.stringify(
          usersView.diff(readyState, afterRemoveState),
          null,
          2,
        ),
      },
    ],
    template: usersTemplate,
    app: usersApp,
  },
  excerpts,
});

const startHtml = renderStartPage({ flowSvg: pureFlow, flowSteps: FLOW_STEPS });
const aboutHtml = renderAboutPage();

const outIndex = join(siteDir, "index.html");
writeFileSync(outIndex, startHtml);
console.log(`wrote ${outIndex} (${(startHtml.length / 1024).toFixed(0)} KB)`);

const outDocs = join(siteDir, "docs.html");
writeFileSync(outDocs, docsHtml);
console.log(`wrote ${outDocs} (${(docsHtml.length / 1024).toFixed(0)} KB)`);

const outAbout = join(siteDir, "about.html");
writeFileSync(outAbout, aboutHtml);
console.log(`wrote ${outAbout} (${(aboutHtml.length / 1024).toFixed(0)} KB)`);

const written: [string, string][] = [
  ["pipeline.svg", pipeline.toString()],
  ...compiled.map((c, i) => [`ex-${c.ex.id}.svg`, exampleSvgs[i].svg]),
  ["pure-concept.svg", pureConcept],
  ["pure-concept-flow.svg", pureFlow],
  ["tick-counter.svg", counterSvg],
  ["tick-users.svg", usersSvg],
];
for (const [name, content] of written) {
  const p = join(diagramsDir, name);
  writeFileSync(p, content);
  console.log(`wrote ${p} (${(content.length / 1024).toFixed(1)} KB)`);
}

/* ---- sanity: the SVGs we emit must be well-formed */

function checkXml(name: string, s: string): void {
  const stack: string[] = [];
  const re =
    /<\/?([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^"'>])*)\/?>|<!--[\s\S]*?-->/g;
  let m: RegExpExecArray | null;
  let last = 0;
  while ((m = re.exec(s))) {
    const between = s.slice(last, m.index);
    if (between.includes("<"))
      throw new Error(
        `${name}: unexpected markup between tags near ${m.index}`,
      );
    last = re.lastIndex;
    if (!m[0].startsWith("<")) continue; // comment
    const tag = m[1];
    if (m[0].startsWith("</")) {
      const top = stack.pop();
      if (top !== tag)
        throw new Error(`${name}: </${tag}> closes <${top ?? "nothing"}>`);
    } else if (!m[0].endsWith("/>")) {
      stack.push(tag);
    }
  }
  if (stack.length) throw new Error(`${name}: unclosed <${stack.join(",")}>`);
}
for (const [name, content] of written) checkXml(name, content);
console.log("svg well-formedness: ok");
