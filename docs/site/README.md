# pavlus documentation site

The landing page that explains the framework — generated, not written by hand.

```
npm run docs:build        # from the workspace root (node docs/site/scripts/build.ts)
open docs/site/index.html # or serve docs/ statically
```

The build **compiles every example in `examples.ts` with the real compiler**
(`framework/src/compiler`) and **runs the real runtime** (`framework/src/runtime`),
so the page shows exactly what the framework produces:

- the generated `render` / `diff` module for each template (verbatim),
- the middle data — the AST with each node's dependency set
  (`analyze.nodeDeps`), the thing that lets `diff` skip unchanged subtrees,
- the real vnodes `render(state)` returns and the real patches
  `diff(prev, next)` returns for every documented step.

## Layout

| File                | What                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------- |
| `build.ts`          | The entry point: compiles, runs, generates SVGs + `index.html`, checks SVG well-formedness.                   |
| `examples.ts`       | The seven part-I examples (template + states + steps), from a static element to a keyed list.                 |
| `run.ts`            | Compiles an example and runs `render`/`diff`; formats vnodes and patches for display.                         |
| `ast-view.ts`       | AST → labeled tree (SVG) and indented listing (HTML) with dependency sets.                                    |
| `svg.ts`            | Small SVG builder: panels, code blocks, arrows, tree layout, sequence steps.                                  |
| `diagrams.ts`       | The diagrams: per-example compile pipelines, the pure-concept architecture, the counter/users tick scenarios. |
| `demos.ts`          | The counter and users apps of part II — their real patches feed the scenario diagrams.                        |
| `page.ts`           | HTML + CSS + a few lines of vanilla JS (step tabs).                                                           |
| `check-geometry.ts` | Dev helper: bounds/overflow/overlap checks for the generated SVGs.                                            |

Diagrams are also written to `../diagrams/*.svg` so they can be embedded in
READMEs and issues directly.

The framework source excerpts on the page are sliced from the real files at
build time, so they cannot drift from the code.
