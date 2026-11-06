import { Component, type Effect, type Message } from "@pavlus/frontend";
import { storeEffector as store } from "@pavlus/frontend/plugins";
import view from "./thread-row.pavlus";

export interface ThreadItem {
  id: string;
  title: string;
  name: string;
  category: string;
  emoji: string;
  score: number;
  replies: number;
  views: number;
  /** Hours since it was posted (for sorting); `ago` is its label. */
  hours: number;
  ago: string;
  pinned: boolean;
  locked: boolean;
  solved: boolean;
  hidden: boolean;
}

export type ThreadSort = "new" | "top" | "unanswered";

/** Pure: pinned threads first, then the chosen order (stable, new = fewer hours). */
export function sortThreads(
  list: ThreadItem[],
  sort: ThreadSort,
): ThreadItem[] {
  const pool = sort === "unanswered" ? list.filter(isUnanswered) : list;
  const by =
    sort === "top"
      ? (a: ThreadItem, b: ThreadItem) => b.score - a.score
      : (a: ThreadItem, b: ThreadItem) => a.hours - b.hours;
  return [...pool].sort(
    (a, b) => Number(b.pinned) - Number(a.pinned) || by(a, b),
  );
}

/** Pure: no replies yet and not solved. */
export const isUnanswered = (t: ThreadItem): boolean =>
  t.replies === 0 && !t.solved;

const SAMPLE: ThreadItem[] = [
  {
    id: "t1",
    title: "Read this first: how to ask a good question",
    name: "Dana Cruz",
    category: "Meta",
    emoji: "📌",
    score: 58,
    replies: 3,
    views: 4200,
    hours: 900,
    ago: "5 weeks ago",
    pinned: true,
    locked: true,
    solved: false,
    hidden: false,
  },
  {
    id: "t2",
    title: "Memory keeps growing after every route change",
    name: "Sam Whitfield",
    category: "Help",
    emoji: "🛟",
    score: 12,
    replies: 4,
    views: 310,
    hours: 3,
    ago: "3h ago",
    pinned: false,
    locked: false,
    solved: true,
    hidden: false,
  },
  {
    id: "t3",
    title: "Spam: buy followers cheap",
    name: "bot4412",
    category: "Help",
    emoji: "🛟",
    score: -6,
    replies: 0,
    views: 12,
    hours: 6,
    ago: "6h ago",
    pinned: false,
    locked: false,
    solved: false,
    hidden: true,
  },
];

export interface ThreadRowState {
  threads: ThreadItem[];
  last: string;
}

export const initial: ThreadRowState = {
  threads: sortThreads(SAMPLE, "new"),
  last: "Nothing opened yet.",
};

export class ThreadRowPage extends Component<ThreadRowState> {
  view = view;

  "row.open"(msg: Message, state: ThreadRowState): Effect[] {
    const t = state.threads.find((x) => x.id === msg.payload);
    return [store.set("last", t ? `Opened: ${t.title}` : "")];
  }
}

export const page = new ThreadRowPage();
