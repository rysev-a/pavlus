// Writes the built-in manifests of the plugin library from the plugins of
// @pavlus/backend:  node scripts/gen-plugin-library.ts
// (run it again after a plugin of the server gets a new effect; a test fails until you do)
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { builtinFiles } from "../frontend/plugin-library/build.ts";

const here = dirname(fileURLToPath(import.meta.url));
const server = join(here, "../../backend/src/plugins");
const out = join(here, "../frontend/plugin-library/builtin");
mkdirSync(out, { recursive: true });
for (const f of builtinFiles((dir) =>
  readFileSync(join(server, dir, "mod.ts"), "utf8"),
)) {
  writeFileSync(join(out, f.file), f.json);
  console.log(`builtin/${f.file}`);
}
