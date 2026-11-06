// The wiring, shared by main.ts and the tests: the app is pure, everything that
// touches the world is a plugin.
import {
  createHttpServerPlugin,
  createPostgresPlugin,
  createServerApp,
} from "pavlus-server";
import { app } from "./app.ts";
import { routes } from "./routes.ts";

export interface ServerOptions {
  url: string;
  port: number;
}

export function buildServer({ url, port }: ServerOptions) {
  const http = createHttpServerPlugin({
    port,
    // a diagram and an interface are a few hundred KB of JSON, with room to grow
    limits: { bodyBytes: 16 * 1024 * 1024 },
  });
  return createServerApp({
    app,
    routes,
    plugins: [createPostgresPlugin({ url }), http],
  });
}
