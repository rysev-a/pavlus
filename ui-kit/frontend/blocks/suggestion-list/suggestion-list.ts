import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import { patch } from "../admin-shell/shell.ts";
import { type Article, suggest, type Suggestion } from "./suggest.ts";
import view from "./suggestion-list.pavlus";

const ARTICLES: Article[] = [
  {
    id: "k1",
    title: "Export a report to CSV",
    snippet:
      "Choose a date range, press Export and download the file from the bell menu.",
    tag: "Reports",
    keywords: "download csv excel empty export",
  },
  {
    id: "k2",
    title: "Reset your password",
    snippet:
      "Use the link on the sign-in page. The email arrives within a minute.",
    tag: "Account",
    keywords: "login locked sign in email",
  },
  {
    id: "k3",
    title: "Change your billing plan",
    snippet:
      "Plans can be changed at any time from Settings, Billing. We prorate the difference.",
    tag: "Billing",
    keywords: "invoice upgrade downgrade payment",
  },
];

export interface SuggestionListState {
  query: string;
  items: Suggestion[];
  message: string;
}

export const initial: SuggestionListState = {
  query: "export csv",
  items: suggest(ARTICLES, "export csv"),
  message: "Type to search, or press Use in reply.",
};

export class SuggestionListPage extends Component<SuggestionListState> {
  view = view;

  "kb.search"(msg: Message): Effect[] {
    const query = msg.event?.value ?? "";
    return patch({ query, items: suggest(ARTICLES, query) });
  }

  "kb.use"(msg: Message): Effect[] {
    const found = ARTICLES.find((a) => a.id === msg.payload);
    return patch({ message: found ? `Would insert "${found.title}".` : "" });
  }
}

export const page = new SuggestionListPage();
