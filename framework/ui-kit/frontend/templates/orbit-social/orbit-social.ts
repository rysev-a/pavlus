// Orbit, a social network. All its data lives in IndexedDB (the `idb` plugin) and,
// while the page is open, in `state.db`. This is the shell: sign in, the navigation,
// the database, and the glue that runs the feature modules (see core.ts for the
// contract). Everything here is a pure function of (message, state).
import { Component, type Effect, type Message } from "@pavlus/frontend";
import { storeEffector as store } from "@pavlus/frontend/plugins";
import {
  type NavGroup,
  notice,
  type ShellAction,
  type ShellUser,
} from "../../blocks/admin-shell/shell.ts";
import { idbEffector, type Loaded } from "../../idb.ts";
import {
  checkRegistration,
  DEMO_ADMIN,
  DEMO_PASSWORD,
  login,
  newUser,
} from "./auth.ts";
import {
  type AuthState,
  type OrbitState,
  type Screen,
  type SliceKey,
  tick,
  type Update,
  upsert,
  without,
} from "./core.ts";
import { MODULES } from "./modules.ts";
import view from "./orbit-social.pavlus";
import { initialsOf } from "./pictures.ts";
import { type Db, emptyDb, NOW, TABLES } from "./schema.ts";
import { seedDb } from "./seed.ts";

export const DB_NAME = "orbit-social";

// ---- the navigation ----

const NAV: {
  title: string;
  items: { id: Screen; label: string; icon: string; admin?: boolean }[];
}[] = [
  {
    title: "Social",
    items: [
      { id: "wall", label: "Wall", icon: "k-ai-home" },
      { id: "blog", label: "Posts", icon: "k-ai-file" },
      { id: "profile", label: "Profile", icon: "k-icon-user" },
      { id: "photos", label: "Photos", icon: "k-ai-sparkles" },
    ],
  },
  {
    title: "Talk",
    items: [
      { id: "messages", label: "Messages", icon: "k-icon-mail" },
      { id: "communities", label: "Communities", icon: "k-ai-users" },
    ],
  },
  {
    title: "Fun",
    items: [
      { id: "music", label: "Music", icon: "k-ai-pulse" },
      { id: "games", label: "Games", icon: "k-ai-play" },
    ],
  },
  {
    title: "System",
    items: [
      { id: "admin", label: "Admin panel", icon: "k-ai-key", admin: true },
    ],
  },
];

export const labelOf = (screen: Screen): string =>
  NAV.flatMap((g) => g.items).find((i) => i.id === screen)?.label ?? "";

const ACTIONS: ShellAction[] = [
  { id: "logout", label: "Sign out", icon: "k-ai-logout", variant: "outline" },
];

const NO_USER: ShellUser = { name: "Guest", role: "", initials: "?" };

/** The shell's own derived fields: the navigation, the title and who is signed in. */
export function deriveShell(
  s: OrbitState,
): Pick<
  OrbitState,
  "groups" | "user" | "title" | "subtitle" | "actions" | "view"
> {
  const me = s.db.users.find((u) => u.id === s.me);
  const groups: NavGroup[] = NAV.map((g) => ({
    title: g.title,
    items: g.items
      .filter((i) => !i.admin || me?.role === "admin")
      .map((i) => ({ id: i.id, label: i.label, icon: i.icon })),
  })).filter((g) => g.items.length > 0);
  return {
    groups,
    user: me
      ? {
          name: me.name,
          role:
            me.role === "admin"
              ? "Administrator"
              : me.role === "moderator"
                ? "Moderator"
                : "Member",
          initials: initialsOf(me.name),
        }
      : NO_USER,
    title: labelOf(s.screen),
    subtitle: me ? `Signed in as ${me.email}` : "",
    actions: ACTIONS,
    view: s.status !== "ready" ? "loading" : me ? "app" : "auth",
  };
}

const NO_AUTH: AuthState = {
  email: "",
  password: "",
  name: "",
  confirm: "",
  error: "",
  errors: {},
};

export function initialState(): OrbitState {
  const s = {
    status: "loading",
    error: "",
    db: emptyDb(),
    me: 0,
    now: NOW,
    view: "loading",
    screen: "wall",
    authView: "login",
    auth: NO_AUTH,
    navOpen: false,
    notice: "",
    groups: [],
    user: NO_USER,
    actions: ACTIONS,
    title: "Wall",
    subtitle: "",
    wall: MODULES.wall.initial(),
    blog: MODULES.blog.initial(),
    profile: MODULES.profile.initial(),
    photos: MODULES.photos.initial(),
    messages: MODULES.messages.initial(),
    communities: MODULES.communities.initial(),
    games: MODULES.games.initial(),
    music: MODULES.music.initial(),
    admin: MODULES.admin.initial(),
  } as OrbitState;
  return { ...s, ...deriveShell(s) };
}

export const initial: OrbitState = initialState();

// ---- applying an Update ----

/** Pure: the state after an update of a module, and the effects that write it. */
export function applyUpdate(
  state: OrbitState,
  key: SliceKey,
  u: Update,
  depth = 0,
): { state: OrbitState; effects: Effect[] } {
  let s: OrbitState = { ...state };
  const effects: Effect[] = [];
  const set = (patch: Partial<OrbitState>): void => {
    s = { ...s, ...patch };
  };
  if (u.slice) set({ [key]: { ...s[key], ...u.slice } } as Partial<OrbitState>);
  if (u.db) set({ db: { ...s.db, ...u.db } });
  let content = false;
  if (u.put) {
    let db = s.db;
    for (const t of Object.keys(u.put) as (keyof Db)[]) {
      const rows = u.put[t] as { id: number }[];
      if (!rows || rows.length === 0) continue;
      db = { ...db, [t]: upsert(db[t] as { id: number }[], rows) };
      effects.push(idbEffector.put(DB_NAME, t, rows, "dbFailed"));
      if (t !== "scores") content = true;
    }
    set({ db });
  }
  if (u.remove) {
    let db = s.db;
    for (const t of Object.keys(u.remove) as (keyof Db)[]) {
      const ids = u.remove[t] as number[];
      if (!ids || ids.length === 0) continue;
      db = { ...db, [t]: without(db[t] as { id: number }[], ids) };
      effects.push(idbEffector.remove(DB_NAME, t, ids, "dbFailed"));
    }
    set({ db });
  }
  if (u.replaceDb) {
    set({ db: u.replaceDb });
    effects.push(
      idbEffector.replaceAll(
        DB_NAME,
        u.replaceDb as unknown as Record<string, unknown[]>,
        "persisted",
        "dbFailed",
      ),
    );
  }
  if (content) set({ now: tick(s.now) });
  if (u.me !== undefined) {
    set({
      me: u.me,
      screen: u.me > 0 ? "wall" : s.screen,
      auth: NO_AUTH,
      authView: "login",
    });
    const row = [{ id: 1, userId: u.me }];
    if (u.me > 0) {
      set({ db: { ...s.db, session: row } });
      effects.push(idbEffector.put(DB_NAME, "session", row, "dbFailed"));
    } else {
      set({ db: { ...s.db, session: [] } });
      effects.push(idbEffector.remove(DB_NAME, "session", [1], "dbFailed"));
    }
  }
  if (u.go) {
    set({ screen: u.go.screen, navOpen: false });
    const entered = MODULES[u.go.screen].enter?.(u.go.params, s);
    if (entered && depth < 2) {
      const r = applyUpdate(s, u.go.screen, entered, depth + 1);
      s = r.state;
      effects.push(...r.effects);
    }
  }
  if (u.notice) effects.push(...notice(u.notice));
  if (u.effects) effects.push(...u.effects);
  if (depth === 0) {
    const shell = deriveShell(s);
    s = { ...s, ...shell };
    if (s.view === "app")
      s = { ...s, [s.screen]: MODULES[s.screen].derive(s) } as OrbitState;
  }
  return { state: s, effects };
}

/** The `store.set` effects that bring the store from `before` to `after`. */
export function diffEffects(before: OrbitState, after: OrbitState): Effect[] {
  const out: Effect[] = [];
  for (const k of Object.keys(after) as (keyof OrbitState)[]) {
    if (after[k] !== before[k]) out.push(store.set(k, after[k]));
  }
  return out;
}

export class OrbitSocial extends Component<OrbitState> {
  view = view;

  constructor() {
    super();
    // every handler of every module becomes the message `<key>.<name>`
    for (const mod of Object.values(MODULES)) {
      for (const [name, handler] of Object.entries(mod.handlers)) {
        (this as unknown as Record<string, unknown>)[`${mod.key}.${name}`] = (
          msg: Message,
          state: OrbitState,
        ): Effect[] => {
          const u = handler(msg.payload, msg.event, state);
          return u ? this._apply(state, mod.key, u) : [];
        };
      }
    }
  }

  _apply(state: OrbitState, key: SliceKey, u: Update): Effect[] {
    const r = applyUpdate(state, key, u);
    return [...diffEffects(state, r.state), ...r.effects];
  }

  /** A plain change of shell fields (no module involved). */
  _set(
    state: OrbitState,
    patch: Partial<OrbitState>,
    extra: Effect[] = [],
  ): Effect[] {
    let s = { ...state, ...patch } as OrbitState;
    s = { ...s, ...deriveShell(s) };
    if (s.view === "app" && (patch.screen || patch.me !== undefined))
      s = { ...s, [s.screen]: MODULES[s.screen].derive(s) } as OrbitState;
    return [...diffEffects(state, s), ...extra];
  }

  // ---- start: load the database, or seed it ----

  enter(_msg: Message, state: OrbitState): Effect[] {
    if (state.status === "ready") return [];
    return [
      idbEffector.load(DB_NAME, TABLES as string[], "loaded", "dbFailed"),
    ];
  }

  loaded(msg: Message, state: OrbitState): Effect[] {
    const { data, empty } = msg.payload as Loaded;
    if (empty) {
      const db = seedDb();
      return [
        ...this._set(state, { db, status: "ready" }),
        idbEffector.replaceAll(
          DB_NAME,
          db as unknown as Record<string, unknown[]>,
          "persisted",
          "dbFailed",
        ),
        ...notice("Sample data created in your browser"),
      ];
    }
    const db: Db = { ...emptyDb(), ...(data as unknown as Partial<Db>) };
    const me =
      db.users.find(
        (u) => u.id === db.session[0]?.userId && u.status === "active",
      )?.id ?? 0;
    return this._set(state, { db, status: "ready", me });
  }

  persisted(): Effect[] {
    return [];
  }

  dbFailed(msg: Message, state: OrbitState): Effect[] {
    const text = String(msg.payload ?? "the database failed");
    // without IndexedDB (a private window) Orbit still works on the sample data, for this visit
    if (state.status === "loading") {
      return [
        ...this._set(state, { db: seedDb(), status: "ready" }),
        ...notice(
          `IndexedDB is not available (${text}): your changes will not be kept`,
        ),
      ];
    }
    return notice(`Could not save: ${text}`);
  }

  // ---- shell ----

  "nav.go"(msg: Message, state: OrbitState): Effect[] {
    const screen = String(msg.payload) as Screen;
    if (!(screen in MODULES)) return [];
    return this._apply(state, screen, { go: { screen } });
  }
  "top.toggle"(_msg: Message, state: OrbitState): Effect[] {
    return [store.set("navOpen", !state.navOpen)];
  }
  closeNav(): Effect[] {
    return [store.set("navOpen", false)];
  }
  "top.dismiss"(): Effect[] {
    return [store.set("notice", "")];
  }
  clearNotice(): Effect[] {
    return [store.set("notice", "")];
  }
  "top.action"(msg: Message, state: OrbitState): Effect[] {
    return msg.payload === "logout"
      ? this._apply(state, "wall", { me: 0, notice: "Signed out" })
      : [];
  }

  // ---- sign in and registration ----

  authField(msg: Message, state: OrbitState): Effect[] {
    const field = String(msg.payload) as keyof AuthState;
    return this._set(state, {
      auth: {
        ...state.auth,
        [field]: msg.event?.value ?? "",
        error: "",
        errors: {},
      },
    });
  }

  authSwitch(msg: Message, state: OrbitState): Effect[] {
    return this._set(state, {
      authView: msg.payload === "register" ? "register" : "login",
      auth: NO_AUTH,
    });
  }

  authLogin(_msg: Message, state: OrbitState): Effect[] {
    const r = login(state.db, state.auth.email, state.auth.password);
    if (!r.ok)
      return this._set(state, { auth: { ...state.auth, error: r.error } });
    return this._apply(state, "wall", { me: r.userId, notice: "Welcome back" });
  }

  /** The demo buttons: fill in a user and sign in. */
  authDemo(msg: Message, state: OrbitState): Effect[] {
    const email =
      msg.payload === "admin"
        ? DEMO_ADMIN
        : (state.db.users.find(
            (u) => u.role === "user" && u.status === "active",
          )?.email ?? "");
    const r = login(state.db, email, DEMO_PASSWORD);
    return r.ok
      ? this._apply(state, "wall", {
          me: r.userId,
          notice: `Signed in as ${email}`,
        })
      : [];
  }

  authRegister(_msg: Message, state: OrbitState): Effect[] {
    const a = state.auth;
    const errors = checkRegistration(state.db, a);
    if (Object.keys(errors).length > 0)
      return this._set(state, { auth: { ...a, errors } });
    const user = newUser(state.db, a, state.now);
    return this._apply(state, "wall", {
      put: { users: [user] },
      me: user.id,
      notice: `Welcome to Orbit, ${user.name}`,
    });
  }
}

export const page = new OrbitSocial();
