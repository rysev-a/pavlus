// `applications/coffee-shop/` is generated: this keeps it what the design makes
// (`node ui-kit/scripts/flow-generate.ts coffee applications/coffee-shop --name coffee-shop`),
// and checks the project that is made for it.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { parseSync } from "vite";
import { describe, expect, test } from "vitest";
import { coffeeDemo } from "../templates/flow-studio/demo-coffee.ts";
import { generateProject } from "../templates/flow-studio/project.ts";
import { schemaSql } from "../templates/flow-studio/schema.ts";

const APP = join(__dirname, "../../../../applications/coffee-shop");
const files = generateProject(coffeeDemo(), { name: "coffee-shop" });

const ROOT = join(__dirname, "../../../..");

/** what the formatter of the repository makes of generated code (the app is kept formatted, imports in order) */
const formatted = (path: string, code: string): string =>
  path.endsWith(".ts")
    ? execFileSync(
        join(ROOT, "node_modules/.bin/biome"),
        ["check", "--write", "--stdin-file-path", join(APP, path)],
        { input: code, cwd: ROOT, encoding: "utf8" },
      )
    : code;

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (f === "node_modules") return [];
    return statSync(p).isDirectory() ? walk(p) : [relative(APP, p)];
  });

describe("coffee-shop is the app of the design", () => {
  test("every file of it is what Flow Studio generates", () => {
    for (const f of files) {
      expect(existsSync(join(APP, f.path)), f.path).toBe(true);
      expect(readFileSync(join(APP, f.path), "utf8"), f.path).toBe(
        formatted(f.path, f.code),
      );
    }
  });

  test("and there is no file that the design does not make", () => {
    expect(walk(APP).sort()).toEqual(files.map((f) => f.path).sort());
  });
});

describe("the project that is made", () => {
  const by = (path: string) => files.find((f) => f.path === path)!.code;

  test("is a runnable @pavlus/backend package with a Postgres for development", () => {
    const pkg = JSON.parse(by("package.json"));
    expect(pkg.name).toBe("coffee-shop");
    expect(pkg.scripts.start).toContain("server/main.ts");
    expect(Object.keys(pkg.dependencies)).toEqual([
      "@pavlus/frontend",
      "@pavlus/backend",
      "pg",
    ]);
    expect(by("compose.yaml")).toContain("postgres:16-alpine");
    expect(by(".env.example")).toContain(
      "DATABASE_URL=postgres://app:app@127.0.0.1:54330/coffee_shop",
    );
    expect(by("README.md")).toContain("`POST /orders`");
  });

  test("the server waits for its tables before it listens", () => {
    const main = by("server/main.ts");
    expect(main.indexOf("await ensureDatabase(")).toBeGreaterThan(0);
    expect(main.indexOf("await ensureDatabase(")).toBeLessThan(
      main.indexOf("createServerApp({"),
    );
    expect(by("server/db.ts")).toContain("setval(");
  });

  test("the schema is made from the rows of the design", () => {
    const sql = schemaSql(coffeeDemo().db);
    expect(sql).toContain('"id" serial primary key');
    expect(sql).toContain('"email" text not null');
    expect(sql).toContain('constraint "customers_email_key" unique ("email")');
    expect(sql).toContain('"price" double precision');
    expect(sql).toContain('"active" boolean');
    expect(sql).toContain('"items" jsonb');
    expect(sql).toContain('"created_at" timestamptz');
    expect(sql).toContain('"points" integer');
  });

  test("every typescript file parses", () => {
    for (const f of files.filter((x) => x.path.endsWith(".ts"))) {
      expect(
        parseSync(f.path, f.code, { lang: "ts" }).errors.map((e) => e.message),
        f.path,
      ).toEqual([]);
    }
  });
});
