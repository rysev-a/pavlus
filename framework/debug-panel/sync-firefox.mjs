/**
 * Copies the shared extension files from `extension/` (Chrome) to
 * `extension-firefox/`. Everything except `manifest.json` is identical:
 * Firefox has no service workers, so only its manifest differs (MV2 with a
 * persistent background page). Run this after editing the panel:
 *
 *     npm run debug:sync-firefox
 */
import { copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const from = join(here, "extension");
const to = join(here, "extension-firefox");

for (const f of [
  "background.js",
  "content.js",
  "devtools.html",
  "devtools.js",
  "panel.html",
  "panel.css",
  "panel.js",
]) {
  copyFileSync(join(from, f), join(to, f));
}

console.log("extension-firefox/ synced with extension/");
