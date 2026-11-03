import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import {
  httpEffector as http,
  storeEffector as store,
  timeEffector as time,
} from "@service-laboratory/pavlus/plugins";
import {
  firstEnabled,
  matches,
  moveActive,
  type Option,
  type Row,
  rowsOf,
  toggle,
} from "../../lib/multiselect.ts";
import view from "./view.pavlus";

/** The most rows an async answer shows; the rest is "Showing 8 of 31". */
export const PAGE = 8;
/** How long typing must pause before the options are requested. */
export const DEBOUNCE_MS = 250;

export interface SelectState {
  uid: string;
  label: string;
  placeholder: string;
  size: "sm" | "md" | "lg";
  /** 0 = no limit. */
  max: number;
  /** `sync`: every option is here and filtered as you type. `async`: asked of `url` as you type. */
  kind: "sync" | "async";
  url: string;
  open: boolean;
  query: string;
  selected: Option[];
  active: number;
  /** sync: all the options. async: the rows of the last answer. */
  options: Option[];
  status: "idle" | "loading" | "ready" | "failed";
  /** async: how many options matched, of which `PAGE` are shown. */
  total: number;
  message: string;
  // derived (see `derive`)
  rows: Row[];
  empty: boolean;
  emptyText: string;
  loading: boolean;
  failed: boolean;
  note: string;
  hasSelection: boolean;
  selectedText: string;
}

type Core = Pick<
  SelectState,
  | "kind"
  | "options"
  | "query"
  | "selected"
  | "active"
  | "status"
  | "total"
  | "max"
  | "message"
>;

/** The options the menu shows: a sync list is filtered here, an async one already was. */
export function shownOf(core: Core): Option[] {
  return core.kind === "sync"
    ? core.options.filter((o) => matches(o, core.query))
    : core.options;
}

/** Pure: everything on screen that follows from the core. */
export function derive(core: Core) {
  const shown = shownOf(core);
  const rows = rowsOf(shown, core.selected, core.active);
  const loading = core.status === "loading";
  const failed = core.status === "failed";
  return {
    rows,
    empty: rows.length === 0,
    emptyText: loading
      ? "Searching..."
      : failed
        ? "The options could not be loaded."
        : core.query.trim()
          ? `No results for "${core.query.trim()}"`
          : "No options",
    loading,
    failed,
    note:
      core.kind === "async" && !loading && core.total > rows.length
        ? `Showing ${rows.length} of ${core.total}: keep typing to narrow it down`
        : "",
    hasSelection: core.selected.length > 0,
    selectedText: core.selected.map((o) => o.label).join(", ") || "nothing",
  };
}

const coreOf = (s: SelectState): Core => ({
  kind: s.kind,
  options: s.options,
  query: s.query,
  selected: s.selected,
  active: s.active,
  status: s.status,
  total: s.total,
  max: s.max,
  message: s.message,
});

export function selectState(
  base: Pick<SelectState, "uid" | "label" | "placeholder" | "kind"> &
    Partial<SelectState>,
): SelectState {
  const core: Core = {
    kind: base.kind,
    options: base.options ?? [],
    query: "",
    selected: base.selected ?? [],
    active: -1,
    status: base.kind === "sync" ? "ready" : "idle",
    total: 0,
    max: base.max ?? 0,
    message: "",
  };
  return {
    size: "md",
    url: "",
    open: false,
    ...base,
    ...core,
    ...derive(core),
  };
}

/** A multi-select: type to search, arrows and Enter to pick, chips to remove. */
export class MultiSelect extends Component<SelectState> {
  view = view;

  openList(_msg: Message, state: SelectState): Effect[] {
    return [
      store.set("open", true),
      ...(state.kind === "async" && state.status === "idle"
        ? this._ask(state, "")
        : []),
    ];
  }

  close(): Effect[] {
    return [store.set("open", false), store.set("message", "")];
  }

  /** Typing: filter at once (sync), or wait for a pause and ask (async). */
  type(msg: Message, state: SelectState): Effect[] {
    const query = msg.event?.value ?? "";
    if (state.kind === "sync") {
      return this._commit(
        state,
        { query, active: -1, message: "" },
        { open: true },
      );
    }
    return [
      ...this._commit(
        state,
        { query, status: "loading", message: "" },
        { open: true },
      ),
      time.setTimeout("search", DEBOUNCE_MS, "searchFire", query),
    ];
  }

  searchFire(msg: Message, state: SelectState): Effect[] {
    return this._request(state, String(msg.payload ?? ""));
  }

  /** The answer: the options that match the query as it is now, the first `PAGE` of them. */
  loaded(msg: Message, state: SelectState): Effect[] {
    const data = (msg.payload as { data: Option[] }).data;
    const all = (Array.isArray(data) ? data : []).filter((o) =>
      matches(o, state.query),
    );
    const options = all.slice(0, PAGE);
    return this._commit(state, {
      options,
      total: all.length,
      status: "ready",
      active: firstEnabled(options),
    });
  }

  failed(_msg: Message, state: SelectState): Effect[] {
    return this._commit(state, { status: "failed" });
  }

  retry(_msg: Message, state: SelectState): Effect[] {
    return this._ask(state, state.query);
  }

  toggle(msg: Message, state: SelectState): Effect[] {
    const option = shownOf(coreOf(state)).find((o) => o.id === msg.payload);
    if (!option) return [];
    const next = toggle(state.selected, option, state.max);
    return this._commit(state, {
      selected: next.selected,
      message: next.full ? `You can pick up to ${state.max}.` : "",
      // a sync list starts over after a pick; an async one keeps its search
      ...(state.kind === "sync" ? { query: "", active: -1 } : {}),
    });
  }

  remove(msg: Message, state: SelectState): Effect[] {
    return this._commit(state, {
      selected: state.selected.filter((o) => o.id !== msg.payload),
      message: "",
    });
  }

  clear(_msg: Message, state: SelectState): Effect[] {
    return this._commit(state, { selected: [], message: "" });
  }

  /** Under the pointer is the highlighted row, like under the arrow keys. */
  hoverRow(msg: Message, state: SelectState): Effect[] {
    const i = shownOf(coreOf(state)).findIndex((o) => o.id === msg.payload);
    return i === state.active ? [] : this._commit(state, { active: i });
  }

  /** The keys of the search box: arrows, Enter, Escape, Backspace on an empty box. */
  key(msg: Message, state: SelectState): Effect[] {
    const key = msg.event?.key;
    const shown = shownOf(coreOf(state));
    if (key === "ArrowDown" || key === "ArrowUp") {
      return this._commit(
        state,
        {
          active: moveActive(state.active, key === "ArrowDown" ? 1 : -1, shown),
        },
        { open: true },
      );
    }
    if (key === "Enter") {
      const option = shown[state.active];
      return option
        ? this.toggle({ id: "toggle", payload: option.id }, state)
        : [];
    }
    if (key === "Escape") return this.close();
    if (key === "Backspace" && !state.query && state.selected.length > 0) {
      return this.remove(
        { id: "remove", payload: state.selected.at(-1)!.id },
        state,
      );
    }
    return [];
  }

  /** The page leaves: nothing is left running. */
  leave(): Effect[] {
    return [time.cancel("search"), http.cancel("options")];
  }

  /** The first request, and a retry: at once, no debounce. */
  _ask(state: SelectState, query: string): Effect[] {
    return [
      ...this._commit(state, { query, status: "loading" }),
      ...this._request(state, query),
    ];
  }

  _request(state: SelectState, query: string): Effect[] {
    return [
      http.request({
        id: "options",
        url: `${state.url}?q=${encodeURIComponent(query)}`,
        onSuccess: "loaded",
        onError: "failed",
      }),
    ];
  }

  /** The change, then everything derived from the new core. */
  _commit(
    state: SelectState,
    change: Partial<Core>,
    extra: Partial<Pick<SelectState, "open">> = {},
  ): Effect[] {
    const core: Core = { ...coreOf(state), ...change };
    return Object.entries({ ...core, ...derive(core), ...extra }).map(
      ([k, v]) => store.set(k, v),
    );
  }
}
