// The template's CRM, routed: every screen has an address, the links are real
// links, the database is on the server and a failed load can be retried.
import type { Effect, Message } from "@pavlus/frontend";
import {
  routerEffector as router,
  storeEffector as store,
} from "@pavlus/frontend/plugins";
import { notice } from "../../../framework/ui-kit/frontend/blocks/admin-shell/shell.ts";
import { initialTable } from "../../../framework/ui-kit/frontend/blocks/crud-table/table.ts";
import {
  idbEffector,
  type Loaded,
} from "../../../framework/ui-kit/frontend/idb.ts";
import { ENTITIES } from "../../../framework/ui-kit/frontend/templates/phone-retail-crm/entities.ts";
import {
  type CrmState,
  DB_NAME,
  PhoneRetailCrm,
  setScreenHrefs,
  initialState as templateState,
} from "../../../framework/ui-kit/frontend/templates/phone-retail-crm/phone-retail-crm.ts";
import type { Db } from "../../../framework/ui-kit/frontend/templates/phone-retail-crm/snapshot-bridge.ts";
import { titleEffector } from "../frontend/title.ts";
import { DEFAULT_PATH, parsePath, pathOfScreen, titleOf } from "./routes.ts";

/** The CRM state, and what the routing adds to it. */
export type RoutedCrmState = CrmState & {
  /** the form to open once the database is loaded (a deep link): its row id, 0 for a new one, -1 for none */
  pendingEdit: number;
};

const go = (url: string, replace = false): Effect =>
  router.navigate(url, { absolute: true, replace });

const dbOf = (effects: Effect[]): Db | undefined =>
  (
    effects.find(
      (e) => e.plugin === "store" && (e as { path?: unknown }).path === "db",
    ) as { value?: Db } | undefined
  )?.value;

const tables = (): string[] => ENTITIES.map((e) => e.key as string);

export class RoutedCrm extends PhoneRetailCrm {
  /** The router activated the page (or only its address changed). */
  enter(msg: Message, s: CrmState): Effect[] {
    const state = s as RoutedCrmState;
    const path = (msg.payload as { path?: string } | undefined)?.path ?? "/";
    if (path === "/") return [go(DEFAULT_PATH, true)];
    const place = parsePath(path);
    const title = titleEffector.set(titleOf(path));
    if (!place) return [title];
    const effects: Effect[] = [title];
    const sameScreen = state.screen === place.screen;
    if (state.status !== "ready") {
      // first visit (or a retry): the screen is chosen now, the data comes after
      effects.push(
        ...this._commit(
          state,
          {
            screen: place.screen,
            mode: "list",
            table: initialTable(sortKeyOf(place.screen)),
          },
          {
            pendingEdit: place.mode === "form" ? place.id : -1,
          } as Partial<CrmState>,
        ),
        ...super.enter(msg, state),
      );
      return effects;
    }
    if (!sameScreen)
      effects.push(
        ...super["nav.go"]({ id: "nav.go", payload: place.screen }, state),
      );
    if (place.mode === "list") {
      if (sameScreen && state.mode === "form")
        effects.push(...super["form.cancel"](msg, state));
    } else {
      const base = sameScreen ? state : afterNav(state, place.screen);
      effects.push(...this._open(base, place.id));
    }
    return effects;
  }

  loaded(msg: Message, s: CrmState): Effect[] {
    const state = s as RoutedCrmState;
    const effects = super.loaded(msg, state);
    if (state.pendingEdit < 0) return effects;
    const db = dbOf(effects) ?? (msg.payload as Loaded).data;
    const ready = { ...state, db: db as Db, status: "ready" as const };
    return [
      ...effects,
      ...this._open(ready, state.pendingEdit),
      store.set("pendingEdit", -1),
    ];
  }

  /** A failed load is a screen of its own (error and Retry), not the sample data. */
  dbFailed(msg: Message, s: CrmState): Effect[] {
    const text = String(msg.payload ?? "the database failed");
    if (s.status !== "ready") {
      return this._commit(s, { status: "failed" }, { error: text });
    }
    return notice(`Could not save: ${text}`);
  }

  retry(_msg: Message, s: CrmState): Effect[] {
    return [
      ...this._commit(s, { status: "loading" }, { error: "" }),
      idbEffector.load(DB_NAME, tables(), "loaded", "dbFailed"),
    ];
  }

  // ---- the links of the template go through the address bar ----

  "nav.go"(msg: Message, s: CrmState): Effect[] {
    return [go(pathOfScreen(String(msg.payload)))];
  }

  "table.add"(_msg: Message, s: CrmState): Effect[] {
    return [go(`${pathOfScreen(s.screen)}/new`)];
  }

  "table.edit"(msg: Message, s: CrmState): Effect[] {
    return [go(`${pathOfScreen(s.screen)}/${Number(msg.payload)}`)];
  }

  "form.cancel"(msg: Message, s: CrmState): Effect[] {
    return [go(pathOfScreen(s.screen))];
  }

  "form.save"(msg: Message, s: CrmState): Effect[] {
    const effects = super["form.save"](msg, s);
    // saved (a put went out) and not refused by the validation: back to the list
    return effects.some((e) => e.plugin === "idb")
      ? [...effects, go(pathOfScreen(s.screen))]
      : effects;
  }

  confirmYes(msg: Message, s: CrmState): Effect[] {
    const effects = super.confirmYes(msg, s);
    return s.mode === "form" && effects.length
      ? [...effects, go(pathOfScreen(s.screen), true)]
      : effects;
  }
}

/** What `nav.go` leaves behind, for the next step of the same message. */
const afterNav = (state: CrmState, screen: string): CrmState => ({
  ...state,
  screen,
  mode: "list",
  editId: 0,
  draft: {},
  errors: {},
  pickedShop: "",
  table: initialTable(sortKeyOf(screen), state.table.pageSize),
});

const sortKeyOf = (screen: string): string =>
  ENTITIES.find((e) => e.screen === screen)?.sortKey ?? "";

/** Links of the navigation point at the real addresses. */
export function useRealLinks(): void {
  setScreenHrefs(pathOfScreen);
}

export function initialCrm(): RoutedCrmState {
  useRealLinks();
  return { ...templateState(), pendingEdit: -1 };
}

export const crm = new RoutedCrm();
