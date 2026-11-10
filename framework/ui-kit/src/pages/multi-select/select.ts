import { Component, type Effect, type Message } from "@pavlus/client";
import {
  httpEffector as http,
  storeEffector as store,
  timeEffector as time,
} from "@pavlus/client/plugins";
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

/** A row of the menu with the attributes the template reads. */
export interface ViewRow extends Row {
  /** `data-active` when the row is highlighted. */
  activeAttr: string | null;
  /** `aria-selected` of the row. */
  selectedAttr: string;
  /** `aria-disabled` of the row. */
  disabledAttr: string | null;
}

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
  rows: ViewRow[];
  empty: boolean;
  emptyText: string;
  loading: boolean;
  failed: boolean;
  note: string;
  hasSelection: boolean;
  selectedText: string;
  openAttr: string | null;
  expanded: string;
  invalidAttr: string | null;
  inputPlaceholder: string;
  // derived from `size` (fixed per instance, see `selectState`)
  isSm: boolean;
  isLg: boolean;
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
  | "open"
  | "placeholder"
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
  const loading = core.status === "loading";
  const failed = core.status === "failed";
  const hasSelection = core.selected.length > 0;
  const rows: ViewRow[] = rowsOf(shown, core.selected, core.active).map(
    (r) => ({
      ...r,
      activeAttr: r.active ? "true" : null,
      selectedAttr: r.selected ? "true" : "false",
      disabledAttr: r.disabled ? "true" : null,
    }),
  );
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
    hasSelection,
    selectedText: core.selected.map((o) => o.label).join(", ") || "nothing",
    openAttr: core.open ? "true" : null,
    expanded: core.open ? "true" : "false",
    invalidAttr: core.message ? "true" : null,
    inputPlaceholder: hasSelection ? "" : core.placeholder,
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
  open: s.open,
  placeholder: s.placeholder,
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
    open: base.open ?? false,
    placeholder: base.placeholder,
  };
  return {
    size: "md",
    url: "",
    ...base,
    ...core,
    ...derive(core),
    isSm: (base.size ?? "md") === "sm",
    isLg: (base.size ?? "md") === "lg",
  };
}

/** A multi-select: type to search, arrows and Enter to pick, chips to remove. */
export class MultiSelect extends Component<SelectState> {
  view = view;

  openList(_msg: Message, state: SelectState): Effect[] {
    const ask =
      state.kind === "async" && state.status === "idle"
        ? this._ask({ ...state, open: true }, "")
        : [];
    return [...this._commit(state, { open: true }), ...ask];
  }

  close(_msg: Message, state: SelectState): Effect[] {
    return this._commit(state, { open: false, message: "" });
  }

  /** Typing: filter at once (sync), or wait for a pause and ask (async). */
  type(msg: Message, state: SelectState): Effect[] {
    const query = msg.event?.value ?? "";
    if (state.kind === "sync") {
      return this._commit(state, {
        query,
        active: -1,
        message: "",
        open: true,
      });
    }
    return [
      ...this._commit(state, {
        query,
        status: "loading",
        message: "",
        open: true,
      }),
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
      return this._commit(state, {
        active: moveActive(state.active, key === "ArrowDown" ? 1 : -1, shown),
        open: true,
      });
    }
    if (key === "Enter") {
      const option = shown[state.active];
      return option
        ? this.toggle({ id: "toggle", payload: option.id }, state)
        : [];
    }
    if (key === "Escape") return this.close(msg, state);
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
  _commit(state: SelectState, change: Partial<Core>): Effect[] {
    const core: Core = { ...coreOf(state), ...change };
    return Object.entries({ ...core, ...derive(core) }).map(([k, v]) =>
      store.set(k, v),
    );
  }
}
