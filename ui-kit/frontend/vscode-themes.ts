import { ensureContrast, mix, onColor } from "./color.ts";
import type { Mode } from "./theming.ts";

/**
 * 20 dark and 20 light themes in the spirit of well-known Visual Studio Code
 * themes. Each is a handful of colours (the editor background and text, the
 * side panel, a border, the accent and five syntax colours, taken from the
 * public palettes of those themes); `vsVars` turns them into the kit's tokens
 * and moves any colour that would not read far enough toward black or white,
 * so every theme is readable whatever the original contrast.
 */

/** What picking a theme sets besides the colours (when the bundle is on). */
export interface Preset {
  font?: string;
  ui?: string;
  text?: string;
  block?: string;
  style?: string;
}

export interface VsTheme {
  /** Always starts with `vs-`. */
  id: string;
  name: string;
  mode: Mode;
  bg: string;
  fg: string;
  panel: string;
  border: string;
  accent: string;
  /** red, green, yellow or orange, blue, purple: used for charts and danger. */
  colors: [string, string, string, string, string];
  /** The same theme family in the other mode, for the light / dark switch. */
  pair?: string;
  preset: Preset;
}

const t = (
  id: string,
  name: string,
  mode: Mode,
  [bg, fg, panel, border, accent]: [string, string, string, string, string],
  colors: VsTheme["colors"],
  preset: Preset,
  pair?: string,
): VsTheme => ({
  id: `vs-${id}`,
  name,
  mode,
  bg,
  fg,
  panel,
  border,
  accent,
  colors,
  preset,
  pair: pair ? `vs-${pair}` : undefined,
});

const mono = { font: "mono", style: "cs", text: "sm", ui: "sm" };
const editor = { font: "system", style: "default", text: "sm", ui: "sm" };

export const VSCODE_THEMES: VsTheme[] = [
  // ---- dark ----
  t(
    "dark-plus",
    "Dark+",
    "dark",
    ["#1e1e1e", "#d4d4d4", "#252526", "#3c3c3c", "#007acc"],
    ["#f44747", "#4ec9b0", "#ce9178", "#569cd6", "#c586c0"],
    editor,
    "light-plus",
  ),
  t(
    "monokai",
    "Monokai",
    "dark",
    ["#272822", "#f8f8f2", "#1e1f1c", "#3e3d32", "#a6e22e"],
    ["#f92672", "#a6e22e", "#e6db74", "#66d9ef", "#ae81ff"],
    mono,
  ),
  t(
    "dracula",
    "Dracula",
    "dark",
    ["#282a36", "#f8f8f2", "#21222c", "#44475a", "#bd93f9"],
    ["#ff5555", "#50fa7b", "#f1fa8c", "#8be9fd", "#ff79c6"],
    mono,
    "alucard",
  ),
  t(
    "one-dark",
    "One Dark Pro",
    "dark",
    ["#282c34", "#abb2bf", "#21252b", "#3e4451", "#61afef"],
    ["#e06c75", "#98c379", "#e5c07b", "#61afef", "#c678dd"],
    { ...editor, font: "mono" },
    "one-light",
  ),
  t(
    "solarized-dark",
    "Solarized Dark",
    "dark",
    ["#002b36", "#93a1a1", "#073642", "#0f4a58", "#268bd2"],
    ["#dc322f", "#859900", "#b58900", "#268bd2", "#6c71c4"],
    mono,
    "solarized-light",
  ),
  t(
    "nord",
    "Nord",
    "dark",
    ["#2e3440", "#d8dee9", "#3b4252", "#434c5e", "#88c0d0"],
    ["#bf616a", "#a3be8c", "#ebcb8b", "#81a1c1", "#b48ead"],
    { font: "humanist", style: "default", text: "md", ui: "md" },
    "nord-light",
  ),
  t(
    "tokyo-night",
    "Tokyo Night",
    "dark",
    ["#1a1b26", "#a9b1d6", "#16161e", "#292e42", "#7aa2f7"],
    ["#f7768e", "#9ece6a", "#e0af68", "#7aa2f7", "#bb9af7"],
    { font: "geometric", style: "default", text: "sm", ui: "sm" },
    "tokyo-night-light",
  ),
  t(
    "tokyo-storm",
    "Tokyo Night Storm",
    "dark",
    ["#24283b", "#a9b1d6", "#1f2335", "#3b4261", "#7aa2f7"],
    ["#f7768e", "#9ece6a", "#e0af68", "#7aa2f7", "#bb9af7"],
    { font: "geometric", style: "default", text: "sm", ui: "sm" },
    "tokyo-night-light",
  ),
  t(
    "night-owl",
    "Night Owl",
    "dark",
    ["#011627", "#d6deeb", "#010e1a", "#122d42", "#7e57c2"],
    ["#ef5350", "#addb67", "#ecc48d", "#82aaff", "#c792ea"],
    mono,
    "light-owl",
  ),
  t(
    "github-dark",
    "GitHub Dark",
    "dark",
    ["#0d1117", "#e6edf3", "#161b22", "#30363d", "#1f6feb"],
    ["#f85149", "#3fb950", "#d29922", "#58a6ff", "#bc8cff"],
    editor,
    "github-light",
  ),
  t(
    "github-dimmed",
    "GitHub Dark Dimmed",
    "dark",
    ["#22272e", "#adbac7", "#2d333b", "#444c56", "#539bf5"],
    ["#e5534b", "#57ab5a", "#c69026", "#539bf5", "#b083f0"],
    editor,
    "github-light",
  ),
  t(
    "ayu-mirage",
    "Ayu Mirage",
    "dark",
    ["#1f2430", "#cccac2", "#232834", "#333a4a", "#ffcc66"],
    ["#f28779", "#d5ff80", "#ffa759", "#73d0ff", "#dfbfff"],
    { font: "geometric", style: "default", text: "sm", ui: "sm" },
    "ayu-light",
  ),
  t(
    "ayu-dark",
    "Ayu Dark",
    "dark",
    ["#0b0e14", "#bfbdb6", "#0d1017", "#1b222c", "#e6b450"],
    ["#f07178", "#aad94c", "#ff8f40", "#59c2ff", "#d2a6ff"],
    { font: "geometric", style: "default", text: "sm", ui: "sm" },
    "ayu-light",
  ),
  t(
    "gruvbox-dark",
    "Gruvbox Dark",
    "dark",
    ["#282828", "#ebdbb2", "#3c3836", "#504945", "#fabd2f"],
    ["#fb4934", "#b8bb26", "#fe8019", "#83a598", "#d3869b"],
    mono,
    "gruvbox-light",
  ),
  t(
    "cobalt2",
    "Cobalt2",
    "dark",
    ["#193549", "#ffffff", "#15232d", "#0d3a58", "#ffc600"],
    ["#ff628c", "#3ad900", "#ffc600", "#0088ff", "#9a5feb"],
    { font: "mono", style: "funny", text: "sm", ui: "sm" },
  ),
  t(
    "synthwave",
    "SynthWave '84",
    "dark",
    ["#262335", "#ffffff", "#241b2f", "#34294f", "#ff7edb"],
    ["#f97e72", "#72f1b8", "#fede5d", "#36f9f6", "#b893ce"],
    { font: "mono", style: "funny", text: "sm", ui: "md" },
  ),
  t(
    "palenight",
    "Palenight",
    "dark",
    ["#292d3e", "#a6accd", "#232635", "#3a3f58", "#c792ea"],
    ["#f07178", "#c3e88d", "#ffcb6b", "#82aaff", "#c792ea"],
    { font: "rounded", style: "casual", text: "md", ui: "md" },
  ),
  t(
    "shades-of-purple",
    "Shades of Purple",
    "dark",
    ["#2d2b55", "#ffffff", "#1e1e3f", "#3b3a6e", "#fad000"],
    ["#ff628c", "#3ad900", "#fad000", "#9effff", "#b362ff"],
    { font: "rounded", style: "funny", text: "md", ui: "md" },
  ),
  t(
    "catppuccin-mocha",
    "Catppuccin Mocha",
    "dark",
    ["#1e1e2e", "#cdd6f4", "#181825", "#45475a", "#cba6f7"],
    ["#f38ba8", "#a6e3a1", "#f9e2af", "#89b4fa", "#cba6f7"],
    { font: "rounded", style: "casual", text: "md", ui: "md" },
    "catppuccin-latte",
  ),
  t(
    "rose-pine",
    "Rosé Pine",
    "dark",
    ["#191724", "#e0def4", "#1f1d2e", "#403d52", "#c4a7e7"],
    ["#eb6f92", "#9ccfd8", "#f6c177", "#31748f", "#c4a7e7"],
    { font: "classical", style: "casual", text: "md", ui: "md" },
    "rose-pine-dawn",
  ),

  // ---- light ----
  t(
    "light-plus",
    "Light+",
    "light",
    ["#ffffff", "#1f1f1f", "#f3f3f3", "#e5e5e5", "#007acc"],
    ["#cd3131", "#008000", "#a31515", "#0000ff", "#795e26"],
    editor,
    "dark-plus",
  ),
  t(
    "solarized-light",
    "Solarized Light",
    "light",
    ["#fdf6e3", "#586e75", "#eee8d5", "#ddd6c1", "#268bd2"],
    ["#dc322f", "#859900", "#b58900", "#268bd2", "#6c71c4"],
    mono,
    "solarized-dark",
  ),
  t(
    "github-light",
    "GitHub Light",
    "light",
    ["#ffffff", "#1f2328", "#f6f8fa", "#d0d7de", "#0969da"],
    ["#cf222e", "#1a7f37", "#9a6700", "#0969da", "#8250df"],
    editor,
    "github-dark",
  ),
  t(
    "quiet-light",
    "Quiet Light",
    "light",
    ["#f5f5f5", "#333333", "#ececec", "#d4d4d4", "#7a3e9d"],
    ["#aa3731", "#448c27", "#9c5d27", "#4b69c6", "#7a3e9d"],
    { font: "serif", style: "official", text: "md", ui: "md" },
  ),
  t(
    "ayu-light",
    "Ayu Light",
    "light",
    ["#fafafa", "#5c6166", "#f3f4f5", "#e0e2e4", "#ff9940"],
    ["#f07171", "#86b300", "#f2ae49", "#36a3d9", "#a37acc"],
    { font: "geometric", style: "default", text: "sm", ui: "sm" },
    "ayu-mirage",
  ),
  t(
    "one-light",
    "One Light",
    "light",
    ["#fafafa", "#383a42", "#eaeaeb", "#dbdbdc", "#4078f2"],
    ["#e45649", "#50a14f", "#c18401", "#4078f2", "#a626a4"],
    { ...editor, font: "mono" },
    "one-dark",
  ),
  t(
    "gruvbox-light",
    "Gruvbox Light",
    "light",
    ["#fbf1c7", "#3c3836", "#ebdbb2", "#d5c4a1", "#b57614"],
    ["#9d0006", "#79740e", "#af3a03", "#076678", "#8f3f71"],
    { font: "slab", style: "casual", text: "md", ui: "md" },
    "gruvbox-dark",
  ),
  t(
    "light-owl",
    "Light Owl",
    "light",
    ["#fbfbfb", "#403f53", "#f0f0f0", "#d9d9d9", "#2aa298"],
    ["#de3d3b", "#08916a", "#e0af02", "#4876d6", "#994cc3"],
    mono,
    "night-owl",
  ),
  t(
    "tokyo-night-light",
    "Tokyo Night Light",
    "light",
    ["#d5d6db", "#343b58", "#cbccd1", "#b4b5b9", "#34548a"],
    ["#8c4351", "#33635c", "#965027", "#34548a", "#5a4a78"],
    { font: "geometric", style: "default", text: "sm", ui: "sm" },
    "tokyo-night",
  ),
  t(
    "catppuccin-latte",
    "Catppuccin Latte",
    "light",
    ["#eff1f5", "#4c4f69", "#e6e9ef", "#ccd0da", "#8839ef"],
    ["#d20f39", "#40a02b", "#df8e1d", "#1e66f5", "#ea76cb"],
    { font: "rounded", style: "casual", text: "md", ui: "md" },
    "catppuccin-mocha",
  ),
  t(
    "rose-pine-dawn",
    "Rosé Pine Dawn",
    "light",
    ["#faf4ed", "#575279", "#fffaf3", "#dfdad9", "#907aa9"],
    ["#b4637a", "#56949f", "#ea9d34", "#286983", "#907aa9"],
    { font: "classical", style: "casual", text: "md", ui: "md" },
    "rose-pine",
  ),
  t(
    "nord-light",
    "Nord Light",
    "light",
    ["#eceff4", "#2e3440", "#e5e9f0", "#d8dee9", "#5e81ac"],
    ["#bf616a", "#a3be8c", "#ebcb8b", "#81a1c1", "#b48ead"],
    { font: "humanist", style: "default", text: "md", ui: "md" },
    "nord",
  ),
  t(
    "alucard",
    "Alucard (Dracula Light)",
    "light",
    ["#fffbeb", "#1f1f1f", "#f5f0dc", "#cfcfde", "#644ac9"],
    ["#cb3a2a", "#14710a", "#846e15", "#036a96", "#a3144d"],
    mono,
    "dracula",
  ),
  t(
    "papercolor-light",
    "PaperColor Light",
    "light",
    ["#eeeeee", "#444444", "#e4e4e4", "#d0d0d0", "#005f87"],
    ["#af0000", "#008700", "#d75f00", "#005f87", "#8700af"],
    { font: "mono", style: "official", text: "sm", ui: "sm" },
  ),
  t(
    "tomorrow",
    "Tomorrow",
    "light",
    ["#ffffff", "#4d4d4c", "#efefef", "#d6d6d6", "#4271ae"],
    ["#c82829", "#718c00", "#f5871f", "#4271ae", "#8959a8"],
    editor,
  ),
  t(
    "everforest-light",
    "Everforest Light",
    "light",
    ["#fdf6e3", "#5c6a72", "#f4f0d9", "#e6e2cc", "#8da101"],
    ["#f85552", "#8da101", "#dfa000", "#3a94c5", "#df69ba"],
    { font: "humanist", style: "biology", text: "md", ui: "md" },
  ),
  t(
    "xcode-light",
    "Xcode Light",
    "light",
    ["#ffffff", "#262626", "#f2f2f7", "#d9d9d9", "#ad3da4"],
    ["#d12f1b", "#3e8087", "#272ad8", "#0b4f79", "#ad3da4"],
    { font: "system", style: "official", text: "md", ui: "md" },
  ),
  t(
    "material-lighter",
    "Material Lighter",
    "light",
    ["#fafafa", "#546e7a", "#f1f1f1", "#e7eaec", "#00acc1"],
    ["#e53935", "#91b859", "#f6a434", "#6182b8", "#7c4dff"],
    { font: "geometric", style: "default", text: "md", ui: "md" },
  ),
  t(
    "min-light",
    "Min Light",
    "light",
    ["#ffffff", "#212121", "#f6f6f6", "#eeeeee", "#1976d2"],
    ["#d32f2f", "#2e7d32", "#f57c00", "#1976d2", "#7b1fa2"],
    { font: "system", style: "official", text: "md", ui: "md" },
  ),
  t(
    "bluloco-light",
    "Bluloco Light",
    "light",
    ["#f9f9f9", "#373a41", "#eeeeee", "#dddddd", "#275fe4"],
    ["#d52753", "#23974a", "#df631c", "#275fe4", "#823ff1"],
    editor,
  ),
];

export const isVsId = (id: string): boolean => id.startsWith("vs-");
export const vsThemeById = (id: string): VsTheme | undefined =>
  VSCODE_THEMES.find((x) => x.id === id);

/** The kit's colour tokens for a theme. Every pair that carries text reads at 4.5:1 or better. */
export function vsVars(th: VsTheme): Record<string, string> {
  const bg = th.bg;
  const fg = ensureContrast(th.fg, bg, 7);
  const soft = mix(bg, fg, 0.08);
  const hover = mix(bg, fg, 0.13);
  const primary = ensureContrast(th.accent, onColor(th.accent), 4.5);
  const primaryFg = onColor(primary);
  const muted = ensureContrast(mix(fg, bg, 0.4), hover, 4.5);
  const red = ensureContrast(th.colors[0], bg, 3);
  const panel = th.panel;
  const v: Record<string, string> = {
    "--background": bg,
    "--foreground": fg,
    "--card": panel,
    "--card-foreground": ensureContrast(fg, panel, 7),
    "--popover": panel,
    "--popover-foreground": ensureContrast(fg, panel, 7),
    "--primary": primary,
    "--primary-foreground": primaryFg,
    "--secondary": soft,
    "--secondary-foreground": ensureContrast(fg, soft, 7),
    "--muted": soft,
    "--muted-foreground": muted,
    "--accent": hover,
    "--accent-foreground": ensureContrast(fg, hover, 7),
    "--destructive": red,
    "--destructive-foreground": onColor(red),
    "--border": th.border,
    "--input": mix(th.border, fg, 0.15),
    "--ring": th.accent,
    "--sidebar": panel,
    "--sidebar-foreground": ensureContrast(fg, panel, 7),
    "--sidebar-primary": primary,
    "--sidebar-primary-foreground": primaryFg,
    "--sidebar-accent": hover,
    "--sidebar-accent-foreground": ensureContrast(fg, hover, 7),
    "--sidebar-border": th.border,
    "--sidebar-ring": th.accent,
  };
  th.colors.forEach((c, i) => (v[`--chart-${i + 1}`] = c));
  return v;
}
