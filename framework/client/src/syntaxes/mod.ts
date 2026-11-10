/**
 * Alternative template syntaxes. A syntax is a parser from source text to the
 * template AST (template/ast.ts); everything after that (codegen, the runtime
 * helpers, the dom plugin) is shared, so every syntax produces the same pure
 * `render`/`diff` pair. Use one with the Vite plugin:
 *
 *   pavlus({ syntaxes: { ".pug": parsePug, ".ng.html": parseAngular } })
 */
export { parsePug } from "./pug/parse.ts";
export { parseAngular } from "./angular/parse.ts";
export { parseJsx } from "./jsx/parse.ts";
export { parseBlocks } from "./blocks/parse.ts";
