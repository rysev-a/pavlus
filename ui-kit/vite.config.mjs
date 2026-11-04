// @ts-check
import { pavlus } from "@service-laboratory/pavlus/vite";

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
    .replace(/(?<![\w-])((?:min-)?(?:height|width)):\s*(\d+)px/g, (m, prop, n) =>
      CONTROL.has(n) ? `${prop}: calc(${n}px * var(--k-ui, 1))` : m,
    );

const scaleSizes = () => ({
  name: "ui-kit:scale-sizes",
  enforce: "pre",
  transform(code, id) {
    const file = id.split("?")[0];
    if (!/(admin-app\/frontend\/styles|ui-kit\/frontend\/(kit|(blocks|templates)\/[^/]+\/[^/]+))\.css$/.test(file)) return null;
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

export default {
  base,
  // Compiles *.pavlus templates into pure render/diff functions.
  plugins: [scaleSizes(), pavlus(), spaFallback()],
  test: {
    // pages.ts finds the pages with import.meta.glob; a cached transform of it
    // would keep the list of files from the run that wrote the cache.
    fsModuleCache: false,
  },
};
