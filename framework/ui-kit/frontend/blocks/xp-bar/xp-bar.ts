import { Component, type Effect, type Message } from "@pavlus/frontend";
import { storeEffector as store } from "@pavlus/frontend/plugins";
import { type XpProps, xpProps } from "./xp.ts";
import view from "./xp-bar.pavlus";

export interface XpBarState {
  xp: number;
  bar: XpProps;
  fresh: XpProps;
}

export const initial: XpBarState = {
  xp: 120,
  bar: xpProps(120, 4),
  fresh: xpProps(0, 0),
};

export class XpBarPage extends Component<XpBarState> {
  view = view;

  gain(msg: Message, state: XpBarState): Effect[] {
    const xp = state.xp + (msg.payload as number);
    return [store.set("xp", xp), store.set("bar", xpProps(xp, 4))];
  }

  resetXp(): Effect[] {
    return [store.set("xp", 120), store.set("bar", xpProps(120, 4))];
  }
}

export const page = new XpBarPage();
