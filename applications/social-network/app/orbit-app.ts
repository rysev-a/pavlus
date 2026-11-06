// Orbit as a routed child of the shell: the template's own component, plus
// three things the template (which keeps everything in one screen state) does not do:
//  - the data comes over HTTP, so a failed load is an error with a retry, not sample data;
//  - the address bar follows the screen and the screen follows the address bar;
//  - sign-in is a place (/login, /register) with a way back (?next=).
import type { Effect, Message, Route } from "@pavlus/frontend";
import {
  routerEffector as router,
  storeEffector as store,
} from "@pavlus/frontend/plugins";
import { idbEffector } from "../../../framework/ui-kit/frontend/idb.ts";
import type {
  OrbitState,
  SliceKey,
  Update,
} from "../../../framework/ui-kit/frontend/templates/orbit-social/core.ts";
import {
  applyUpdate,
  DB_NAME,
  diffEffects,
  OrbitSocial,
  initialState as templateState,
} from "../../../framework/ui-kit/frontend/templates/orbit-social/orbit-social.ts";
import { TABLES } from "../../../framework/ui-kit/frontend/templates/orbit-social/schema.ts";
import { titleEffector } from "../frontend/title.ts";
import {
  nextOf,
  PATHS,
  parsePath,
  pathOf,
  showsPath,
  titleOf,
} from "./routes.ts";

/** What the shell adds to the state of the template. */
export interface OrbitAppState extends OrbitState {
  /** the load of the database was asked for (once; `reload` asks again) */
  requested: boolean;
  /** where we are (given by the router; absent before the first report) */
  route?: Route;
}

export const initialOrbit = (): OrbitAppState => ({
  ...templateState(),
  requested: false,
});

const go = (url: string, replace = false): Effect =>
  router.navigate(url, { replace, absolute: true });

type SetEffect = Effect & {
  plugin: "store";
  type: "set";
  path: string;
  value: unknown;
};
const isSet = (e: Effect): e is SetEffect =>
  (e as SetEffect).plugin === "store" && (e as SetEffect).type === "set";

/** The state after the `store.set` effects (top-level keys), like the store plugin would leave it. */
export function fold(state: OrbitAppState, effects: Effect[]): OrbitAppState {
  const next = { ...state } as Record<string, unknown>;
  for (const e of effects) if (isSet(e)) next[e.path] = e.value;
  return next as unknown as OrbitAppState;
}

export class OrbitApp extends OrbitSocial {
  // ---- the navigation is made of real links ----

  /** The groups of the navigation get a real address for every item. */
  _hrefs(effects: Effect[]): Effect[] {
    return effects.map((e) => {
      if (!isSet(e) || e.path !== "groups") return e;
      const groups = e.value as { items: { id: keyof typeof PATHS }[] }[];
      return store.set(
        "groups",
        groups.map((g) => ({
          ...g,
          items: g.items.map((i) => ({ ...i, href: PATHS[i.id] })),
        })),
      );
    });
  }

  // ---- state changes: the address bar and the title follow ----

  /** The effects that make the address bar and the title match `after`. */
  _where(before: OrbitAppState, after: OrbitAppState): Effect[] {
    // the first view of a loaded database is placed by `_route`, from the address
    if (before.view === "loading" || after.view === "loading") return [];
    const out: Effect[] = [];
    const here = before.route?.path ?? "";
    if (!showsPath(after, here)) {
      const login = after.view === "auth" && before.view === "app";
      // changing the screen is a new history entry; refining the one that is open is not
      out.push(
        go(
          pathOf(after),
          !login &&
            before.view === after.view &&
            before.screen === after.screen,
        ),
      );
    }
    if (titleOf(before) !== titleOf(after) || before.view !== after.view)
      out.push(titleEffector.set(titleOf(after)));
    return out;
  }

  _apply(
    state: OrbitAppState,
    key: SliceKey,
    u: Update,
    sync = true,
  ): Effect[] {
    let update = u;
    if (u.me !== undefined && u.me > 0 && !u.go) {
      // signed in: back to where the person was going
      const next = parsePath(nextOf(state.route?.search ?? "").split("?")[0]);
      if (next.kind === "screen")
        update = { ...u, go: { screen: next.screen, params: next.params } };
    }
    const r = applyUpdate(state, key, update);
    const effects = [...this._hrefs(diffEffects(state, r.state)), ...r.effects];
    if (sync) effects.push(...this._where(state, fold(state, effects)));
    return effects;
  }

  _set(
    state: OrbitAppState,
    patch: Partial<OrbitState>,
    extra: Effect[] = [],
  ): Effect[] {
    const effects = this._hrefs(super._set(state, patch, extra));
    const after = fold(state, effects);
    return [...effects, ...this._where(state, after)];
  }

  // ---- the address bar drives the screen ----

  /** Where the path wants the application to be: effects, from `state` (the template is ready). */
  _route(state: OrbitAppState, route: Route): Effect[] {
    const p = parsePath(route.path);
    if (p.kind === "unknown") return [titleEffector.set("Not found · Orbit")];
    const me = state.db.users.find((u) => u.id === state.me);
    if (p.kind === "root") return [go(me ? PATHS.wall : "/login", true)];
    if (!me) {
      if (p.kind === "auth") {
        const fx =
          state.authView === p.view
            ? []
            : this._set(state, { authView: p.view });
        return [
          ...fx,
          titleEffector.set(titleOf({ ...state, authView: p.view })),
        ];
      }
      const next = encodeURIComponent(route.path + route.search);
      return [go(`/login?next=${next}`, true)];
    }
    if (p.kind === "auth")
      return [go(nextOf(route.search) || PATHS.wall, true)];
    if (p.screen === "admin" && me.role !== "admin")
      return [go(PATHS.wall, true)];
    if (showsPath(state, route.path))
      return [titleEffector.set(titleOf(state))];
    return this._apply(
      state,
      p.screen,
      { go: { screen: p.screen, params: p.params } },
      false,
    ).concat(titleEffector.set(`${titleOf({ ...state, screen: p.screen })}`));
  }

  /** The router entered (or changed) the route: the first time it also loads the database. */
  enter(msg: Message, state: OrbitAppState): Effect[] {
    const route = msg.payload as Route;
    if (state.status !== "ready") {
      if (state.requested) return [];
      return [store.set("requested", true), ...this._load()];
    }
    return this._route(state, route);
  }

  _load(): Effect[] {
    return [
      idbEffector.load(DB_NAME, TABLES as string[], "loaded", "dbFailed"),
    ];
  }

  loaded(msg: Message, state: OrbitAppState): Effect[] {
    const effects = this._hrefs(super.loaded(msg, state));
    const after = fold(state, effects);
    return state.route
      ? [...effects, ...this._route(after, state.route)]
      : effects;
  }

  /** A failed load is an error on the screen, with a retry; a failed write is a notice. */
  dbFailed(msg: Message, state: OrbitAppState): Effect[] {
    if (state.status === "loading")
      return [
        store.set("status", "failed"),
        store.set("error", String(msg.payload ?? "the database failed")),
      ];
    return super.dbFailed(msg, state);
  }

  /** Retry of a failed load. */
  reload(_msg: Message, _state: OrbitAppState): Effect[] {
    return [
      store.set("status", "loading"),
      store.set("error", ""),
      store.set("requested", true),
      ...this._load(),
    ];
  }
}

export const orbit = new OrbitApp();
