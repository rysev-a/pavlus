// @vitest-environment node
import { describe, expect, it } from "vitest";
import { signal } from "../core/mod.ts";
import { each, html, show } from "../dom/mod.ts";
import { renderToStream, renderToString } from "./mod.ts";

describe("ssr without a DOM", () => {
  it("has no document, window or jsdom", () => {
    expect(typeof document).toBe("undefined");
    expect(typeof window).toBe("undefined");
  });

  it("renders the same component code to a string", async () => {
    const items = signal([1, 2, 3]);
    const App = () =>
      html`<ul class="list">
          ${each(
            items,
            (n) => n,
            (n) => html`<li>${n}</li>`,
          )}
        </ul>
        ${show(
          () => items().length > 2,
          () => html`<p>many</p>`,
        )}`;
    const out = await renderToString(App);
    expect(out).toContain('<ul class="list"');
    expect(out).toMatch(
      /<li[^>]*>1<\/li>.*<li[^>]*>2<\/li>.*<li[^>]*>3<\/li>/s,
    );
    expect(out).toContain("many");
  });

  it("streams", async () => {
    const reader = renderToStream(() => html`<p>${"hi"}</p>`).getReader();
    const first = await reader.read();
    expect(first.value).toContain("hi");
    expect((await reader.read()).done).toBe(true);
  });
});
