// @ts-check
import { pavlus } from "@pavlus/client/vite";

export default {
  // GitHub Pages serves the site under /<repo>/: the workflow sets BASE
  base: process.env.BASE ?? "/",
  // Compiles *.pavlus templates into pure render/diff functions.
  plugins: [pavlus()],
  server: { port: 5191 },
  preview: { port: 5191 },
  test: { include: ["tests/**/*.test.ts"] },
};
