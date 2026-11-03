import { Component } from "@service-laboratory/pavlus";
import view from "./site-nav.pavlus";

export interface NavLink {
  label: string;
  href: string;
}

export interface SiteNavState {
  links: NavLink[];
  none: NavLink[];
}

export const initial: SiteNavState = {
  links: [
    { label: "Features", href: "#features" },
    { label: "Pricing", href: "#pricing" },
    { label: "Docs", href: "#docs" },
  ],
  none: [],
};

/** Only data: the page has no messages of its own. */
export class SiteNavPage extends Component<SiteNavState> {
  view = view;
}

export const page = new SiteNavPage();
