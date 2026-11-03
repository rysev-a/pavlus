// @ts-check
import { pavlus } from "@service-laboratory/pavlus/vite";

// GitHub Pages serves a project site from /<repo>/, so the workflow builds
// with UI_KIT_BASE=/pavlus/. Locally it is "/".
const base = process.env.UI_KIT_BASE ?? "/";

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

export default {
  base,
  // Compiles *.pavlus templates into pure render/diff functions.
  plugins: [pavlus(), spaFallback()],
  test: {
    // pages.ts finds the pages with import.meta.glob; a cached transform of it
    // would keep the list of files from the run that wrote the cache.
    fsModuleCache: false,
  },
};
