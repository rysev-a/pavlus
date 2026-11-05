import { resolve, sep } from "node:path";

// `npx vite build` / `npx vite preview` inside examples/<name> runs from this package
// (npm workspaces), so use the directory the command was typed in as the Vite root.
// Tests (`vitest run` at the package root) are not affected.
const typedIn = resolve(process.env.INIT_CWD ?? process.cwd());
const inExample = typedIn.includes(`${sep}examples${sep}`);

export default {
  test: { environment: "jsdom" },
  ...(inExample ? { root: typedIn } : {}),
};
