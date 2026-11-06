---
summary: A component can list its pages by path and show the one that matches with a single line, +outlet. Learn the routing table, the route in the state, enter and leave, nested routes and how to serve the app under a base path.
---
## One path, one page

A single-page application shows different pages at different addresses, without loading a new HTML document each time. In pavlus this is **routing**, and it is declared as data. A component gets a `routing` table: it maps a path pattern to the child that should be shown. Its template says *where* the child goes with one line, `+outlet`.

Here is the smallest router. Three paths, three pages:

```ts
class AppShell extends Component<AppState> {
  view = view;
  routing: Routing<AppState> = {
    "/": { view: homeView },
    "/about": { view: aboutView },
    "*": { view: notFoundView },
  };
}
```

And the template of the shell:

```pavlus
main.page
  +outlet
```

`+outlet` is a built-in. It takes nothing after it. When the route is `/about`, the `main` element contains the `about` page; when it is `/`, the home page. The patterns on the left are matched against the current path, and `"*"` means "anything that is left".

A name that starts with a lowercase letter is a built-in (`outlet`); a name that starts with a capital letter is an imported component (`+Sidebar`). That is why the two never clash.

> [!NOTE] Where does the current path come from?
> From the **router plugin**. It reads the address of the browser and reports it to your application as a message. The section "Wiring the router" below shows how it is connected. Until the plugin has reported, the state field `route` is `null` and the outlet is empty.

## What the compiler does with +outlet

The outlet is not magic at run time. The compiler turns the line into a *dynamic embed*: two markers in the DOM, and between them the view of whatever page matches. This is the generated `render` of the shell above, the part for `+outlet`:

```ts
  // line 2: +outlet
  mainChildren.push({ t: "marker", id: "1s" + idSuffix });
  const outlet = resolveOutlet(env, state);
  if (outlet) {
    mainChildren.push(...outlet.view.render(
      outlet.state,
      idSuffix + "/1",
      messagePrefix + outlet.name + ".",
      outlet.component,
    ));
  }
  mainChildren.push({ t: "marker", id: "1e" + idSuffix });
```

`resolveOutlet(env, state)` looks at `env`, the component that owns the template, takes its `routing` table and matches `state.route`. It returns the view to render, the **instance name** of the page, and the **state** the page will see. The name becomes a message prefix: every event inside the page is sent as `<name>.<message>`. This is the same rule as for any embedded child, see [messages and child components](page:concepts-messages).

On a state change, `diff` does one of two things. If the matched page is another page (a different view or name), it clears everything between the two markers and renders the new page. If it is the same page, it only runs that page's own `diff`. So moving from `/about` to `/` rebuilds the content, and changing a counter inside a page patches one text node.

> [!WARNING] Mount the component, not only its view
> `+outlet` needs `env`, the component with the `routing` table. `createApp({ mount })` passes it for you. If you mount a bare view of a template that has an outlet, you get: pavlus: +outlet needs a component with a `routing` table; mount the component, not only its view. For tests, use `mountView(component, state)` from `@pavlus/frontend/testing` with the component itself.

## Patterns and matching

A pattern is a path made of segments separated by `/`. A segment is either plain text, or `:name`, which captures whatever is in that place of the path.

The rules are short:

- A pattern matches the path exactly, or as a **prefix that ends at a `/`**. `"/admin"` matches `/admin` and `/admin/tasks`, but not `/administrator`.
- `"/"` matches only the exact path `/`. It is the home page and never a prefix of anything.
- `":name"` captures one segment and decodes it (`a%20b` becomes `a b`).
- `"*"` matches anything that nothing else matched.
- If several patterns match, the **longest** one wins (the most segments); if two are equally long, the one declared first.
- If nothing matches and there is no `"*"`, the outlet stays empty.

This table is the real output of `matchRoute` for the table `"/"`, `"/users"`, `"/users/:id"`, `"/admin"` and `"*"`. The last three columns are what the matched page receives as its `route`:

| Path | Matched pattern | route.path | route.base | route.params |
| --- | --- | --- | --- | --- |
| `/` | `/` | `/` | (empty) | none |
| `/users` | `/users` | `/` | `/users` | none |
| `/users/42` | `/users/:id` | `/` | `/users/42` | id is 42 |
| `/users/42/edit` | `/users/:id` | `/edit` | `/users/42` | id is 42 |
| `/admin/x` | `/admin` | `/x` | `/admin` | none |
| `/administrator` | `*` | `/administrator` | (empty) | none |

Look at the `route.path` and `route.base` columns. A page does not see the whole path. It sees what is **left below** the pattern that matched (`path`) and what was used up to reach it (`base`). That is what makes nesting possible, and we come back to it in a moment.

`matchRoute(routing, route)` and `routeName(pattern, spec)` are exported from the package, so you can use the same logic in a test or on a server.

## A routing entry

The value in the table is a *route spec*. It has the shape of a child entry (see the [components page](page:concepts-messages)), plus `view` and `name`. All the fields:

| Field | Meaning |
| --- | --- |
| `component` | The page is a component: a class instance with its own handlers and its own `view`. |
| `view` | The page is only a template, with no logic of its own. Use `view` or `component`, not both. |
| `select` | Like `component`, but chosen from the state: `select: (state) => ...`. For pages that are values in the state. |
| `key` | The name of the state field the page owns. The page sees `state[key]`, and its `store` paths get the key in front. |
| `props` | Extra read-only fields for the page, computed from the parent state: `props: (s) => ({ count: s.people.length })`. |
| `name` | The instance name, which is the message prefix. By default the last static segment of the pattern. |

The default name is worked out like this: `"/admin/tasks"` is `tasks`, `"/users/:id"` is `users` (the `:id` segment is skipped), `"/"` is `index`, and `"*"` is `fallback`. Two entries must not end up with the same name, because a message could not tell them apart. The framework refuses it and tells you the fix:

```text
pavlus: two children named "x" (routing "/x/:id"); give one a `name`
```

### View or component?

A **view** is the right choice for a page that only shows data: an about page, a not-found page, a detail page that reads `route.params`. It costs nothing, it has no handlers, and the data it needs comes from `props`.

A **component** is the right choice when the page reacts: it handles messages, it loads data when it is entered, it owns a piece of the state. It is an ordinary component; being routed adds only the `route` field in its state and the `enter` and `leave` messages.

A view-only page can still have events in its template. An event `@click=pick(1)` in the `about` page is sent as the message `about.pick`, and the component with the `routing` table can handle it with a method named `"about.pick"`. The one event you rarely need to handle yourself is `navigate`, described below.

## The route in the state

A routed page has a field `route` in its state. You can read it in handlers and in the template:

```ts
{ path: "/edit", base: "/users/42", params: { id: "42" }, search: "", hash: "" }
```

`search` and `hash` are raw strings, `"?page=2"` and `"#top"`. The framework does not parse the query string. `params` holds the `:name` captures of this level **and of every level above**, so a deeply nested page can still read the `id` of its grandparent.

::demo route-state

The demo is a page that shows a user. When the address goes from `/admin/users/2` to `/admin/users/7`, the template is patched in place: the router did not rebuild anything, the page just got a new `route`. A page that needs to load the data of the new user also gets a new `enter` message, as you will see shortly.

## Wiring the router

The outside world is a plugin, as always. The **router plugin** reads the browser address and changes it. It has four effects: `listen`, `navigate`, `back` and `forward` (all of them are described in [the plugin reference](page:plugins-reference)). Two of them matter here.

- `router.listen("routeChanged")` starts the reporting. The plugin sends the message `routeChanged` at once with the current location, and again after every `navigate` and every back or forward button press. The payload is `{ path, search, hash }`.
- `router.navigate("/about")` pushes a new history entry. The plugin then tells the listener about the new location, so the same `routeChanged` arrives.

You do not have to write the wiring. A component that has a `routing` table has two default handlers:

```ts
mounted: () => [router.listen("routeChanged")],
routeChanged: (msg, _state, { setRoute }) => setRoute(msg.payload),
```

`mounted` is the message that `createApp({ mount })` sends once the application is in the DOM. `setRoute` is a function in the component context. It is pure. It returns a `store.set("route", ...)` effect and the `leave` and `enter` effects of the pages that changed. If you write a method called `mounted` or `routeChanged` yourself, it replaces the default. The ui-kit does that to also set the theme and the section of the menu when the route changes. A simplified version of its shell:

```ts
routeChanged(msg: Message, _state: AppState, { setRoute }: ComponentCtx): Effect[] {
  const path = (msg.payload as { path: string }).path;
  return [
    ...setRoute(msg.payload),
    store.set("section", sectionOf(path)),
  ];
}

mounted(_msg: Message, state: AppState): Effect[] {
  return [router.listen("routeChanged"), themeEffector.apply(state.look, false)];
}
```

The handler must call `setRoute` and return its effects. If it forgets, the `route` is never stored and the outlet stays empty.

The plugins you need for a routed application are the store (it holds `route`), the dom plugin and the router plugin:

```ts main.ts
import { createApp } from "@pavlus/frontend";
import {
  DomPlugin,
  createRouterPlugin,
  createStorePlugin,
} from "@pavlus/frontend/plugins";
import { type AppState, initialState, shell } from "./app.ts";

createApp<AppState>({
  app: shell,
  plugins: [
    createStorePlugin(initialState),
    new DomPlugin(),
    createRouterPlugin(),
  ],
  mount: "#app",
});
```

> [!TIP] The initial state has route: null
> Put `route: null` in the initial state. Until the router plugin has reported, templates read `route.path` of `null`, and a path in an expression is null safe, so nothing breaks. The second step of the next demo shows exactly that case.

## Links that are real links

Navigation needs links. A link should be a real `<a href>`, so that the middle click, "open in a new tab" and the status bar all work. But a plain click should not load a new document. The pavlus way is to write both:

```pavlus
a(href="/about" @click.prevent=navigate("/about")) About
```

`href` is for the browser. `@click.prevent` stops the default action, and the event becomes the message `navigate` with the payload `"/about"`. You do not write a handler for it. A message `navigate` (or `something.navigate`, from an embedded template or a view-only page) that nobody handles, with a string payload, is turned into `router.navigate(url)` by default. The url is relative to the component that receives the message, which for the shell is the whole site.

::demo links

The second step of the demo shows the active link. The class `active` is a condition on `route.path`. When the route goes from `null` to `/`, only the first link is patched.

> [!NOTE] Plain hrefs are not rewritten
> The framework rewrites the url of the effect `router.navigate`. It does not touch the `href` attribute, because it is only text in your template. When a page sits below a base, write the base yourself: `href={route.base + "/users"}`. The sections on nested routes and on base paths have the full picture.

## enter and leave

A page often has to do something when it appears: load data, start a timer. And when it disappears: stop the timer. The router tells the page with two messages.

- `enter` is sent when a page becomes active. The payload is its `route`.
- `leave` is sent when it stops being active.

The messages are computed by `setRoute` from the previous and the new route, level by level. From the first level whose active page differs, the old pages leave (deepest first) and the new ones enter (from the top down). A leaf page also gets `enter` again when only its own route changed, for example `/items/5` to `/items/7`, because `params` differ. A change of `search` or `hash` alone does not enter again.

This is why no list of "pages and their data" is needed anywhere. The page that needs data asks for it itself:

```ts
class Post extends Component<PostState> {
  view = view;

  enter(msg: Message): Effect[] {
    const { params } = msg.payload as Route;
    return [
      store.set("status", "loading"),
      http.request({
        id: "post",
        url: `/api/posts/${params.id}`,
        onSuccess: "loaded",
        onError: "failed",
      }),
    ];
  }
}
```

The `id: "post"` of the request matters. If the user goes from post 1 to post 2 while post 1 is still loading, the second request replaces the first, and the answer to the first is ignored. See the [http section](page:plugins-reference) of the plugin reference.

## Nested routes

Routing nests. A routed page that has its own `routing` table gets only the part of the path **below its base**, and it navigates relative to it, without knowing who embeds it. The admin area of a site is the typical case: the shell has `/admin`, the admin page has tabs `/users` and `/users/:id`, and the full addresses are `/admin/users` and `/admin/users/2`.

The tab bar of the admin page does not know that it lives under `/admin`. It reads `route.base`, which the framework sets to `/admin`:

::demo tabs

The `href` is `route.base + "/users"`, so the link is `/admin/users`; the message is `navigate("/users")`, and the framework adds the base to the effect. The rule for a relative navigate is: *the innermost routed page adds its whole base once, and marks the effect `absolute`, so the levels above do not add theirs again.* To go somewhere outside, use `router.navigate(url, { absolute: true })`.

## A complete example

Here is a small site with a home page, an admin area with two tabs, a list of users, a user page and a not-found page. It uses every idea of this page. The files are listed in the order you would write them.

The shell template has the top navigation and the first outlet:

```pavlus app.pavlus
div.app
  nav.app__nav
    a(href="/" class:active={route.path === "/"} @click.prevent=navigate("/")) Home
    a(href="/admin" class:active={route.base === "/admin"} @click.prevent=navigate("/admin")) Admin
  main.app__main
    +outlet
```

The shell component has three entries: a view-only home page, the admin component under the key `admin`, and the `"*"` fallback.

```ts app.ts
import {
  Component,
  type Route,
  type Routing,
} from "@pavlus/frontend";
import { admin, type AdminState, initialAdmin } from "./admin.ts";
import view from "./app.pavlus";
import homeView from "./home.pavlus";
import notFoundView from "./not-found.pavlus";

export interface AppState {
  route: Route | null;
  admin: AdminState;
}

export const initialState: AppState = { route: null, admin: initialAdmin };

export class Shell extends Component<AppState> {
  view = view;

  routing: Routing<AppState> = {
    "/": { view: homeView },
    "/admin": { component: admin, key: "admin" },
    "*": { view: notFoundView },
  };
}

export const shell = new Shell();
```

The two simple pages:

```pavlus home.pavlus
section
  h1 Home
  p Welcome to the site.
```

```pavlus not-found.pavlus
section
  h1 Page not found
  a(href="/" @click.prevent=navigate("/")) Back to the home page
```

The admin component has its own table. Look at the three kinds of entry: a view with `props`, a component with a `key` and `props`, and a view with an explicit `name`, because `/users` and `/users/:id` would both be called `users`.

```ts admin.ts
import { Component, type Routing } from "@pavlus/frontend";
import view from "./admin.pavlus";
import overviewView from "./overview.pavlus";
import userView from "./user.pavlus";
import { usersPage, type UsersState } from "./users.ts";

export interface Person {
  id: number;
  name: string;
}

export interface AdminState {
  people: Person[];
  usersPage: UsersState;
}

export const initialAdmin: AdminState = {
  people: [
    { id: 1, name: "Ann" },
    { id: 2, name: "Bob" },
  ],
  usersPage: { visits: 0 },
};

export class Admin extends Component<AdminState> {
  view = view;

  routing: Routing<AdminState> = {
    "/": { view: overviewView, props: (s) => ({ count: s.people.length }) },
    "/users": {
      component: usersPage,
      key: "usersPage",
      props: (s) => ({ people: s.people }),
    },
    "/users/:id": { view: userView, name: "user" },
  };
}

export const admin = new Admin();
```

```pavlus admin.pavlus
div.admin
  nav.admin__tabs
    a(href={route.base} class:active={route.path === "/"} @click.prevent=navigate("/")) Overview
    a(href={route.base + "/users"} class:active={route.path !== "/"} @click.prevent=navigate("/users")) Users
  +outlet
```

The pages below the tabs. The overview and the user page are views. The users page is a component: it counts how many times it was entered.

```pavlus overview.pavlus
p There are {count} people.
```

```pavlus user.pavlus
h2 User {route.params.id}
```

```pavlus users.pavlus
section
  h2 Users (this page was opened {visits} times)
  ul
    for person in people key person.id
      li
        a(href={route.base + "/" + person.id} @click.prevent=navigate("/" + person.id)) {person.name}
```

```ts users.ts
import {
  Component,
  type Effect,
  type Message,
} from "@pavlus/frontend";
import { storeEffector as store } from "@pavlus/frontend/plugins";
import view from "./users.pavlus";

export interface UsersState {
  visits: number;
}

export class UsersPage extends Component<UsersState> {
  view = view;

  enter(_msg: Message, state: UsersState): Effect[] {
    return [store.set("visits", state.visits + 1)];
  }
}

export const usersPage = new UsersPage();
```

Three details are worth a second look.

First, the state of the users page lives at `admin.usersPage`. The page writes `store.set("visits", ...)`, and the effect leaves the page as `usersPage.visits` and the shell as `admin.usersPage.visits`: every level puts its `key` in front. The page knows nothing about where it is mounted.

Second, `navigate("/" + person.id)` in the users page goes to `/admin/users/1`, because the users page is routed at `/admin/users` and a relative url is added to its base.

Third, the `href`s use `route.base`: in the users page it is `/admin/users`, so the link is `/admin/users/1`, and the browser opens the right address from a middle click.

A test drives the whole site with the real plugins in jsdom. It clicks the links and looks at the address and at the page:

```ts routing.test.ts
import { createApp } from "@pavlus/frontend";
import {
  DomPlugin,
  createRouterPlugin,
  createStorePlugin,
} from "@pavlus/frontend/plugins";
import { expect, test } from "vitest";
import { type AppState, initialState, shell } from "./app.ts";

function start(path: string) {
  document.body.innerHTML = '<div id="app"></div>';
  history.replaceState(null, "", path);
  const store = createStorePlugin<AppState>(initialState);
  const app = createApp<AppState>({
    app: shell,
    plugins: [store, new DomPlugin(), createRouterPlugin()],
    mount: "#app",
  });
  return { app, store };
}
const click = (text: string) =>
  [...document.querySelectorAll("a")]
    .find((a) => a.textContent === text)!
    .click();
const main = () => document.querySelector("main")!.textContent;
const hrefs = () =>
  [...document.querySelectorAll("a")].map((a) => a.getAttribute("href"));

test("click through the site", () => {
  const { app, store } = start("/");
  expect(main()).toContain("Welcome");
  click("Admin");
  expect(location.pathname).toBe("/admin");
  expect(main()).toContain("There are 2 people.");
  expect(hrefs()).toEqual(["/", "/admin", "/admin", "/admin/users"]);
  click("Users");
  expect(location.pathname).toBe("/admin/users");
  expect(main()).toContain("opened 1 times");
  expect(hrefs()).toContain("/admin/users/2");
  expect(store.getState().admin.usersPage.visits).toBe(1);
  click("Bob");
  expect(location.pathname).toBe("/admin/users/2");
  expect(main()).toContain("User 2");
  click("Overview");
  expect(location.pathname).toBe("/admin");
  click("Users");
  expect(main()).toContain("opened 2 times");
  app.dispose();
});

test("a direct visit and an unknown path", () => {
  const a = start("/admin/users/1");
  expect(main()).toContain("User 1");
  a.app.dispose();
  const b = start("/nowhere");
  expect(main()).toContain("Page not found");
  click("Back to the home page");
  expect(location.pathname).toBe("/");
  b.app.dispose();
});
```

Messages sent on each navigation are plain data, so you can also test a route change without a DOM. Calling the shell as a function with a `routeChanged` message gives the effects. Going from `/admin` to `/admin/users` returns the `route` update and one effect from the users page, because it was entered:

```json
[{ "plugin": "store", "type": "set", "path": "admin.usersPage.visits", "value": 1 }]
```

## Serving under a base path

A site on GitHub Pages is not at the root of the domain. The ui-kit, whose source this documentation is, lives at `/pavlus/`. There the page for the button is `/pavlus/button`, but the application wants to call it `/button`. If the router sees the real path, `/pavlus/button` matches only `"*"`, and the user sees the not-found page.

The router plugin has no base path option. It has a `window` option, and that is the seam. The ui-kit gives it a small object that looks like the browser window, but with the base path taken off when the location is read and put back when the history is written:

```ts base-window.ts
/** `"/pavlus/"` → `"/pavlus"`, `"/"` → `""`. */
export const rootOf = (base: string): string => base.replace(/\/+$/, "");

/** `/pavlus/button` → `/button`; a path outside the base is left alone. */
export function stripBase(root: string, pathname: string): string {
  if (!root) return pathname;
  if (pathname === root) return "/";
  return pathname.startsWith(root + "/")
    ? pathname.slice(root.length)
    : pathname;
}

/** `/button?x=1` → `/pavlus/button?x=1`; `/` → `/pavlus/`. */
export function withBase(root: string, url: string): string {
  return url.startsWith("/") ? root + url : url;
}

export function windowAt(root: string, win: Window = window): Window {
  const location = {
    get pathname() {
      return stripBase(root, win.location.pathname);
    },
    get search() {
      return win.location.search;
    },
    get hash() {
      return win.location.hash;
    },
  };
  const history = {
    pushState: (state: unknown, title: string, url?: string | URL | null) =>
      win.history.pushState(
        state,
        title,
        typeof url === "string" ? withBase(root, url) : url,
      ),
    replaceState: (state: unknown, title: string, url?: string | URL | null) =>
      win.history.replaceState(
        state,
        title,
        typeof url === "string" ? withBase(root, url) : url,
      ),
    back: () => win.history.back(),
    forward: () => win.history.forward(),
  };
  return {
    location,
    history,
    addEventListener: win.addEventListener.bind(win),
    removeEventListener: win.removeEventListener.bind(win),
    dispatchEvent: win.dispatchEvent.bind(win),
  } as unknown as Window;
}
```

The application never sees the base. Only `main.ts` knows it:

```ts main.ts
const root = rootOf(import.meta.env.BASE_URL);

createApp<AppState>({
  app: shell,
  plugins: [
    createStorePlugin(initialState({ root })),
    new DomPlugin(),
    createRouterPlugin({ window: windowAt(root) }),
  ],
  mount: "#app",
});
```

Three pieces make it work:

1. Vite's `base` option. The ui-kit builds with `UI_KIT_BASE=/pavlus/`, locally the base is `/`. `import.meta.env.BASE_URL` is that value, and `rootOf` turns `/pavlus/` into `/pavlus`.
2. `windowAt(root)` for the router, as above. The routing table stays `"/button"`, `"/tabs"`.
3. Real hrefs. They are text, so they need the base. The ui-kit keeps `root` in its state, and the templates write `href={root + "/templates"}`.

::demo base-href

The demo shows the `href` follow the `root` in the state. The click handler does not change: `navigate("/about")` is relative to the application and the wrapped window adds the base.

### The 404 on a direct visit

There is one more problem, and it is not in the application. GitHub Pages is a static file server. A request for `/pavlus/button` finds no file `button` and answers with a 404, before any JavaScript runs. Clicking a link works, because the browser never asks the server. Reloading the page, or opening a link someone sent you, fails.

GitHub Pages serves the file `404.html` for every unknown path. So the trick is to publish the application shell under that name too. The ui-kit does it in a small Vite plugin:

```js vite.config.mjs
/**
 * GitHub Pages has no history fallback: a direct load of /pavlus/button would
 * be a 404. It does serve 404.html for any unknown path, so the build emits
 * the app shell under that name too and the router takes it from there.
 */
const spaFallback = () => ({
  name: "ui-kit:spa-fallback",
  // "post": Vite's own HTML plugin adds index.html to the bundle first.
  generateBundle: {
    order: "post",
    handler(_options, bundle) {
      const index = bundle["index.html"];
      if (index && index.type === "asset") {
        this.emitFile({
          type: "asset",
          fileName: "404.html",
          source: index.source,
        });
      }
    },
  },
});
```

The browser gets the shell with the status 404, loads the scripts, the router reads the real address and shows the right page. On a server you control, answer every unknown path with `index.html` and the status 200 instead.

## What is not done

Be aware of the limits, so that you do not look for them:

- No guards and no redirects as route entries. A redirect is a handler: on `enter`, return `router.navigate("/login", { replace: true })`.
- No query string parsing. `route.search` is the raw string.
- `route.params` is typed as `Record<string, string>`: every param is a string.
- No lazy loading of pages. All pages are imported at the top of the file.

## What you learned

- A `routing` table maps patterns to pages, and `+outlet` shows the one that matches. The longest pattern wins, and `"*"` catches the rest.
- A page is a `view` (a template) or a `component` (logic). It sees `route`, gets `enter` and `leave`, and `key` and `props` shape its state.
- Links are real `href`s with `@click.prevent=navigate(...)`. Routing nests, and a navigate from a nested page is relative to its base.
- Under a base path, give the router plugin a `window` that hides the base, and build the hrefs with it.

Next: [server-side rendering](page:concepts-ssr).
