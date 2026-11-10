// @ts-check
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { pavlus } from "@pavlus/client/vite";

// GitHub Pages serves a project site from /<repo>/, so the workflow builds
// with UI_KIT_BASE=/pavlus/. Locally it is "/".
const base = process.env.UI_KIT_BASE ?? "/";

/**
 * The sizes of the Theming page. The admin-app stylesheet states font sizes and
 * the heights of controls in px; here every font size becomes
 * `calc(Npx * var(--k-text, 1))` and every control height or width
 * (24, 28, 32, 36 and 40 px) `calc(Npx * var(--k-ui, 1))`, as the file is
 * loaded. With the variables unset it is the same stylesheet. The source file
 * stays what the admin-app uses.
 */
const CONTROL = new Set(["24", "28", "32", "36", "40"]);
export const scaleCss = (css) =>
  css
    .replace(
      /font-size:\s*(\d+(?:\.\d+)?)px/g,
      (_m, n) => `font-size: calc(${n}px * var(--k-text, 1))`,
    )
    .replace(
      /(?<![\w-])((?:min-)?(?:height|width)):\s*(\d+)px/g,
      (m, prop, n) =>
        CONTROL.has(n) ? `${prop}: calc(${n}px * var(--k-ui, 1))` : m,
    );

const scaleSizes = () => ({
  name: "ui-kit:scale-sizes",
  enforce: "pre",
  transform(code, id) {
    const file = id.split("?")[0];
    if (
      !/ui-kit\/src\/(kit|(blocks|templates)\/[^/]+\/[^/]+)\.css$/.test(
        file,
      )
    )
      return null;
    return { code: scaleCss(code), map: null };
  },
});

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

/**
 * The documentation is a site of its own: docs/site (built by `npm run
 * docs:build`) is served under /docs/ — index.html at /docs/, docs.html and
 * about.html next to it. /docs/overview, where the docs used to be, redirects.
 */
const DOCS_PAGES = ["index.html", "docs.html", "about.html"];
const docsFile = (name) =>
  readFileSync(
    fileURLToPath(new URL(`../../docs/site/${name}`, import.meta.url)),
    "utf8",
  );
const OVERVIEW = `<!doctype html>
<meta charset="utf-8">
<title>Pavlus — documentation</title>
<meta http-equiv="refresh" content="0; url=${base}docs/">
<link rel="canonical" href="${base}docs/">
<p><a href="${base}docs/">The documentation moved to ${base}docs/.</a></p>
`;
const docsSite = () => ({
  name: "ui-kit:docs-site",
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const path = (req.url ?? "").split("?")[0];
      const rel = path.startsWith(base) ? path.slice(base.length) : path.slice(1);
      let html;
      if (rel === "docs" || rel === "docs/" || rel === "docs/index.html")
        html = docsFile("index.html");
      else if (rel === "docs/docs.html") html = docsFile("docs.html");
      else if (rel === "docs/about.html") html = docsFile("about.html");
      else if (rel === "docs/overview" || rel === "docs/overview/")
        html = OVERVIEW;
      if (html === undefined) return next();
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.end(html);
    });
  },
  generateBundle() {
    for (const name of DOCS_PAGES)
      this.emitFile({
        type: "asset",
        fileName: `docs/${name}`,
        source: docsFile(name),
      });
    this.emitFile({
      type: "asset",
      fileName: "docs/overview/index.html",
      source: OVERVIEW,
    });
  },
});

export default {
  base,
  // Compiles *.pavlus templates into pure render/diff functions.
  plugins: [scaleSizes(), pavlus(), spaFallback(), docsSite()],
  server: {
    // the Visual Builder demo of the coffee shop asks /crm-api for the generated
    // server (coffee-shop-app, port 3020) when its simulated backend is switched off
    proxy: {
      "/crm-api": {
        target: "http://127.0.0.1:3020",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/crm-api/, ""),
      },
    },
  },
  test: {
    // pages.ts finds the pages with import.meta.glob; a cached transform of it
    // would keep the list of files from the run that wrote the cache.
    fsModuleCache: false,
  },
};
