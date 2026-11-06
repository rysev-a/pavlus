import { Component, type Effect, type Message } from "@pavlus/frontend";
import { storeEffector as store } from "@pavlus/frontend/plugins";
import { compact, initialsOf } from "../feed-post/feed-post.ts";
import view from "./profile-header.pavlus";

export interface Stat {
  label: string;
  value: string;
}

export interface HeaderProps {
  id: string;
  name: string;
  handle: string;
  initials: string;
  tone: number;
  cover: number;
  square: boolean;
  headline: string;
  bio: string;
  place: string;
  verified: boolean;
  stats: Stat[];
  primaryLabel: string;
  primaryDone: boolean;
  secondaryLabel: string;
}

/** Pure: the three counters of a person; the follower one follows `following`. */
export function personStats(
  posts: number,
  followers: number,
  following: number,
): Stat[] {
  return [
    { label: "posts", value: compact(posts) },
    { label: "followers", value: compact(followers) },
    { label: "following", value: compact(following) },
  ];
}

/** Pure: the follower count after a click on follow or unfollow. */
export const followers = (base: number, following: boolean): number =>
  base + (following ? 1 : 0);

/** Pure: the header of a person. */
export function personHeader(p: {
  id: string;
  name: string;
  handle: string;
  tone: number;
  headline: string;
  bio: string;
  place: string;
  posts: number;
  followers: number;
  followingCount: number;
  following: boolean;
  isMe: boolean;
}): HeaderProps {
  return {
    id: p.id,
    name: p.name,
    handle: p.handle,
    initials: initialsOf(p.name),
    tone: p.tone,
    cover: ((p.tone + 1) % 5) + 1,
    square: false,
    headline: p.headline,
    bio: p.bio,
    place: p.place,
    verified: false,
    stats: personStats(
      p.posts,
      followers(p.followers, p.following),
      p.followingCount,
    ),
    primaryLabel: p.isMe
      ? "Edit profile"
      : p.following
        ? "Following"
        : "Follow",
    primaryDone: !p.isMe && p.following,
    secondaryLabel: p.isMe ? "" : "Message",
  };
}

export interface HeaderState {
  following: boolean;
  following2: boolean;
  person: HeaderProps;
  company: HeaderProps;
}

const PERSON = {
  id: "maya",
  name: "Maya Ortiz",
  handle: "maya",
  tone: 1,
  headline: "Muralist and illustrator",
  bio: "Painting big walls and small zines in Valencia. Commissions open for spring.",
  place: "Valencia, Spain",
  posts: 212,
  followers: 3480,
  followingCount: 291,
  isMe: false,
};

const companyOf = (following: boolean): HeaderProps => ({
  id: "lumo",
  name: "Lumo Studio",
  handle: "",
  initials: "💡",
  tone: 4,
  cover: 2,
  square: true,
  headline: "Product design for small teams",
  bio: "A 24 person studio making apps people keep. We hire designers and engineers twice a year.",
  place: "Lisbon, Portugal",
  verified: true,
  stats: [
    { label: "followers", value: compact(12400 + (following ? 1 : 0)) },
    { label: "employees", value: "24" },
    { label: "open roles", value: "3" },
  ],
  primaryLabel: following ? "Following" : "Follow",
  primaryDone: following,
  secondaryLabel: "",
});

export const initial: HeaderState = {
  following: false,
  following2: false,
  person: personHeader({ ...PERSON, following: false }),
  company: companyOf(false),
};

export class ProfileHeaderPage extends Component<HeaderState> {
  view = view;

  "person.primary"(_msg: Message, state: HeaderState): Effect[] {
    const following = !state.following;
    return [
      store.set("following", following),
      store.set("person", personHeader({ ...PERSON, following })),
    ];
  }

  "company.primary"(_msg: Message, state: HeaderState): Effect[] {
    const following2 = !state.following2;
    return [
      store.set("following2", following2),
      store.set("company", companyOf(following2)),
    ];
  }
}

export const page = new ProfileHeaderPage();
