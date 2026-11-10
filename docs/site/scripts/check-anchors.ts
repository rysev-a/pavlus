/**
 * Checks that every fragment link in the built site resolves: same-page
 * #anchors, cross-page page.html#anchor, page-to-page links and repo-relative
 * links (GitHub URLs of the repository). Run after `npm run docs:build`:
 * node docs/site/scripts/check-anchors.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const site = join(here, "..");
const repo = join(here, "..", "..", "..");
const pages = ["index.html", "docs.html", "about.html"];

let failures = 0;
const fail = (msg: string): void => {
  failures += 1;
  console.log(`FAIL: ${msg}`);
};

const idsOf = (html: string): Set<string> =>
  new Set([...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]));

const htmls = new Map<string, string>(
  pages.map((p) => [p, readFileSync(join(site, p), "utf8")]),
);

for (const [page, html] of htmls) {
  const ids = idsOf(html);

  // same-page fragments
  for (const frag of new Set(
    [...html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]),
  )) {
    if (!ids.has(frag)) fail(`${page}: #${frag} does not resolve`);
  }

  // cross-page links and fragments
  const pageRe = /href="([a-z-]+\.html)(#[^"]+)?"/g;
  for (const [, target, frag] of [...html.matchAll(pageRe)]) {
    const targetHtml = htmls.get(target);
    if (targetHtml === undefined) {
      fail(`${page}: ${target} missing from the site`);
      continue;
    }
    if (frag && !idsOf(targetHtml).has(frag.slice(1))) {
      fail(`${page}: ${target}${frag} does not resolve`);
    }
  }

  // links into the repository (GitHub URLs): the file or folder must exist
  for (const [, rel] of html.matchAll(
    /href="https:\/\/github\.com\/rysev-a\/pavlus\/(?:blob|tree)\/main\/([A-Za-z0-9_./-]+)"/g,
  )) {
    if (!existsSync(join(repo, rel))) fail(`${page}: ${rel} does not exist`);
  }
}

if (failures === 0) console.log("anchors: ok");
else {
  console.log(`${failures} failure(s)`);
  process.exitCode = 1;
}
