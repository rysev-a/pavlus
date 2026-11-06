// Writes the project of a Flow Studio design to a folder:
//   node scripts/flow-generate.ts <demo id | design.json> <folder> [--name coffee-shop-app] [--port 3020]
// A demo id is one of the built-in designs (coffee, login, todo, ...); a file is
// the JSON a design was exported as.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { demoOf, DEMOS } from "../frontend/templates/flow-studio/demos.ts";
import { parseProject } from "../frontend/templates/flow-studio/model.ts";
import { generateProject } from "../frontend/templates/flow-studio/project.ts";

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const [from, out] = args.filter(
  (a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"),
);
if (!from || !out) {
  console.error(
    `usage: flow-generate <${DEMOS.map((d) => d.id).join("|")}|design.json> <folder> [--name n] [--port 3020]`,
  );
  process.exit(2);
}

const design = DEMOS.some((d) => d.id === from)
  ? demoOf(from).make()
  : parseProject(readFileSync(resolve(from), "utf8"));
if (typeof design === "string") {
  console.error(design);
  process.exit(1);
}
const files = generateProject(design, {
  name: flag("name"),
  port: flag("port") ? Number(flag("port")) : undefined,
});
for (const f of files) {
  const path = join(resolve(out), f.path);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, f.code);
}
console.log(`${files.length} files in ${resolve(out)}`);
