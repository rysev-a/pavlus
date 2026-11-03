import { defineConfig } from "vite";
import { pavlus } from "./src/vite/mod.ts";

export default defineConfig({
  plugins: [pavlus()],
  resolve: {
    alias: {
      // Compiled templates import their helpers from the package. Inside this
      // repository that is the source.
      "@service-laboratory/pavlus/runtime": new URL(
        "./src/runtime/helpers.ts",
        import.meta.url,
      ).pathname,
    },
  },
  build: {
    lib: {
      entry: {
        main: "main.ts",
        vite: "src/vite/mod.ts",
        compiler: "src/compiler/mod.ts",
        runtime: "src/runtime/helpers.ts",
        testing: "src/testing/mod.ts",
        plugins: "src/plugins/mod.ts",
        "plugins/dom": "src/plugins/dom/mod.ts",
        "plugins/store": "src/plugins/store/mod.ts",
        "plugins/http": "src/plugins/http/mod.ts",
        "plugins/ws": "src/plugins/ws/mod.ts",
        "plugins/time": "src/plugins/time/mod.ts",
        "plugins/logger": "src/plugins/logger/mod.ts",
        "plugins/router": "src/plugins/router/mod.ts",
      },
      formats: ["es"],
      fileName: (_format, name) => `${name}.js`,
    },
  },
});
