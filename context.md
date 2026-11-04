# Pavlus — working context

Live handoff notes for the agent threads working in this repo. Update on every
significant step; keep it terse. Full history is in git + the conversation.

## Ground rules

- Repo root `/Users/rysev-a/Projects/pavlus`; workspaces: `framework/`,
  `admin-app/`, `ui-kit/` (+ `debug-panel/` — **owned by another thread, do
  NOT touch**; the Console tab for the debug panel is built there).
- From a workspace dir binaries are `../node_modules/.bin/{tsc,vitest,prettier}`
  (never `npx`, never `../../`).
- SSR build only via `npm run build` in admin-app (passes
  `--ssr app/entry-server.ts --outDir dist/server`).
- After editing `.pavlus` templates, a stale vitest/vite cache can cause
  phantom e2e failures → `rm -rf ../node_modules/.vitest-cache ../node_modules/.vite*`
  at root and re-run.
- Template expression limits: NO arrow functions (`=>` → parser error
  "Unexpected character ="). Ternaries, `.includes`, method calls, string-literal
  event args (`@click=sort("id")`), boolean attrs (`disabled=(...)`) all work.
- User language: Russian.

## Architecture snapshot (post slot-removal PoC)

- Components are pure classes; effects bubble up and are enriched/scoped by
  parents (dom target scoping, store path prefixing = lens); messages sink down
  and get sliced per-component. Framework: `src/component/mod.ts` slices paint
  payloads at every scoped boundary.
- `DomPlugin` is a class (`mount/unmount/update/focus/blur`, static helpers);
  no legacy `repaint`/`onState`.
- Admin-app routing: `app.pavlus` = `div.ui-shell > +Sidebar#sidebar(menu=
route) + main.ui-shell-content > +outlet` (sidebar is a view-only template
  import, no TS handler — `sidebar.navigate` hits the Component default);
  `app.ts` `routing` maps `/`→list, `/new`→new, `/:id/edit`→edit with
  `props: (s) => ({ roles: s.roles })`; pages self-paint via `paintOnWrite`;
  `main.ts` uses `createRouterPlugin()`. SSR `renderPage(frontend, query, at)`
  dispatches `routeChanged` (with `inert("router")`) before `mounted`.
- Styles live in `admin-app/public/styles.css`, `<link>` in index.html, NO
  import in code (user preference).

## Done & green: users page == ui.shadcn.com/examples/tasks (completed)

Every remaining step landed. Bugs found when the rewritten e2e ran for the
first time (it never had):

- expected 501 users after create — arithmetic missed Bob's earlier delete;
  500 is right (fixed + a comment).
- until-races after navigate-back: the re-entered page reloads, so clicks
  landed on the "Loading..." paint without the table/buttons — added
  `until("the table is back", rows().length === 10)` waits.
- `onSuccess: "reset.done"` never reached `resetDone`: dotted ids only match
  literally-quoted method names (`"roles.loaded"()` in app.ts); now
  `"resetDone"`.
- `resetDatabase` pool wrapper returned `QueryArrayResult`, not rows → tsc
  error; now `.then((r) => r.rows as Row[])` (as ssr.test.ts does).
- removed the leftover fetch-logging wrapper + 1.5s sleep from the create
  section.

## Done & green: left menu sidebar in the legacy style (users item only)

- `app/sidebar/sidebar.pavlus` NEW — a view-only child (template-level
  `import Sidebar` + `+Sidebar#sidebar(menu=menu route=route)` in
  `app.pavlus`): brand header, "Menu" group label, data-driven links with
  the legacy `data-active` expression (root item = exact "/" port). Legacy's
  collapsible categories/account NOT ported (one item; port from legacy when
  a second section appears). Zero TS: clicks fall through to the Component
  default (`x.navigate` → `router.navigate`).
- `state.ts`: `MenuItem` + `menu: [{ path: "/", title: "Users", icon:
"users" }]` in `AppState`/initial.
- `styles.css`: `.admin` → `.ui-shell` grid (sticky 256px aside + body,
  `.ui-shell-content` keeps the old 1200px/padding), `.ui-sidebar*`/
  `.ui-brand*` ported onto the app's tokens; ≤800px stacks into a block.
  Icons are lucide CSS masks — only `data-icon="users"` shipped.
- Tests: app.test.ts (sidebar renders, active on `/`, inactive on `/new`,
  menu link navigates back), ssr.test.ts (`data-active="true"` in the HTML).
- Docs: README shell wording; `docs/site/scripts/build.ts` excerpts re-picked
  (outletShell app.pavlus 12–16, childPaint user-list.ts 70–77), page.ts
  "one line — +outlet" sentence updated, site rebuilt (`node
docs/site/scripts/build.ts`).
- Validation: admin-app vitest 2/2, `tsc --noEmit` clean, `npm run build` +
  prod SSR smoke on :3211 (aside, menu item, data-active, hydration state).
- ⚠️ The user's `npm run dev` (own terminal) got stuck mid `--watch` restart
  (listen socket closed while an HMR connection held the process) after the
  edit window where `app.pavlus` imported a not-yet-created sidebar file —
  needs Ctrl-C + `npm run dev`.
