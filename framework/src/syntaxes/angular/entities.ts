/** The named character references templates are likely to use. */
const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  copy: "©",
  reg: "®",
  trade: "™",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  laquo: "«",
  raquo: "»",
  middot: "·",
  bull: "•",
  times: "×",
  euro: "€",
  larr: "←",
  rarr: "→",
};

/**
 * Decodes `&amp;` style references and `&#39;` / `&#x27;` numeric ones.
 * Unknown or malformed references are left as they are, like browsers do.
 * The result is literal text: it is never scanned for `{{` or `}` again,
 * which is how a literal brace is written (`&#123;`, `&#125;`).
 */
export function decodeEntities(text: string): string {
  if (!text.includes("&")) return text;
  return text.replace(
    /&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|([A-Za-z][A-Za-z0-9]*));/g,
    (whole, dec?: string, hex?: string, name?: string) => {
      if (name !== undefined) return NAMED[name] ?? whole;
      const code = dec !== undefined ? Number(dec) : parseInt(hex!, 16);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    },
  );
}
