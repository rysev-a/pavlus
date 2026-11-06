// @ts-check
import { fileURLToPath } from "node:url";
import { pavlus } from "@pavlus/frontend/vite";
import { scaleCss } from "../../framework/ui-kit/vite.config.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));

// GitHub Pages serves a project site from /<repo>/mobile/: the workflow builds
// with MOBILE_BASE. Locally it is "/".
const base = process.env.MOBILE_BASE ?? "/";

/** The ui-kit scales its sizes with the Theming variables; the editors' styles are loaded the same way here. */
const scaleSizes = () => ({
  name: "mobile-dev:scale-sizes",
  enforce: /** @type {const} */ ("pre"),
  /** @param {string} code @param {string} id */
  transform(code, id) {
    const file = id.split("?")[0];
    if (
      !/ui-kit\/frontend\/(kit|(blocks|templates)\/[^/]+\/[^/]+)\.css$/.test(
        file,
      )
    )
      return null;
    return { code: scaleCss(code), map: null };
  },
});

/**
 * GitHub Pages has no history fallback, and the 404.html it serves is the one of the
 * whole site, so every address of the app is a folder with the shell in it.
 */
const spaFallback = () => ({
  name: "mobile-dev:spa-fallback",
  generateBundle: {
    order: /** @type {const} */ ("post"),
    /** @this {import("rollup").PluginContext} @param {unknown} _o @param {import("rollup").OutputBundle} bundle */
    handler(_o, bundle) {
      const index = bundle["index.html"];
      if (index && index.type === "asset") {
        this.emitFile({
          type: "asset",
          fileName: "404.html",
          source: index.source,
        });
        // a load of /<repo>/mobile/interface/ finds its page
        this.emitFile({
          type: "asset",
          fileName: "interface/index.html",
          source: index.source,
        });
      }
    },
  },
  /** @param {import("vite").ViteDevServer} server */
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      const url = req.url ?? "";
      if (
        req.method === "GET" &&
        req.headers.accept?.includes("text/html") &&
        !url.startsWith("/@") &&
        !url.includes(".")
      )
        req.url = "/index.html";
      next();
    });
  },
});

export default {
  base,
  plugins: [scaleSizes(), pavlus(), spaFallback()],
  server: { port: 5191, fs: { allow: [root] } },
  preview: { port: 5191 },
  test: { include: ["tests/**/*.test.ts"] },
};
