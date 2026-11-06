// @ts-check
import { fileURLToPath } from "node:url";
import { pavlus } from "@pavlus/frontend/vite";
import { scaleCss } from "../../framework/ui-kit/vite.config.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const API = process.env.API_URL ?? "http://127.0.0.1:3020";

/** The ui-kit scales its sizes with the Theming variables; the template styles are loaded the same way here. */
const scaleSizes = () => ({
  name: "social-network-app:scale-sizes",
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

export default {
  // Compiles *.pavlus templates into pure render/diff functions.
  plugins: [scaleSizes(), pavlus()],
  server: {
    port: 5175,
    // the ui-kit (templates, blocks, styles) sits next to this app
    fs: { allow: [root] },
    // every unknown path serves index.html: deep links work in dev
    proxy: { "/api": API },
  },
  preview: { port: 5175, proxy: { "/api": API } },
  test: {
    // the backend tests share one database: one file at a time
    fileParallelism: false,
    include: ["tests/**/*.test.ts"],
  },
};
