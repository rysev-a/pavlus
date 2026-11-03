import { Component, type Children } from "@service-laboratory/pavlus";
import {
  type DocsState,
  docsLayout,
  docsState,
} from "../../blocks/docs-layout/docs-layout.ts";
import type { NavLink } from "../../blocks/site-nav/site-nav.ts";
import { PAGES } from "./content.ts";
import view from "./documentation-wiki.pavlus";

export interface WikiState {
  nav: NavLink[];
  docs: DocsState;
}

export const initial: WikiState = {
  nav: [
    { label: "Docs", href: "#top" },
    { label: "Releases", href: "#top" },
    { label: "Community", href: "#top" },
  ],
  docs: docsState("Fennel", "v2.1", PAGES),
};

/** The docs layout keeps the menu, the search and the page; this page only frames it. */
export class DocumentationWiki extends Component<WikiState> {
  view = view;
  children: Children<WikiState> = {
    docs: { component: docsLayout, key: "docs" },
  };
}

export const page = new DocumentationWiki();
