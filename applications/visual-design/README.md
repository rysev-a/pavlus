# Visual Design

An application for **programming visually**: you draw the data flow of a backend
(Flow Studio), build the interface that gets its data from that diagram (the Visual
Builder), and keep both as a project in Postgres.

It is a real application, not a template:

| | |
| --- | --- |
| frontend | pavlus (`app/`, `frontend/`): the shell, the projects page, and the two editors of the `ui-kit` mounted as routes |
| backend | @pavlus/backend (`server/`): a pure `(message, state) => effects` app, the `http` and `pg` plugins |
| database | Postgres 16 in Docker (`compose.yaml`, port 54340) |

```
/                          the projects: create from a template, open, delete
/projects/:id/flow         Flow Studio on the diagram of the project
/projects/:id/interface    the Visual Builder on its interface
```

## Run

```bash
npm run dev        # Postgres (docker compose), the API on :3030 and the web app on :5190
```

Open <http://localhost:5190>. Or each part on its own: `npm run db:up`,
`npm run dev:api`, `npm run dev:web`. `.env.example` has the two variables
(`DATABASE_URL`, `PORT`); the scripts read `.env` when it is there.

`npm run db:reset` throws the database away and starts over.

## What a project is

A name and two documents, the JSON the editors export:

- `flow`: the diagram (swimlanes of messages and effects, modules, pipes, code);
- `interface`: the Visual Builder project;
- `theme`: the colour theme of the app being designed (see below).

The interface is **wired to the diagram**: each time it is opened, its `flow` is the
project's diagram as it is now, so a route you draw in the diagram answers the
requests of the interface at once (the simulated backend; switch it off to send them
to a real server). Edit the diagram, open the Interface: the change is there.

New projects start from a template: *Blank*, or the *Coffee shop CRM* (the diagram of
its backend and the front desk wired to it). Flow Studio can generate the @pavlus/backend
app of a diagram (Export, or `node ../ui-kit/scripts/flow-generate.ts`): that is how
`../coffee-shop-app` was made.

## How the editors save to the server

The editors are the `ui-kit` ones, unchanged. They save with the `local` plugin
(`local.save(key, text)`, in a template that is localStorage). `frontend/workspace.ts`
answers the same effects with the API: the key says which document it is, the address
says which project. Edits wait a moment (they come in bursts), go out one after
another, and are tried again after a failure; a load waits for the saves before it; a
document that could not be read is never written over. The bar shows the state:
*Saving...*, *Saved*, *Not saved: trying again*.

## The diagram board

Flow Studio's board is the page: as wide as the browser, with the inspector, debugger, scenario
and plugins in a drawer that stays shut until you press **Panels**.

- **Zoom:** Shift + mouse wheel, toward the pointer (a plain wheel scrolls the page; the +/- buttons,
  Fit and 100% are still there).
- **Full screen:** the icon in the top right corner of the board. Esc leaves it.
- **Height:** drag the bar under the board (or focus it and use the up and down arrows).
- **Frames:** the plot has no end and nothing on it is fixed. A *frame* is a rectangle, like a frame in
  Figma: **Add frame** puts one in the middle of the board; drag its header to move it, a border or a
  corner to resize it, the cross in its header (or **Remove** in the **Frames** list) to take it away. A
  component is free on the plot, anywhere. Drop it on a frame and it is attached to it (the frame lights
  up), and it goes where the frame goes; drag it off and it is free again. A frame can say what its
  components run as (Browser, App, Plugins, Externals), which is how lanes come back: a frame the width
  of the board that runs as App is the App lane. A design that was made with lanes opens exactly as it
  was, with the four lanes as four frames you can now move, resize or remove.
- **Minimap:** it shows the whole design and the rectangle of what the board shows, which gets smaller as
  you zoom in. Drag the rectangle to move the board, or click the minimap to jump there. The height of the
  board is remembered in the browser. Drag a node into another lane to move it there.

## Color themes

Two themes, both from the ui-kit's panel (about 40 VS Code themes such as Dracula, One Dark,
Nord, Monokai, Solarized and Tokyo Night, plus other design systems, fonts, styles, corners and
sizes; Export gives the stylesheet):

- **the editor's theme** (the palette button, and the sun / moon for light and dark): the bar, the
  panels and the diagram. It is remembered in the browser.
- **the app's theme** (*App theme*, in a project): the interface you are designing, on the design
  canvas and in the preview, including its dashboard, tiles and chart colors. It is saved with the
  project in Postgres (the `theme` document) and is independent of the editor's, so a coffee shop
  front desk can be Dracula inside a light editor. *Reset* gives the app the editor's theme back.

`frontend/app-theme.ts` sets the theme's CSS variables on the frame of the designed interface only
(a `<style>` rule for `.vb-frame`). The few `.dark ...` selectors of the kit follow the editor's mode,
not the app's.

## API

`server/routes.ts` is the whole table:

```
GET    /projects                    list (newest edit first)
POST   /projects                    { name, docs?: { flow, interface } }
GET    /projects/:id
PATCH  /projects/:id                { name }
DELETE /projects/:id
GET    /projects/:id/docs/:key      { text }   (key: flow | interface | theme; null when not there yet)
PUT    /projects/:id/docs/:key      { text }
```

## Test

```bash
npm test             # unit tests; the API tests need `npm run db:up` (skipped without Postgres)
npm run typecheck
```

`tests/api.test.ts` runs the real server on real sockets against the real Postgres.

## Notes

- This folder is not a workspace of the root `package.json`; it resolves `pavlus`,
  `@pavlus/backend`, `pg` and `vite` from the root `node_modules` (like `coffee-shop-app`).
- `npm run build` builds the web app; serving it from the API is not done yet (in
  production put the two behind one proxy: `/api` goes to the API, the rest is `dist/`).
- No sign-in: the projects are shared by everyone who can reach the API.
