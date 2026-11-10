import { expect, test } from "vitest";
// @ts-expect-error the Vite config is JavaScript, with no declarations
import { scaleCss } from "../../vite.config.mjs";
import {
  allThemes,
  catalog,
  contrast,
  cssOf,
  defaultLook,
  FONTS,
  flipMode,
  luminance,
  PALETTE_PRESETS,
  PALETTES,
  paletteVars,
  panelOf,
  parseLook,
  STYLES,
  varsOf,
  withBundle,
  withChoice,
  withTheme,
} from "../theming.ts";

/** `hsl(217 91% 40%)` or `#fff` → its luminance. */
function lum(color: string): number {
  if (color === "#fff") return 1;
  const m = /hsl\((\d+) (\d+)% (\d+)%\)/.exec(color);
  if (!m) throw new Error(`not a colour: ${color}`);
  return luminance(+m[1], +m[2], +m[3]);
}

test("there are 30 palettes, each a light and a dark theme", () => {
  expect(PALETTES).toHaveLength(30);
  expect(new Set(PALETTES.map((p) => p.id)).size).toBe(30);
  expect(Object.keys(paletteVars(PALETTES[0], "light"))).toEqual([]); // zinc is the stock one
  for (const p of PALETTES.slice(1)) {
    for (const mode of ["light", "dark"] as const) {
      const v = paletteVars(p, mode);
      expect(Object.keys(v).length, `${p.id} ${mode}`).toBeGreaterThan(25);
    }
  }
});

test("text stays readable on the primary color of every theme", () => {
  for (const p of PALETTES.slice(1)) {
    for (const mode of ["light", "dark"] as const) {
      const v = paletteVars(p, mode);
      expect(
        contrast(lum(v["--primary"]), lum(v["--primary-foreground"])),
        `${p.id} ${mode} primary`,
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrast(lum(v["--background"]), lum(v["--foreground"])),
        `${p.id} ${mode} text`,
      ).toBeGreaterThanOrEqual(7);
      expect(
        contrast(lum(v["--background"]), lum(v["--muted-foreground"])),
        `${p.id} ${mode} muted`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  }
});

test("a look becomes CSS variables, and the default changes nothing", () => {
  const base = varsOf(defaultLook());
  expect(base["--k-ui"]).toBe("1");
  expect(base["--background"]).toBeUndefined();
  expect(base["--radius"]).toBeUndefined();
  expect(base["--font-sans"]).toContain("Inter");

  const look = {
    ...defaultLook("dark"),
    palette: "blue",
    font: "mono",
    ui: "xl",
    text: "lg",
    block: "xs",
    style: "official",
  };
  const v = varsOf(look);
  expect(v["--k-ui"]).toBe("1.25");
  expect(v["--k-text"]).toBe("1.12");
  expect(v["--k-block"]).toBe("0.7");
  expect(v["--radius"]).toBe("0");
  expect(v["--font-sans"]).toBe(FONTS.find((f) => f.id === "mono")!.stack);
  expect(v["--primary"]).toMatch(/^hsl\(217 91% /);
  expect(cssOf(look)).toContain(".dark {");
  expect(cssOf(defaultLook())).toContain(":root {");
});

test("a saved look is checked: what is not valid falls back", () => {
  const fallback = defaultLook("dark");
  expect(parseLook(null, fallback)).toEqual(fallback);
  expect(parseLook({ palette: "nope", font: 3, mode: "x" }, fallback)).toEqual(
    fallback,
  );
  expect(
    parseLook({ palette: "teal", mode: "light", style: "cs" }, fallback),
  ).toMatchObject({
    palette: "teal",
    mode: "light",
    style: "cs",
    font: "sans",
  });
  // a theme of a catalog that is gone (an editor theme) falls back too
  expect(
    parseLook({ palette: "vs-dracula", mode: "dark", bundle: false }, fallback),
  ).toMatchObject({ palette: "zinc", mode: "dark", bundle: false });
});

test("choices change one row; a style also suggests its font", () => {
  const look = defaultLook();
  expect(withChoice(look, "ui", "lg").ui).toBe("lg");
  expect(withChoice(look, "text", "nope")).toEqual(look);
  expect(withChoice(look, "nothing", "x")).toEqual(look);
  const cs = withChoice(look, "style", "cs");
  expect(cs).toMatchObject({ style: "cs", font: "mono" });
  expect(withChoice(cs, "font", "serif").font).toBe("serif"); // and the user has the last word
  expect(STYLES.map((s) => s.id)).toEqual([
    "default",
    "official",
    "casual",
    "funny",
    "cs",
    "biology",
  ]);
  // every style suggests a font that exists
  for (const s of STYLES) {
    expect(
      FONTS.some((f) => f.id === s.font),
      `${s.id} font`,
    ).toBe(true);
  }
  expect(flipMode(look).mode).toBe("dark");
  expect(flipMode(flipMode(look))).toEqual(look);
});

test("font sizes and control heights are scaled where the stylesheet is loaded", () => {
  const css =
    ".a { font-size: 14px; height: 36px; min-height: 40px; width: 36px; }" +
    " .b { max-height: 36px; height: 56px; line-height: 20px; font-size: 12.5px; padding: 8px 36px; }";
  const out = scaleCss(css);
  expect(out).toContain("font-size: calc(14px * var(--k-text, 1))");
  expect(out).toContain("font-size: calc(12.5px * var(--k-text, 1))");
  expect(out).toContain("height: calc(36px * var(--k-ui, 1))");
  expect(out).toContain("min-height: calc(40px * var(--k-ui, 1))");
  expect(out).toContain("width: calc(36px * var(--k-ui, 1))");
  // not a control: left alone
  expect(out).toContain("max-height: 36px");
  expect(out).toContain("height: 56px");
  expect(out).toContain("line-height: 20px");
  expect(out).toContain("padding: 8px 36px");
});

// ---- theme bundles, the catalog, the random plugin ----

test("every palette brings a font and a style that exist", () => {
  for (const p of PALETTES) {
    const preset = PALETTE_PRESETS[p.id];
    expect(preset, `${p.id} preset`).toBeDefined();
    expect(
      FONTS.some((f) => f.id === preset.font),
      `${p.id} font`,
    ).toBe(true);
    expect(
      STYLES.some((s) => s.id === preset.style),
      `${p.id} style`,
    ).toBe(true);
  }
});

test("picking a theme sets font, sizes and style when the bundle is on, only colors when off", () => {
  const look = {
    ...defaultLook(),
    font: "serif",
    text: "xl",
    style: "official",
  };
  const graphite = withTheme(look, "graphite", "dark");
  expect(graphite).toMatchObject({
    palette: "graphite",
    mode: "dark",
    font: "mono",
    style: "cs",
    text: "sm",
    ui: "sm",
  });
  // what a theme does not name goes back to the default, not to the last theme's
  expect(withTheme(graphite, "rose", "dark")).toMatchObject({
    font: "rounded",
    style: "casual",
    text: "md",
    ui: "md",
    block: "md",
  });
  expect(withTheme(graphite, "zinc", "light")).toMatchObject({
    font: "sans",
    style: "default",
    text: "md",
    mode: "light",
  });
  // a palette that does not exist leaves the palette alone
  expect(withTheme(look, "vs-dracula", "dark").palette).toBe("zinc");
  // bundle off: colors only
  const colorsOnly = withTheme({ ...look, bundle: false }, "graphite", "dark");
  expect(colorsOnly).toMatchObject({
    palette: "graphite",
    font: "serif",
    text: "xl",
    style: "official",
  });
  expect(withBundle(look, false).bundle).toBe(false);
  // and a saved look keeps the switch
  expect(
    parseLook({ palette: "ocean", mode: "dark", bundle: false }, defaultLook()),
  ).toMatchObject({ palette: "ocean", mode: "dark", bundle: false });
});

test("the light and dark switch keeps the palette and changes the mode", () => {
  const graphite = withTheme(defaultLook(), "graphite", "dark");
  expect(flipMode(graphite)).toMatchObject({
    palette: "graphite",
    mode: "light",
  });
  expect(flipMode(flipMode(graphite))).toEqual(graphite);
  // a theme becomes CSS variables, with its font and size scales in the look
  const v = varsOf(graphite);
  expect(v["--background"]).toMatch(/^hsl\(220 /);
  expect(v["--font-sans"]).toContain("monospace");
  expect(v["--k-text"]).toBe("0.95");
});

test("the catalog lists the palettes as swatches, and the panel marks the chosen one", () => {
  const cat = catalog();
  expect(cat.light).toHaveLength(30);
  expect(cat.dark).toHaveLength(30);
  expect(cat.light.map((s) => s.id)).toEqual(PALETTES.map((p) => p.id));
  const panel = panelOf(cat, withTheme(defaultLook(), "ocean", "dark"));
  expect(panel.dark.filter((s) => s.active).map((s) => s.id)).toEqual([
    "ocean",
  ]);
  expect(panel.light.some((s) => s.active)).toBe(false);
  expect(panel.fonts.filter((o) => o.selected)).toHaveLength(1);
});

test("the random button covers every theme and the plugin answers with a message", async () => {
  const { createRandomPlugin, randomEffector } = await import("../random.ts");
  const all = allThemes();
  // 30 palettes x 2 modes
  expect(all).toHaveLength(60);
  expect(new Set(all.map((t) => `${t.palette}/${t.mode}`)).size).toBe(
    all.length,
  );

  const sent: unknown[] = [];
  const ctx = { dispatch: (m: unknown) => sent.push(m) } as never;
  const plugin = createRandomPlugin(() => 0.999999);
  plugin.handle(randomEffector.int(100, "randomPicked"), ctx);
  createRandomPlugin(() => 0).handle(
    randomEffector.int(100, "randomPicked"),
    ctx,
  );
  expect(sent).toEqual([
    { id: "randomPicked", payload: 99 },
    { id: "randomPicked", payload: 0 },
  ]);
});
