import { hslToHex, mix, rotate } from "./color.ts";
import type { Mode } from "./theming.ts";
import type { Preset, VsTheme } from "./vscode-themes.ts";

/**
 * Colour themes in the spirit of well-known design systems: shadcn/ui, Radix
 * Colors, Bulma, Flowbite, MDN, Material Design and Ant Design. Each theme is
 * a light or a dark one, made of the system's own accent and neutrals
 * (the hex values are the ones the systems publish for their primary colours)
 * and, like the editor themes, moved just far enough where a pair would not
 * read. A system also brings its font and its style (corners, shadows,
 * weight), which is what a theme preset carries.
 */
export interface Family {
  id: string;
  name: string;
}

export const FAMILIES: Family[] = [
  { id: "shadcn", name: "shadcn/ui" },
  { id: "radix", name: "Radix Colors" },
  { id: "bulma", name: "Bulma" },
  { id: "flowbite", name: "Flowbite" },
  { id: "mdn", name: "MDN" },
  { id: "material", name: "Material Design" },
  { id: "ant", name: "Ant Design" },
];

interface Spec {
  family: string;
  id: string;
  name: string;
  mode: Mode;
  bg: string;
  fg: string;
  panel: string;
  border: string;
  accent: string;
  red: string;
  preset: Preset;
}

const both = (
  base: Omit<
    Spec,
    "mode" | "bg" | "fg" | "panel" | "border" | "accent" | "red"
  > & {
    light: Pick<Spec, "bg" | "fg" | "panel" | "border" | "accent" | "red">;
    dark: Pick<Spec, "bg" | "fg" | "panel" | "border" | "accent" | "red">;
  },
): VsTheme[] =>
  (["light", "dark"] as const).map((mode) => {
    const spec: Spec = { ...base, ...base[mode], mode };
    const other = mode === "light" ? "dark" : "light";
    const charts = [
      spec.accent,
      rotate(spec.accent, 55),
      rotate(spec.accent, 120),
      rotate(spec.accent, 200),
      rotate(spec.accent, 280),
    ];
    return {
      id: `bs-${spec.family}-${spec.id}-${mode}`,
      name: spec.name,
      mode,
      bg: spec.bg,
      fg: spec.fg,
      panel: spec.panel,
      border: spec.border,
      accent: spec.accent,
      colors: [spec.red, charts[2], charts[1], charts[3], charts[4]],
      charts,
      red: spec.red,
      pair: `bs-${spec.family}-${spec.id}-${other}`,
      preset: spec.preset,
      family: spec.family,
    };
  });

// ---- shadcn/ui: five neutrals, and seven accents on zinc ----

const SHADCN: Preset = { font: "sans", style: "default" };

const shadcnNeutrals: [
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
][] = [
  // id, name, light fg, light border, light primary, dark bg, dark fg, dark border
  [
    "neutral",
    "Neutral",
    "#0a0a0a",
    "#e5e5e5",
    "#171717",
    "#0a0a0a",
    "#fafafa",
    "#262626",
  ],
  [
    "zinc",
    "Zinc",
    "#09090b",
    "#e4e4e7",
    "#18181b",
    "#09090b",
    "#fafafa",
    "#27272a",
  ],
  [
    "slate",
    "Slate",
    "#020617",
    "#e2e8f0",
    "#0f172a",
    "#020617",
    "#f8fafc",
    "#1e293b",
  ],
  [
    "stone",
    "Stone",
    "#0c0a09",
    "#e7e5e4",
    "#1c1917",
    "#0c0a09",
    "#fafaf9",
    "#292524",
  ],
  [
    "gray",
    "Gray",
    "#030712",
    "#e5e7eb",
    "#111827",
    "#030712",
    "#f9fafb",
    "#1f2937",
  ],
];

const shadcnAccents: [string, string, string, string, string][] = [
  // id, name, light accent, dark accent, dark red
  ["red", "Red", "#dc2626", "#ef4444", "#ef4444"],
  ["rose", "Rose", "#e11d48", "#f43f5e", "#f43f5e"],
  ["orange", "Orange", "#ea580c", "#f97316", "#ef4444"],
  ["green", "Green", "#16a34a", "#22c55e", "#ef4444"],
  ["blue", "Blue", "#2563eb", "#3b82f6", "#ef4444"],
  ["yellow", "Yellow", "#ca8a04", "#eab308", "#ef4444"],
  ["violet", "Violet", "#7c3aed", "#8b5cf6", "#ef4444"],
];

const shadcn: VsTheme[] = [
  ...shadcnNeutrals.flatMap(
    ([id, name, fg, border, primary, dbg, dfg, dborder]) =>
      both({
        family: "shadcn",
        id,
        name,
        preset: SHADCN,
        light: {
          bg: "#ffffff",
          fg,
          panel: mix("#ffffff", fg, 0.02),
          border,
          accent: primary,
          red: "#dc2626",
        },
        dark: {
          bg: dbg,
          fg: dfg,
          panel: mix(dbg, dfg, 0.04),
          border: dborder,
          accent: dfg,
          red: "#ef4444",
        },
      }),
  ),
  ...shadcnAccents.flatMap(([id, name, light, dark, red]) =>
    both({
      family: "shadcn",
      id,
      name,
      preset: SHADCN,
      light: {
        bg: "#ffffff",
        fg: "#09090b",
        panel: "#fafafa",
        border: "#e4e4e7",
        accent: light,
        red: "#dc2626",
      },
      dark: {
        bg: "#09090b",
        fg: "#fafafa",
        panel: "#111113",
        border: "#27272a",
        accent: dark,
        red,
      },
    }),
  ),
];

// ---- Radix Colors: the step 9 accents; surfaces and text are tints of the hue ----

const RADIX: Preset = { font: "inter", style: "radix", text: "md", ui: "md" };

const radixAccents: [string, string, string][] = [
  ["gray", "Gray", "#8d8d8d"],
  ["tomato", "Tomato", "#e54d2e"],
  ["red", "Red", "#e5484d"],
  ["crimson", "Crimson", "#e93d82"],
  ["pink", "Pink", "#d6409f"],
  ["plum", "Plum", "#ab4aba"],
  ["purple", "Purple", "#8e4ec6"],
  ["violet", "Violet", "#6e56cf"],
  ["indigo", "Indigo", "#3e63dd"],
  ["blue", "Blue", "#0090ff"],
  ["cyan", "Cyan", "#00a2c7"],
  ["teal", "Teal", "#12a594"],
  ["green", "Green", "#30a46c"],
  ["grass", "Grass", "#46a758"],
  ["orange", "Orange", "#f76b15"],
  ["amber", "Amber", "#ffc53d"],
  ["sky", "Sky", "#7ce2fe"],
];

const radix: VsTheme[] = radixAccents.flatMap(([id, name, a]) =>
  both({
    family: "radix",
    id,
    name,
    preset: RADIX,
    light: {
      bg: mix("#ffffff", a, 0.03),
      fg: mix(a, "#000000", 0.78),
      panel: mix("#ffffff", a, 0.07),
      border: mix("#ffffff", a, 0.28),
      accent: a,
      red: "#e5484d",
    },
    dark: {
      bg: mix("#111111", a, 0.07),
      fg: mix(a, "#ffffff", 0.82),
      panel: mix("#111111", a, 0.12),
      border: mix("#111111", a, 0.28),
      accent: a,
      red: "#ff6369",
    },
  }),
);

// ---- Bulma ----

const BULMA: Preset = {
  font: "sourcesans",
  style: "bulma",
  text: "md",
  ui: "md",
};

const bulmaColors: [string, string, string][] = [
  ["turquoise", "Turquoise", "#00d1b2"],
  ["link", "Link", "#485fc7"],
  ["info", "Info", "#3e8ed0"],
  ["success", "Success", "#48c78e"],
  ["warning", "Warning", "#ffe08a"],
  ["danger", "Danger", "#f14668"],
];

const bulma: VsTheme[] = bulmaColors.flatMap(([id, name, a]) =>
  both({
    family: "bulma",
    id,
    name,
    preset: BULMA,
    light: {
      bg: "#ffffff",
      fg: "#363636",
      panel: "#f5f5f5",
      border: "#dbdbdb",
      accent: a,
      red: "#f14668",
    },
    dark: {
      bg: "#141414",
      fg: "#b5b5b5",
      panel: "#1f1f1f",
      border: "#363636",
      accent: a,
      red: "#f14668",
    },
  }),
);

// ---- Flowbite ----

const FLOWBITE: Preset = {
  font: "inter",
  style: "flowbite",
  text: "md",
  ui: "md",
};

const flowbiteColors: [string, string, string][] = [
  ["blue", "Blue", "#1c64f2"],
  ["green", "Green", "#0e9f6e"],
  ["red", "Red", "#f05252"],
  ["yellow", "Yellow", "#e3a008"],
  ["purple", "Purple", "#7e3af2"],
  ["pink", "Pink", "#d61f69"],
  ["indigo", "Indigo", "#5850ec"],
  ["teal", "Teal", "#0694a2"],
];

const flowbite: VsTheme[] = flowbiteColors.flatMap(([id, name, a]) =>
  both({
    family: "flowbite",
    id,
    name,
    preset: FLOWBITE,
    light: {
      bg: "#ffffff",
      fg: "#111827",
      panel: "#f9fafb",
      border: "#e5e7eb",
      accent: a,
      red: "#f05252",
    },
    dark: {
      bg: "#111827",
      fg: "#f9fafb",
      panel: "#1f2937",
      border: "#374151",
      accent: a,
      red: "#f98080",
    },
  }),
);

// ---- MDN ----

const mdn: VsTheme[] = both({
  family: "mdn",
  id: "default",
  name: "MDN",
  preset: { font: "system", style: "mdn", text: "md", ui: "md" },
  light: {
    bg: "#ffffff",
    fg: "#1b1b1b",
    panel: "#f9f9fb",
    border: "#cdcdcd",
    accent: "#0069c2",
    red: "#d30038",
  },
  dark: {
    bg: "#1b1b1b",
    fg: "#ffffff",
    panel: "#2b2b2b",
    border: "#4e4e4e",
    accent: "#8cb4ff",
    red: "#ff6a8b",
  },
});

// ---- Material Design: the baseline scheme, and the 2014 palette's primaries ----

const MATERIAL: Preset = {
  font: "roboto",
  style: "material",
  text: "md",
  ui: "md",
};

const materialColors: [string, string, string][] = [
  ["indigo", "Indigo", "#3f51b5"],
  ["deep-purple", "Deep Purple", "#673ab7"],
  ["blue", "Blue", "#2196f3"],
  ["cyan", "Cyan", "#00bcd4"],
  ["teal", "Teal", "#009688"],
  ["green", "Green", "#4caf50"],
  ["amber", "Amber", "#ffc107"],
  ["deep-orange", "Deep Orange", "#ff5722"],
  ["pink", "Pink", "#e91e63"],
];

const material: VsTheme[] = [
  ...both({
    family: "material",
    id: "baseline",
    name: "Baseline",
    preset: MATERIAL,
    light: {
      bg: "#fffbfe",
      fg: "#1c1b1f",
      panel: "#f3edf7",
      border: "#cac4d0",
      accent: "#6750a4",
      red: "#b3261e",
    },
    dark: {
      bg: "#1c1b1f",
      fg: "#e6e1e5",
      panel: "#2b2930",
      border: "#49454f",
      accent: "#d0bcff",
      red: "#f2b8b5",
    },
  }),
  ...materialColors.flatMap(([id, name, a]) =>
    both({
      family: "material",
      id,
      name,
      preset: MATERIAL,
      light: {
        bg: mix("#fffbfe", a, 0.02),
        fg: "#1c1b1f",
        panel: mix("#ffffff", a, 0.08),
        border: mix("#ffffff", a, 0.25),
        accent: a,
        red: "#b3261e",
      },
      dark: {
        bg: mix("#1c1b1f", a, 0.04),
        fg: "#e6e1e5",
        panel: mix("#1c1b1f", a, 0.12),
        border: mix("#1c1b1f", a, 0.3),
        accent: a,
        red: "#f2b8b5",
      },
    }),
  ),
];

// ---- Ant Design ----

const ANT: Preset = { font: "segoe", style: "ant", text: "sm", ui: "sm" };

const antColors: [string, string, string][] = [
  ["blue", "Daybreak Blue", "#1677ff"],
  ["geekblue", "Geek Blue", "#2f54eb"],
  ["purple", "Golden Purple", "#722ed1"],
  ["magenta", "Magenta", "#eb2f96"],
  ["red", "Dust Red", "#f5222d"],
  ["orange", "Sunset Orange", "#fa8c16"],
  ["green", "Polar Green", "#52c41a"],
  ["cyan", "Cyan", "#13c2c2"],
];

const ant: VsTheme[] = antColors.flatMap(([id, name, a]) =>
  both({
    family: "ant",
    id,
    name,
    preset: ANT,
    light: {
      bg: "#f5f5f5",
      fg: "#1f1f1f",
      panel: "#ffffff",
      border: "#d9d9d9",
      accent: a,
      red: "#f5222d",
    },
    dark: {
      bg: "#141414",
      fg: "#e6e6e6",
      panel: "#1f1f1f",
      border: "#424242",
      accent: a,
      red: "#ff4d4f",
    },
  }),
);

export const BRAND_THEMES: VsTheme[] = [
  ...shadcn,
  ...radix,
  ...bulma,
  ...flowbite,
  ...mdn,
  ...material,
  ...ant,
];

// hslToHex is re-exported for the tests that build a colour to compare with
export { hslToHex };
