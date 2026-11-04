/**
 * Server-side rendering. The application is the same pure code as in the
 * browser (app/); here it runs without a DOM, with the API answered
 * in-process, until its data is in. Then its view is rendered to HTML and
 * its state to JSON, and the browser hydrates both (frontend/main.ts).
 *
 * The app's `dom.update()` effects land on an inert plugin: on the server
 * there is nothing to repaint along the way — the whole page is rendered
 * once, from the final state.
 */
import {
  type Component,
  createApp,
  type Plugin,
  viewOf,
} from "@service-laboratory/pavlus";
import {
  createHttpPlugin,
  createStorePlugin,
} from "@service-laboratory/pavlus/plugins";
import { renderToString, serializeState } from "@service-laboratory/pavlus/ssr";
import { handleApi, type Query } from "./api.ts";

/** What app/entry-server.ts exports. */
export interface Frontend {
  app: Component;
  initialState: unknown;
}

export interface Page {
  /** The markup of `#app`, ready for hydration. */
  html: string;
  /** The state the page was rendered from, as JSON. */
  state: string;
}

/** The app's `fetch`, answered by the API handlers directly: no socket. */
function inProcess(query: Query): typeof fetch {
  return async (input, init) => {
    const url = new URL(String(input), "http://ssr.local");
    let body: unknown;
    if (typeof init?.body === "string") {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = undefined;
      }
    }
    const reply = await handleApi(
      init?.method ?? "GET",
      url.pathname,
      query,
      body,
    );
    return new Response(JSON.stringify(reply.body), {
      status: reply.status,
      headers: { "content-type": "application/json" },
    });
  };
}

/** A plugin that accepts its effects and does nothing: no DOM on the server. */
const inert = (name: string): Plugin => ({ name, handle() {} });

/**
 * Renders the page: `mounted` goes in (the same message the browser's mount
 * dispatches), the data loads through `query`, and the result is rendered.
 */
export async function renderPage(
  frontend: Frontend,
  query: Query,
): Promise<Page> {
  const view = viewOf(frontend.app);
  if (!view) throw new Error("ssr: the app has no view");
  const store = createStorePlugin(frontend.initialState);
  const http = createHttpPlugin({ fetch: inProcess(query) });
  const instance = createApp({
    app: frontend.app,
    plugins: [store, http, inert("dom")],
  });
  try {
    instance.dispatch({ id: "mounted" });
    await http.settled();
  } finally {
    instance.dispose();
  }
  const state = store.getState();
  return {
    html: renderToString(view, state),
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
