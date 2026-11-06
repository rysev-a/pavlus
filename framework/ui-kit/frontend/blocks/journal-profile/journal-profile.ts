import { Component, type Effect } from "@pavlus/frontend";
import { patch } from "../admin-shell/shell.ts";
import type { Post } from "../journal-entry/entry.ts";
import view from "./journal-profile.pavlus";
import {
  cardOf,
  type Profile,
  type ProfileCard,
  profileStats,
  type Stat,
} from "./profile.ts";

const base: Profile = {
  name: "Anna Wren",
  handle: "annawren",
  hue: 336,
  bio: "Translator by day, notebook hoarder by night. I write about weather, trams and the people I almost call.",
  location: "Lisbon",
  since: "March 2019",
};

const POSTS: Post[] = [
  "2026-10-29",
  "2026-10-30",
  "2026-10-31",
  "2026-11-02",
  "2026-11-03",
].map((iso, i) => ({
  id: `p${i}`,
  author: "anna",
  iso,
  time: "21:00",
  title: "Entry",
  body: "Some words about the day that went by, long enough to count for something in the statistics of a quiet writer.",
  mood: "calm",
  music: "",
  location: "",
  tags: [],
  privacy: "public" as const,
}));

export interface ProfileDemoState {
  profile: ProfileCard;
  stats: Stat[];
}

export const initial: ProfileDemoState = {
  profile: cardOf(base),
  stats: profileStats(POSTS, 12, 41, "2026-11-03"),
};

export class ProfilePage extends Component<ProfileDemoState> {
  view = view;

  "profile.shuffle"(_msg: unknown, state: ProfileDemoState): Effect[] {
    return patch({
      profile: { ...state.profile, hue: (state.profile.hue + 47) % 360 },
    });
  }
}

export const page = new ProfilePage();
