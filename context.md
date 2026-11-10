# Pavlus — working context

Live handoff notes for the agent threads working in this repo. Update on every
significant step; keep it terse. Full history is in git + the conversation.

## Ground rules

- Repo root `/Users/rysev-a/Projects/pavlus`; workspaces: `framework/*` and
  `applications/diagram-programming/` (+ `debug-panel/` — **owned by another thread,
  do NOT touch**; the Console tab for the debug panel is built there).
- Binaries live at the repo root: from a workspace dir they are
  `../../node_modules/.bin/{tsc,vitest}` (never `npx`).
- `npm run format` (root) is `biome format --write .`: it formats the whole
  repo whatever files you pass.
- After editing `.pavlus` templates, a stale vitest/vite cache can cause
  phantom e2e failures → `rm -rf node_modules/.vitest-cache node_modules/.vite*`
  at root and re-run.
- Template expressions are `Literal | Path` only — everything else is computed
  in component code (`framework/docs/philosophy.md`). Events are
  `@click=handler` or `@click=handler(path, "literal")`. Two holes with nothing
  static between them (`{a} {b}`) are a compiler warning: compose in code.
- Audit every template with the real compiler:
  `node /tmp/pavlus-audit.mts <dirs...>` (a throwaway script; recreate it from
  `compileTemplate` in `framework/client/src/compiler/mod.ts` if /tmp was
  cleared). As of 2026-11-10: 0 failures, 0 warnings outside `ui-kit/src/docs`.
- User language: Russian.

## Layout (2026-11)

- `framework/` — core, client (was frontend), server (was backend), ui-kit,
  debug-panel, editors, docs. The ui-kit keeps: the components (`src/pages`),
  the two editors (`src/templates/flow-studio`, `src/templates/visual-builder`),
  a small curated set of blocks, the docs section (`src/docs`, 5 languages) and
  the engine page. The catalog of one-off demo blocks/templates is gone.
- Theming (ui-kit `theming.ts`) is slim: 10 system fonts, 30 generated
  palettes × light/dark, 6 styles (default, official, casual, funny, cs,
  biology), 7 radii. The VS Code themes, the design-system themes
  (`vscode-themes.ts`, `brand-themes.ts`, `color.ts`), the brand styles and
  fonts, and the "family" tabs of the colour picker were removed on 2026-11-10.
  `Catalog` has `light`/`dark` swatch lists; `panelOf(catalog, look)`.
- `applications/diagram-programming/` — the one fullstack demo: pavlus client +
  `@pavlus/server` server + Postgres (compose.yaml, :54340). It mounts the two
  editors from the ui-kit by relative path (`../../../framework/ui-kit/src/...`).
  Its shell keeps everything the bar reads in `state.bar` (`barOf` in
  `app/app.ts`); handlers that change a bar input write through `_write`.
- `docs/philosophy/` — the four philosophy docs (template engine, architecture,
  plugins, functional programming) + README; `framework/docs/philosophy.md` is
  the template contract they build on.
- The other applications (admin, coffee-shop, phone-crm, mobile-dev, team-up)
  were removed; their compose stacks are down and deleted.

## Open work (2026-11-10)

- `framework/editors/` (tree-sitter grammar, Zed highlights) still know arrows,
  ternaries and operators: slim them to `Literal | Path` + events.
- `docs/site/scripts/examples.ts` and `ast-view.ts`: check the examples against
  the slim language (`npm run docs:build`).
- `framework/ui-kit/src/docs/content/*/syntax-expressions.md` and the 9 code
  blocks per language that used operators: being rewritten (see the docs tests,
  `src/tests/docs.test.ts`).

## Working on the ui-kit

- `registry.ts` collects blocks/templates via `import.meta.glob("*/meta.ts")`:
  deleting a folder removes the entry, nothing else lists them.
- `BLOCK_GROUPS` / `TEMPLATE_GROUPS` in `registry.ts` list the sidebar groups.
- diagram-programming imports the editors and kit helpers by relative path
  (`../../../framework/ui-kit/src/...`) — check it before moving kit files.
