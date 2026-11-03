---
summary: The same pure templates that run in the browser can run on a server and give HTML. Learn what the ssr module offers, how to load data before rendering, how the browser takes the markup over, and what is not supported.
---
## Why render on the server

A normal pavlus page starts empty. The browser downloads a small HTML file, then the JavaScript, then the code builds the page. Until that finishes, the visitor sees nothing, and a program that reads only HTML (a search engine, a link preview) sees nothing either.

**Server-side rendering** (SSR) changes the first step. The server runs your application, produces the HTML of the page, and sends it together with the JavaScript. The visitor sees the page at once. Then the JavaScript starts in the browser and **hydrates** the markup: it attaches the event listeners to the elements that are already there. Nothing is rebuilt.

This works in pavlus without a second code base, because the application is made of pure functions. A template is compiled into `render(state)`, which returns plain data, and `render` does not care where it runs. A handler returns effects, plain data too. Only the plugins touch the outside world, and on the server you simply give the application different plugins.

```text
server                                   browser
createApp({ app, plugins })  --state-->  createApp({ app, plugins, mount: "#app" })
  dispatch routeChanged                    reviveState(json) -> the store
  http.settled()                           the DOM plugin hydrates #app
  renderToString(view, state) --html-->    (listeners and ids on the markup)
```

## The smallest example

The one function you cannot do without is `renderToString`. It takes a view and a state and returns a string.

::demo hello

The demo shows the HTML that `render` produced for this state. On the server, you would call:

```ts
import { compileToView } from "@service-laboratory/pavlus/compiler";
import { renderToString } from "@service-laboratory/pavlus/ssr";

const view = compileToView("p Hello, {name}");
renderToString(view, { name: "Ann" });
```

and get this string, which is the HTML of the demo between two comments:

```text
<!--pavlus--><p>Hello, Ann</p><!--/pavlus-->
```

(Your application imports the view with `import view from "./hello.pavlus"`. `compileToView` is the way to get the same view in a script or a test, without Vite.)

The two comments `<!--pavlus-->` and `<!--/pavlus-->` are the **markers** of a server render. The DOM plugin looks for them when it mounts. If they are there, it hydrates the markup between them; if not, it builds the page as usual.

## What the ssr module offers

The module `@service-laboratory/pavlus/ssr` has three functions. Two related functions come from the main package.

| Function | What it does |
| --- | --- |
| `renderToString(view, state)` | The HTML of the view for this state, between the two marker comments. |
| `serializeState(state, components)` | The state as JSON. Component values in the state are replaced by their names. |
| `reviveState(json, components)` | The state back from JSON, with the component instances put back. |
| `viewOf(component)` | From the main package. The view of a component, closed over the component, so `+outlet` and children work. |
| `toHtml(vnodes)` | From the main package. Plain HTML of vnodes, without any markers. |

`renderToString` is `toHtml` with a flag: it also writes the *block markers* of the template. Look at what the compiler puts into a list:

::demo list open=vnodes

In the vnodes you see `marker` nodes around the `for` block. They are invisible comments in the DOM, and they let the runtime find where a block starts and ends. A server render must contain them, or the browser could not patch the list later. With the flag the same state gives:

```text
<!--pavlus--><ul><!--1s--><!--1[#1--><li class="done">a</li><!--1]#1--><!--1[#2--><li>b</li><!--1]#2--><!--1e--></ul><!--/pavlus-->
```

If you want plain HTML only, for an e-mail or a static page that is never hydrated, use `toHtml(view.render(state))`. It has no markers and it is smaller.

### Escaping

Text and attribute values are escaped for you. The same template with a hostile name:

::demo escape

The HTML in the demo shows the text as text, not as a tag. In the string the characters `<`, `>` and `&` in text, and the quotes in attributes, are written as entities (`&lt;script&gt;`). Your state cannot add a tag to the page.

## Loading data before the render

A page rarely shows only static state. The usual case is that a page loads data when it is entered, with an `http` request. The server has to wait for that data before it renders. Look at the plan:

1. Create the application **without `mount`**. There is no DOM.
2. Give it a store, an `http` plugin, and plugins that accept the effects of the browser-only plugins and do nothing.
3. Dispatch the message the router would send, with the requested location.
4. Wait until no request is in flight.
5. Read the state and render.

Why dispatch by hand? In the browser, the router plugin reads `window.location` and sends `routeChanged`. On the server there is no window, but the location is known: it is the URL of the request. A component with a `routing` table handles `routeChanged` by default (`setRoute`), so the pages that `enter` start loading their data, exactly as they do in the browser.

The `http` plugin takes a `fetch` option. On the server you pass a `fetch` that answers in the same process, without a socket. And `http.settled()` is a promise that resolves when nothing is in flight any more, **including the requests that the answers started**. If a page loads a list and then loads the details of each item, `settled` waits for all of them.

Effects for plugins that make no sense on the server need a stand-in. If the application returns `router.navigate(...)` and no `router` plugin is registered, the core throws `no plugin "router" for effect "navigate"`. The stand-in is a plugin of one line:

```ts
const inert = (name: string): Plugin => ({ name, handle() {} });
```

## A complete example

We build a small site with two posts. The home page is a view, a post page is a component that loads the post when it is entered. The files are the same as for a browser application, plus `server.ts`.

The shell template and the pages:

```pavlus app.pavlus
div.app
  nav
    a(href="/" @click.prevent=navigate("/")) Home
    a(href="/posts/1" @click.prevent=navigate("/posts/1")) First post
    a(href="/posts/2" @click.prevent=navigate("/posts/2")) Second post
  main
    +outlet
```

```pavlus home.pavlus
section
  h1 Home
  p Pick a post.
```

```pavlus not-found.pavlus
section
  h1 Page not found
  a(href="/" @click.prevent=navigate("/")) Back to the home page
```

```pavlus post.pavlus
article.post
  if status === "loading"
    p Loading...
  else if status === "failed"
    p.error Could not load the post.
  else
    h1 {post.title}
    p {post.body}
    button(type="button" @click=like) Like ({likes})
```

The post page asks for its data in `enter`, with the `id` from the route. Replies come back as the messages `loaded` and `failed`:

```ts post.ts
import {
  Component,
  type Effect,
  type Message,
  type Route,
} from "@service-laboratory/pavlus";
import {
  httpEffector as http,
  storeEffector as store,
} from "@service-laboratory/pavlus/plugins";
import view from "./post.pavlus";

export interface PostState {
  status: "idle" | "loading" | "ready" | "failed";
  post: { id: number; title: string; body: string } | null;
  likes: number;
}

export const initialPost: PostState = { status: "idle", post: null, likes: 0 };

export class Post extends Component<PostState> {
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

  loaded(msg: Message): Effect[] {
    const { data } = msg.payload as { data: PostState["post"] };
    return [store.set("post", data), store.set("status", "ready")];
  }

  failed(): Effect[] {
    return [store.set("status", "failed")];
  }

  like(_msg: Message, state: PostState): Effect[] {
    return [store.set("likes", state.likes + 1)];
  }
}

export const post = new Post();
```

```ts app.ts
import {
  Component,
  type Route,
  type Routing,
} from "@service-laboratory/pavlus";
import view from "./app.pavlus";
import homeView from "./home.pavlus";
import notFoundView from "./not-found.pavlus";
import { initialPost, post, type PostState } from "./post.ts";

export interface AppState {
  route: Route | null;
  post: PostState;
}

export const initialState: AppState = { route: null, post: initialPost };

export class Shell extends Component<AppState> {
  view = view;
  routing: Routing<AppState> = {
    "/": { view: homeView },
    "/posts/:id": { component: post, key: "post" },
    "*": { view: notFoundView },
  };
}

export const shell = new Shell();

/** Component instances that are values in the state: none in this app. */
export const components = {};
```

`components` is the list of component instances that are *values* in the state (a template can embed `+{expr}` and the state then holds a component). This app has none. We come back to it below.

Now the server. A new store, a new `http` plugin and a new application are created **for every request**. The components (`shell`, `post`) are shared, because they hold no state; the state is not shared:

```ts server.ts
import {
  createApp,
  matchRoute,
  type Plugin,
  viewOf,
} from "@service-laboratory/pavlus";
import {
  createHttpPlugin,
  createStorePlugin,
} from "@service-laboratory/pavlus/plugins";
import { renderToString, serializeState } from "@service-laboratory/pavlus/ssr";
import { components, initialState, shell } from "./app.ts";

const POSTS = [
  { id: 1, title: "Hello", body: "The first post." },
  { id: 2, title: "Second", body: "Another one." },
];

/** A fetch that answers the API without a socket. */
const inProcess: typeof fetch = async (input) => {
  const match = /^\/api\/posts\/(\d+)$/.exec(String(input));
  const post = POSTS.find((p) => p.id === Number(match?.[1]));
  return new Response(JSON.stringify(post ?? { error: "not found" }), {
    status: post ? 200 : 404,
    headers: { "content-type": "application/json" },
  });
};

/** A plugin that accepts its effects and does nothing. */
const inert = (name: string): Plugin => ({ name, handle() {} });

export async function renderPage(url: URL) {
  const store = createStorePlugin(initialState);
  const http = createHttpPlugin({ fetch: inProcess });
  const app = createApp({
    app: shell,
    plugins: [store, http, inert("dom"), inert("router")],
  });
  app.dispatch({
    id: "routeChanged",
    payload: { path: url.pathname, search: url.search, hash: "" },
  });
  await http.settled();
  app.dispose();
  const state = store.getState();
  const match = state.route && matchRoute(shell.routing, state.route);
  return {
    status: match && match.pattern !== "*" ? 200 : 404,
    html: renderToString(viewOf(shell)!, state),
    state: serializeState(state, components),
  };
}

/** The page: the template with the markup and the state put in. */
export function renderDocument(
  template: string,
  page: { html: string; state: string },
): string {
  const state = JSON.stringify(page.state).replace(/</g, "\\u003c");
  return template
    .replace(
      "</head>",
      () => `<script>window.__STATE__ = ${state};</script></head>`,
    )
    .replace('<div id="app"></div>', () => `<div id="app">${page.html}</div>`);
}
```

Read `renderPage` slowly. It returns three things: the `status`, the `html` and the `state` as JSON. The status comes from `matchRoute`, the same function the outlet uses: if the best match is the `"*"` entry or there is none, the server answers 404. The framework does not do this for you, because the HTTP response is the business of your server.

`renderDocument` puts the pieces into `index.html`. The markup goes into the mount element, **with the marker comments, which `renderToString` wrote**. The state goes into a script before the application's own script. Two details:

- The JSON is first made a JavaScript string (`JSON.stringify` of the string), and `<` is written as `<`. A text such as `</script>` in your state cannot close the script element.
- `replace` is called with a function, not with a string. In a replacement string `$&` and `$'` have a meaning, so a post that contains them would be corrupted.

Finally the browser. It revives the state, if there is one, and mounts as usual:

```ts main.ts
import { createApp } from "@service-laboratory/pavlus";
import {
  createDomPlugin,
  createHttpPlugin,
  createRouterPlugin,
  createStorePlugin,
} from "@service-laboratory/pavlus/plugins";
import { reviveState } from "@service-laboratory/pavlus/ssr";
import { type AppState, components, initialState, shell } from "./app.ts";

const json = (globalThis as { __STATE__?: string }).__STATE__;

createApp<AppState>({
  app: shell,
  plugins: [
    createStorePlugin(
      json ? reviveState<AppState>(json, components) : initialState,
    ),
    createDomPlugin(),
    createRouterPlugin(),
    createHttpPlugin(),
  ],
  mount: "#app",
});
```

```text index.html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Posts</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

When the target `#app` already holds a server render, `mount` **hydrates** it. When the page has no state (a plain build without a server), `json` is undefined and the store starts from `initialState`; the application works as a normal client application.

A test runs the server, puts the result into jsdom, starts the client code and checks the three promises of SSR: the content is there, the nodes are not rebuilt, and the post is not loaded a second time.

```ts ssr.test.ts
import { expect, test, vi } from "vitest";
import { renderDocument, renderPage } from "./server.ts";

const template = `<!doctype html><html><head><title>Posts</title></head><body><div id="app"></div></body></html>`;

test("the server loads the post and renders it", async () => {
  const page = await renderPage(new URL("http://example.com/posts/2"));
  expect(page.status).toBe(200);
  expect(page.html).toContain("<h1>Second</h1>");
  expect(JSON.parse(page.state).post.status).toBe("ready");
  expect(renderDocument(template, page)).toContain(
    '<div id="app"><!--pavlus-->',
  );
});

test("a missing page is a 404 with the not-found page", async () => {
  const page = await renderPage(new URL("http://example.com/nowhere"));
  expect(page.status).toBe(404);
  expect(page.html).toContain("Page not found");
});

test("a user text cannot close the script or the markup", async () => {
  const doc = renderDocument(template, {
    html: "<p>$&</p>",
    state: JSON.stringify({ text: "</script><b>" }),
  });
  expect(doc).toContain("<p>$&</p>");
  expect(doc).not.toContain("</script><b>");
});

test("the browser hydrates the markup and does not load the post again", async () => {
  const page = await renderPage(new URL("http://example.com/posts/2"));
  document.body.innerHTML = `<div id="app">${page.html}</div>`;
  const button = document.querySelector("button")!;
  Object.assign(globalThis, { __STATE__: page.state });
  history.replaceState(null, "", "/posts/2");
  const warn = vi.spyOn(console, "warn");
  const requests: string[] = [];
  globalThis.fetch = (async (url: string) => {
    requests.push(url);
    return new Response("{}");
  }) as typeof fetch;

  await import("./main.ts");

  expect(warn).not.toHaveBeenCalled();
  expect(requests).toEqual([]);
  expect(document.querySelector("button")).toBe(button);
  button.click();
  expect(button.textContent).toBe("Like (1)");
});
```

## How hydration works, and what it checks

The DOM plugin walks the markup that the server wrote next to the nodes that `render(state)` returns. For each element it checks that the tag is the one the view expects; it attaches the listeners and registers the node ids; then it goes on to the children. Nothing is created, so there is no flash, and the state of form controls (the text a visitor has already typed) survives.

The HTML parser does two things that a naive walk would trip on: it merges adjacent text nodes, and it drops empty ones. Hydration undoes both: it splits a merged text node at the right place and inserts the empty ones back.

When the markup does not match the view, the page still works. The plugin prints a warning and renders afresh:

```text
pavlus/dom: the server render does not match the view (expected <p>); rendering afresh
```

and:

```text
pavlus/dom: the server render does not match the view (text "Hello, Bob" is not "Hello, Ann"); rendering afresh
```

The reasons are the usual ones: the state in the browser is not the state the server used, or the browser has another version of the template than the server.

The first `routeChanged` after hydration carries the location the server rendered, so `setRoute` sends no `enter`. This is why the test above sees no request: the data is already in the state.

## What is and is not supported

SSR in pavlus is deliberately small. This list is the whole truth:

- **Supported.** Rendering a view or a component (with children and `+outlet`) to a string; serializing and reviving a state; hydrating by attaching listeners and ids; waiting for `http` requests; falling back to a client render when the markup differs.
- **One string, no streaming.** `renderToString` is synchronous and returns the whole page.
- **Only `http` is awaited.** `http.settled()` knows about `http` requests. A `time` timer or a `ws` message is not waited for, and it is better not to register those plugins on the server.
- **The state must be JSON.** `serializeState` is `JSON.stringify` with one addition, component instances. A `Date` becomes a string, `undefined` and functions are dropped, `NaN` becomes `null`, a `Map` becomes `{}`. Keep the state plain, as you should anyway.
- **Hydration compares the structure, not the attributes.** Tags, text and markers are checked. If the server wrote `class="x"` and the client view has none, hydration succeeds and the attribute stays until a patch touches it. Do not render different attributes on the server.
- **The markers must survive.** If you strip the comments `<!--pavlus-->` and `<!--/pavlus-->` from the HTML (a minifier, a hand-made template), the browser does not see a server render and appends a second copy of the page after the first one. Test your pipeline with the real output.
- **No `<head>` management.** The title and meta tags are yours: compute them from the state in `renderDocument`.
- **No base path.** The server passes the path it received. If your site is served under a prefix, strip it before you dispatch `routeChanged`, as the ui-kit's `windowAt` does in the browser (see [routing](page:concepts-routing)).
- **No HTTP server.** The framework gives you the functions. Routing HTTP requests, serving the built files and running Vite in development are your server's work. The `admin-app` of this repository has a complete one, in `backend/ssr.ts` and `backend/server.ts`, with `frontend/entry-server.ts` as the module that the server loads.

> [!WARNING] A store per request
> Never create the store plugin at the top of the server module. The state would be shared by all the requests, and a visitor could see the data of the previous one. Create the store, the `http` plugin and the application inside the function that handles one request, and dispose of the application at the end.

## Components in the state

A template can embed a component that is a *value* in the state: `+{view}#name(...)`. Then the state holds a class instance, and JSON cannot hold it. `serializeState` takes a second argument, an object that gives each instance a name, and writes `{"$component": name}` instead. `reviveState` takes the same object and puts the instances back.

```ts
class Table extends Component {}
const table = new Table();

serializeState({ n: 1, mode: table }, { table });
// {"n":1,"mode":{"$component":"table"}}
```

An instance that is not in the object is an error that says what to do:

```text
pavlus/ssr: a Table instance is in the state; list it in `components` to serialize it
```

And a name that the browser does not know is an error as well: `pavlus/ssr: no component named "zzz"`. This is why the server and the browser must import the same `components` object. In the example above it is exported from `app.ts`, and both sides use it.

## What you learned

- SSR is the same pure `render` run on a server. `renderToString` returns the HTML between two marker comments, and the DOM plugin hydrates it.
- To load data, create the app without `mount`, dispatch `routeChanged` with the request location, and wait for `http.settled()` before rendering.
- The state travels as JSON in a script; `serializeState` and `reviveState` handle component values.
- Create the store and the app for every request. The markers must reach the browser, and the framework compares structure only.

Next: [how plugins work](page:plugins-overview).
