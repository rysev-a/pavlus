import { Component, type Effect, type Message } from "@pavlus/frontend";
import { storeEffector as store } from "@pavlus/frontend/plugins";
import view from "./tabs.pavlus";

export interface TabsState {
  active: string;
  tabs: { id: string; title: string }[];
}

export const initial: TabsState = {
  active: "account",
  tabs: [
    { id: "account", title: "Account" },
    { id: "password", title: "Password" },
    { id: "billing", title: "Billing" },
  ],
};

export class Tabs extends Component<TabsState> {
  view = view;

  select(msg: Message): Effect[] {
    return [store.set("active", msg.payload)];
  }
}

export const page = new Tabs();
