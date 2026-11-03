import { Component } from "@service-laboratory/pavlus";
import { initial as listInitial } from "../../blocks/link-list/link-list.ts";
import view from "./links-hub.pavlus";

export interface LinksHubState {
  name: string;
  handle: string;
  bio: string;
  links: (typeof listInitial.links)[number][];
  socials: { label: string; href: string }[];
}

export const initial: LinksHubState = {
  name: "Ann Lee",
  handle: "@annlee",
  bio: "Frontend developer. I write about pure functions and build small tools for the web.",
  links: [
    {
      title: "My blog",
      note: "Notes on pure functions",
      href: "https://example.com/blog",
    },
    {
      title: "Latest project",
      note: "A music practice tool",
      href: "https://example.com/music",
    },
    {
      title: "Talks and slides",
      note: "Conferences and meetups",
      href: "https://example.com/talks",
    },
    {
      title: "Newsletter",
      note: "Once a month, no spam",
      href: "https://example.com/news",
    },
    {
      title: "Book a call",
      note: "30 minutes, free",
      href: "https://example.com/call",
    },
  ],
  socials: [
    { label: "GitHub", href: "https://github.com" },
    { label: "Mastodon", href: "https://mastodon.social" },
    { label: "LinkedIn", href: "https://linkedin.com" },
    { label: "YouTube", href: "https://youtube.com" },
  ],
};

/** Only data: the page has no messages of its own. */
export class LinksHub extends Component<LinksHubState> {
  view = view;
}

export const page = new LinksHub();
