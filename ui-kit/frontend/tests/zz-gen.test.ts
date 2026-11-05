import { test } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { DEMOS } from "../templates/flow-studio/demos.ts";
import { generateAll } from "../templates/flow-studio/codegen.ts";
test("write", () => {
  for (const d of DEMOS) {
    const root = join("/home/user/pavlus/server/.tmp-gen", d.id);
    rmSync(root, { recursive: true, force: true });
    for (const f of generateAll(d.make())) {
      const p = join(root, f.path);
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, f.code);
    }
  }
});
