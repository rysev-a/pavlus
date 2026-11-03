/** Small pure colour helpers for the themes that come as hex values. */
export type RGB = [number, number, number];

export function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  const n = parseInt(full.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const part = (n: number): string =>
  Math.max(0, Math.min(255, Math.round(n)))
    .toString(16)
    .padStart(2, "0");

export const rgbToHex = ([r, g, b]: RGB): string =>
  `#${part(r)}${part(g)}${part(b)}`;

/** `t` = 0 is `a`, 1 is `b`. */
export function mix(a: string, b: string, t: number): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return rgbToHex([0, 1, 2].map((i) => x[i] * (1 - t) + y[i] * t) as RGB);
}

/** WCAG relative luminance of a hex colour. */
export function luminanceOf(hex: string): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio of two hex colours (1 to 21). */
export function contrastOf(a: string, b: string): number {
  const x = luminanceOf(a);
  const y = luminanceOf(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/**
 * `color`, moved toward white or black (whichever reads better on `on`) just
 * far enough to reach the contrast `min` with `on`.
 */
export function ensureContrast(color: string, on: string, min: number): string {
  if (contrastOf(color, on) >= min) return color;
  const target =
    contrastOf("#ffffff", on) >= contrastOf("#000000", on)
      ? "#ffffff"
      : "#000000";
  for (let t = 0.05; t <= 1.0001; t += 0.05) {
    const c = mix(color, target, t);
    if (contrastOf(c, on) >= min) return c;
  }
  return target;
}

/** Black or white text, whichever reads better on `bg`. */
export const onColor = (bg: string): string =>
  contrastOf("#ffffff", bg) >= contrastOf("#111111", bg)
    ? "#ffffff"
    : "#111111";

/** `#rrggbb` to hue (0-360), saturation and lightness (0-100). */
export function hexToHsl(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex).map((c) => c / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l * 100];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h =
    max === r
      ? ((g - b) / d) % 6
      : max === g
        ? (b - r) / d + 2
        : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s * 100, l * 100];
}

export function hslToHex(h: number, s: number, l: number): string {
  const sat = s / 100;
  const light = l / 100;
  const a = sat * Math.min(light, 1 - light);
  const k = (n: number) => (n + h / 30) % 12;
  const f = (n: number) =>
    light - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return rgbToHex([f(0) * 255, f(8) * 255, f(4) * 255]);
}

/** The colour with its hue turned by `deg` degrees. */
export function rotate(hex: string, deg: number): string {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex((h + deg + 360) % 360, s, l);
}
