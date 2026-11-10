/**
 * Server-side rendering, the framework half. The application is the same pure
 * code as in the browser (the app's entry-server); here it runs without a DOM,
 * with the API answered in-process (a fetch that runs the same pure backend
 * application — see helpers/flow-fetch.ts), until its data is in. Then its
 * view is rendered to HTML and its state to JSON, and the browser hydrates
 * both.
 *
 * The app's dom effects land on an inert plugin: on the server there is
 * nothing to repaint along the way — the whole page is rendered once, from the
 * final state. The children are embedded in the app's view, so the one
 * render includes them; the browser hydrates the whole page.
 *
 * This module is a "./ssr" subpath on purpose: it imports @pavlus/client
 * values, and the package's main entry stays free of it at runtime.
 */
import { type Component, createApp, type Plugin, viewOf } from "@pavlus/client";
import { createHttpPlugin, createStorePlugin } from "@pavlus/client/plugins";
import { renderToString, serializeState } from "@pavlus/client/ssr";

/** What the app's entry-server.ts exports. */
export interface Frontend {
  app: Component;
  initialState: unknown;
}

/** Where the page is rendered at: the router reports this to the app. */
export interface PageLocation {
  path: string;
  search?: string;
  hash?: string;
}

export interface Page {
  /** The markup of `#app`, ready for hydration. */
  html: string;
  /** The state the page was rendered from, as JSON. */
  state: string;
}

/** A plugin that accepts its effects and does nothing: no DOM on the server. */
const inert = (name: string): Plugin => ({ name, handle() {} });

export interface RenderPageOptions {
  /** Where the page is rendered at: the router reports this to the app. */
  at?: PageLocation;
  /**
   * Plugin names the app uses that have no business on the server (a ws
   * connection, audio, ...) — inert placeholders accept their effects, so
   * the render does not throw. "dom" and "router" are always inert.
   */
  inert?: string[];
}

/**
 * Renders the page: the route goes in first (the same `routeChanged` the
 * router plugin dispatches in the browser — it activates the page, whose
 * `enter` loads its data), then `mounted`, and everything loads through
 * `fetch`. The result is rendered once, from the final state.
 */
export async function renderPage(
  frontend: Frontend,
  ssrFetch: typeof fetch,
  opts: RenderPageOptions = {},
): Promise<Page> {
  const view = viewOf(frontend.app);
  if (!view) throw new Error("ssr: the app has no view");
  const store = createStorePlugin(frontend.initialState);
  const http = createHttpPlugin({ fetch: ssrFetch });
  const inertNames = ["dom", "router", ...(opts.inert ?? [])];
  const instance = createApp({
    app: frontend.app,
    plugins: [store, http, ...inertNames.map(inert)],
  });
  try {
    const at = opts.at ?? { path: "/" };
    instance.dispatch({
      id: "routeChanged",
      payload: { path: at.path, search: at.search ?? "", hash: at.hash ?? "" },
    });
    instance.dispatch({ id: "mounted" });
    await http.settled();
  } finally {
    instance.dispose();
  }
  const state = store.getState();
  // One render of the app's view: the embedded children render from the same
  // state, in place — a closed form (its slice null) renders nothing.
  const html = renderToString(view, state);
  return {
    html,
    state: serializeState(state),
  };
}

/**
 * The document: `template` (index.html, with the build's assets) with the
 * page inside `#app` and its state in a script at the end of `<head>`, so it
 * is there before the app's own script runs.
 */
export function renderDocument(template: string, page: Page): string {
  // Inside a script, `<` must not start a tag (`</script>`): escape it.
  const state = JSON.stringify(page.state).replace(/</g, "\\u003c");
  const script = `<script>window.__PAVLUS_STATE__ = ${state};</script>`;
  const marker = '<div id="app"></div>';
  if (!template.includes(marker) || !template.includes("</head>")) {
    throw new Error('ssr: the template needs <div id="app"></div> and <head>');
  }
  return template
    .replace("</head>", `  ${script}\n  </head>`)
    .replace(marker, `<div id="app">${page.html}</div>`);
}
