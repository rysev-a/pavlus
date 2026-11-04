/**
 * Pictures without image files. A picture is a string:
 *   `grad:<hue>:<hue2>:<glyph>`  a generated picture: a gradient and a glyph (an emoji)
 *   `data:image/...`             an uploaded image (a data URL)
 * `pictureStyle` turns either into the inline style of a box, so an avatar, a
 * photo or a wallpaper is a `div(style=...)`. Pure.
 */

export const gradient = (hue: number, hue2: number, glyph = ""): string => `grad:${Math.round(hue) % 360}:${Math.round(hue2) % 360}:${glyph}`;

export const isUpload = (src: string): boolean => src.startsWith("data:");

/** The glyph of a generated picture ("" for an upload). */
export function glyphOf(src: string): string {
  if (!src.startsWith("grad:")) return "";
  return src.split(":").slice(3).join(":");
}

/** The inline style that paints a box with the picture. */
export function pictureStyle(src: string): string {
  if (isUpload(src)) return `background-image: url(${src}); background-size: cover; background-position: center`;
  const [, a, b] = src.split(":");
  const h1 = Number(a);
  const h2 = Number(b);
  if (!Number.isFinite(h1) || !Number.isFinite(h2)) return "background: var(--muted)";
  return `background: linear-gradient(135deg, hsl(${h1} 70% 55%), hsl(${h2} 70% 42%))`;
}

/** The initials of a name, for an avatar with no glyph. */
export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");
}
