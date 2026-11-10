# ui-kit

Every [shadcn/ui](https://ui.shadcn.com/docs/components) component, written as
a [pavlus](../framework) template, and what is built from them. The kit is kept
slim on purpose: the components, a small set of blocks, the two editors, and
one theming system. The top menu has these sections:

- **Components**: the shadcn components, one page each, with live demos.
- **Blocks**: a curated set of ready-made sections (auth, shop cart, kanban
  board, data grid, chat thread, docs layout...). Some are the parts the
  templates are built from.
- **Templates**: the two editors, Flow Studio and the Visual Builder. The
  `applications/diagram-programming` app mounts them.
- **A Source tab on every page**: Preview and Source (the pavlus template, its
  logic, its stylesheet, highlighted; the page stays mounted underneath).
- **A theming panel**, fixed on the right and opened from the top bar, with the same
  choices as the Theming page, on any page, a template included.
- **Theming**: a configurator for the whole kit: 10 system font stacks, 30
  palettes (each a light and a dark theme, derived from one hue), three size
  scales (controls, text, blocks), six styles (default, official, casual, funny,
  computer science, biology) and the corner radius. Picking a palette also sets
  the font, sizes and style it comes with (a switch turns that off), and a
  button picks a random theme. It applies at once, is remembered in the browser
  and can be exported as CSS.

The stateful pages (tabs, dialog, calendar, data table, music player, carts,
quizzes...) are pavlus components with pure handlers, the rest are templates
without logic.

Published on GitHub Pages: **https://rysev-a.github.io/pavlus/**

## Run it

```sh
npm install                       # from the workspace root, once
npm run dev --workspace ui-kit    # http://localhost:5173
npm test --workspace ui-kit
npm run typecheck --workspace ui-kit
UI_KIT_BASE=/pavlus/ npm run build --workspace ui-kit   # what the workflow builds
```

## How it is built

- **Style.** The admin-app's stylesheet (`admin-app/frontend/styles.css`: the
  shadcn "new-york" tokens and the `.ui-*` classes) is imported as it is, so
  the kit and the app can never drift apart. `frontend/kit.css` adds only what
  the app has no use for: the site layout, the demo frames, `kbd`, input
  group, item, typography, chart bars and the icons.
- **Templates.** A page is `pages/<slug>/<slug>.pavlus`. A demo with state also
  has `pages/<slug>/<slug>.ts`: a `Component` whose handlers are pure
  (`select(msg) → [store.set("active", msg.payload)]`) and that exports its
  `initial` state. `pages.ts` finds both with `import.meta.glob`; the router
  does the rest (`routing` of the shell, one `+outlet`).
- **Adding a component** is adding that folder and a line in `registry.ts`
  (sidebar, home page, title and description). `tests/pages.test.ts` fails for
  an entry that has no page.
- **Adding a block or a template** is adding a folder with a `meta.ts` (title,
  group, description; a template also sets its `look`). Nothing else lists it.
  See [AUTHORING.md](./AUTHORING.md): the conventions, the rule that templates are
  built from blocks, and the traps of the template language.
- **Theming** is data: `theming.ts` holds the catalogs (fonts, palettes, sizes,
  styles, radii) and the pure functions that turn a look into CSS variables,
  with the contrast maths that keeps every palette readable; the `theme` plugin (`theme.ts`)
  is the only code that touches `<html>`, and the `random` plugin (`random.ts`) is
  where the random button gets its number, because application code cannot call
  `Math.random()`. A template's `look` is applied while its page is open.
  Font sizes and control heights are scaled where the stylesheets are loaded
  (`scaleSizes` in `vite.config.mjs`), so the admin-app stylesheet stays as it is.
- **Plugins.** `main.ts` is the only file with side effects: the store, DOM,
  router and time plugins from the framework, and a small `theme` plugin
  (`theme.ts`) that sets the `dark` / `light` class on `<html>`. The toasts of
  the Sonner page are dismissed by a timer of the time plugin.
- **Base path.** GitHub Pages serves the site from `/pavlus/`. The router
  plugin takes a `window` option, so `base-window.ts` shows it a window
  without the base and puts it back on `pushState`; pages are routed as
  `/button` and the links are real `href`s (`{root}/button`).
- **Source tab.** `source.ts` bundles every file of a page folder as a lazy raw
  chunk (`import.meta.glob(..., { query: "?raw" })`); a `source` plugin loads the
  one asked for and the pure `highlight` turns it into tokens. The pavlus
  highlighter is a few regular expressions, tested by re-joining the tokens of every
  file of the kit.
- **Direct links.** Pages has no history fallback, so the build also emits
  `404.html` (a copy of `index.html`): opening `/pavlus/button` directly gets
  the app, which routes it. See `vite.config.mjs`.

## From a diagram to a running app

Flow Studio and the Visual Builder are two halves of one way to build an app: the
diagram is the data flow and the backend, the Visual Builder is the UI that is wired to
it. The demo is a CRM for a coffee shop, in both tools.

- **Run it in the browser.** Open the "Coffee shop CRM" demo of Flow Studio and press
  Run: the requests go through modules, a pipe, code and a plugin, against the tables of
  the design (`store.ts`, a small in-memory SQL). In the Visual Builder open the demo of
  the same name: it is linked to that diagram, which answers its requests.
- **Make the server.** `node scripts/flow-generate.ts coffee ../coffee-shop-app --name
  coffee-shop-app` writes a [@pavlus/server](../server) project: one file per module,
  the routes, the schema and the seed of the tables, the stubs of the plugins, tests.
  `coffee-shop-app/` is that output (a test keeps it in step with the design).
- **Run the server.** In `coffee-shop-app/`: `cp .env.example .env && npm run db:up &&
  npm start`. In the Visual Builder demo switch "Simulated backend" off: its requests go
  to `/crm-api`, which `npm run dev` proxies to the server on port 3020.
- **Check that they agree.** `frontend/tests/coffee-conformance.test.ts` runs one day
  of the shop through the simulation and through the real server and Postgres and
  compares every answer and every table (it is skipped without `COFFEE_API` and
  `DATABASE_URL`; the command is at its top).
- **Plugins.** `frontend/plugin-library/` is the library: the built-in plugins, made
  from `server/src/plugins` (`npm run gen:plugins`; a test fails when the server gets an
  effect the library does not know), and ready-made ones (mailer, stripe, s3, sms,
  queue) that a project can add. A plugin of a project can be kept in "My library" in
  the browser for the other projects.

## Deploy

`.github/workflows/ui-kit-pages.yml` type-checks, tests and builds the kit on
every pull request, and deploys `ui-kit/dist` to Pages on a push to `main`.
Once, in the repository: **Settings → Pages → Build and deployment → Source:
GitHub Actions**.

## Known limits

- The framework's DOM plugin creates `svg`/`math` elements in their namespace, so
  inline SVG works; the kit still draws icons as CSS masks over `currentColor`
  (`.k-icon-*`) and the charts as boxes (bars) and a clipped box (area) — a kit
  convention, kept for its zero-dependency look.
- Overlays (dialog, sheet, drawer, popovers) are state-driven markup and native
  `<details>`: no focus trap and no `Escape` to close.
