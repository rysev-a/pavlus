import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import { storeEffector as store } from "@service-laboratory/pavlus/plugins";
import { compact } from "../feed-post/feed-post.ts";
import view from "./trend-list.pavlus";

export interface Topic {
  id: string;
  tag: string;
  posts: number;
}

/** Pure: the topics, most posts first, ranked from 1. */
export function trendRows(list: Topic[], activeId: string, unit = "posts") {
  return [...list]
    .sort((a, b) => b.posts - a.posts)
    .map((t, i) => ({
      id: t.id,
      rank: i + 1,
      tag: t.tag,
      sub: `${compact(t.posts)} ${unit}`,
      active: t.id === activeId,
    }));
}

const TOPICS: Topic[] = [
  { id: "t1", tag: "#streetfood", posts: 2410 },
  { id: "t2", tag: "#mural", posts: 980 },
  { id: "t3", tag: "#sundayride", posts: 5320 },
  { id: "t4", tag: "#sourdough", posts: 1180 },
];

export interface TrendState {
  activeId: string;
  trends: { title: string; items: ReturnType<typeof trendRows> };
}

const trends = (activeId: string) => ({
  title: "Trending now",
  items: trendRows(TOPICS, activeId),
});

export const initial: TrendState = { activeId: "", trends: trends("") };

export class TrendListPage extends Component<TrendState> {
  view = view;

  "trends.pick"(msg: Message): Effect[] {
    const id = msg.payload as string;
    return [store.set("activeId", id), store.set("trends", trends(id))];
  }
}

export const page = new TrendListPage();
