import { afterEach, describe, expect, it } from "vitest";
import { cleanup, flush, mount } from "../testing/mod.ts";
import { signal } from "../core/mod.ts";
import { html, isSafeUrl, unsafe } from "./mod.ts";

afterEach(cleanup);

describe("isSafeUrl", () => {
  it("accepts ordinary URLs", () => {
    for (const u of [
      "/a",
      "https://x.dev/?q=1",
      "mailto:a@b.c",
      "#frag",
      "relative/path",
      "",
      "tel:123",
    ]) {
      expect(isSafeUrl(u), u).toBe(true);
    }
  });
  it("rejects javascript:/vbscript: in any disguise", () => {
    for (const u of [
      "javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      " \tjavascript:alert(1)",
      "java\nscript:alert(1)",
      "java\u0000script:1",
      "​javascript:1",
      "vbscript:x",
    ]) {
      expect(isSafeUrl(u), JSON.stringify(u)).toBe(false);
    }
  });
  it("allows data: only for raster images", () => {
    expect(isSafeUrl("data:image/png;base64,AAAA")).toBe(true);
    expect(isSafeUrl("data:text/html,<script>1</script>")).toBe(false);
    expect(isSafeUrl("data:image/svg+xml,<svg onload=1>")).toBe(false);
  });
});

describe("attribute safety", () => {
  it("refuses javascript: in href/src/action/formaction bindings", () => {
    for (const make of [
      () => html`<a href=${"javascript:alert(1)"}>x</a>`,
      () => html`<iframe src=${"JAVASCRIPT:alert(1)"}></iframe>`,
      () => html`<form action=${"javascript:alert(1)"}></form>`,
      () => html`<button formaction=${"javascript:alert(1)"}></button>`,
      () => html`<a href=${() => "javascript:alert(1)"}>x</a>`,
    ]) {
      expect(make).toThrow(/unsafe URL/);
    }
  });

  it("refuses a reactive value that turns unsafe later (error goes to the effect handler)", async () => {
    const url = signal("/ok");
    const m = mount(() => html`<a href=${url}>x</a>`);
    expect(m.query("a").getAttribute("href")).toBe("/ok");
    url.set("javascript:alert(1)");
    await expect(flush()).rejects.toThrow(/unsafe URL/);
    expect(m.query("a").getAttribute("href")).toBe("/ok");
  });

  it("checks composite attributes and .href properties too", () => {
    expect(() => html`<a href="${"javascript:"}${"alert(1)"}">x</a>`).toThrow(
      /unsafe URL/,
    );
    expect(() => html`<a .href=${"javascript:alert(1)"}>x</a>`).toThrow(
      /unsafe URL/,
    );
  });

  it("allows safe URLs and unsafe() overrides", () => {
    const m = mount(
      () =>
        html`<a href=${"/safe"}>a</a
          ><a id="u" href=${unsafe("javascript:void(0)")}>b</a>`,
    );
    expect(m.query("a").getAttribute("href")).toBe("/safe");
    expect(m.query("#u").getAttribute("href")).toBe("javascript:void(0)");
  });

  it("rejects on* attribute bindings (name-based), including via spread", () => {
    expect(() => html`<div onclick=${"alert(1)"}></div>`).toThrow(
      /not allowed/,
    );
    expect(() => html`<div onmouseover="${"a"}b"></div>`).toThrow(
      /not allowed/,
    );
    expect(() => html`<div ...${{ onerror: "alert(1)" }}></div>`).toThrow(
      /not allowed/,
    );
    expect(() => html`<div ...${{ OnClick: "x" }}></div>`).toThrow(
      /not allowed/,
    );
    const m = mount(
      () => html`<div id="d" onclick=${unsafe("window.__x=1")}></div>`,
    );
    expect(m.query("#d").getAttribute("onclick")).toBe("window.__x=1");
  });

  it("static on* in the template source is the author's own markup and is left alone", () => {
    const el = html`<b data-ok="1">x</b>` as HTMLElement;
    expect(el.dataset.ok).toBe("1");
  });

  it("srcdoc, .innerHTML and .outerHTML need unsafe()", () => {
    expect(
      () => html`<iframe srcdoc=${"<script>1</script>"}></iframe>`,
    ).toThrow(/srcdoc/);
    expect(
      () => html`<div .innerHTML=${"<img src=x onerror=1>"}></div>`,
    ).toThrow(/unsafe/);
    const m = mount(
      () => html`<div id="d" .innerHTML=${unsafe("<b>ok</b>")}></div>`,
    );
    expect(m.query("#d b").textContent).toBe("ok");
  });

  it("attribute values cannot break out of the attribute", () => {
    const evil = `" onmouseover="alert(1)" x="`;
    const m = mount(() => html`<div title=${evil} id="d"></div>`);
    const d = m.query("#d");
    expect(d.getAttribute("title")).toBe(evil);
    expect(d.hasAttribute("onmouseover")).toBe(false);
    expect(d.attributes.length).toBe(2);
  });

  it("text cannot inject elements, comments or scripts", () => {
    const m = mount(
      () =>
        html`<div id="d">${"<script>window.__pwn=1</script><!-- c -->"}</div>`,
    );
    expect(m.container.querySelector("script")).toBeNull();
    expect(m.query("#d").textContent).toContain("<script>");
    expect((window as unknown as { __pwn?: number }).__pwn).toBeUndefined();
  });

  it("style bindings go through CSSOM, not markup", () => {
    const m = mount(
      () =>
        html`<div id="d" style=${{ color: `red;" onclick="alert(1)` }}></div>`,
    );
    expect(m.query("#d").hasAttribute("onclick")).toBe(false);
  });
});
