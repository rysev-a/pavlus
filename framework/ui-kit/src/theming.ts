/**
 * The look of the site as data, and the pure functions that turn it into CSS
 * variables. Nothing here touches the page: the `theme` plugin (theme.ts)
 * applies what `varsOf` returns, and the configurator page (Theming) shows
 * the catalogs below.
 */
export type Mode = "light" | "dark";

/** What picking a theme sets besides the colours (when the bundle is on). */
export interface Preset {
  font?: string;
  ui?: string;
  text?: string;
  block?: string;
  style?: string;
}

/** One choice per row of the configurator. Every field is an id of a catalog. */
export interface Look {
  mode: Mode;
  /** A palette name (`blue`): the same 30 names exist as a light and a dark theme. */
  palette: string;
  font: string;
  /** Sizes: controls, text and blocks (cards, forms, page rhythm). */
  ui: string;
  text: string;
  block: string;
  style: string;
  /** The corners: `auto` is what the style says, else an id of RADII. */
  radius: string;
  /**
   * When on, picking a theme also sets the font, the three size scales and the
   * style the theme comes with (not just its colours).
   */
  bundle: boolean;
}

/** What a template may set: the rest comes from the defaults. */
export type LookPreset = Partial<Look>;

export const defaultLook = (mode: Mode = "light"): Look => ({
  mode,
  palette: "zinc",
  font: "sans",
  ui: "md",
  text: "md",
  block: "md",
  style: "default",
  radius: "auto",
  bundle: true,
});

// ---- fonts: system stacks only, nothing is downloaded ----

export interface Font {
  id: string;
  name: string;
  /** What the face is like, shown under its name. */
  note: string;
  stack: string;
}

export const FONTS: Font[] = [
  {
    id: "sans",
    name: "Geist / Inter",
    note: "The default, neutral sans",
    stack:
      '"Geist", "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
  },
  {
    id: "system",
    name: "System UI",
    note: "Whatever the device uses",
    stack: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
  },
  {
    id: "humanist",
    name: "Humanist",
    note: "Warm, open shapes",
    stack:
      "Seravek, 'Gill Sans Nova', Ubuntu, Calibri, 'DejaVu Sans', source-sans-pro, sans-serif",
  },
  {
    id: "geometric",
    name: "Geometric",
    note: "Circles and straight lines",
    stack:
      "Avenir, Montserrat, Corbel, 'URW Gothic', source-sans-pro, sans-serif",
  },
  {
    id: "rounded",
    name: "Rounded",
    note: "Friendly, soft ends",
    stack:
      "ui-rounded, 'Hiragino Maru Gothic ProN', Quicksand, Comfortaa, Manjari, 'Arial Rounded MT', 'Arial Rounded MT Bold', Calibri, source-sans-pro, sans-serif",
  },
  {
    id: "serif",
    name: "Transitional serif",
    note: "Books and newspapers",
    stack: "Charter, 'Bitstream Charter', 'Sitka Text', Cambria, serif",
  },
  {
    id: "classical",
    name: "Old-style serif",
    note: "Formal, classical",
    stack:
      "'Iowan Old Style', 'Palatino Linotype', 'URW Palladio L', P052, serif",
  },
  {
    id: "slab",
    name: "Slab serif",
    note: "Sturdy, typewriter-like",
    stack:
      "Rockwell, 'Rockwell Nova', 'Roboto Slab', 'DejaVu Serif', 'Sitka Small', serif",
  },
  {
    id: "mono",
    name: "Monospace",
    note: "Code and terminals",
    stack:
      "ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, 'DejaVu Sans Mono', monospace",
  },
  {
    id: "handwritten",
    name: "Handwritten",
    note: "Casual, playful",
    stack:
      "'Segoe Print', 'Bradley Hand', Chilanka, TSCu_Comic, casual, cursive",
  },
];

// ---- sizes ----

export interface Size {
  id: string;
  name: string;
  /** The multiplier the CSS variable gets. */
  scale: number;
}

const sizes = (names: [string, string, number][]): Size[] =>
  names.map(([id, name, scale]) => ({ id, name, scale }));

/** Heights of buttons, inputs, avatars, rows. */
export const UI_SIZES = sizes([
  ["xs", "Compact", 0.85],
  ["sm", "Small", 0.93],
  ["md", "Default", 1],
  ["lg", "Large", 1.12],
  ["xl", "Extra large", 1.25],
]);
/** Every font size. */
export const TEXT_SIZES = sizes([
  ["xs", "Small", 0.9],
  ["sm", "Snug", 0.95],
  ["md", "Default", 1],
  ["lg", "Large", 1.12],
  ["xl", "Extra large", 1.25],
]);
/** Padding and gaps of cards, forms and the page. */
export const BLOCK_SIZES = sizes([
  ["xs", "Tight", 0.7],
  ["sm", "Snug", 0.85],
  ["md", "Default", 1],
  ["lg", "Roomy", 1.25],
  ["xl", "Spacious", 1.5],
]);

const scaleOf = (list: Size[], id: string): number =>
  (list.find((s) => s.id === id) ?? list[2]).scale;

// ---- styles ----

export interface Style {
  id: string;
  name: string;
  note: string;
  /** The corner radius of the whole kit (`--radius`). */
  radius: string;
  /** The font a style suggests when it is picked; the user can change it after. */
  font: string;
}

export const STYLES: Style[] = [
  {
    id: "default",
    name: "Default",
    note: "The admin-app look: soft corners, light shadows",
    radius: "0.625rem",
    font: "sans",
  },
  {
    id: "official",
    name: "Official",
    note: "Square corners, flat, thin lines: forms, banks, agencies",
    radius: "0",
    font: "classical",
  },
  {
    id: "casual",
    name: "Casual",
    note: "Big round corners, pill buttons, soft shadows",
    radius: "1rem",
    font: "rounded",
  },
  {
    id: "funny",
    name: "Funny",
    note: "Thick outlines, hard shadows, buttons that wiggle",
    radius: "1.25rem",
    font: "handwritten",
  },
  {
    id: "cs",
    name: "Computer science",
    note: "Monospace, sharp corners, terminal-like dashed lines",
    radius: "2px",
    font: "mono",
  },
  {
    id: "biology",
    name: "Biology",
    note: "Organic leaf-like corners, nothing symmetric",
    radius: "1.5rem",
    font: "humanist",
  },
];

// ---- corners ----

export interface Radius {
  id: string;
  name: string;
  /** `--radius`: the corners of cards, popovers and the rest. */
  radius: string;
  /** The corners of buttons, badges and tabs (a pill is fully round). */
  chip: string;
}

/** `auto` (from the style) is the first choice; the rest set the corners whatever the style. */
export const RADII: Radius[] = [
  { id: "auto", name: "From the style", radius: "", chip: "" },
  { id: "none", name: "Sharp", radius: "0", chip: "0" },
  { id: "sm", name: "Small", radius: "0.25rem", chip: "0.25rem" },
  { id: "md", name: "Medium", radius: "0.5rem", chip: "0.5rem" },
  { id: "lg", name: "Large", radius: "0.875rem", chip: "0.875rem" },
  { id: "xl", name: "Round", radius: "1.25rem", chip: "1.25rem" },
  { id: "pill", name: "Pill", radius: "1.25rem", chip: "999px" },
];

// ---- palettes: 30 names, each a light and a dark theme ----

export interface Palette {
  id: string;
  name: string;
  /** Hue and saturation the whole theme is derived from. */
  h: number;
  s: number;
}

const p = (id: string, name: string, h: number, s: number): Palette => ({
  id,
  name,
  h,
  s,
});

export const PALETTES: Palette[] = [
  p("zinc", "Zinc", 240, 4),
  p("slate", "Slate", 215, 16),
  p("stone", "Stone", 25, 8),
  p("graphite", "Graphite", 220, 10),
  p("red", "Red", 0, 72),
  p("rose", "Rose", 346, 77),
  p("pink", "Pink", 330, 80),
  p("fuchsia", "Fuchsia", 292, 76),
  p("purple", "Purple", 270, 70),
  p("violet", "Violet", 258, 75),
  p("indigo", "Indigo", 239, 70),
  p("blue", "Blue", 217, 91),
  p("sky", "Sky", 199, 89),
  p("cyan", "Cyan", 187, 85),
  p("teal", "Teal", 173, 80),
  p("emerald", "Emerald", 152, 70),
  p("green", "Green", 142, 71),
  p("lime", "Lime", 84, 75),
  p("yellow", "Yellow", 48, 96),
  p("amber", "Amber", 38, 92),
  p("orange", "Orange", 24, 95),
  p("coral", "Coral", 11, 80),
  p("sunset", "Sunset", 14, 85),
  p("peach", "Peach", 20, 80),
  p("sand", "Sand", 40, 35),
  p("mint", "Mint", 160, 55),
  p("forest", "Forest", 130, 40),
  p("ocean", "Ocean", 205, 75),
  p("lavender", "Lavender", 250, 60),
  p("berry", "Berry", 320, 55),
];

/**
 * What each of the 30 palettes brings besides its colours: a font, a style and
 * sizes that suit its character (a rose is round and friendly, a graphite is
 * dense and technical). Applied when the theme bundle is on.
 */
export const PALETTE_PRESETS: Record<string, Preset> = {
  zinc: { font: "sans", style: "default" },
  slate: { font: "system", style: "official", text: "sm" },
  stone: { font: "classical", style: "official" },
  graphite: { font: "mono", style: "cs", text: "sm", ui: "sm" },
  red: { font: "rounded", style: "funny" },
  rose: { font: "rounded", style: "casual" },
  pink: { font: "rounded", style: "casual", ui: "lg" },
  fuchsia: { font: "handwritten", style: "funny" },
  purple: { font: "geometric", style: "casual" },
  violet: { font: "geometric", style: "default" },
  indigo: { font: "sans", style: "default" },
  blue: { font: "system", style: "default" },
  sky: { font: "humanist", style: "casual" },
  cyan: { font: "geometric", style: "cs" },
  teal: { font: "humanist", style: "default" },
  emerald: { font: "humanist", style: "biology" },
  green: { font: "rounded", style: "biology" },
  lime: { font: "rounded", style: "funny", text: "lg" },
  yellow: { font: "handwritten", style: "funny", text: "lg" },
  amber: { font: "slab", style: "casual" },
  orange: { font: "rounded", style: "casual" },
  coral: { font: "rounded", style: "funny" },
  sunset: { font: "serif", style: "casual" },
  peach: { font: "serif", style: "casual", block: "lg" },
  sand: { font: "serif", style: "official" },
  mint: { font: "rounded", style: "biology" },
  forest: { font: "serif", style: "biology" },
  ocean: { font: "geometric", style: "default" },
  lavender: { font: "humanist", style: "casual", block: "lg" },
  berry: { font: "rounded", style: "funny" },
};

const hsl = (h: number, s: number, l: number): string =>
  `hsl(${Math.round(h)} ${Math.round(s)}% ${Math.round(l)}%)`;

export function luminance(h: number, s: number, l: number): number {
  const sat = s / 100;
  const light = l / 100;
  const a = sat * Math.min(light, 1 - light);
  const k = (n: number) => (n + h / 30) % 12;
  const f = (n: number) =>
    light - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const lin = (c: number) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  return 0.2126 * lin(f(0)) + 0.7152 * lin(f(8)) + 0.0722 * lin(f(4));
}

export const contrast = (a: number, b: number): number =>
  (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/** The lightness of a primary that reads with white text (light themes). */
function primaryLight(h: number, s: number): number {
  for (let l = 50; l > 20; l--) {
    if (contrast(luminance(h, s, l), 1) >= 4.5) return l;
  }
  return 20;
}

/** The lightness of a primary that reads with near-black text (dark themes). */
function primaryDark(h: number, s: number, ink: number): number {
  for (let l = 58; l < 90; l++) {
    if (contrast(luminance(h, s, l), ink) >= 6) return l;
  }
  return 90;
}

/** The colour tokens of a palette. `zinc` is the stock palette and sets none. */
export function paletteVars(
  palette: Palette,
  mode: Mode,
): Record<string, string> {
  if (palette.id === "zinc") return {};
  const { h, s } = palette;
  const tint = Math.round(Math.min(s, 40) * 0.5);
  const v: Record<string, string> = {};
  if (mode === "light") {
    const fg = hsl(h, Math.min(s, 40), 8);
    const pl = primaryLight(h, s);
    Object.assign(v, {
      "--background": hsl(h, tint, 98),
      "--foreground": fg,
      "--card": hsl(h, tint, 100),
      "--card-foreground": fg,
      "--popover": hsl(h, tint, 100),
      "--popover-foreground": fg,
      "--primary": hsl(h, s, pl),
      "--primary-foreground": "#fff",
      "--secondary": hsl(h, tint, 94),
      "--secondary-foreground": fg,
      "--muted": hsl(h, tint, 94),
      "--muted-foreground": hsl(h, Math.min(s, 20), 38),
      "--accent": hsl(h, tint, 92),
      "--accent-foreground": fg,
      "--border": hsl(h, tint, 88),
      "--input": hsl(h, tint, 86),
      "--ring": hsl(h, Math.round(s * 0.7), 55),
      "--sidebar": hsl(h, tint, 97),
      "--sidebar-foreground": fg,
      "--sidebar-primary": hsl(h, s, pl),
      "--sidebar-primary-foreground": "#fff",
      "--sidebar-accent": hsl(h, tint, 92),
      "--sidebar-accent-foreground": fg,
      "--sidebar-border": hsl(h, tint, 88),
      "--sidebar-ring": hsl(h, Math.round(s * 0.7), 55),
    });
  } else {
    const fg = hsl(h, 20, 96);
    const ink = luminance(h, 30, 8);
    const pd = primaryDark(h, s, ink);
    Object.assign(v, {
      "--background": hsl(h, tint, 7),
      "--foreground": fg,
      "--card": hsl(h, tint, 10),
      "--card-foreground": fg,
      "--popover": hsl(h, tint, 10),
      "--popover-foreground": fg,
      "--primary": hsl(h, s, pd),
      "--primary-foreground": hsl(h, 30, 8),
      "--secondary": hsl(h, tint, 16),
      "--secondary-foreground": fg,
      "--muted": hsl(h, tint, 16),
      "--muted-foreground": hsl(h, Math.min(s, 20), 66),
      "--accent": hsl(h, tint, 18),
      "--accent-foreground": fg,
      "--border": hsl(h, tint, 20),
      "--input": hsl(h, tint, 24),
      "--ring": hsl(h, Math.round(s * 0.5), 45),
      "--sidebar": hsl(h, tint, 10),
      "--sidebar-foreground": fg,
      "--sidebar-primary": hsl(h, s, pd),
      "--sidebar-primary-foreground": hsl(h, 30, 8),
      "--sidebar-accent": hsl(h, tint, 18),
      "--sidebar-accent-foreground": fg,
      "--sidebar-border": hsl(h, tint, 20),
      "--sidebar-ring": hsl(h, Math.round(s * 0.5), 45),
    });
  }
  const c = mode === "light" ? [50, 45] : [60, 62];
  [0, 40, 80, 200, 240].forEach(
    (turn, i) =>
      (v[`--chart-${i + 1}`] = hsl(h + turn, Math.max(55, s * 0.8), c[i % 2])),
  );
  return v;
}

export interface Swatch {
  id: string;
  name: string;
  bg: string;
  fg: string;
  primary: string;
}

/** What a palette looks like, for the configurator. */
export function swatchOf(palette: Palette, mode: Mode): Swatch {
  const v = paletteVars(palette, mode);
  return {
    id: palette.id,
    name: palette.name,
    bg: v["--background"] ?? (mode === "light" ? "#fff" : "#0a0a0a"),
    fg: v["--foreground"] ?? (mode === "light" ? "#0a0a0a" : "#fafafa"),
    primary: v["--primary"] ?? (mode === "light" ? "#171717" : "#e5e5e5"),
  };
}

/** The catalogs as the configurator page shows them. */
export interface Catalog {
  fonts: Font[];
  /** The 30 palettes, as a light and a dark theme each. */
  light: Swatch[];
  dark: Swatch[];
  ui: Size[];
  text: Size[];
  block: Size[];
  styles: Style[];
  radii: Radius[];
}

export const catalog = (): Catalog => ({
  fonts: FONTS,
  light: PALETTES.map((x) => swatchOf(x, "light")),
  dark: PALETTES.map((x) => swatchOf(x, "dark")),
  ui: UI_SIZES,
  text: TEXT_SIZES,
  block: BLOCK_SIZES,
  styles: STYLES,
  radii: RADII,
});

// ---- from a look to CSS ----

const byId = <T extends { id: string }>(list: T[], id: string): T =>
  list.find((x) => x.id === id) ?? list[0];

/** Every CSS variable a look sets on `<html>`. Pure: the same look, the same map. */
export function varsOf(look: Look): Record<string, string> {
  const style = byId(STYLES, look.style);
  const vars: Record<string, string> = {
    ...paletteVars(byId(PALETTES, look.palette), look.mode),
    "--font-sans": byId(FONTS, look.font).stack,
    "--k-ui": String(scaleOf(UI_SIZES, look.ui)),
    "--k-text": String(scaleOf(TEXT_SIZES, look.text)),
    "--k-block": String(scaleOf(BLOCK_SIZES, look.block)),
  };
  if (style.id !== "default") vars["--radius"] = style.radius;
  // corners the visitor chose win over the style's: every radius token follows
  const r = RADII.find((x) => x.id === look.radius);
  if (r && r.radius) {
    vars["--radius"] = r.radius;
    vars["--btn-radius"] = r.chip;
    vars["--chip-radius"] = r.chip;
    vars["--field-radius"] = r.id === "pill" ? "0.875rem" : r.radius;
    vars["--card-radius"] = r.radius;
  }
  return vars;
}

/** The look as CSS to paste into an app's stylesheet. */
export function cssOf(look: Look): string {
  const vars = varsOf(look);
  const lines = Object.entries(vars).map(([k, v]) => `  ${k}: ${v};`);
  const head = look.mode === "dark" ? ".dark" : ":root";
  return `/* style: ${look.style} (html[data-style="${look.style}"] rules are in kit.css) */\n${head} {\n${lines.join("\n")}\n}`;
}

const MODES: Mode[] = ["light", "dark"];
const idOf = (list: { id: string }[], v: unknown, fallback: string): string =>
  typeof v === "string" && list.some((x) => x.id === v) ? v : fallback;

/** A saved look, or anything: what is not valid falls back to the default. */
export function parseLook(raw: unknown, fallback: Look): Look {
  const o = (typeof raw === "object" && raw !== null ? raw : {}) as Record<
    string,
    unknown
  >;
  return {
    mode: MODES.includes(o.mode as Mode) ? (o.mode as Mode) : fallback.mode,
    palette: idOf(PALETTES, o.palette, fallback.palette),
    font: idOf(FONTS, o.font, fallback.font),
    ui: idOf(UI_SIZES, o.ui, fallback.ui),
    text: idOf(TEXT_SIZES, o.text, fallback.text),
    block: idOf(BLOCK_SIZES, o.block, fallback.block),
    style: idOf(STYLES, o.style, fallback.style),
    radius: idOf(RADII, o.radius, fallback.radius),
    bundle: typeof o.bundle === "boolean" ? o.bundle : fallback.bundle,
  };
}

/** The same palette in the other mode. */
export function flipMode(look: Look): Look {
  return { ...look, mode: look.mode === "light" ? "dark" : "light" };
}

/** Every theme there is, for the random button: the 30 palettes in two modes. */
export function allThemes(): { palette: string; mode: Mode }[] {
  return PALETTES.flatMap((p) =>
    (["light", "dark"] as const).map((mode) => ({ palette: p.id, mode })),
  );
}

/** What a theme brings besides colours. */
export function presetOf(palette: string): Preset {
  return PALETTE_PRESETS[palette] ?? {};
}

/**
 * Picks a theme: its colours, and with the bundle on also its font, sizes and
 * style (what the theme does not name goes back to the default, so a theme
 * never inherits the last one's font).
 */
export function withTheme(look: Look, palette: string, mode: Mode): Look {
  const next: Look = {
    ...look,
    palette: idOf(PALETTES, palette, look.palette),
    mode,
  };
  if (!look.bundle) return next;
  const base = defaultLook(next.mode);
  const preset = presetOf(next.palette);
  return {
    ...next,
    font: preset.font ?? base.font,
    ui: preset.ui ?? base.ui,
    text: preset.text ?? base.text,
    block: preset.block ?? base.block,
    style: preset.style ?? base.style,
    radius: "auto",
  };
}

export const withBundle = (look: Look, bundle: boolean): Look => ({
  ...look,
  bundle,
});

/** A change from the configurator: one row, one id. */
export function withChoice(look: Look, row: string, id: string): Look {
  switch (row) {
    case "font":
      return { ...look, font: idOf(FONTS, id, look.font) };
    case "style": {
      const style = byId(STYLES, id);
      // a style brings its own corners, font and all
      return { ...look, style: style.id, font: style.font, radius: "auto" };
    }
    case "ui":
      return { ...look, ui: idOf(UI_SIZES, id, look.ui) };
    case "text":
      return { ...look, text: idOf(TEXT_SIZES, id, look.text) };
    case "block":
      return { ...look, block: idOf(BLOCK_SIZES, id, look.block) };
    case "radius":
      return { ...look, radius: idOf(RADII, id, look.radius) };
    default:
      return look;
  }
}

// ---- what the theming panel reads ----

/** One option of the panel's selects, its `selected` worked out. */
export interface PanelOption {
  id: string;
  name: string;
  selected: boolean;
}

/** A swatch of the panel, its `active` worked out. */
export interface PanelSwatch extends Swatch {
  /** The look is this theme in this mode. */
  active: boolean;
}

/** Everything the theming panel's template reads (see `panelOf`). */
export interface PanelData {
  light: PanelSwatch[];
  dark: PanelSwatch[];
  fonts: PanelOption[];
  styles: PanelOption[];
  radii: PanelOption[];
  ui: PanelOption[];
  text: PanelOption[];
  block: PanelOption[];
}

/** Pure: the panel's catalogs with the look and the swatches worked out. */
export function panelOf(cat: Catalog, look: Look): PanelData {
  const options = <T extends { id: string; name: string }>(
    list: T[],
    chosen: string,
  ): PanelOption[] =>
    list.map((o) => ({ id: o.id, name: o.name, selected: o.id === chosen }));
  const swatches = (list: Swatch[], mode: Mode): PanelSwatch[] =>
    list.map((sw) => ({
      ...sw,
      active: look.palette === sw.id && look.mode === mode,
    }));
  return {
    light: swatches(cat.light, "light"),
    dark: swatches(cat.dark, "dark"),
    fonts: options(cat.fonts, look.font),
    styles: options(cat.styles, look.style),
    radii: options(cat.radii, look.radius),
    ui: options(cat.ui, look.ui),
    text: options(cat.text, look.text),
    block: options(cat.block, look.block),
  };
}
