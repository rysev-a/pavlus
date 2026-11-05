/**
 * A small forgiving HTML parser for template markup (the static parts of
 * `html` templates and `unsafe()` strings) on the server. It handles void
 * elements, comments, raw-text elements, entities, SVG case preservation and
 * the common implied end tags (`p`, `li`, `option`, `tr`, `td`, ...). It does
 * not implement the full HTML5 tree-construction algorithm (no table
 * foster-parenting or `tbody` insertion): write well-formed templates.
 *
 * @module
 */
import type { VDocument, VElement, VNode } from "./vdom.ts";

export const VOID = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "source",
  "track",
  "wbr",
]);
const RAW = new Set(["script", "style"]);
const RCDATA = new Set(["textarea", "title"]);

// opening <key> implicitly closes an open element in the value set
const CLOSES: Record<string, string[]> = {
  li: ["li"],
  dt: ["dt", "dd"],
  dd: ["dt", "dd"],
  option: ["option"],
  optgroup: ["optgroup", "option"],
  tr: ["tr", "td", "th"],
  td: ["td", "th"],
  th: ["td", "th"],
  thead: ["tbody", "tfoot"],
  tbody: ["thead", "tbody", "tfoot"],
  tfoot: ["thead", "tbody"],
};
const CLOSE_P = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "div",
  "dl",
  "fieldset",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "main",
  "nav",
  "ol",
  "p",
  "pre",
  "section",
  "table",
  "ul",
]);

const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  copy: "©",
  hellip: "…",
  mdash: "—",
  ndash: "–",
};

export function decodeEntities(s: string): string {
  if (!s.includes("&")) return s;
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code =
        e[1] === "x" || e[1] === "X"
          ? parseInt(e.slice(2), 16)
          : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : m;
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

/** Parse `markup` and append the resulting nodes to `target`. */
export function parseFragment(
  markup: string,
  doc: VDocument,
  target: VNode,
  inSvg = false,
): void {
  const stack: Array<{ node: VNode; name: string; svg: boolean }> = [
    { node: target, name: "", svg: inSvg },
  ];
  const top = (): { node: VNode; name: string; svg: boolean } =>
    stack[stack.length - 1]!;
  let i = 0;
  const n = markup.length;
  const text = (s: string): void => {
    if (s === "") return;
    const t = top().node;
    const data = decodeEntities(s);
    const last = t.lastChild;
    if (last !== null && last.nodeType === 3)
      (last as unknown as { data: string }).data += data;
    else t.appendChild(doc.createTextNode(data));
  };
  while (i < n) {
    const lt = markup.indexOf("<", i);
    if (lt === -1) {
      text(markup.slice(i));
      break;
    }
    if (lt > i) text(markup.slice(i, lt));
    i = lt;
    if (markup.startsWith("<!--", i)) {
      const end = markup.indexOf("-->", i + 4);
      top().node.appendChild(
        doc.createComment(markup.slice(i + 4, end === -1 ? n : end)),
      );
      i = end === -1 ? n : end + 3;
      continue;
    }
    if (markup[i + 1] === "!" || markup[i + 1] === "?") {
      const end = markup.indexOf(">", i);
      i = end === -1 ? n : end + 1;
      continue;
    }
    if (markup[i + 1] === "/") {
      const end = markup.indexOf(">", i);
      const name = markup
        .slice(i + 2, end === -1 ? n : end)
        .trim()
        .toLowerCase();
      i = end === -1 ? n : end + 1;
      for (let k = stack.length - 1; k > 0; k--) {
        if (stack[k]!.name.toLowerCase() === name) {
          stack.length = k;
          break;
        }
      }
      continue;
    }
    if (!/[a-zA-Z]/.test(markup[i + 1] ?? "")) {
      text("<");
      i++;
      continue;
    }
    let j = i + 1;
    while (j < n && !/[\s/>]/.test(markup[j]!)) j++;
    const rawName = markup.slice(i + 1, j);
    const lower = rawName.toLowerCase();
    const svg = top().svg || lower === "svg";
    const el: VElement = svg
      ? doc.createElementNS("http://www.w3.org/2000/svg", rawName)
      : doc.createElement(lower);
    let selfClose = false;
    for (;;) {
      while (j < n && /\s/.test(markup[j]!)) j++;
      if (j >= n) break;
      const c = markup[j]!;
      if (c === ">") {
        j++;
        break;
      }
      if (c === "/") {
        if (markup[j + 1] === ">") {
          selfClose = true;
          j += 2;
          break;
        }
        j++;
        continue;
      }
      let k = j;
      while (k < n && !/[\s=/>]/.test(markup[k]!)) k++;
      const name = markup.slice(j, k);
      j = k;
      while (j < n && /\s/.test(markup[j]!)) j++;
      let value = "";
      if (markup[j] === "=") {
        j++;
        while (j < n && /\s/.test(markup[j]!)) j++;
        const q = markup[j];
        if (q === '"' || q === "'") {
          const e = markup.indexOf(q, j + 1);
          value = markup.slice(j + 1, e === -1 ? n : e);
          j = e === -1 ? n : e + 1;
        } else {
          k = j;
          while (k < n && !/[\s>]/.test(markup[k]!)) k++;
          value = markup.slice(j, k);
          j = k;
        }
      }
      if (name !== "" && !el.hasAttribute(name))
        el.setAttribute(name, decodeEntities(value));
    }
    i = j;
    if (!svg) {
      const closes = CLOSES[lower];
      if (closes) {
        for (let k = stack.length - 1; k > 0; k--) {
          const nm = stack[k]!.name;
          if (closes.includes(nm)) {
            stack.length = k;
            break;
          }
          if (
            nm === "ul" ||
            nm === "ol" ||
            nm === "table" ||
            nm === "select" ||
            nm === "dl"
          )
            break;
        }
      }
      if (CLOSE_P.has(lower) && top().name === "p") stack.pop();
    }
    top().node.appendChild(el);
    if ((!svg && VOID.has(lower)) || (svg && selfClose)) continue;
    if (!svg && (RAW.has(lower) || RCDATA.has(lower))) {
      const m = new RegExp(`</${lower}\\s*>`, "i").exec(markup.slice(i));
      const end = m === null ? n : i + m.index;
      const body = markup.slice(i, end);
      if (body !== "")
        el.appendChild(
          doc.createTextNode(RCDATA.has(lower) ? decodeEntities(body) : body),
        );
      i = m === null ? n : end + m[0].length;
      continue;
    }
    stack.push({
      node:
        lower === "template"
          ? (el as unknown as { content: VNode }).content
          : el,
      name: svg ? rawName : lower,
      svg,
    });
  }
}
