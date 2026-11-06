import { Component, type Effect, type Message } from "@pavlus/frontend";
import { storeEffector as store } from "@pavlus/frontend/plugins";
import view from "./admin-shell.pavlus";
import {
  type NavGroup,
  notice,
  patch,
  type ShellAction,
  type ShellUser,
  titleOf,
} from "./shell.ts";

export interface AdminShellState {
  open: boolean;
  active: string;
  title: string;
  notice: string;
  groups: NavGroup[];
  actions: ShellAction[];
  user: ShellUser;
}

export const initial: AdminShellState = {
  open: false,
  active: "overview",
  title: "Overview",
  notice: "",
  groups: [
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
  ],
  actions: [
    { id: "new", label: "New order", icon: "k-icon-plus", variant: "default" },
  ],
  user: { name: "Ann Lee", role: "Administrator", initials: "AL" },
};

export class AdminShellPage extends Component<AdminShellState> {
  view = view;

  "nav.go"(msg: Message, state: AdminShellState): Effect[] {
    const id = msg.payload as string;
    return patch({
      active: id,
      title: titleOf(state.groups, id),
      open: false,
    });
  }

  "top.toggle"(_msg: Message, state: AdminShellState): Effect[] {
    return [store.set("open", !state.open)];
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
    return [store.set("open", false)];
  }
}

export const page = new AdminShellPage();
