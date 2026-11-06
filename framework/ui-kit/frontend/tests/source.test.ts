// @vitest-environment jsdom
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import {
  createSourcePlugin,
  filesOf,
  highlight,
  sourceEffector,
} from "../source.ts";

// (under jsdom the global URL is not Node's: use the working directory, which is ui-kit/)
const frontend = join(process.cwd(), "frontend");

function* files(dir: string): Generator<string> {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== "tests") yield* files(path);
    } else if (/\.(pavlus|ts|css)$/.test(e.name)) yield path;
  }
}

test("the tokens of every line join back to the line, for every source file of the kit", () => {
  let count = 0;
  for (const file of files(frontend)) {
    const text = readFileSync(file, "utf8");
    const lines = highlight(file, text);
    const back = lines.map((l) => l.tokens.map((t) => t.t).join("")).join("\n");
    expect(back, file).toBe(text);
    count++;
  }
  expect(count).toBeGreaterThan(200);
});

test("pavlus, TypeScript and CSS get their own classes", () => {
  const classes = (file: string, text: string) =>
    highlight(file, text).flatMap((l) => l.tokens.map((t) => `${t.c}:${t.t}`));

  expect(
    classes(
      "a.pavlus",
      'a.link(href={url} @click.prevent=go("x")) Hi\n// note\n| text {name}\nfor item in items key item.id',
    ),
  ).toEqual(
    expect.arrayContaining([
      "tag:a",
      "attr:.link",
      "prop:href",
      "expr:{url}",
      "event:@click.prevent",
      'string:"x"',
      "comment:// note",
      "keyword:|",
      "expr:{name}",
      "keyword:for",
      "keyword:in",
      "keyword:key",
    ]),
  );
  expect(
    classes("a.ts", 'export class A extends B { x = 1; // c\n  s = "q"; }'),
  ).toEqual(
    expect.arrayContaining([
      "keyword:export",
      "keyword:class",
      "type:A",
      "keyword:extends",
      "number:1",
      "comment:// c",
      'string:"q"',
    ]),
  );
  // a block comment that spans lines stays a comment on every line
  const block = highlight("a.css", "/* one\ntwo */ .a { color: red; }");
  expect(block[0].tokens.map((t) => t.c)).toEqual(["comment"]);
  expect(block[1].tokens[0]).toMatchObject({ c: "comment", t: "two */" });
  expect(block[1].tokens.some((t) => t.c === "prop" && t.t === "color")).toBe(
    true,
  );
});

test("the files of a folder: the template first, the logic, the stylesheet, meta last", () => {
  const keys = [
    "./blocks/hero/meta.ts",
    "./blocks/hero/hero.css",
    "./blocks/hero/view.pavlus",
    "./blocks/hero/hero.ts",
    "./blocks/hero/hero.pavlus",
    "./blocks/auth/auth.pavlus",
  ];
  expect(filesOf("blocks/hero", "hero", keys)).toEqual([
    "hero.pavlus",
    "hero.ts",
    "view.pavlus",
    "hero.css",
    "meta.ts",
  ]);
  // the real folders of the kit
  expect(filesOf("blocks/auth", "auth")[0]).toBe("auth.pavlus");
  expect(filesOf("pages/button", "button")).toEqual(["button.pavlus"]);
});

test("the source plugin answers with the text, or with an error for a file it does not have", async () => {
  const sent: unknown[] = [];
  const ctx = { dispatch: (m: unknown) => sent.push(m) } as never;
  const plugin = createSourcePlugin({ "./x/y.ts": async () => "let a;" });
  plugin.handle(sourceEffector.load("./x/y.ts", "ok", "bad"), ctx);
  plugin.handle(sourceEffector.load("./x/none.ts", "ok", "bad"), ctx);
  await new Promise((r) => setTimeout(r, 0));
  expect(sent).toEqual([
    { id: "bad", payload: "./x/none.ts" },
    { id: "ok", payload: { path: "./x/y.ts", text: "let a;" } },
  ]);
});

test("the Source tab shows the file of the page, keeps the page mounted, and switches files", async () => {
  window.matchMedia = (() => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
  document.body.innerHTML = `<div id="app"></div>`;
  window.history.replaceState(null, "", "/tabs");
  await import("../main.ts");
  const click = (sel: string, nth = 0) =>
    (document.querySelectorAll(sel)[nth] as HTMLElement).click();
  const until = async (test: () => boolean) => {
    for (let i = 0; i < 100 && !test(); i++)
      await new Promise((r) => setTimeout(r, 20));
    expect(test()).toBe(true);
  };

  expect(document.querySelector(".k-source")).toBeNull();
  click(".k-viewtabs .ui-tabs-trigger", 1);
  await until(() => document.querySelectorAll(".k-source__line").length > 5);
  expect(document.querySelector(".k-pane")?.className).toContain(
    "k-pane--hidden",
  );
  expect(document.querySelector(".k-source__code")?.textContent).toContain(
    "ui-tabs-list",
  );
  expect(
    document.querySelectorAll(".k-source__files button").length,
  ).toBeGreaterThanOrEqual(2);

  // the logic file
  click(".k-source__files button", 1);
  await until(
    () =>
      !!document
        .querySelector(".k-source__code")
        ?.textContent?.includes("class Tabs"),
  );

  // back to the page, which was never unmounted
  click(".k-viewtabs .ui-tabs-trigger", 0);
  expect(document.querySelector(".k-source")).toBeNull();
  expect(document.querySelector(".k-pane")?.className).not.toContain(
    "k-pane--hidden",
  );
  expect(document.querySelector(".ui-tabs-content")).not.toBeNull();
}, 30_000);
