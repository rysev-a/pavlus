// @vitest-environment node
import { describe, expect, it } from "vitest";
import { delay } from "../shop/api.ts";
import { renderPage, streamPage } from "./render.ts";

describe("ssr example without a DOM", () => {
  it("has no document or window", () => {
    expect(typeof document).toBe("undefined");
    expect(typeof window).toBe("undefined");
  });

  it("renders the product page for a url", async () => {
    delay.ms = 5;
    const html = await renderPage("/products/2");
    expect(html).toContain("Earl Grey");
    expect(html).toContain('id="__MAXIMUS_STATE__"');
    expect(await renderPage("/nope")).toContain("Not found");
  });

  it("streams the shell before the product", async () => {
    delay.ms = 20;
    const chunks: string[] = [];
    const reader = streamPage("/products/4").getReader();
    for (;;) {
      const r = await reader.read();
      if (r.done) break;
      chunks.push(r.value);
    }
    expect(chunks[0]).toContain("Loading product...");
    expect(chunks[0]).not.toContain("Rooibos");
    const rest = chunks.slice(1).join("");
    expect(rest).toContain("Rooibos");
    expect(rest).toContain("__MAXIMUS_STATE__");
  });
});
