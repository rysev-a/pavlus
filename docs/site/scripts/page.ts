/**
 * The three generated pages of the pavlus site.
 *
 * - index.html — the start page: hero, motivation, and the interactive
 *   six-actors diagram with play/pause/step controls
 * - docs.html — the documentation: template engine, core, plugins
 * - about.html — the concept grid, the project story, and links
 *
 * Everything is generated: the code, the AST listings, the vnodes and the
 * patches come from running the real compiler (see run.ts); the diagrams are
 * generated SVG (see diagrams.ts).
 */

import { esc, type Svg } from "./svg.ts";
import type { Compiled } from "./run.ts";
import { codeLines, gutterStart, hlPavlus, hlTs } from "./highlight.ts";
import type { FlowStep } from "./diagrams.ts";

export interface DemoPatchGroup {
  label: string;
  json: string;
}

export interface Excerpt {
  code: string;
  /** True line offset of the first line in its source file. */
  from: number;
}

export interface DocsInput {
  pipeline: string;
  examples: { c: Compiled; svg: string }[];
  /** The static pure-concept diagram — it stays on the docs page. */
  pureConcept: string;
  counter: {
    svg: string;
    patches: DemoPatchGroup;
    template: string;
    app: string;
  };
  users: {
    svg: string;
    patches: DemoPatchGroup[];
    template: string;
    app: string;
  };
  excerpts: {
    core: Excerpt;
    storeApply: Excerpt;
    storeChange: Excerpt;
    httpType: Excerpt;
    httpRun: Excerpt;
    domHandler: Excerpt;
    domApply: Excerpt;
    domOnState: Excerpt;
    loggerType: Excerpt;
    loggerPlugin: Excerpt;
    timeType: Excerpt;
    wsType: Excerpt;
    wsFrames: Excerpt;
    embedNamed: Excerpt;
    embedValue: Excerpt;
    childrenDecl: Excerpt;
    pluginCtx: Excerpt;
    pluginType: Excerpt;
  };
}

export interface StartInput {
  /** pureConceptFlowSvg() output. */
  flowSvg: string;
  /** FLOW_STEPS. */
  flowSteps: FlowStep[];
}

const esc2 = esc;

type Lang = "pavlus" | "ts";

interface PreOpts {
  cls?: string;
  /** Highlight with a line-number gutter showing true offsets. */
  lang?: Lang;
  /** Line number of the first line in its source file (default 1). */
  from?: number;
}

function pre(title: string, code: string, opts: PreOpts = {}): string {
  const cls = opts.cls ? ` ${opts.cls}` : "";
  let body: string;
  if (opts.lang) {
    const html = opts.lang === "pavlus" ? hlPavlus(code) : hlTs(code);
    const from = opts.from ?? 1;
    body = `<code class="hl" style="${gutterStart(from)}">${codeLines(html)}</code>`;
  } else {
    body = `<code>${esc2(code)}</code>`;
  }
  return `<div class="codecard${cls}"><div class="codecard-title">${esc2(title)}</div><pre>${body}</pre></div>`;
}

function figure(svg: Svg | string, caption?: string): string {
  const body = typeof svg === "string" ? svg : svg.toString();
  return `<figure class="diagram">${body}${caption ? `<figcaption>${esc2(caption)}</figcaption>` : ""}</figure>`;
}

const STEPS_DATA: Record<string, { label: string; json: string }[]> = {};

function stepsUi(exId: string, c: Compiled): string {
  STEPS_DATA[exId] = c.steps.map((s) => ({ label: s.label, json: s.json }));
  const btns = c.steps
    .map(
      (s, i) =>
        `<button class="step-btn${i === 0 ? " on" : ""}" data-ex="${esc2(exId)}" data-step="${i}">${esc2(s.label)}</button>`,
    )
    .join("");
  const notes = c.ex.notes.map((n) => `<li>${n}</li>`).join("");
  return `
  <div class="steps-bar">${btns}<span class="steps-note">→ <code data-label="${esc2(exId)}">${esc2(c.steps[0]?.label ?? "")}</code></span></div>
  <pre class="patches" data-patches="${esc2(exId)}"><code>${esc2(c.steps[0]?.json ?? "[]")}</code></pre>
  <ul class="notes">${notes}</ul>`;
}

/* ------------------------------------------------------------------ */
/* shared chrome                                                       */
/* ------------------------------------------------------------------ */

function chrome(opts: {
  title: string;
  description: string;
  active: "home" | "docs" | "about";
  body: string;
  scripts?: string;
}): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc2(opts.title)}</title>
<meta name="description" content="${esc2(opts.description)}">
<style>
:root {
  --ink: #1f2430; --muted: #667085; --faint: #98a2b3;
  --border: #d4d9e0; --bg: #fbfcfe; --panel: #ffffff;
  --msg: #2563eb; --effect: #7c3aed; --state: #059669; --dom: #d97706; --net: #0ea5e9;
  --code-bg: #0f172a; --code-text: #e2e8f0; --accent: #4f46e5;
}
* { box-sizing: border-box; }
body { margin: 0; font: 15px/1.65 -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif; color: var(--ink); background: var(--bg); }
.wrap { max-width: 1280px; margin: 0 auto; padding: 0 28px; }
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
h1 { font-size: 40px; line-height: 1.15; margin: 0 0 12px; letter-spacing: -0.02em; }
h2 { font-size: 27px; margin: 0 0 8px; letter-spacing: -0.01em; }
h3 { font-size: 16px; margin: 28px 0 10px; color: var(--ink); }
p { margin: 8px 0 14px; }
header.site { position: sticky; top: 0; z-index: 10; background: rgba(251,252,254,0.92); backdrop-filter: blur(6px); border-bottom: 1px solid var(--border); }
header.site .wrap { display: flex; gap: 18px; align-items: center; height: 52px; }
header.site .brand { font-weight: 700; letter-spacing: -0.01em; }
header.site nav { display: flex; gap: 14px; flex-wrap: wrap; font-size: 13.5px; }
.hero { padding: 56px 0 36px; }
.hero .lead { font-size: 18px; color: var(--muted); max-width: 860px; }
.hero .flow { background: var(--code-bg); color: var(--code-text); font-family: ui-monospace, Menlo, monospace; font-size: 12.5px; line-height: 1.5; padding: 18px 22px; border-radius: 12px; margin: 22px 0 0; overflow-x: auto; }
.layout { display: grid; grid-template-columns: 230px minmax(0, 1fr); gap: 36px; align-items: start; }
aside.menu { position: sticky; top: 64px; max-height: calc(100vh - 76px); overflow: auto; font-size: 13.5px; padding: 4px 0 30px; }
.menu .group { font-size: 11px; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; color: var(--muted); margin: 18px 0 4px; }
.menu .group:first-child { margin-top: 0; }
.menu .group a { color: var(--accent); }
.menu a.item { display: block; padding: 3px 0 3px 14px; margin-left: 2px; border-left: 2px solid var(--border); color: var(--ink); }
.menu a.item:hover { color: var(--accent); border-left-color: var(--accent); text-decoration: none; }
@media (max-width: 1080px) {
  .layout { grid-template-columns: 1fr; gap: 0; }
  aside.menu { position: sticky; top: 52px; z-index: 9; display: flex; align-items: baseline; gap: 4px 16px; max-height: none; white-space: nowrap; overflow-x: auto; border: 1px solid var(--border); border-radius: 10px; background: var(--panel); padding: 10px 16px; margin: 0 0 10px; box-shadow: 0 6px 18px rgba(31,36,48,0.06); }
  .menu .group, .menu a.item { white-space: nowrap; }
  .menu .group { margin: 0 2px 0 0; }
  .menu a.item { display: inline-block; padding: 0; margin: 0; border-left: 0; }
  section[id], h3[id] { scroll-margin-top: 116px; }
}
section[id], h3[id] { scroll-margin-top: 64px; }
.part { margin: 56px 0 0; padding: 34px 0 6px; border-top: 2px solid var(--border); }
.part-badge { display: inline-block; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--accent); background: #eef2ff; border: 1px solid #dfe3ff; padding: 3px 10px; border-radius: 999px; margin-bottom: 10px; }
.sec-head { margin-bottom: 6px; }
section.example { margin: 48px 0; padding-top: 8px; }
figure.diagram { margin: 18px 0 8px; }
figure.diagram svg { width: 100%; height: auto; display: block; background: #f6f8fa; border: 1px solid var(--border); border-radius: 14px; }
figcaption { font-size: 12.5px; color: var(--muted); padding: 8px 4px 0; }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items: start; }
.grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; align-items: start; }
.stack { display: grid; gap: 16px; align-content: start; }
@media (max-width: 980px) { .grid2, .grid3 { grid-template-columns: 1fr; } }
.codecard { border: 1px solid var(--border); border-radius: 12px; overflow: hidden; background: var(--panel); }
.codecard-title { font-family: ui-monospace, Menlo, monospace; font-size: 11.5px; font-weight: 700; color: var(--muted); padding: 9px 14px; border-bottom: 1px solid var(--border); background: #f2f5f9; }
.codecard pre { margin: 0; padding: 13px 14px; background: var(--code-bg); color: var(--code-text); font: 12px/1.55 ui-monospace, Menlo, Consolas, monospace; overflow: auto; max-height: 420px; }
.codecard pre.scroll { max-height: 560px; }
.codecard .tiny { font-size: 11.5px; color: var(--muted); margin: 8px 12px; }
.tk-kw { color: #c792ea; }
.tk-str { color: #9ece6a; }
.tk-num { color: #f78c6c; }
.tk-com { color: #64748b; font-style: italic; }
.tk-fn { color: #82aaff; }
.tk-type { color: #e5c07b; }
.tk-tag { color: #82aaff; font-weight: 600; }
.tk-attr { color: #e5c07b; }
.tk-evt { color: #c792ea; }
.tk-expr { color: #f07178; }
.tk-key { color: #82aaff; }
.tk-punc { color: #8b9bb4; }
pre code.hl { display: block; }
pre code.hl .line { display: block; min-height: 1.55em; counter-increment: ln; }
pre code.hl .line::before { content: counter(ln); display: inline-block; width: 3ch; margin-right: 14px; text-align: right; color: #52607a; user-select: none; }
pre.patches { margin: 10px 0 0; padding: 14px 16px; background: var(--code-bg); color: var(--code-text); font: 12px/1.6 ui-monospace, Menlo, monospace; border-radius: 12px; overflow: auto; max-height: 380px; }
.steps-bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 8px; }
.step-btn { font: 12.5px -apple-system, 'Segoe UI', sans-serif; padding: 6px 12px; border-radius: 999px; border: 1px solid var(--border); background: var(--panel); color: var(--ink); cursor: pointer; }
.step-btn:hover { border-color: var(--accent); }
.step-btn.on { background: var(--accent); border-color: var(--accent); color: #fff; }
.steps-note { font-size: 12.5px; color: var(--muted); }
.steps-note code { color: var(--accent); }
ul.notes { margin: 14px 0 0; padding-left: 20px; font-size: 13.5px; color: var(--muted); }
ul.notes li { margin: 4px 0; }
ul.notes code, p code, .tiny code, td code, li code { font-family: ui-monospace, Menlo, monospace; font-size: 0.92em; background: #eef1f6; border: 1px solid #e2e6ee; border-radius: 5px; padding: 1px 5px; color: var(--ink); }
table.t { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 13.5px; background: var(--panel); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
table.t th { text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); background: #f2f5f9; }
table.t th, table.t td { padding: 9px 14px; border-bottom: 1px solid var(--border); vertical-align: top; }
table.t tr:last-child td { border-bottom: none; }
.pure-list { padding-left: 20px; }
.concept-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin: 20px 0 0; }
@media (max-width: 980px) { .concept-grid { grid-template-columns: 1fr; } }
.concept { border: 1px solid var(--border); border-radius: 12px; background: var(--panel); padding: 14px 16px; }
.concept b { font-size: 14px; }
.concept p { font-size: 13px; color: var(--muted); margin: 6px 0 0; }
.concept .k { font-family: ui-monospace, Menlo, monospace; font-size: 11px; color: var(--accent); }
footer.site { margin: 64px 0 0; border-top: 1px solid var(--border); padding: 26px 0 46px; font-size: 13px; color: var(--muted); }
.site a.brand { color: var(--ink); }
.site nav a.on { color: var(--accent); font-weight: 600; }
.page-head { padding: 44px 0 4px; }
.page-head .lead { color: var(--muted); font-size: 15.5px; max-width: 900px; margin: 10px 0 0; }
.motivation { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; margin: 22px 0 0; }
@media (max-width: 980px) { .motivation { grid-template-columns: 1fr; } }
.cta-row { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 26px; }
.cta { display: inline-block; padding: 10px 18px; border-radius: 10px; border: 1px solid var(--border); background: var(--panel); font-weight: 600; font-size: 14px; }
.cta.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.cta:hover { text-decoration: none; border-color: var(--accent); }
.flowviz { border: 1px solid var(--border); border-radius: 14px; background: #f6f8fa; overflow: hidden; }
.flowviz > svg { width: 100%; height: auto; display: block; }
.fv-bar { display: flex; gap: 8px; align-items: center; padding: 10px 14px; background: var(--panel); border-top: 1px solid var(--border); flex-wrap: wrap; }
.fv-btn { font: 12.5px -apple-system, 'Segoe UI', sans-serif; padding: 6px 14px; border-radius: 999px; border: 1px solid var(--border); background: var(--panel); color: var(--ink); cursor: pointer; }
.fv-btn:hover { border-color: var(--accent); }
.fv-btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.fv-dots { display: flex; gap: 6px; margin-left: auto; flex-wrap: wrap; }
.fv-dot { width: 10px; height: 10px; border-radius: 50%; border: 1px solid var(--border); background: #e2e6ee; cursor: pointer; padding: 0; }
.fv-dot.on { background: var(--accent); border-color: var(--accent); }
.fv-caption { display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; padding: 10px 16px 14px; background: var(--panel); border-top: 1px solid var(--border); font-size: 13.5px; color: var(--muted); min-height: 92px; }
.fv-counter { font-weight: 700; color: var(--ink); font-size: 12px; white-space: nowrap; }
.fv-label { font-family: ui-monospace, Menlo, monospace; font-size: 12px; color: var(--accent); }
/* hero stage: diagram + toy browser, synced */
.stage { position: relative; display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(300px, 1fr); gap: 20px; align-items: stretch; margin: 26px 0 0; }
@media (max-width: 1080px) { .stage { grid-template-columns: 1fr; } }
.fv-dots { gap: 4px; }
.fv-dot { width: 8px; height: 8px; }
.fv-dot.fv-gap { margin-left: 11px; }
.fv-phase { font-size: 11px; font-weight: 700; color: var(--accent); background: #eef2ff; border: 1px solid #dfe3ff; border-radius: 999px; padding: 3px 10px; white-space: nowrap; }
.tb { display: flex; flex-direction: column; border: 1px solid var(--border); border-radius: 14px; background: var(--panel); box-shadow: 0 10px 30px rgba(31,36,48,0.08); overflow: hidden; }
.tb-chrome { display: flex; align-items: center; gap: 6px; padding: 9px 12px; background: #eef1f6; border-bottom: 1px solid var(--border); }
.tb-dot { width: 10px; height: 10px; border-radius: 50%; flex: none; }
.tb-dot.r { background: #ff5f57; }
.tb-dot.y { background: #febc2e; }
.tb-dot.g { background: #28c840; }
.tb-url { flex: 1; margin-left: 8px; font: 11.5px/1.2 ui-monospace, Menlo, monospace; color: var(--muted); background: #fff; border: 1px solid var(--border); border-radius: 7px; padding: 5px 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#fv-fly { position: absolute; width: 13px; height: 13px; border-radius: 50%; background: var(--accent); border: 2px solid #fff; box-shadow: 0 0 0 3px rgba(79,70,229,.16), 0 2px 10px rgba(31,36,48,.28); pointer-events: none; opacity: 0; z-index: 30; transform: translate(-50%,-50%); }
@keyframes tbfx { 0%,100% { border-color: var(--border); box-shadow: none; } 50% { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(79,70,229,.2); } }
.tb-url.fx { animation: tbfx .45s ease-in-out 2; }
.tb-col { display: flex; flex-direction: column; min-width: 0; }
.tb-col .tb { flex: 1; }
.srv-link { align-self: center; width: 0; height: 18px; border-left: 2px dashed #94a3b8; }
.srv { display: flex; align-items: center; gap: 10px; padding: 10px 14px; background: var(--panel); border: 1.5px solid var(--border); border-radius: 12px; box-shadow: 0 6px 20px rgba(31,36,48,0.07); transition: border-color .25s ease, box-shadow .25s ease; }
.srv-led { flex: none; width: 10px; height: 10px; border-radius: 50%; background: #cbd5e1; transition: background .2s; }
#fv-srv.on .srv-led { background: #16a34a; animation: fvled .45s ease-in-out 3; }
#fv-srv.on { border-color: #16a34a; }
#fv-srv.lit { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(79,70,229,.16), 0 6px 20px rgba(31,36,48,0.07); }
.srv-txt { display: flex; flex-direction: column; line-height: 1.3; }
.srv-txt b { font-size: 13px; }
.srv-txt span { font: 10.5px/1.3 ui-monospace, Menlo, monospace; color: var(--muted); }
.srv-cap { margin: 8px 0 0; text-align: center; font-size: 10.5px; font-style: italic; color: var(--faint); }
@keyframes fvled { 0%,100% { opacity: .3; } 50% { opacity: 1; } }
.tb-body { flex: 1; padding: 12px 14px 14px; min-height: 250px; }
.tb-nav { display: flex; gap: 12px; align-items: baseline; font-size: 12px; color: var(--muted); border-bottom: 1px solid var(--border); padding-bottom: 8px; margin-bottom: 10px; }
.tb-nav b { color: var(--ink); font-size: 12.5px; margin-right: 4px; }
.tb-nav span.on { color: var(--accent); font-weight: 700; }
.tb-view h4 { margin: 2px 0 8px; font-size: 13px; }
.tb-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.tb-card { border: 1px solid var(--border); border-radius: 9px; padding: 8px 10px; display: flex; flex-direction: column; }
.tb-card b { font-size: 16px; }
.tb-card span { font-size: 10.5px; color: var(--muted); }
.tb-sk { height: 14px; border-radius: 6px; background: linear-gradient(90deg, #e9edf3, #f6f8fb, #e9edf3); background-size: 200% 100%; animation: tbsk 1.2s linear infinite; margin: 9px 0; }
@keyframes tbsk { from { background-position: 200% 0; } to { background-position: -200% 0; } }
.tb-row { display: flex; align-items: center; gap: 8px; border: 1px solid var(--border); border-radius: 8px; padding: 6px 9px; margin: 6px 0; font-size: 12px; }
.tb-row .tb-id { color: var(--faint); font: 11px ui-monospace, Menlo, monospace; }
.tb-row .tb-sp { flex: 1; }
.tb-btn { font-style: normal; font-size: 10.5px; font-weight: 700; color: var(--accent); border: 1px solid var(--border); border-radius: 6px; padding: 2px 7px; background: #fff; flex: none; }
.tb-btn.danger { color: #dc2626; }
.tb-btn.primary { color: #fff; background: var(--accent); border-color: var(--accent); }
.tb-in { flex: 1; font: 12px ui-monospace, Menlo, monospace; border: 1px solid var(--accent); border-radius: 6px; padding: 3px 8px; min-width: 60px; }
.tb-dev { border-top: 1px solid var(--border); background: var(--code-bg); color: var(--code-text); font: 11px/1.45 ui-monospace, Menlo, Consolas, monospace; }
.tb-tabs { display: flex; align-items: center; gap: 2px; padding: 3px 8px 0; background: #0b1220; border-bottom: 1px solid #1e293b; }
.tb-tab { font: 11px ui-monospace, Menlo, monospace; color: #7c8aa0; background: none; border: none; border-bottom: 2px solid transparent; padding: 4px 10px 5px; cursor: pointer; }
.tb-tab.on { color: #e2e8f0; border-bottom-color: var(--accent); }
.tb-spring { flex: 1; }
.tb-step { color: #64748b; padding-right: 6px; }
.tb-line { display: flex; align-items: center; gap: 8px; padding: 6px 12px; }
.tb-dbg { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tb-pane { display: none; height: 96px; overflow: auto; padding: 4px 12px 8px; }
.tb-pane.on { display: block; }
.tb-ev { display: flex; gap: 7px; padding: 1px 0; color: #94a3b8; white-space: nowrap; }
.tb-ev.new { color: #e2e8f0; }
.tb-ev .tb-ln { color: #475569; }
.tb-cm { display: flex; gap: 7px; padding: 1px 0; color: #94a3b8; white-space: nowrap; }
.tb-cm.cur { color: #e2e8f0; }
.tb-cm .tb-n { color: #6ee7b7; }
.tb-tl { display: flex; align-items: center; flex-wrap: wrap; gap: 3px; padding: 7px 2px 3px; }
.tb-tick { width: 7px; height: 7px; border-radius: 50%; border: 1px solid #334155; background: transparent; padding: 0; cursor: pointer; flex: none; }
.tb-tick.c { background: #16a34a; border-color: #16a34a; }
.tb-tick.cur { box-shadow: 0 0 0 2px var(--code-bg), 0 0 0 3.5px var(--accent); }
.tb-tl-cap { color: #64748b; padding: 3px 2px 6px; }
.tb-chip { font-size: 9.5px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; border-radius: 5px; padding: 2px 6px; background: #1e293b; flex: none; }
.tb-chip.t-msg { color: #93c5fd; }
.tb-chip.t-fx { color: #c4b5fd; }
.tb-chip.t-net { color: #67e8f9; }
.tb-chip.t-state { color: #6ee7b7; }
.tb-chip.t-dom { color: #fcd34d; }
.tb-chip.t-app, .tb-chip.t-ssr { color: #cbd5e1; }
</style>
</head>
<body>
<header class="site"><div class="wrap">
  <a class="brand" href="index.html">pavlus</a>
  <nav>
    <a href="about.html"${opts.active === "about" ? ' class="on"' : ""}>about</a>
    <a href="docs.html"${opts.active === "docs" ? ' class="on"' : ""}>docs</a>
  </nav>
</div></header>
${opts.body}
<footer class="site">
  <div class="wrap">
    <p>Generated by <code>docs/site/scripts/build.ts</code> — it compiles every example with the real
      pavlus compiler and runs the real runtime. Regenerate with <code>npm run docs:build</code>.</p>
    <p>More: <a href="../../framework/README.md">framework/README.md</a> ·
      <a href="../../framework/docs/architecture.md">framework/docs/architecture.md</a> ·
      <a href="../../admin-app/">admin-app/</a> (a complete application) ·
      <a href="about.html">about</a></p>
  </div>
</footer>
${opts.scripts ?? ""}
</body>
</html>`;
}

/* ------------------------------------------------------------------ */
/* scripts                                                             */
/* ------------------------------------------------------------------ */

const STEPS_SCRIPT = `<script>
(function () {
  var DATA = JSON.parse(document.getElementById("steps-data").textContent);
  function hlJson(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/("(?:[^"]*)")([ \\t]*:)?|-?[0-9]+(?:[.][0-9]+)?|(?:true|false|null)/g,
      function (m, str, colon) {
        if (str !== undefined)
          return '<span class="' + (colon ? "tk-key" : "tk-str") + '">' + str + '</span>' + (colon || "");
        return '<span class="tk-' + (/^-?[0-9]/.test(m) ? "num" : "kw") + '">' + m + '</span>';
      });
  }
  document.querySelectorAll("pre.patches > code").forEach(function (el) {
    el.innerHTML = hlJson(el.textContent);
  });
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-step]");
    if (!b) return;
    var ex = b.getAttribute("data-ex");
    var i = +b.getAttribute("data-step");
    var d = DATA[ex] && DATA[ex][i];
    if (!d) return;
    var box = document.querySelector('[data-patches="' + ex + '"]');
    if (box) box.firstElementChild.innerHTML = hlJson(d.json);
    var lbl = document.querySelector('[data-label="' + ex + '"]');
    if (lbl) lbl.textContent = d.label;
    document.querySelectorAll('[data-ex="' + ex + '"][data-step]').forEach(function (x) {
      x.classList.toggle("on", x === b);
    });
  });
})();
</script>`;

const FLOWVIZ_SCRIPT = `<script>
(function () {
  var data = document.getElementById("flow-steps");
  if (!data) return;
  var STEPS = JSON.parse(data.textContent);
  var svg = document.getElementById("flowviz-svg");
  var packet = document.getElementById("fv-packet");
  if (!svg || !packet) return;
  var nodes = {};
  svg.querySelectorAll("rect[data-node]").forEach(function (r) {
    nodes[r.getAttribute("data-node")] = r;
  });
  var counter = document.querySelector(".fv-counter");
  var label = document.querySelector(".fv-label");
  var text = document.querySelector(".fv-text");
  var phaseEl = document.querySelector(".fv-phase");
  var dotsBox = document.querySelector(".fv-dots");
  var playBtn = document.getElementById("fv-play");
  var prevBtn = document.getElementById("fv-prev");
  var nextBtn = document.getElementById("fv-next");
  var tbUrl = document.getElementById("tb-url");
  var tbView = document.getElementById("tb-view");
  var tbChip = document.getElementById("tb-chip");
  var tbDbg = document.getElementById("tb-dbg");
  var tbStep = document.getElementById("tb-step");
  var tbNav = document.querySelectorAll(".tb-nav span[data-nav]");
  var tbLog = document.getElementById("tb-log");
  var tbCommits = document.getElementById("tb-commits");
  var tbTl = document.getElementById("tb-tl");
  var tbTlInfo = document.getElementById("tb-tl-info");
  var srv = document.getElementById("fv-srv");
  var fly = document.getElementById("fv-fly");
  var stageBox = fly ? fly.parentNode : null;
  var tabs = document.querySelectorAll(".tb-tab");
  var panes = document.querySelectorAll(".tb-pane");
  var srvT = null;

  function ROW(id, name) {
    return '<div class="tb-row"><span class="tb-id">' + id + '</span><b>' + name +
      '</b><span class="tb-sp"></span><i class="tb-btn">edit</i><i class="tb-btn danger">remove</i></div>';
  }
  function ROWEDIT(id, name) {
    return '<div class="tb-row"><span class="tb-id">' + id + '</span>' +
      '<input class="tb-in" value="' + name + '"><i class="tb-btn primary">save</i></div>';
  }
  function ROWS(rows) { return '<h4>Users</h4>' + rows.join(""); }

  var VIEWS = {
    home: '<h4>Overview</h4><div class="tb-cards"><div class="tb-card"><b>8</b><span>users</span></div><div class="tb-card"><b>10</b><span>products</span></div><div class="tb-card"><b>10</b><span>payments</span></div></div>',
    "users-loading": '<h4>Users</h4><div class="tb-sk"></div><div class="tb-sk"></div><div class="tb-sk"></div>',
    users: ROWS([ROW(1, "Ada L."), ROW(2, "Grace H."), ROW(3, "Alan T.")]),
    "users-edit": ROWS([ROWEDIT(1, "Ada L."), ROW(2, "Grace H."), ROW(3, "Alan T.")]),
    "users-edited": ROWS([ROW(1, "Ada Lovelace"), ROW(2, "Grace H."), ROW(3, "Alan T.")]),
    "users-after": ROWS([ROW(1, "Ada Lovelace"), ROW(2, "Grace H.")])
  };

  var cur = { url: "/", view: "home" };

  // micro timeline: one circle per step, green where the store commits
  var ticks = [];
  STEPS.forEach(function (s, k) {
    var c = s.browser && s.browser.store;
    var t = document.createElement("button");
    t.className = "tb-tick" + (c ? " c" : "");
    t.title = "step " + (k + 1) + (c ? " — " + c : "");
    t.addEventListener("click", function () { stop(); go(k); });
    tbTl.appendChild(t);
    ticks.push(t);
  });

  // devtools tabs, chrome-style
  tabs.forEach(function (b) {
    b.addEventListener("click", function () {
      tabs.forEach(function (x) { x.classList.remove("on"); });
      panes.forEach(function (p) {
        p.classList.toggle("on", p.getAttribute("data-pane") === b.getAttribute("data-tab"));
      });
      b.classList.add("on");
    });
  });

  // rebuild both panes from steps 0..i — deterministic on any jump
  function renderDev() {
    var n = 0, rows = "", last = "—";
    for (var k = 0; k <= i; k++) {
      var b = STEPS[k].browser;
      if (b && b.store) {
        n++;
        last = b.store;
        rows += '<div class="tb-cm"><span class="tb-n">#' + n + "</span><span>" + b.store + "</span></div>";
      }
    }
    tbCommits.innerHTML = rows || '<div class="tb-cm"><span class="tb-n">—</span><span>no changes yet</span></div>';
    var log = "";
    for (var k = Math.max(0, i - 8); k <= i; k++) {
      var d = STEPS[k].browser && STEPS[k].browser.dbg;
      if (d) {
        var nn = (k + 1 < 10 ? "0" : "") + (k + 1);
        log += '<div class="tb-ev' + (k === i ? " new" : "") + '"><span class="tb-ln">' + nn + '</span><span class="tb-chip t-' + d.t + '">' + d.t + "</span><span>" + d.m + "</span></div>";
      }
    }
    tbLog.innerHTML = log;
    tbLog.scrollTop = tbLog.scrollHeight;
    ticks.forEach(function (t) { t.classList.remove("cur"); });
    ticks[i].classList.add("cur");
    tbTlInfo.textContent = "state #" + n + " — " + last;
  }

  function applyBrowser(f) {
    if (!f) return;
    if (f.url) {
      cur.url = f.url;
      tbUrl.textContent = "localhost:3000" + cur.url;
    }
    if (f.view && VIEWS[f.view]) {
      cur.view = f.view;
      tbView.innerHTML = VIEWS[f.view];
      var sec = cur.view === "home" ? "overview" : "users";
      tbNav.forEach(function (n) {
        n.className = n.getAttribute("data-nav") === sec ? "on" : "";
      });
    }
    if (f.dbg) {
      tbChip.textContent = f.dbg.t;
      tbChip.className = "tb-chip t-" + f.dbg.t;
      tbDbg.textContent = f.dbg.m;
    }
  }

  var dots = [];
  STEPS.forEach(function (s, k) {
    var d = document.createElement("button");
    d.className = "fv-dot" + (k > 0 && s.phase !== STEPS[k - 1].phase ? " fv-gap" : "");
    d.title = s.phase + " — " + s.label;
    d.addEventListener("click", function () { stop(); go(k); });
    dotsBox.appendChild(d);
    dots.push(d);
  });
  var i = -1, playing = false, timer = null, raf = null, flyRaf = null, urlFxT = null;

  function segPoint(pts, t) {
    var segs = [], total = 0, k;
    for (k = 1; k < pts.length; k++) {
      var dx = pts[k][0] - pts[k - 1][0], dy = pts[k][1] - pts[k - 1][1];
      var L = Math.sqrt(dx * dx + dy * dy);
      segs.push(L); total += L;
    }
    var d = t * total;
    for (k = 0; k < segs.length; k++) {
      if (d <= segs[k] || k === segs.length - 1) {
        var f = segs[k] === 0 ? 1 : d / segs[k];
        return [pts[k][0] + (pts[k + 1][0] - pts[k][0]) * f,
                pts[k][1] + (pts[k + 1][1] - pts[k][1]) * f];
      }
      d -= segs[k];
    }
    return pts[pts.length - 1];
  }

  function lit(ids) {
    for (var k in nodes)
      if (nodes[k]) nodes[k].classList.toggle("lit", ids.indexOf(k) >= 0);
  }

  // a fly-leg target: an SVG point, or an HTML anchor ("url" = toy URL bar, "srv" = server box)
  function anchorPt(a) {
    var st = stageBox.getBoundingClientRect();
    var r;
    if (a.e === "url" && tbUrl) r = tbUrl.getBoundingClientRect();
    else if (a.e === "srv" && srv) r = srv.getBoundingClientRect();
    else {
      var vr = svg.viewBox.baseVal, sr = svg.getBoundingClientRect();
      return [sr.left - st.left + (a.p[0] / vr.width) * sr.width,
              sr.top - st.top + (a.p[1] / vr.height) * sr.height];
    }
    return [r.left - st.left + r.width / 2, r.top - st.top + r.height / 2];
  }
  function pulseUrl() {
    tbUrl.classList.remove("fx");
    void tbUrl.offsetWidth;
    tbUrl.classList.add("fx");
    clearTimeout(urlFxT);
    urlFxT = setTimeout(function () { tbUrl.classList.remove("fx"); }, 950);
  }

  function go(n, instant) {
    if (raf) cancelAnimationFrame(raf);
    if (flyRaf) cancelAnimationFrame(flyRaf);
    flyRaf = null;
    i = ((n % STEPS.length) + STEPS.length) % STEPS.length;
    var s = STEPS[i];
    if (srv) {
      if (s.flash) {
        srv.classList.add("on");
        clearTimeout(srvT);
        srvT = setTimeout(function () { srv.classList.remove("on"); }, 1300);
      } else {
        srv.classList.remove("on");
        clearTimeout(srvT);
      }
    }
    lit([s.from, s.to]);
    if (srv) srv.classList.toggle("lit", s.from === "server" || s.to === "server");
    packet.setAttribute("fill", s.color);
    counter.textContent = "step " + (i + 1) + " / " + STEPS.length;
    label.textContent = s.label;
    text.textContent = s.caption;
    if (phaseEl) phaseEl.textContent = s.phase;
    dots.forEach(function (d, k) { d.classList.toggle("on", k === i); });
    if (tbStep) tbStep.textContent = (i + 1) + "/" + STEPS.length;
    var landed = false;
    function land() {
      if (landed) return;
      landed = true;
      applyBrowser(s.browser);
      renderDev();
    }
    if (s.fly && fly && stageBox) {
      packet.setAttribute("opacity", "0");
      if (instant) {
        var fin = anchorPt(s.fly[s.fly.length - 1]);
        fly.style.left = fin[0] + "px";
        fly.style.top = fin[1] + "px";
        land();
        return;
      }
      var leg = 0, lt0 = null, lfrom = null, LEG = 420;
      function flyFrame(ts) {
        if (lt0 === null) { lt0 = ts; lfrom = anchorPt(s.fly[leg]); }
        var p = Math.min(1, (ts - lt0) / LEG);
        var e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
        var to = anchorPt(s.fly[leg]);
        fly.style.left = lfrom[0] + (to[0] - lfrom[0]) * e + "px";
        fly.style.top = lfrom[1] + (to[1] - lfrom[1]) * e + "px";
        fly.style.opacity = "1";
        if (p >= 1) {
          if (s.fly[leg].e === "url") pulseUrl();
          leg++;
          lt0 = null;
          if (leg >= s.fly.length) { fly.style.opacity = "0"; land(); return; }
        }
        flyRaf = requestAnimationFrame(flyFrame);
      }
      flyRaf = requestAnimationFrame(flyFrame);
      return;
    }
    var t0 = null, DUR = instant ? 0 : 650;
    function frame(ts) {
      if (t0 === null) t0 = ts;
      var p = DUR === 0 ? 1 : Math.min(1, (ts - t0) / DUR);
      var e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      var pt = segPoint(s.pts, e);
      packet.setAttribute("cx", pt[0]);
      packet.setAttribute("cy", pt[1]);
      packet.setAttribute("opacity", "1");
      if (p >= 1) land();
      raf = p < 1 ? requestAnimationFrame(frame) : null;
    }
    if (instant) land();
    raf = requestAnimationFrame(frame);
  }

  function play() {
    playing = true;
    playBtn.textContent = "⏸ pause";
    go(i + 1);
    timer = setInterval(function () { go(i + 1); }, 1800);
  }
  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
    playing = false;
    playBtn.textContent = "▶ play";
  }
  playBtn.addEventListener("click", function () { playing ? stop() : play(); });
  prevBtn.addEventListener("click", function () { stop(); go(i - 1); });
  nextBtn.addEventListener("click", function () { stop(); go(i + 1); });
  go(0, true);
})();
</script>`;

/* ------------------------------------------------------------------ */
/* sample code for the "your own plugin" guide                         */
/* ------------------------------------------------------------------ */

const SAMPLE_RANDOM = `import type { Effect, Message, Plugin, PluginContext } from "@service-laboratory/pavlus";

export type RandomEffect = Effect & {
  plugin: "random";
  type: "int";
  as: string; // the message id that receives the rolled value
  min: number;
  max: number;
};

// the effector — same role as store.set(...) or http.request(...)
export function randomInt(e: Omit<RandomEffect, "plugin" | "type">): RandomEffect {
  return { plugin: "random", type: "int", ...e };
}

export function randomPlugin(): Plugin<RandomEffect> {
  return {
    name: "random", // effects route to plugins by this name
    handle(effect: RandomEffect, ctx: PluginContext) {
      const span = effect.max - effect.min + 1;
      const value = effect.min + Math.floor(Math.random() * span);
      // dirty work done — the answer re-enters the loop as a message
      ctx.dispatch({ id: effect.as, payload: value });
    },
  };
}`;

const SAMPLE_USAGE = `import { Component, createApp, type Message } from "@service-laboratory/pavlus";
import { createStorePlugin, storeEffector as store } from "@service-laboratory/pavlus/plugins/store";
import { createDomPlugin } from "@service-laboratory/pavlus/plugins/dom";
import { randomInt, randomPlugin } from "./random-plugin";

class Dice extends Component<{ dice: number }> {
  roll() {
    return [randomInt({ as: "rolled", min: 1, max: 6 })];
  }
  rolled(msg: Message, _state: { dice: number }) {
    return [store.set("dice", msg.payload)];
  }
}

createApp({
  app: new Dice(),
  plugins: [createStorePlugin({ dice: 0 }), randomPlugin(), createDomPlugin()],
  mount: "#app",
});`;

const SAMPLE_PERSIST = `// wrap a built-in: same name / handle / getState, plus persistence on every change
function persistedStore(initial: Record<string, unknown>) {
  const store = createStorePlugin(initial);
  return {
    ...store,
    onState(state: Record<string, unknown>) {
      localStorage.setItem("app-state", JSON.stringify(state));
    },
  };
}

const saved = JSON.parse(localStorage.getItem("app-state") ?? "null");
createApp({
  app: new App(),
  plugins: [persistedStore(saved ?? { theme: "dark" }), createDomPlugin()],
});`;

// the last line contains a template literal, so its backtick and \${ are escaped
const SAMPLE_TEST = `// no framework instance needed — a fake context is three functions
const received: Message[] = [];
const ctx: PluginContext = {
  dispatch: (m) => received.push(m),
  getState: () => ({ dice: 0 }),
  dispatchEffect: () => {},
};

randomPlugin().handle(randomInt({ as: "rolled", min: 1, max: 6 }), ctx);

const value = received[0].payload as number;
if (value < 1 || value > 6) throw new Error(\`out of range: \${value}\`);`;

/* ------------------------------------------------------------------ */

export function renderDocsPage(input: DocsInput): string {
  // examples
  const exampleSections = input.examples
    .map(({ c, svg }, idx) => {
      const id = c.ex.id;
      const stateJson = JSON.stringify(c.ex.state, null, 2);
      return `
<section class="example" id="${esc2(id)}">
  <div class="sec-head"><span class="part-badge">part I · example ${idx + 1}</span><h2>${esc2(c.ex.title)}</h2></div>
  <p class="intro">${c.ex.intro}</p>
  ${figure(svg)}
  <h3>The three views of one template</h3>
  <div class="grid2">
    <div class="stack">
      ${pre("1 · the pavlus template", c.ex.template, { lang: "pavlus" })}
      ${pre("2 · middle data — AST + dependencies", c.astListing)}
    </div>
    <div class="codecard"><div class="codecard-title">3 · target functions — the full module</div>
      <pre class="scroll"><code class="hl" style="${gutterStart(1)}">${codeLines(hlTs(c.code))}</code></pre>
      <p class="tiny">compiled by the real compiler from the template on the left — readable on purpose</p>
    </div>
  </div>
  <h3>The real run</h3>
  <div class="grid3">
    ${pre("state (the input)", stateJson)}
    ${pre("render(state) → vnodes", c.vnodesTree)}
    <div class="codecard"><div class="codecard-title">the browser gets this HTML</div>
      <pre><code>${esc2(c.html)}</code></pre>
      <p class="tiny">DOM plugin <code>build(vnodes)</code> — plain data becomes nodes; events stay data until a listener is attached</p>
    </div>
  </div>
  <h3>diff(prev, next) → patches, step by step</h3>
  ${stepsUi(id, c)}
</section>`;
    })
    .join("\n");

  // users demo patch tabs
  STEPS_DATA["users-demo"] = input.users.patches;
  const usersTabs = input.users.patches
    .map(
      (p, i) =>
        `<button class="step-btn${i === 0 ? " on" : ""}" data-ex="users-demo" data-step="${i}">${esc2(p.label)}</button>`,
    )
    .join("");
  const usersPatchesBlock = `
  <div class="steps-bar">${usersTabs}<span class="steps-note">→ <code data-label="users-demo">${esc2(input.users.patches[0]?.label ?? "")}</code></span></div>
  <pre class="patches" data-patches="users-demo"><code>${esc2(input.users.patches[0]?.json ?? "[]")}</code></pre>`;

  // after exampleSections + users-demo have filled STEPS_DATA
  const dataJson = JSON.stringify(STEPS_DATA).replace(/</g, "\\u003c");

  const body = `<div class="wrap">

<div class="layout">
<aside class="menu" id="menu">
  <div class="group"><a href="#part1">Template engine</a></div>
  <a class="item" href="#text">variables</a>
  <a class="item" href="#attributes">attributes</a>
  <a class="item" href="#events">events</a>
  <a class="item" href="#if">conditions</a>
  <a class="item" href="#for">cycles</a>
  <a class="item" href="#components">components and slots</a>
  <div class="group"><a href="#core">Core</a></div>
  <a class="item" href="#core">the pure concept</a>
  <a class="item" href="#core-source">the core, in full</a>
  <a class="item" href="#core-counter">one click, one tick</a>
  <a class="item" href="#core-users">a real walkthrough</a>
  <a class="item" href="#purity">the purity contract</a>
  <a class="item" href="#glossary">glossary</a>
  <div class="group"><a href="#plugins">Plugins</a></div>
  <a class="item" href="#plugin-dom">DOM</a>
  <a class="item" href="#plugin-http">http</a>
  <a class="item" href="#plugin-store">store</a>
  <a class="item" href="#plugin-logger">logger</a>
  <a class="item" href="#plugin-time">time</a>
  <a class="item" href="#plugin-ws">WebSockets</a>
  <a class="item" href="#plugin-custom">your own plugin</a>
</aside>

<main class="content">

<section class="page-head">
  <span class="part-badge">docs</span>
  <h1>Documentation</h1>
  <p class="lead">Everything below is generated by <code>npm run docs:build</code>:
  the build compiles every example with the real pavlus compiler and runs the real
  runtime — every AST, generated function and patch you see is genuine output,
  not an illustration.</p>
</section>

<section class="part" id="part1">
  <span class="part-badge">part I</span>
  <h2>Templates: from .pavlus to two pure functions</h2>
  <p>A template is an indented tree (pug/slim style). The Vite plugin compiles it on import:
  <code>parser.parse()</code> turns lines into an AST, <code>analyze.nodeDeps()</code> records which
  state roots every subtree reads, and <code>codegen.generate()</code> emits a readable module with
  <code>render</code> and <code>diff</code>. Because the compiler knows each node's dependencies,
  <code>diff</code> skips every subtree whose inputs did not change (<code>===</code> checks) —
  that is the whole trick, and each example below shows it on the real generated code.</p>
  ${figure(input.pipeline)}
</section>

${exampleSections}

<section class="example" id="components">
  <div class="sec-head"><span class="part-badge">part I · composition</span><h2>Components and slots</h2></div>
  <p class="intro">A template embeds another component with <code>+Name#instance(props)</code>:
  the props are expressions on the parent's state and become the child template's state;
  <code>...expr</code> spreads one. Events inside the child are prefixed with the instance
  name automatically — <code>@click=select(user.id)</code> in the <code>users</code> instance
  reaches the parent as <code>users.select</code>. One name ties the three layers together:
  <code>users</code> in the template, <code>users</code> in the parent's <code>children</code>,
  <code>users</code> in the state.</p>
  <div class="grid2">
    ${pre(
      "embed by name — admin-app/frontend/pages/admin/admin.pavlus",
      input.excerpts.embedNamed.code,
      { lang: "pavlus", from: input.excerpts.embedNamed.from },
    )}
    ${pre(
      "the child declaration — admin-app/frontend/pages/admin/admin.ts",
      input.excerpts.childrenDecl.code,
      { lang: "ts", from: input.excerpts.childrenDecl.from },
    )}
  </div>
  <p class="intro">The embed can also be a <em>value in the state</em> (<code>+{expr}#instance</code>):
  the dashboard swaps its users list for a table at runtime, and <code>diff</code> compares the
  component by identity — a different value is <code>clear</code> + <code>insert</code>, the same
  value diffs only its props. This is also how routed pages work: the shell's <code>+outlet</code>
  renders whatever page the router selected.</p>
  ${pre(
    "embed by value — admin-app/frontend/pages/dashboard/overview/overview.pavlus",
    input.excerpts.embedValue.code,
    { lang: "pavlus", from: input.excerpts.embedValue.from },
  )}
  <p class="intro"><strong>Slots</strong> — passing content <em>into</em> a child — are planned,
  not built yet: the roadmap has the parent handing the child its own <code>render</code> /
  <code>diff</code> closures, placed by a <code>slot</code> node in the child's template. Until
  then, composition is props down and messages up. See
  <a href="../../framework/docs/child-views.md">framework/docs/child-views.md</a>.</p>
</section>

<section class="part" id="core">
  <span class="part-badge">part II · core</span>
  <h2>Core: an application that is a function</h2>
  <p class="intro">The compiler gives you pure views; the architecture makes the whole application pure.
  Your handlers never touch the DOM, the network, the clock or randomness: they get a message and the state,
  and return an array of effects — plain data. The core feeds effects to plugins in order; the store plugin
  replaces the state immutably; when the state object identity changes, every plugin gets
  <code>onState(next)</code>, and the DOM plugin turns the change into patches for the browser.
  Purity is a documented contract, not a runtime police: the framework simply gives you nowhere dirty to go.</p>

  <h3>The whole system</h3>
  ${figure(input.pureConcept, "Messages flow in (blue), effects flow out (violet), state flows green, DOM work amber, network cyan. The application island never talks to the browser directly — ever.")}

  <h3 id="core-source">The core, in full</h3>
  <p>This is the whole engine (from <code>framework/src/core/mod.ts</code>): a queue, one call to the app,
  effects to plugins, then <code>onState</code> if the state identity changed. Messages that arrive while a
  tick is running are processed in the same tick.</p>
  ${pre(
    "core — createApp().dispatch · framework/src/core/mod.ts",
    input.excerpts.core.code,
    {
      lang: "ts",
      from: input.excerpts.core.from,
    },
  )}

  <h3 id="core-counter">Simple: one click, one tick</h3>
  <p>A counter. One real message — a click — produces one effect; the store replaces the state; the DOM plugin
  diffs and patches exactly one text node. The patch in the diagram is the real output of the compiled
  template's <code>diff</code>, run by this build.</p>
  ${figure(input.counter.svg)}
  <div class="grid2">
    ${pre("counter.pavlus", input.counter.template, { lang: "pavlus" })}
    ${pre("the whole app", input.counter.app, { lang: "ts" })}
  </div>
  <pre class="patches"><code>${esc2(input.counter.patches.json)}</code></pre>

  <h3 id="core-users">Complex: from the init message to the browser</h3>
  <p>The users app starts with <code>mounted</code> — the first message, dispatched once the view is in the
  DOM. The handler returns a store effect and an HTTP effect; the http plugin fetches; the reply comes back as
  another message; two more store effects flip the branch, and the DOM plugin re-renders. Then a click closes
  the loop. Three ticks, no callbacks — just messages and data.</p>
  ${figure(input.users.svg)}
  <div class="grid2">
    ${pre("users.pavlus", input.users.template, { lang: "pavlus" })}
    ${pre("the whole app", input.users.app, { lang: "ts" })}
  </div>
  ${usersPatchesBlock}

  <h3 id="purity">The purity contract</h3>
  <ul class="pure-list">
    <li>Handlers are pure: no <code>Date.now()</code>, <code>Math.random()</code>, <code>fetch</code>, DOM, logs. Same message + same state ⇒ same effects.</li>
    <li>Effects and patches are plain data; plugins are the only interpreters.</li>
    <li>State is immutable (the store does it); <code>diff</code> trusts <code>===</code>.</li>
    <li>Keep component instances free of mutable fields — the same instance handles every message.</li>
    <li>Need the time? <code>time.now()</code>. Need random? A plugin. The app describes, plugins do.</li>
  </ul>

  <h3 id="glossary">Glossary</h3>
  <table class="t">
    <tr><th>Term</th><th>Meaning</th></tr>
    <tr><td><b>Message</b></td><td>Input of the app: <code>{ id, payload?, event? }</code>. Plain data.</td></tr>
    <tr><td><b>Effect</b></td><td>Output of the app: <code>{ plugin, type, … }</code>. A request for a plugin to act.</td></tr>
    <tr><td><b>Effector</b></td><td>A plugin's typed effect builder: <code>store.set(…)</code>, <code>http.request(…)</code>.</td></tr>
    <tr><td><b>Plugin</b></td><td>Owns side effects and its own state; turns the outside world into messages.</td></tr>
    <tr><td><b>Component</b></td><td>A function or class instance mapping <code>(message, state)</code> to effects; may have a <code>view</code>, <code>children</code>, <code>routing</code>.</td></tr>
    <tr><td><b>Handler</b></td><td>A component method named after the message id it handles.</td></tr>
    <tr><td><b>View</b></td><td>A compiled template: <code>{ render, diff, meta }</code>.</td></tr>
    <tr><td><b>VNode</b></td><td>What <code>render</code> returns: <code>el</code>, <code>text</code> or <code>marker</code> nodes with ids where patched.</td></tr>
    <tr><td><b>Patch</b></td><td>What <code>diff</code> returns: one of eight DOM operations as data.</td></tr>
    <tr><td><b>Marker</b></td><td>An empty comment node delimiting an <code>if</code>, <code>for</code> or embed block.</td></tr>
    <tr><td><b>Guard</b></td><td>The <code>prev.x !== next.x</code> check the compiler emits so unchanged subtrees cost nothing.</td></tr>
  </table>
</section>

<section class="part" id="plugins">
  <span class="part-badge">part III · plugins</span>
  <h2>Plugins: the interpreters of effect data</h2>
  <p class="intro">Every effect names its plugin, and the core routes it by that name — <code>byName.get(effect.plugin)</code>; an effect for an unknown plugin throws. The first plugin with <code>getState()</code> is the state source, plugin names must be unique, and <code>mount</code> needs a plugin named <code>dom</code>. The six built-ins cover DOM, state, network, logs, time and sockets — and writing your own is a small interface.</p>

  <h3 id="plugin-store">The store plugin: state as data</h3>
  <p>State lives in one plugin — the first one with <code>getState()</code>. Handlers never mutate it;
  they return <code>set</code> / <code>merge</code> / <code>remove</code> effects. Updates are pure functions
  with <strong>structural sharing</strong>: untouched branches keep their object identity, which is exactly
  what <code>diff</code>'s <code>===</code> checks need. Every change is recorded with its inverse
  (<code>restoreEffect</code>), so <code>undo</code> and time travel need no snapshots. No-op writes return
  the same state — and trigger no re-render.</p>
  <table class="t">
    <tr><th>Effect</th><th>What it does</th></tr>
    <tr><td><code>store.set(path, value)</code></td><td>Sets the value at <code>path</code>, creating missing parents.</td></tr>
    <tr><td><code>store.merge(path, obj)</code></td><td>Shallow-merges into the object at <code>path</code>.</td></tr>
    <tr><td><code>store.remove(path)</code></td><td>Removes the value; an array element is spliced out.</td></tr>
    <tr><td><code>store.undo(steps?)</code></td><td>Applies the recorded inverse of the last changes.</td></tr>
    <tr><td><code>store.restoreTo(ts)</code></td><td>Undoes everything recorded after <code>ts</code> (time travel).</td></tr>
  </table>
  ${pre(
    "the pure state transition — framework/src/plugins/store/mod.ts",
    input.excerpts.storeApply.code,
    {
      lang: "ts",
      from: input.excerpts.storeApply.from,
    },
  )}
  ${pre(
    "recording + undo — framework/src/plugins/store/mod.ts",
    input.excerpts.storeChange.code,
    {
      lang: "ts",
      from: input.excerpts.storeChange.from,
    },
  )}

  <h3 id="plugin-http">The http plugin: requests are effects, replies are messages</h3>
  <p>A request carries a required <code>id</code>: sending another request with the same id cancels the
  previous one (think search-as-you-type), and a cancelled request never dispatches anything. On success or
  failure the plugin dispatches the <code>onSuccess</code> / <code>onError</code> message — the app never
  sees a promise. On the server the same plugin answers <code>settled()</code> for rendering after load.</p>
  ${pre(
    "the whole surface — framework/src/plugins/http/mod.ts",
    input.excerpts.httpType.code,
    {
      lang: "ts",
      from: input.excerpts.httpType.from,
    },
  )}
  ${pre(
    "fetch + reply — framework/src/plugins/http/mod.ts",
    input.excerpts.httpRun.code,
    {
      lang: "ts",
      from: input.excerpts.httpRun.from,
    },
  )}

  <h3 id="plugin-dom">The dom plugin: the only imperative code</h3>
  <p>Mounting renders the view into the container between two comment markers and registers every node id.
  Updates interpret the eight patch ops. Events are never inline functions: the template's
  <code>@click=remove(user.id)</code> is data (<code>{ id: "remove", payload: user.id }</code>); one stable
  listener per element and event type reads the <em>latest</em> message data and dispatches it — so re-binding
  is a map write, and <code>diff</code> can compare handlers by value.</p>
  <table class="t">
    <tr><th>Patch op</th><th>Meaning</th></tr>
    <tr><td><code>text</code></td><td>Replace a text node's content.</td></tr>
    <tr><td><code>attr</code> / <code>rmAttr</code></td><td>Set or remove an attribute (value/checked mirror properties too).</td></tr>
    <tr><td><code>handler</code></td><td>Rebind an event's message data.</td></tr>
    <tr><td><code>insert</code></td><td>Insert rendered vnodes before a node (new branch, new list item).</td></tr>
    <tr><td><code>clear</code></td><td>Empty the range between two markers (a branch switch).</td></tr>
    <tr><td><code>remove</code> / <code>move</code></td><td>Remove or reorder a sibling range (keyed list reconciliation).</td></tr>
  </table>
  ${pre(
    "listeners are data — framework/src/plugins/dom/mod.ts",
    input.excerpts.domHandler.code,
    {
      lang: "ts",
      from: input.excerpts.domHandler.from,
    },
  )}
  ${pre(
    "patches → DOM — framework/src/plugins/dom/mod.ts",
    input.excerpts.domApply.code,
    {
      lang: "ts",
      from: input.excerpts.domApply.from,
    },
  )}
  ${pre(
    "when the state changes — framework/src/plugins/dom/mod.ts",
    input.excerpts.domOnState.code,
    {
      lang: "ts",
      from: input.excerpts.domOnState.from,
    },
  )}

  <h3 id="plugin-logger">The logger plugin: even logs are effects</h3>
  <p>A handler that needs to say something returns a <code>log.info(…)</code> effect — plain data,
  checked by the same tests as everything else. The logger plugin writes it to the console, or to
  any <code>sink</code>: the frontend tests collect the log lines of an app in an array instead of
  spying on <code>console</code>.</p>
  ${pre(
    "the log effect — framework/src/plugins/logger/mod.ts",
    input.excerpts.loggerType.code,
    { lang: "ts", from: input.excerpts.loggerType.from },
  )}
  ${pre(
    "the whole plugin — framework/src/plugins/logger/mod.ts",
    input.excerpts.loggerPlugin.code,
    { lang: "ts", from: input.excerpts.loggerPlugin.from },
  )}

  <h3 id="plugin-time">The time plugin: the clock is a plugin too</h3>
  <p><code>time.now()</code> replies with the current time as a message; <code>setTimeout</code> and
  <code>setInterval</code> are effects keyed by id — starting a timer with a running id replaces it,
  <code>cancel</code> / <code>cancelAll</code> stop them. The clock itself is injectable
  (<code>now</code>, <code>setTimeout</code>, …), so the same pure handlers run deterministically
  in tests. No <code>Date.now()</code> in application code — that is the purity contract, kept
  honest by giving time an address.</p>
  ${pre(
    "the time effects — framework/src/plugins/time/mod.ts",
    input.excerpts.timeType.code,
    { lang: "ts", from: input.excerpts.timeType.from },
  )}

  <h3 id="plugin-ws">The ws plugin: WebSockets as messages</h3>
  <p>A connection is identified by id: <code>ws.connect({ id, url, onOpen, onMessage, onClose })</code>
  opens it, and every frame arrives as a message — JSON frames parsed, plain text as strings.
  <code>ws.send</code> is an effect like any other, <code>ws.close</code> closes; connecting again
  with the same id replaces the old socket. The socket constructor is injectable, so tests drive
  frames through a fake.</p>
  ${pre(
    "the ws effects — framework/src/plugins/ws/mod.ts",
    input.excerpts.wsType.code,
    { lang: "ts", from: input.excerpts.wsType.from },
  )}
  ${pre(
    "frames become messages — framework/src/plugins/ws/mod.ts",
    input.excerpts.wsFrames.code,
    { lang: "ts", from: input.excerpts.wsFrames.from },
  )}

  <h3 id="plugin-custom">Your own plugin</h3>
  <p class="intro">A plugin is one object: a <code>name</code> and <code>handle(effect, ctx)</code> — with optional <code>init</code>, <code>onState</code> and <code>dispose</code> if you need them. Everything inside a plugin is allowed to be dirty; that is the plugin's whole job. The two types involved:</p>
  <div class="grid2">
    ${pre(
      "Plugin — framework/src/core/types.ts",
      input.excerpts.pluginType.code,
      { lang: "ts", from: input.excerpts.pluginType.from },
    )}
    ${pre(
      "PluginContext — framework/src/core/types.ts",
      input.excerpts.pluginCtx.code,
      { lang: "ts", from: input.excerpts.pluginCtx.from },
    )}
  </div>
  <p class="intro">The rules the core enforces (from <code>framework/src/core/mod.ts</code>): effects route to plugins <strong>by name</strong> — an effect whose <code>plugin</code> matches nothing throws <code>pavlus: no plugin "…"</code>; duplicate plugin names throw at <code>createApp()</code>; the <strong>first</strong> plugin with <code>getState()</code> is the state source (that is the store's seat); <code>mount</code> requires a plugin named <code>dom</code>; and <code>ctx.dispatch()</code> feeds a message back into the loop while <code>ctx.dispatchEffect()</code> applies an effect directly (for devtools and tests).</p>
  ${pre(
    "a minimal custom plugin — sample code, not sliced from the repo",
    SAMPLE_RANDOM,
    { lang: "ts" },
  )}
  <p class="intro">Handlers return its effects like any built-in's, and the plugin answers with a message — the loop stays the loop:</p>
  ${pre("using it — sample code", SAMPLE_USAGE, { lang: "ts" })}
  <p class="intro">Or <strong>wrap a built-in</strong> instead of writing one from scratch: spread it and add hooks — here is the store plugin plus persistence:</p>
  ${pre("customizing the store plugin — sample code", SAMPLE_PERSIST, {
    lang: "ts",
  })}
  <p class="intro">Testing needs no framework instance either: a fake context is three functions, and a plugin is just an object with <code>handle</code>:</p>
  ${pre("a test with a fake context — sample code", SAMPLE_TEST, {
    lang: "ts",
  })}
  <p class="intro"><strong>Checklist for a new plugin:</strong> pick a unique <code>name</code> (it is the routing key); type your effects as <code>MyEffect = Effect &amp; { plugin: "…", type: … }</code>; export an effector helper per effect type (like <code>store.set</code>); do the dirty work in <code>handle</code> and answer with <code>ctx.dispatch()</code>; use <code>onState</code> to react to state changes and <code>dispose</code> to clean up. Register it in the <code>plugins</code> array of <code>createApp()</code> — order matters only for who owns the state.</p>
</section>

</main>
</div>

</div>`;

  return chrome({
    title: "Pavlus — documentation",
    description:
      "pavlus documentation: the template engine, the core message loop, and every plugin — generated from the real compiler output.",
    active: "docs",
    body,
    scripts:
      `<script type="application/json" id="steps-data">${dataJson}</script>` +
      STEPS_SCRIPT,
  });
}

/* ------------------------------------------------------------------ */

export function renderStartPage(input: StartInput): string {
  const flowStepsJson = JSON.stringify(input.flowSteps).replace(
    /</g,
    "\\u003c",
  );

  const body = `<div class="wrap">

<section class="hero">
  <span class="part-badge">a TypeScript framework · plugins do the dirty work</span>
  <h1>The framework where your code is a pure function</h1>
  <p class="lead">pavlus applications are 100% pure functions: a handler takes a message and the state, and returns effects — plain data. Plugins do every dirty thing (DOM, HTTP, time, storage). Templates compile to two pure functions, <code>render(state)</code> and <code>diff(prev,&nbsp;next)</code> — one click becomes a handful of patches, not a re-render.</p>

  <div class="stage">
    <div id="fv-fly"></div>
    <div class="flowviz">
      ${input.flowSvg}
      <div class="fv-bar">
        <button class="fv-btn" id="fv-prev">‹ prev</button>
        <button class="fv-btn primary" id="fv-play">▶ play</button>
        <button class="fv-btn" id="fv-next">next ›</button>
        <span class="fv-phase"></span>
        <div class="fv-dots"></div>
      </div>
      <div class="fv-caption"><span class="fv-counter"></span><code class="fv-label"></code><span class="fv-text"></span></div>
    </div>

    <div class="tb-col">
    <div class="tb" id="toy-browser">
      <div class="tb-chrome"><span class="tb-dot r"></span><span class="tb-dot y"></span><span class="tb-dot g"></span><span class="tb-url" id="tb-url">localhost:3000/</span></div>
      <div class="tb-body">
        <div class="tb-nav"><b>admin</b><span data-nav="overview" class="on">overview</span><span data-nav="users">users</span></div>
        <div class="tb-view" id="tb-view"></div>
      </div>
      <div class="tb-dev">
        <div class="tb-tabs">
          <button class="tb-tab on" data-tab="pavlus">pavlus</button>
          <button class="tb-tab" data-tab="store">store</button>
          <span class="tb-spring"></span>
          <span class="tb-step" id="tb-step"></span>
        </div>
        <div class="tb-line"><span class="tb-chip" id="tb-chip"></span><span class="tb-dbg" id="tb-dbg"></span></div>
        <div class="tb-pane on" data-pane="pavlus"><div class="tb-log" id="tb-log"></div></div>
        <div class="tb-pane" data-pane="store">
          <div class="tb-tl" id="tb-tl"></div>
          <div class="tb-tl-cap"><span id="tb-tl-info"></span> · one circle per change — click to jump</div>
          <div class="tb-commits" id="tb-commits"></div>
        </div>
      </div>
    </div>
    <div class="srv-link"></div>
    <div class="srv" id="fv-srv">
      <span class="srv-led"></span>
      <span class="srv-txt"><b>server</b><span>API · Postgres — the outside world</span></span>
    </div>
    <p class="srv-cap">only the browser talks to the server</p>
    </div>
  </div>

  <p class="tiny">Left — your application as one island (app + core) with the plugin column: every plugin touches exactly two neighbours — the core and the browser. The server lives under the toy browser, and only the browser talks to it: requests fly in through the browser and drop down to the server — watch the light flash green. The devbar under the browser shows every message, effect and patch in simple mode. Prefer it static? The fully annotated diagram lives in the <a href="docs.html#core">docs, in "Core"</a>.</p>

  <div class="cta-row">
    <a class="cta primary" href="docs.html">Read the docs</a>
    <a class="cta" href="about.html">About the concept</a>
    <a class="cta" href="https://www.npmjs.com/package/@service-laboratory/pavlus">npm ↗</a>
  </div>
</section>

<section class="part" id="why">
  <span class="part-badge">why pavlus</span>
  <h2>Why: the dirty work belongs to plugins, not to you</h2>
  <div class="motivation">
    <div class="concept"><b>Handlers stay pure</b> <span class="k">app(message, state) → Effect[]</span><p>Same message + same state ⇒ same effects. No Date.now(), no fetch(), no DOM in application code — so every handler is tested by calling it with data.</p></div>
    <div class="concept"><b>Effects are data, not callbacks</b> <span class="k">{ plugin, type, … }</span><p>A handler returns an array of plain effects. Plugins (dom, store, http, time, ws, logger) interpret them. No promise chains, no event spaghetti, no spies.</p></div>
    <div class="concept"><b>Templates compile to pure functions</b> <span class="k">render · diff</span><p>The compiler records which state roots every subtree reads; diff skips everything whose inputs did not change (=== checks), so a click patches one text node.</p></div>
    <div class="concept"><b>SSR falls out for free</b> <span class="k">same render on the server</span><p>The same pure render(state) produces HTML on the server; the http plugin answers settled() once data has loaded. One mental model everywhere.</p></div>
  </div>

  <div class="flow">DOM event / HTTP reply / timer / WS frame
        │  plugins turn the outside world into messages
        ▼
  core:  app(message, state) → effects[]      ← pure, deterministic
        │  effects are plain data
        ▼
  plugins: dom · store · http · ws · time · logger · router · yours</div>
</section>

</div>`;

  return chrome({
    title: "Pavlus — the framework where your code is a pure function",
    description:
      "pavlus is a TypeScript framework where the application is a pure function: app(message, state) → Effect[]. Plugins do the dirty work.",
    active: "home",
    body,
    scripts:
      `<script type="application/json" id="flow-steps">${flowStepsJson}</script>` +
      FLOWVIZ_SCRIPT,
  });
}

/* ------------------------------------------------------------------ */

export function renderAboutPage(): string {
  const body = `<div class="wrap">

<section class="page-head">
  <span class="part-badge">about</span>
  <h1>pavlus — an application that is a function</h1>
  <p class="lead">pavlus (npm: <code>@service-laboratory/pavlus</code>) is a TypeScript framework where the whole application is a pure function: <code>app(message, state) → Effect[]</code>. The framework's job is to make that practical — a compiler, a tiny core, and plugins that do the dirty work.</p>
</section>

<section>
  <h2>The pieces</h2>
  <p>The <strong>compiler</strong> turns <code>.pavlus</code> templates (an indented tree, pug-style) into two pure functions, <code>render(state)</code> and <code>diff(prev, next)</code>. Because it records which state roots every subtree reads, <code>diff</code> skips unchanged subtrees with a <code>===</code> check — updates are eight kinds of small patch ops, never a re-render of the world.</p>
  <p>The <strong>core</strong> is a message loop: it calls the app with each message, hands the returned effects to the plugins in order, and notifies every plugin when the state identity changed. That is the entire engine — the six actors around it (browser, dom, store, http, the app island, the core) only talk through data: messages in, effects out.</p>
  <p>The <strong>plugins</strong> own everything impure: DOM, state, network, logs, timers, sockets — and <code>admin-app/</code> in the repo is a complete real application built this way (dashboard, users CRUD, shop, billing, backed by Postgres). This site is generated: the build compiles every documented example with the real compiler and runs the real runtime.</p>
</section>

<section>
  <h2>The six concepts</h2>
  <div class="concept-grid">
    <div class="concept"><b>Message</b> <span class="k">{ id, payload?, event? }</span><p>The input of the app. Everything that happens outside — a click, an HTTP reply, a timer — arrives as one.</p></div>
    <div class="concept"><b>Effect</b> <span class="k">{ plugin, type, … }</span><p>The output of the app. A request for a plugin to do something. Not a callback — data.</p></div>
    <div class="concept"><b>Handler</b> <span class="k">load(msg, state, ctx)</span><p>A component method named after the message id it handles. No switch, no registry.</p></div>
    <div class="concept"><b>Plugin</b> <span class="k">{ name, handle, … }</span><p>Owns every side effect and its own state, and turns the outside world into messages.</p></div>
    <div class="concept"><b>View</b> <span class="k">{ render, diff, meta }</span><p>A compiled template. Both functions are pure — the DOM plugin is their only interpreter.</p></div>
    <div class="concept"><b>Patch</b> <span class="k">{ op: "text", … }</span><p>What <code>diff</code> returns: one of eight DOM operations, as data. The DOM effect of a state change.</p></div>
  </div>
</section>

<section>
  <h2>Where to go</h2>
  <table class="t">
    <tr><th>What</th><th>Where</th></tr>
    <tr><td>docs on this site</td><td><a href="docs.html">docs.html</a> — the template engine, the core, the plugins</td></tr>
    <tr><td>the pure concept</td><td><a href="docs.html#core">docs.html#core</a> — the six actors and the whole core source</td></tr>
    <tr><td>framework README</td><td><a href="../../framework/README.md">framework/README.md</a></td></tr>
    <tr><td>architecture</td><td><a href="../../framework/docs/architecture.md">framework/docs/architecture.md</a></td></tr>
    <tr><td>reference application</td><td><a href="../../admin-app/">admin-app/</a></td></tr>
    <tr><td>the package</td><td><a href="https://www.npmjs.com/package/@service-laboratory/pavlus">@service-laboratory/pavlus</a></td></tr>
  </table>
  <p class="tiny">Generated by <code>docs/site/scripts/build.ts</code> — <code>npm run docs:build</code> regenerates all three pages.</p>
</section>

</div>`;

  return chrome({
    title: "Pavlus — about",
    description: "What pavlus is, how it is built, and where to read next.",
    active: "about",
    body,
  });
}
