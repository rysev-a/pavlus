// @ts-check
import { fileURLToPath } from "node:url";
import { pavlus } from "@service-laboratory/pavlus/vite";
import { scaleCss } from "../ui-kit/vite.config.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const API = process.env.API_URL ?? "http://127.0.0.1:3030";

/** The ui-kit scales its sizes with the Theming variables; the styles of the editors are loaded the same way here. */
const scaleSizes = () => ({
  name: "visual-design:scale-sizes",
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

/** every unknown path serves index.html: deep links (/projects/3/flow) work in dev */
const spaFallback = () => ({
  name: "visual-design:spa-fallback",
  /** @param {import("vite").ViteDevServer} server */
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      const url = req.url ?? "";
      if (
        req.method === "GET" &&
        req.headers.accept?.includes("text/html") &&
        !url.startsWith("/api") &&
        !url.startsWith("/@") &&
        !url.includes(".")
      )
        req.url = "/index.html";
      next();
    });
  },
});

const proxy = { "/api": { target: API, rewrite: (/** @type {string} */ p) => p.replace(/^\/api/, "") } };

export default {
  // Compiles *.pavlus templates into pure render/diff functions.
  plugins: [scaleSizes(), pavlus(), spaFallback()],
  server: {
    port: 5190,
    // the ui-kit (editors, styles) sits next to this app
    fs: { allow: [root] },
    proxy,
  },
  preview: { port: 5190, proxy },
  test: {
    include: ["tests/**/*.test.ts"],
    // the API tests share one database: one file at a time
    fileParallelism: false,
  },
};
