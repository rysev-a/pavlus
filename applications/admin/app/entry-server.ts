/**
 * What the server loads to render pages (@pavlus/backend/ssr): the component
 * and its initial state — the same pure code the browser runs. `npm run build`
 * bundles it to dist/server/entry-server.js; in development Vite loads it.
 */
export { app } from "./app.ts";
export { initialState } from "./state.ts";
export type { AppState } from "./state.ts";
