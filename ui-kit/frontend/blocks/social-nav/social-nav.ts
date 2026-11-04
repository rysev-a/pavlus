import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import { storeEffector as store } from "@service-laboratory/pavlus/plugins";
import view from "./social-nav.pavlus";

export interface Tab {
  id: string;
  label: string;
  glyph: string;
  badge: number;
}

export interface TabRow extends Tab {
  active: boolean;
}

export interface NavProps {
  brand: string;
  mark: string;
  meInitials: string;
  meActive: boolean;
  items: TabRow[];
}

/** Pure: the props of the view; `current` is a tab id, or "me". */
export function navProps(
  brand: string,
  tabs: Tab[],
  current: string,
  meInitials = "YO",
): NavProps {
  return {
    brand,
    mark: brand.slice(0, 1).toUpperCase(),
    meInitials,
    meActive: current === "me",
    items: tabs.map((t) => ({ ...t, active: t.id === current })),
  };
}

const TABS: Tab[] = [
  { id: "home", label: "Home", glyph: "home", badge: 0 },
  { id: "people", label: "People", glyph: "users", badge: 2 },
  { id: "messages", label: "Messages", glyph: "message", badge: 5 },
  { id: "alerts", label: "Alerts", glyph: "bell", badge: 0 },
];

export interface SocialNavState {
  current: string;
  nav: NavProps;
}

export const initial: SocialNavState = {
  current: "home",
  nav: navProps("Hello", TABS, "home"),
};

export class SocialNavPage extends Component<SocialNavState> {
  view = view;

  _go(id: string): Effect[] {
    return [
      store.set("current", id),
      store.set("nav", navProps("Hello", TABS, id)),
    ];
  }

  "nav.go"(msg: Message): Effect[] {
    return this._go(msg.payload as string);
  }
  "nav.home"(): Effect[] {
    return this._go("home");
  }
  "nav.me"(): Effect[] {
    return this._go("me");
  }
}

export const page = new SocialNavPage();
