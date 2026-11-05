import { test } from "vitest";
import { DEMOS } from "../templates/flow-studio/demos.ts";
import { simulate, traceText, outcomes } from "../templates/flow-studio/engine.ts";
test("print", () => {
  for (const d of DEMOS) {
    const m = d.make();
    const t = simulate(m, m.scenario, 1);
    console.log("=== " + d.title + "\n" + traceText(t) + "\n" + JSON.stringify(outcomes(t).map(o=>[o.rid,o.result,o.status,o.ms])));
  }
});
import { generateAll } from "../templates/flow-studio/codegen.ts";
import { parseSync } from "vite";
test("codegen", () => {
  for (const d of DEMOS) {
    const m = d.make();
    for (const f of generateAll(m)) {
      const r = parseSync(f.path, f.code, { lang: "ts" });
      if (r.errors.length) console.log("PARSE ERR", d.id, f.path, r.errors[0].message, "\n" + f.code);
    }
  }
  const m = DEMOS[0].make();
  for (const f of generateAll(m)) if (/login|test|frontend|main/.test(f.path)) console.log("--- " + f.path + "\n" + f.code);
});
