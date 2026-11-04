/**
 * What the server renders pages with (backend/ssr.ts): the shell, its initial
 * state and the components that are values in the state. `npm run build`
 * bundles it to dist/server/entry-server.js; in development Vite loads it.
 */
export { app, components, initialState } from "./app.ts";
