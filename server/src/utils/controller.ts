// The class-controller driver. One file per domain holds a static service
// (pure effect builders) and a controller class; `controllersApp` turns the
// controllers into ONE pure app function plus the route table for the runtime:
//
//   class UserController extends HttpController {
//     readonly path = "/users";
//     get(message) { return UserService.getUsers(message.payload) }   // GET /users
//     getItem(message) { ... }                                        // GET /users/:id
//     post(message) { ... }                                           // POST /users
//     patch(message) { ... }                                          // PATCH /users/:id
//     delete(message) { ... }                                         // DELETE /users/:id
//     "getUsers.onSuccess"(message) {                                 // db reply
//       return httpEffector.makeResponse(200, { users: rowsOf(message) });
//     }
//   }
//
// Verb members become routes (only the ones you define). Every OTHER function
// member is a handler for the message with that exact id — the db factory's
// `${id}.onSuccess` continuations, a shared `errorId`, anything. A message id
// that ends in `.onError` and has no handler gets the default: log + 500.
import type { Effect, Message } from "@service-laboratory/pavlus";
import type { ServerState } from "../plugins/requests/mod.ts";
import { requestsEffector } from "../plugins/requests/mod.ts";
import type { RouteTable } from "../routing.ts";
import { internal } from "./kit.ts";

/** The `http.request` payload as the router leaves it on a route message. */
export interface HttpReq {
  method: string;
  path: string;
  query: Record<string, string | string[]>;
  headers: Record<string, string | string[] | undefined>;
  cookies: Record<string, string>;
  params: Record<string, string>;
  body: unknown;
  ip: string;
  [k: string]: unknown;
}

/** A controller method: takes the message and the state, returns effects. */
export type ControllerMethod<M extends Message = Message> = (
  message: M,
  state: ServerState,
) => Effect | Effect[] | void;

/** Verb member -> route pattern. `getItem`/`patch`/... add `/:id`. */
const VERBS: Record<string, string | undefined> = {
  get: "GET {}",
  getItem: "GET {}/:id",
  post: "POST {}",
  patch: "PATCH {}/:id",
  put: "PUT {}/:id",
  delete: "DELETE {}/:id",
};

/**
 * Base class: the request memory. The runtime opens `state.requests[rid]` when
 * the first message of a request arrives; the driver parks `{route, http,
 * step}` there on entry, and flow methods park what the continuations need.
 */
export abstract class HttpController {
  abstract readonly path: string;

  /** This request's slice (`state.requests[rid]`), or undefined. */
  protected slice(
    state: ServerState,
    msg: Message,
  ): Record<string, unknown> | undefined {
    const rid = msg.ctx?.rid;
    return typeof rid === "string"
      ? (state.requests[rid] as Record<string, unknown> | undefined)
      : undefined;
  }

  /** The slice, but only if the flow is at `step` (out-of-turn replies die). */
  protected at(
    state: ServerState,
    msg: Message,
    step: string,
  ): Record<string, unknown> | undefined {
    const s = this.slice(state, msg);
    return s?.step === step ? s : undefined;
  }
}

export interface ControllersApp {
  /** The pure app function: hand to `createServerApp`. */
  app: (message: Message, state: ServerState) => Effect[];
  /** The route table: hand to `createServerApp` as `routes`. */
  routes: RouteTable;
  /** All message ids the controllers answer. */
  readonly ids: readonly string[];
}

type AnyFn = (message: Message, state: ServerState) => unknown;

const flat = (out: unknown): Effect[] => {
  if (out === undefined) return [];
  return (Array.isArray(out) ? out : [out]) as Effect[];
};

/** Function members of the instance (its prototype and its own fields). */
function membersOf(c: HttpController): string[] {
  return [
    ...Object.getOwnPropertyNames(Object.getPrototypeOf(c)),
    ...Object.getOwnPropertyNames(c),
  ].filter((k) => k !== "constructor" && k !== "path");
}

/**
 * Scans the controllers once and returns the app function and route table.
 * Verb members are reachable under their route id (`users.get`); every other
 * function member under its own name (`"getUsers.onSuccess"`, `"orderTxError"`).
 */
export function controllersApp(controllers: HttpController[]): ControllersApp {
  const routes: RouteTable = {};
  const handlers = new Map<string, AnyFn>();
  const entries = new Set<string>(); // ids that start a request (route ids)

  for (const c of controllers) {
    const prefix = c.path
      .split("/")
      .filter((s) => s !== "" && !s.startsWith(":"))
      .join(".");

    for (const key of membersOf(c)) {
      const fn = (c as unknown as Record<string, unknown>)[key];
      if (typeof fn !== "function") continue;
      const bind = (fn as AnyFn).bind(c);
      const pattern = VERBS[key];
      if (pattern) {
        const id = `${prefix}.${key}`;
        if (routes[pattern.replace("{}", c.path)])
          throw new Error(
            `controllersApp: duplicate route "${key}" on ${c.path}`,
          );
        routes[pattern.replace("{}", c.path)] = id;
        handlers.set(id, bind);
        entries.add(id);
      } else {
        if (handlers.has(key))
          throw new Error(`controllersApp: duplicate handler "${key}"`);
        handlers.set(key, bind);
      }
    }
  }

  const app = (message: Message, state: ServerState): Effect[] => {
    const h = handlers.get(message.id);
    if (h) {
      const effects = flat(h(message, state));
      // a route message opens the request memory: which route, what came in
      return entries.has(message.id)
        ? [
            requestsEffector.merge({
              route: message.id,
              http: message.payload,
              step: "run",
            }),
            ...effects,
          ]
        : effects;
    }
    // a db step failed and nobody claimed its error: log it, answer 500
    if (message.id.endsWith(".onError"))
      return internal(message.payload, message.id);
    return [];
  };

  return { app, routes, ids: [...handlers.keys()] };
}
