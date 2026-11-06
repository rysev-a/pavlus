# Pavlus — working context

Live handoff notes for the agent threads working in this repo. Update on every
significant step; keep it terse. Full history is in git + the conversation.

## Ground rules

- Repo root `/Users/rysev-a/Projects/pavlus`; workspaces: `framework/`,
  `applications/admin/`, `ui-kit/` (+ `debug-panel/` — **owned by another thread, do
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
- Styles live in `applications/admin/public/styles.css`, `<link>` in index.html, NO
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

## Done & green: restyled onto the ui-kit (shadcn "new-york")

- `public/styles.css` rewritten from `framework/ui-kit/frontend/styles.css`: sections
  1 (tokens incl. dark), 2 (shell), 3 (button), 4 (form), 5 (card/badge/
  page-header), 6 (data table), 9 (sidebar), 14 (icon masks) — trimmed to the
  rules used, section numbers follow the kit file; section 13 = the app's own
  few rules (status, td.id/th.sortable, `users`+`pencil` masks, form card
  width, centered reset). Deviation (commented in-file): no floating header →
  ≤800px the sidebar unfolds into a block instead of the kit's drawer.
- Templates carry kit classes next to the test hooks (`button.new`,
  `input.flt`, `select.pages`, `td.id`, …): list = ui-page-header/actions +
  ui-data-table (toolbar + ui-data-search with search icon, ui-data-check +
  `data-selected` rows, ui-badge-secondary, ghost icon-sm row actions
  pencil/trash + row-delete, ui-resource-footer with ui-data-rows +
  Previous/Next outline-sm); forms = ui-card (header/title/content) +
  ui-field-group + ui-input / ui-select-control + ui-form-actions
  (default/outline buttons); sidebar root is `nav.ui-sidebar` per the kit.
- app.pavlus / app.ts / user-list.ts untouched → docs excerpts (12–16 /
  38–55 / 70–77) still valid; site not rebuilt.
- README: `public/` line added to the tree.
- Validation: vitest 2/2, `tsc --noEmit` clean, `npm run build`, prod SSR
  smoke on :3212/:3213 (kit markup in HTML, styles.css 200/25KB), prettier
  clean (repo checks `**/*.ts`; the css passes too).

## Done & green: the table's row is a child component (user-list-row/)

- Goal: see how patch ids build when there is a parent component in the
  chain (embed inside a keyed `for`).
- `user-list/user-list-row/`: `user-list-row.pavlus` (the view half: the tr,
  checkbox, tds, star/edit/del) + `user-list-row.ts` (UserListRow — the
  behavior half; no view, no `key`: a row is not state, it reads/writes the
  page's `list` slice directly, so its store paths land beside the page's).
- `user-list.pavlus`: the loop body became `+Row#row(user=user
selected={selected.includes(user.id)} starred={starred.includes(user.id)})`
  - `import Row` line. Embed nid = 38 → row DOM ids =
    `/4#<user.id>/38<nid-in-row-template>`: tr `/4#1/380`, checkbox `/4#1/382`,
    star `/4#1/3813`, edit `/4#1/3815`, del `/4#1/3817`; nodes after the loop
    shifted −16 (footer text 57→41, count text 67→55).
- Message chain: row events arrive as `list.row.{pick,star,edit,remove}`
  (embed adds `row.`, outlet adds `list.`; the for key does NOT enter the
  prefix — the payload carries user.id). UserList renamed `pick/edit/remove`
  to quoted `"row.pick"/"row.edit"/"row.remove"`; UserListRow.star writes
  `starred` (added to ListState + initial) answering "paint" → the reply
  climbs as `list.row.paint` → `"row.paint"` on UserList delegates to paint.
  Guard check: the embed's diff guard in common() is
  `user || selected || starred` — a star click re-diffs every row's props but
  only the touched row yields patches (2 attr on `/4#1/3813`).
- `removed`/`resetDone` filter/clear `starred`. styles.css: `star` icon mask
  - `.row-star.starred { color: var(--warning) }`. Tests: star toggle block
    after the sidebar checks + reset clears starred.
- Docs: childPaint excerpt moved 70–77 → 84–93 (paint shifted by the new
  fields/import), site rebuilt. paint's two `console.log`s kept — the user's
  live window into the patches.
- Validation: vitest 2/2, tsc clean, build, SSR smoke :3214 (star buttons in
  HTML), prettier clean.
