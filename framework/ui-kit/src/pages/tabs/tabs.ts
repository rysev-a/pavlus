import { Component, type Effect, type Message } from "@pavlus/client";
import { storeEffector as store } from "@pavlus/client/plugins";
import view from "./tabs.pavlus";

export interface Tab {
  id: string;
  title: string;
  /** What `aria-selected` reads: "true" or "false". */
  sel: string;
}

export interface TabsState {
  active: string;
  /** What the panes read of `active` (no comparisons in templates). */
  isAccount: boolean;
  isPassword: boolean;
  tabs: Tab[];
}

const TABS = [
  { id: "account", title: "Account" },
  { id: "password", title: "Password" },
  { id: "billing", title: "Billing" },
];

/** Pure: the tabs with their flags for the active one. */
const tabsOf = (active: string): Tab[] =>
  TABS.map((t) => ({ ...t, sel: t.id === active ? "true" : "false" }));

export const initial: TabsState = {
  active: "account",
  isAccount: true,
  isPassword: false,
  tabs: tabsOf("account"),
};

export class Tabs extends Component<TabsState> {
  view = view;

  select(msg: Message): Effect[] {
    const active = String(msg.payload);
    return [
      store.set("active", active),
      store.set("isAccount", active === "account"),
      store.set("isPassword", active === "password"),
      store.set("tabs", tabsOf(active)),
    ];
  }
}

export const page = new Tabs();
