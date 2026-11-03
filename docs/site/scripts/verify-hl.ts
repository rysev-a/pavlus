/**
 * Checks the highlighted code blocks of the built page. Excerpt cards whose
 * title names a real file are verified against that file at their gutter
 * offset, so gutters cannot silently drift. Run after `npm run docs:build`:
 * node docs/site/scripts/verify-hl.ts
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const site = join(here, "..");
const repo = join(here, "..", "..", "..");
const s = readFileSync(join(site, "docs.html"), "utf8");

let failures = 0;
const check = (ok: boolean, msg: string): void => {
  if (!ok) {
    failures += 1;
    console.log(`FAIL: ${msg}`);
  }
};

// every code.hl block exists, has gutter metadata and balanced per-line spans
const blocks = [...s.matchAll(/<code class="hl"[^>]*>([\s\S]*?)<\/code>/g)];
check(
  blocks.length >= 26,
  `expected >= 26 highlighted blocks, got ${blocks.length}`,
);
for (const [, body] of blocks) {
  for (const line of body.split('<span class="line">').slice(1)) {
    // the fragment ends with the .line closer: inner spans = closes - 1
    const open = (line.match(/<span class="tk-/g) ?? []).length;
    const close = (line.match(/<\/span>/g) ?? []).length;
    check(
      open === close - 1,
      `unbalanced spans in line: ${line.slice(0, 100)}`,
    );
  }
}

// decode the handful of entities esc() produces (&amp; last)
const unesc = (t: string): string =>
  t
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");

// excerpt text from a highlighted body: one entry per <span class="line">
const excerptLines = (body: string): string[] =>
  body
    .split('<span class="line">')
    .slice(1)
    .map((l) => unesc(l.replace(/<[^>]+>/g, "")).trimEnd());

// excerpt cards: title, gutter reset and body. counter-reset: ln N means the
// first excerpt line is source line N+1 (see gutterStart in highlight.ts)
const cards = [
  ...s.matchAll(
    /<div class="codecard-title">([^<]+)<\/div>\s*<pre[^>]*><code class="hl" style="counter-reset: ln (\d+)">([\s\S]*?)<\/code>/g,
  ),
];
const pathRe = /((?:framework|admin-app)\/[A-Za-z0-9_/.-]+\.(?:ts|pavlus))/;
const seen = new Set<string>();
let verified = 0;
for (const [, title, reset, body] of cards) {
  const m = title.match(pathRe);
  if (!m) continue; // sample code and compiled examples have no real source
  const file = m[1];
  const start = Number(reset) + 1;
  const key = `${file}:${start}`;
  check(!seen.has(key), `duplicate excerpt anchor ${key} (${title})`);
  seen.add(key);
  const lines = excerptLines(body);
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  const src = readFileSync(join(repo, file), "utf8").split("\n");
  const slice = src.slice(start - 1, start - 1 + lines.length);
  if (
    check(
      slice.length === lines.length,
      `${key}: excerpt wants ${lines.length} lines, source has ${slice.length} there (${title})`,
    )
  ) {
    continue;
  }
  const bad = lines.findIndex((l, i) => l !== slice[i].trimEnd());
  check(
    bad === -1,
    `${key}: line ${start + bad} drifted (${title})\n  excerpt: ${lines[bad]}\n  source:  ${slice[bad]?.trimEnd()}`,
  );
  if (bad === -1) verified += 1;
}
check(
  verified >= 15,
  `only ${verified} excerpts verified against source, expected >= 15`,
);

// patch JSON blocks are runtime-highlighted
check(
  s.includes('<pre class="patches"><code>['),
  "plain patches block missing",
);

// the inline script must be valid JS
const script = s.match(/<script>\n([\s\S]*?)<\/script>/);
check(script !== null, "inline script not found");
if (script) new Function(script[1]);

if (failures === 0) {
  console.log(
    `highlight check: ok (${verified} excerpts verified against source)`,
  );
} else {
  console.log(`${failures} failure(s)`);
  process.exitCode = 1;
}
