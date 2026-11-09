// @ts-check
import { configDefaults } from "vitest/config";
import { pavlus } from "@pavlus/frontend/vite";

// Used by `vite build`, `vite build --ssr` and vitest. The dev server
// (backend/server.ts, devPages) passes the plugins and ssr options inline
// with `configFile: false` — see there for why.
//
// On the server the framework is imported by Node, not bundled, so the
// server render (@pavlus/backend/ssr) and the app (app/) share one
// `Component` class.
const framework = (id) => id.startsWith("@pavlus/frontend");

export default ({ isSsrBuild }) => ({
  // Compiles *.pavlus templates into pure render/diff functions.
  plugins: [pavlus()],
  test: {
    // The tests share the one development database: one file at a time.
    fileParallelism: false,
    // `for-research/` is the original service, cloned for reference only: its
    // tests are not ours.
    exclude: [...configDefaults.exclude, "for-research/**"],
  },
  ssr: { external: ["@pavlus/frontend"] },
  build: isSsrBuild ? { rollupOptions: { external: framework } } : {},
});
