import { Component } from "@service-laboratory/pavlus";
import view from "./link-list.pavlus";

export interface LinkItem {
  title: string;
  note: string;
  href: string;
}

export interface LinkListState {
  links: LinkItem[];
}

export const initial: LinkListState = {
  links: [
    {
      title: "Blog",
      note: "Notes on pure functions",
      href: "https://example.com/blog",
    },
    {
      title: "GitHub",
      note: "Code and experiments",
      href: "https://github.com/rysev-a",
    },
    {
      title: "Newsletter",
      note: "Once a month, no spam",
      href: "https://example.com/news",
    },
  ],
};

/** Only data: the page has no messages of its own. */
export class LinkListPage extends Component<LinkListState> {
  view = view;
}

export const page = new LinkListPage();
