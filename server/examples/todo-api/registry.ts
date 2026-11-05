// Route id -> route function. The gate looks routes up here after it has
// rate-limited and authenticated the request.
import { routes as auth } from "./auth.ts";
import { routes as demo } from "./demo.ts";
import { routes as health } from "./health.ts";
import type { RouteFn } from "./kit.ts";
import { routes as stream } from "./stream.ts";
import { routes as todos } from "./todos.ts";

export const HANDLERS: Record<string, RouteFn> = {
  ...health,
  ...auth,
  ...todos,
  ...stream,
  ...demo,
};
