import { compileTemplate, type Parser } from "../compiler/mod.ts";

/** The part of a Vite plugin we use (avoids depending on Vite's types). */
export interface PavlusVitePlugin {
  name: string;
  enforce: "pre";
  transform(
    this: { error(message: string): never },
    code: string,
    id: string,
  ): { code: string; map: { mappings: string } } | null;
}

export interface PavlusPluginOptions {
  /**
   * More template syntaxes, by file extension (with the dot): each maps source
   * text to the template AST, e.g. `{ ".pug": parsePug }` from
   * `@service-laboratory/pavlus/syntaxes`. They compile exactly like `.pavlus`.
   */
  syntaxes?: Record<string, Parser>;
  /** File extension of templates. Default `.pavlus`. */
  extension?: string;
  /**
   * Module compiled templates import their runtime helpers from. Default
   * `@service-laboratory/pavlus/runtime`.
   */
  runtime?: string;
}

/**
 * Vite plugin: compiles `*.pavlus` templates into modules that export the
 * pure functions `render(state)` and `diff(prev, next)` (and a default
 * `{ render, diff, meta }` view).
 */
export function pavlus(opts: PavlusPluginOptions = {}): PavlusVitePlugin {
  const ext = opts.extension ?? ".pavlus";
  return {
    name: "pavlus",
    enforce: "pre",
    transform(code, id) {
      const [file, query = ""] = id.split("?");
      const alt = Object.keys(opts.syntaxes ?? {}).find((e) => file.endsWith(e));
      if (!file.endsWith(ext) && !alt) return null;
      // `?raw`, `?url` and `?inline` want the file itself, not a compiled module.
      if (/(^|&)(raw|url|inline)(&|$)/.test(query)) return null;
      try {
        // `mappings: ""` means "no source map". Without it Vite invents one that
        // maps the generated code onto itself (big, and it hides nothing). A real
        // map to the template would make DevTools show the template instead of
        // the generated render/diff, which is what you debug.
        return {
          code: compileTemplate(code, {
            filename: file,
            runtime: opts.runtime,
            parser: alt ? opts.syntaxes![alt] : undefined,
          }),
          map: { mappings: "" },
        };
      } catch (e) {
        return this.error(e instanceof Error ? e.message : String(e));
      }
    },
  };
}
