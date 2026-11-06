import { Component, type Effect, type Message } from "@pavlus/frontend";
import { storeEffector as store } from "@pavlus/frontend/plugins";
import { FILTERS, type Filter, type View } from "../mail-list/mail.ts";
import view from "./mail-toolbar.pavlus";

export interface BulkButton {
  /** An `Action` of mail.ts. */
  id: string;
  name: string;
  icon: string;
}

/** Pure: the bulk buttons that make sense in a view. */
export function bulkButtons(view: View): BulkButton[] {
  const read: BulkButton[] = [
    { id: "read", name: "Mark read", icon: "k-mi-mail-open" },
    { id: "unread", name: "Mark unread", icon: "k-icon-mail" },
  ];
  if (view === "trash") {
    return [
      { id: "inbox", name: "Restore", icon: "k-mi-refresh" },
      { id: "delete", name: "Delete forever", icon: "k-mi-trash" },
    ];
  }
  if (view === "spam") {
    return [
      ...read,
      { id: "inbox", name: "Not spam", icon: "k-mi-inbox" },
      { id: "trash", name: "Delete", icon: "k-mi-trash" },
    ];
  }
  if (view === "sent" || view === "drafts") {
    return [...read, { id: "trash", name: "Delete", icon: "k-mi-trash" }];
  }
  return [
    ...read,
    { id: "archive", name: "Archive", icon: "k-mi-archive" },
    { id: "trash", name: "Delete", icon: "k-mi-trash" },
    { id: "spam", name: "Report spam", icon: "k-mi-spam" },
  ];
}

/** Pure: where a conversation can be moved from a view (not to itself). */
export function moveTargets(view: View): { id: string; name: string }[] {
  if (view === "sent" || view === "drafts" || view === "trash") return [];
  return [
    { id: "inbox", name: "Inbox" },
    { id: "archive", name: "Archive" },
    { id: "spam", name: "Spam" },
    { id: "trash", name: "Trash" },
  ].filter((t) => t.id !== view);
}

/** Pure: `3 selected` or `12 conversations`. */
export function toolbarLabel(selected: number, total: number): string {
  if (selected > 0) return `${selected} selected`;
  return `${total} ${total === 1 ? "conversation" : "conversations"}`;
}

export interface FilterChip {
  id: Filter;
  name: string;
  active: boolean;
}

export const filterChips = (current: Filter): FilterChip[] =>
  FILTERS.map((f) => ({ ...f, active: f.id === current }));

export interface ToolbarState {
  query: string;
  filters: FilterChip[];
  selectedCount: number;
  total: number;
  label: string;
  allSelected: boolean;
  moveOpen: boolean;
  buttons: BulkButton[];
  targets: { id: string; name: string }[];
  last: string;
}

export const initial: ToolbarState = {
  query: "",
  filters: filterChips("all"),
  selectedCount: 0,
  total: 12,
  label: toolbarLabel(0, 12),
  allSelected: false,
  moveOpen: false,
  buttons: bulkButtons("inbox"),
  targets: moveTargets("inbox"),
  last: "",
};

export class MailToolbarPage extends Component<ToolbarState> {
  view = view;

  "bar.setQuery"(msg: Message): Effect[] {
    return [store.set("query", msg.event?.value ?? "")];
  }

  "bar.clear"(): Effect[] {
    return [store.set("query", "")];
  }

  "bar.filter"(msg: Message): Effect[] {
    return [
      store.set("filters", filterChips(msg.payload as Filter)),
      store.set("last", `Filter: ${msg.payload}`),
    ];
  }

  "bar.selectAll"(_msg: Message, s: ToolbarState): Effect[] {
    const n = s.allSelected ? 0 : s.total;
    return [
      store.set("allSelected", !s.allSelected),
      store.set("selectedCount", n),
      store.set("label", toolbarLabel(n, s.total)),
    ];
  }

  "bar.toggleMove"(_msg: Message, s: ToolbarState): Effect[] {
    return [store.set("moveOpen", !s.moveOpen)];
  }

  "bar.bulk"(msg: Message): Effect[] {
    return [store.set("last", `Bulk action: ${msg.payload}`)];
  }

  "bar.moveTo"(msg: Message): Effect[] {
    return [
      store.set("moveOpen", false),
      store.set("last", `Moved to ${msg.payload}`),
    ];
  }
}

export const page = new MailToolbarPage();
