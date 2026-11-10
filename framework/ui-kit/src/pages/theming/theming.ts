import type { Catalog, Look } from "../../theming.ts";

/** A chooser entry with its flags ready: a template reads paths, it does not compare them (see philosophy.md). */
type Pressed<T> = T & {
  /** The entry is the visitor's choice. */
  active: boolean;
  /** What `aria-pressed` reads: "true" or "false". */
  pressedAttr: string;
};

/** The flags of a chooser entry the visitor picked or did not. */
const pressedOf = <T>(on: boolean, entry: T): Pressed<T> => ({
  ...entry,
  active: on,
  pressedAttr: on ? "true" : "false",
});

/**
 * The props of the Theming page: the chooser lists with every flag and
 * attribute ready — a template reads paths, it does not compare them (see
 * philosophy.md).
 */
export function themingProps(s: {
  look: Look;
  catalog: Catalog;
  css: string;
  exportNote: string;
}) {
  return {
    bundle: s.look.bundle,
    styles: s.catalog.styles.map((x) => pressedOf(s.look.style === x.id, x)),
    fonts: s.catalog.fonts.map((x) => pressedOf(s.look.font === x.id, x)),
    light: s.catalog.light.map((x) =>
      pressedOf(s.look.palette === x.id && s.look.mode === "light", x),
    ),
    dark: s.catalog.dark.map((x) =>
      pressedOf(s.look.palette === x.id && s.look.mode === "dark", x),
    ),
    radii: s.catalog.radii.map((x) => pressedOf(s.look.radius === x.id, x)),
    ui: s.catalog.ui.map((x) => pressedOf(s.look.ui === x.id, x)),
    text: s.catalog.text.map((x) => pressedOf(s.look.text === x.id, x)),
    block: s.catalog.block.map((x) => pressedOf(s.look.block === x.id, x)),
    css: s.css,
    exportNote: s.exportNote,
  };
}
