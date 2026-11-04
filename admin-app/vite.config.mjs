// @ts-check
import { pavlus } from "@service-laboratory/pavlus/vite";

// Used by `vite build`, `vite build --ssr` and vitest. The dev server
// (backend/server.ts, devPages) passes the plugins and ssr options inline
// with `configFile: false` — see there for why.
//
// On the server the framework is imported by Node, not bundled, so the
// backend (backend/ssr.ts) and the app (app/) share one `Component` class.
const framework = (id) => id.startsWith("@service-laboratory/pavlus");

export default ({ isSsrBuild }) => ({
  // Compiles *.pavlus templates into pure render/diff functions.
  plugins: [pavlus()],
  test: {
    // The tests share the one development database: one file at a time.
    fileParallelism: false,
  },
  ssr: { external: ["@service-laboratory/pavlus"] },
  build: isSsrBuild ? { rollupOptions: { external: framework } } : {},
});
