// @ts-check
import { pavlus } from "@service-laboratory/pavlus/vite";
import { scaleCss } from "../ui-kit/vite.config.mjs";

// The ui-kit sizes (fonts, controls) follow its Theming variables: the same
// transform as the ui-kit's own build, for the stylesheets it applies to.
const scaleSizes = () => ({
  name: "phone-crm:scale-sizes",
  enforce: /** @type {const} */ ("pre"),
  /** @param {string} code @param {string} id */
  transform(code, id) {
    const file = id.split("?")[0];
    if (
      !/(admin-app\/frontend\/styles|ui-kit\/frontend\/(kit|(blocks|templates)\/[^/]+\/[^/]+))\.css$/.test(
        file,
      )
    )
      return null;
    return { code: scaleCss(code), map: null };
  },
});

export default {
  plugins: [scaleSizes(), pavlus()],
  server: {
    port: 5174,
    // the repo root: the ui-kit and the framework sit next to this app
    fs: { allow: [".."] },
    proxy: { "/api": "http://127.0.0.1:3010" },
  },
  test: {
    environment: "jsdom",
    fsModuleCache: false,
    // the backend tests share one development database: one file at a time
    fileParallelism: false,
  },
};
