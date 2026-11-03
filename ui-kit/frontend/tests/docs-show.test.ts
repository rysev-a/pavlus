import { test } from "vitest";
import { runDemo } from "../docs/demo.ts";

/**
 * A helper for writing the Docs, not a test of the site: prints what a demo
 * really produces, so the text of a page can quote it.
 *
 *   SHOW=<slug>:<demo> npx vitest run frontend/tests/docs-show.test.ts
 *
 * (`SHOW=<slug>` shows every demo of the page).
 */
const want = process.env.SHOW;
const join = (lines: { tokens: { t: string }[] }[]) =>
  lines.map((l) => l.tokens.map((t) => t.t).join("")).join("\n");

test.skipIf(!want)("show", async () => {
  const [slug, only] = want!.split(":");
  const { demos } = await import(`../docs/demos/${slug}.ts`);
  for (const [name, demo] of Object.entries(demos)) {
    if (only && only !== name) continue;
    const v = runDemo(name, demo as never, []);
    const out = [`===== ${name} =====`, v.error && `ERROR: ${v.error}`];
    out.push("--- html ---", join(v.html));
    out.push("--- ast ---", join(v.ast));
    for (const s of v.steps) out.push(`--- patches: ${s.label} ---`, join(s.patches));
    out.push("--- vnodes ---", join(v.vnodes));
    out.push("--- module ---", join(v.module));
    process.stderr.write(out.filter(Boolean).join("\n") + "\n");
  }
});
