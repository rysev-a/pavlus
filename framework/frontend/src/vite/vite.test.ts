import { expect, test } from "vitest";
import { pavlus } from "./mod.ts";

test("compiles .pavlus files, ignores others, reports template errors with the file", () => {
  const plugin = pavlus();
  const ctx = {
    error(m: string): never {
      throw new Error(m);
    },
  };
  expect(plugin.transform.call(ctx, "p hi", "/a.ts")).toBeNull();
  // asking for the raw text or the url of a template must not compile it
  for (const q of ["?raw", "?url", "?inline", "?foo&raw"]) {
    expect(
      plugin.transform.call(ctx, "p hi", `/a/page.pavlus${q}`),
      q,
    ).toBeNull();
  }
  const out = plugin.transform.call(ctx, "p hi", "/a/page.pavlus?x=1");
  expect(out?.code).toContain("export default { render, diff, meta }");
  // "no source map": Vite must not invent one that maps the code onto itself
  expect(out?.map).toEqual({ mappings: "" });
  expect(() => plugin.transform.call(ctx, "p {a +}", "/a/page.pavlus")).toThrow(
    /page\.pavlus: .*line 1/,
  );
});
