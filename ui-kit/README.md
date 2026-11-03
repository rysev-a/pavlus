# ui-kit

Every [shadcn/ui](https://ui.shadcn.com/docs/components) component, written as
a [pavlus](../framework) template, in the style of the [admin-app](../admin-app),
and what is built from them. The top menu has four sections:

- **Components**: 58 shadcn components, one page each, with live demos.
- **Blocks**: 61 ready-made sections (sign in and register, credit card form, edit
  profile form, user resume, music player, flight ticket booking, shop cart, hero,
  pricing table, kanban board, piano keyboard...). Some are the parts the
  templates are built from.
- **Templates**: 20 whole sites and apps (portfolios, four shops, four admin
  panels, landing pages, a docs wiki, a music practice tool, a quiz platform,
  a classifieds board...), each built from blocks and each with **its own look**.
- **Theming**: a configurator for the whole kit: 10 fonts, 30 light and 30 dark
  palettes, 20 dark and 20 light themes in the spirit of Visual Studio Code
  (Dracula, Nord, Tokyo Night, Solarized, GitHub, Catppuccin...), three size
  scales (controls, text, blocks) and six styles (default, official, casual,
  funny, computer science, biology). Picking a theme also sets the font, sizes
  and style it comes with (a switch turns that off), and a button picks a random
  theme. It applies at once, is remembered in the browser and can be exported as
  CSS.

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
- **Theming** is data: `theming.ts` holds the catalogs and the pure functions that
  turn a look into CSS variables (`vscode-themes.ts` the 40 editor themes, `color.ts`
  the contrast maths that keeps every one readable); the `theme` plugin (`theme.ts`)
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
- **Direct links.** Pages has no history fallback, so the build also emits
  `404.html` (a copy of `index.html`): opening `/pavlus/button` directly gets
  the app, which routes it. See `vite.config.mjs`.

## Deploy

`.github/workflows/ui-kit-pages.yml` type-checks, tests and builds the kit on
every pull request, and deploys `ui-kit/dist` to Pages on a push to `main`.
Once, in the repository: **Settings → Pages → Build and deployment → Source:
GitHub Actions**.

## Known limits

- The framework's DOM plugin creates elements with `createElement`, so there is
  no inline SVG. Icons are CSS masks over `currentColor` (`.k-icon-*`) and the
  charts are boxes (bars) and a clipped box (area).
- Overlays (dialog, sheet, drawer, popovers) are state-driven markup and native
  `<details>`: no focus trap and no `Escape` to close.
