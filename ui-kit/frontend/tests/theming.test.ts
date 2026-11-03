import { expect, test } from "vitest";
// @ts-expect-error the Vite config is JavaScript, with no declarations
import { scaleCss } from "../../vite.config.mjs";
import {
  contrast,
  cssOf,
  defaultLook,
  FONTS,
  flipMode,
  luminance,
  PALETTES,
  paletteVars,
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

// ---- Visual Studio Code themes, theme bundles, the random plugin ----

test("there are 20 dark and 20 light editor themes, each readable", async () => {
  const { VSCODE_THEMES, vsVars } = await import("../vscode-themes.ts");
  const { contrastOf } = await import("../color.ts");
  expect(VSCODE_THEMES.filter((t) => t.mode === "dark")).toHaveLength(20);
  expect(VSCODE_THEMES.filter((t) => t.mode === "light")).toHaveLength(20);
  expect(new Set(VSCODE_THEMES.map((t) => t.id)).size).toBe(40);
  for (const th of VSCODE_THEMES) {
    const v = vsVars(th);
    const on = (a: string, b: string) => contrastOf(v[a], v[b]);
    expect(
      on("--foreground", "--background"),
      `${th.id} text`,
    ).toBeGreaterThanOrEqual(7);
    expect(
      on("--primary-foreground", "--primary"),
      `${th.id} primary`,
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      on("--muted-foreground", "--background"),
      `${th.id} muted`,
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      on("--card-foreground", "--card"),
      `${th.id} card`,
    ).toBeGreaterThanOrEqual(7);
    expect(
      on("--accent-foreground", "--accent"),
      `${th.id} accent`,
    ).toBeGreaterThanOrEqual(7);
    // a partner is a theme of the other mode
    if (th.pair) {
      const pair = VSCODE_THEMES.find((x) => x.id === th.pair);
      expect(pair?.mode, `${th.id} pair`).toBe(
        th.mode === "dark" ? "light" : "dark",
      );
    }
  }
});

test("picking a theme sets font, sizes and style when the bundle is on, only colors when off", () => {
  const look = {
    ...defaultLook(),
    font: "serif",
    text: "xl",
    style: "official",
  };
  const dracula = withTheme(look, "vs-dracula", "dark");
  expect(dracula).toMatchObject({
    palette: "vs-dracula",
    mode: "dark",
    font: "mono",
    style: "cs",
    text: "sm",
    ui: "sm",
  });
  // what a theme does not name goes back to the default, not to the last theme's
  expect(withTheme(dracula, "vs-palenight", "dark")).toMatchObject({
    font: "rounded",
    style: "casual",
    text: "md",
    ui: "md",
    block: "md",
  });
  expect(withTheme(dracula, "zinc", "light")).toMatchObject({
    font: "sans",
    style: "default",
    text: "md",
    mode: "light",
  });
  // an editor theme has a fixed mode
  expect(withTheme(look, "vs-light-plus", "dark").mode).toBe("light");
  // bundle off: colors only
  const colorsOnly = withTheme(
    { ...look, bundle: false },
    "vs-dracula",
    "dark",
  );
  expect(colorsOnly).toMatchObject({
    palette: "vs-dracula",
    font: "serif",
    text: "xl",
    style: "official",
  });
  expect(withBundle(look, false).bundle).toBe(false);
  // and a saved look keeps the switch, and the mode of an editor theme
  expect(
    parseLook(
      { palette: "vs-nord-light", mode: "dark", bundle: false },
      defaultLook(),
    ),
  ).toMatchObject({ palette: "vs-nord-light", mode: "light", bundle: false });
});

test("the light and dark switch goes to the partner of an editor theme", () => {
  const dracula = withTheme(defaultLook(), "vs-dracula", "dark");
  expect(flipMode(dracula)).toMatchObject({
    palette: "vs-alucard",
    mode: "light",
  });
  expect(flipMode(flipMode(dracula)).palette).toBe("vs-dracula");
  // no partner: the stock palette of the other mode
  expect(
    flipMode(withTheme(defaultLook(), "vs-monokai", "dark")),
  ).toMatchObject({ palette: "zinc", mode: "light" });
  // an editor theme becomes CSS variables, with its font and size scales in the look
  const v = varsOf(dracula);
  expect(v["--background"]).toBe("#282a36");
  expect(v["--font-sans"]).toContain("monospace");
  expect(v["--k-text"]).toBe("0.95");
});

test("the random button covers every theme and the plugin answers with a message", async () => {
  const { allThemes } = await import("../theming.ts");
  const { createRandomPlugin, randomEffector } = await import("../random.ts");
  const all = allThemes();
  expect(all).toHaveLength(100); // 30 palettes x 2 modes + 40 editor themes
  expect(new Set(all.map((t) => `${t.palette}/${t.mode}`)).size).toBe(100);

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
