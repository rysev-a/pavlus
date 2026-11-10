import { Component, type Effect, type Message } from "@pavlus/client";
import { storeEffector as store } from "@pavlus/client/plugins";
import view from "./admin-shell.pavlus";
import {
  type NavGroup,
  type NavProps,
  navProps,
  notice,
  patch,
  type ShellAction,
  type ShellUser,
  titleOf,
} from "./shell.ts";

const BRAND = "Acme";
const TAGLINE = "Back office";
const USER: ShellUser = {
  name: "Ann Lee",
  role: "Administrator",
  initials: "AL",
};

const GROUPS: NavGroup[] = [
  {
    title: "Workspace",
    items: [
      { id: "overview", label: "Overview", icon: "k-ai-home" },
      { id: "orders", label: "Orders", icon: "k-ai-cart", badge: "12" },
      { id: "customers", label: "Customers", icon: "k-ai-users" },
    ],
  },
  {
    title: "System",
    items: [
      { id: "reports", label: "Reports", icon: "k-ai-chart" },
      { id: "settings", label: "Settings", icon: "k-icon-settings" },
    ],
  },
];

const ACTIONS: ShellAction[] = [
  { id: "new", label: "New order", icon: "k-icon-plus", variant: "default" },
];

/** The sidebar's props for the open view. */
const navOf = (groups: NavGroup[], active: string): NavProps =>
  navProps(BRAND, TAGLINE, groups, active, USER);

export interface AdminShellState {
  open: boolean;
  /** The frame's `data-nav` (from `open`): the drawer's state. */
  navData: "open" | "closed";
  active: string;
  title: string;
  notice: string;
  groups: NavGroup[];
  /** The sidebar's props (from `groups` and `active`). */
  nav: NavProps;
  actions: ShellAction[];
  user: ShellUser;
}

export const initial: AdminShellState = {
  open: false,
  navData: "closed",
  active: "overview",
  title: "Overview",
  notice: "",
  groups: GROUPS,
  nav: navOf(GROUPS, "overview"),
  actions: ACTIONS,
  user: USER,
};

export class AdminShellPage extends Component<AdminShellState> {
  view = view;

  "nav.go"(msg: Message, state: AdminShellState): Effect[] {
    const id = msg.payload as string;
    return patch({
      active: id,
      title: titleOf(state.groups, id),
      open: false,
      navData: "closed",
      nav: navOf(state.groups, id),
    });
  }

  "top.toggle"(_msg: Message, state: AdminShellState): Effect[] {
    const open = !state.open;
    return patch({ open, navData: open ? "open" : "closed" });
  }

  "top.action"(): Effect[] {
    return notice("The order was created");
  }

  "top.dismiss"(): Effect[] {
    return [store.set("notice", "")];
  }

  clearNotice(): Effect[] {
    return [store.set("notice", "")];
  }

  close(): Effect[] {
    return patch({ open: false, navData: "closed" });
  }
}

export const page = new AdminShellPage();
