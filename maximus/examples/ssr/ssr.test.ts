import { afterEach, describe, expect, it, vi } from "vitest";
import { hydrate, renderToString } from "../../src/mod.ts";
import { clearCache } from "../../src/resource/mod.ts";
import { fire, flush } from "../../src/testing/mod.ts";
import { delay } from "../shop/api.ts";
import { SsrApp } from "./app.ts";

afterEach(() => {
  clearCache();
  document.body.innerHTML = "";
});

describe("ssr example: hydrate keeps node identity", () => {
  it("adopts the server markup, does not refetch, and is interactive", async () => {
    delay.ms = 5;
    const fetches = vi.fn();
    const markup = await renderToString(() => SsrApp({ onFetch: fetches }), {
      url: "/products/3",
    });
    expect(fetches).toHaveBeenCalledTimes(1); // the server fetched
    expect(markup).toContain("Jasmine Pearl");

    history.pushState(null, "", "/products/3"); // what the browser's address bar says
    const app = document.body.appendChild(document.createElement("div"));
    app.innerHTML = markup;
    const selectors = ["header", "nav", "main", "article", "h1", "button"];
    const before = selectors.map((s) => app.querySelector(s));
    expect(before.every((n) => n !== null)).toBe(true);

    const mismatch = vi.fn();
    const dispose = hydrate(() => SsrApp({ onFetch: fetches }), app, {
      onMismatch: mismatch,
    });
    expect(mismatch).not.toHaveBeenCalled();
    selectors.forEach((s, i) =>
      expect(app.querySelector(s), s).toBe(before[i]),
    );

    await new Promise((r) => setTimeout(r, 20));
    expect(fetches).toHaveBeenCalledTimes(1); // the client did not (staleTime 60 s)
    expect(app.querySelector("#__MAXIMUS_STATE__")).toBeNull();

    // handlers are live on the adopted nodes
    fire(app.querySelector("button")!, "click");
    await flush();
    expect(app.querySelector("output")!.textContent).toBe("1");
    expect(app.querySelector("article")).toBe(before[3]);
    dispose();
  });
});
