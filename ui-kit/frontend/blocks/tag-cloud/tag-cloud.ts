import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import { patch } from "../admin-shell/shell.ts";
import { cloud, countTags, type CloudTag } from "./tags.ts";
import view from "./tag-cloud.pavlus";

export interface TagCloudState {
  counts: Record<string, number>;
  active: string;
  tags: CloudTag[];
  said: string;
}

const counts = countTags([
  ["walks", "autumn", "city"],
  ["autumn", "music", "city"],
  ["music", "vinyl"],
  ["work", "deadline", "coffee"],
  ["coffee", "city", "mornings"],
  ["mornings", "walks"],
  ["autumn", "walks", "family"],
  ["family", "cooking"],
  ["cooking", "autumn"],
  ["music", "city", "walks"],
]);

export const initial: TagCloudState = {
  counts,
  active: "",
  tags: cloud(counts, ""),
  said: "No tag chosen",
};

export class TagCloudPage extends Component<TagCloudState> {
  view = view;

  "cloud.pick"(msg: Message, state: TagCloudState): Effect[] {
    const tag = msg.payload as string;
    const active = tag === state.active ? "" : tag;
    return patch({
      active,
      tags: cloud(state.counts, active),
      said: active ? `Showing the entries tagged "${active}"` : "No tag chosen",
    });
  }
}

export const page = new TagCloudPage();
