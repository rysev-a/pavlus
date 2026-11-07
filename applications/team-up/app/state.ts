/**
 * The application state and its shape. This is data, only data: the views
 * render it, the handlers replace it through the store, and it never holds
 * components or DOM nodes — so the same state renders on the server and in
 * the browser. Each page owns one slice of it, the route included.
 */

import type { Route } from "@pavlus/frontend";

/** What `GET /api/auth/me` answers (or null: a guest). */
export interface Me {
  id: number;
  email: string;
  name: string;
  slug: string;
  city: string;
  status: string;
}

/** One open slot of the match feed, with its computed match. */
export interface FeedItem {
  slotId: number;
  projectSlug: string;
  projectName: string;
  tagline: string;
  kind: string;
  owner: string;
  profession: string;
  bucket: string;
  match: {
    percent: number | null;
    gradeOk: boolean;
    details: string[];
    note: string;
  } | null;
  myBucket: string | null;
}

/** One slot of a project page. */
export interface Slot {
  id: number;
  profession: string;
  bucket: string;
  description: string;
  pay: string | null;
  userId: number | null;
  userName: string | null;
  skills: { name: string; level: number }[];
}

/** One project, as `GET /api/projects/:slug` answers. */
export interface Project {
  id: number;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  kind: string;
  owner: string;
  ownerId: number;
  slots: Slot[];
}

/** One chat thread of the inbox. */
export interface Thread {
  id: number;
  type: string;
  projectId: number | null;
  title: string;
  unread: number;
}

/** One chat message (over http or the live ws frame). */
export interface ChatMessage {
  id: number;
  threadId: number;
  userId: number;
  author: string;
  body: string;
  sentAt: string;
}

/** The public profile page. */
export interface Profile {
  userId: number;
  slug: string;
  name: string;
  city: string;
  bio: string;
  status: string;
  professions: { slug: string; name: string; bucket: string | null }[];
  skills: { slug: string; name: string; level: number | null }[];
}

export interface AppState {
  /** Where we are; null until the router plugin reports it. */
  route: Route | null;
  /** Who is signed in; null until asked, `false` while asking. */
  me: Me | null | false;
  /** The shell: the avatar dropdown's open flag. */
  shell: { menu: boolean };
  /** The login page (`/login`): the form's values and its last error. */
  login: {
    email: string;
    password: string;
    error: string;
    busy: boolean;
  };
  /** The feed page (`/`). */
  feed: {
    items: FeedItem[];
    status: "idle" | "loading" | "failed";
  };
  /** A project page (`/projects/:slug`). */
  project: {
    slug: string;
    data: Project | null;
    status: "idle" | "loading" | "failed";
    applied: boolean;
  };
  /** The chat page (`/chat`). */
  chat: {
    threads: Thread[];
    /** The open thread's messages, oldest first. */
    messages: ChatMessage[];
    /** The open thread's id (0: the inbox list only). */
    open: number;
    /** The open thread's title (the chat header shows it). */
    openTitle: string;
    /** The ws connection: "" down, "connecting", "live". */
    live: "" | "connecting" | "live";
    /** What the composer holds. */
    draft: string;
  };
  /** A public profile (`/people/:slug`). */
  profile: {
    slug: string;
    data: Profile | null;
  };
}

export const initialState: AppState = {
  route: null,
  me: false,
  shell: { menu: false },
  login: {
    email: "bob@team.up",
    password: "teamup123",
    error: "",
    busy: false,
  },
  feed: { items: [], status: "idle" },
  project: { slug: "", data: null, status: "idle", applied: false },
  chat: {
    threads: [],
    messages: [],
    open: 0,
    openTitle: "",
    live: "",
    draft: "",
  },
  profile: { slug: "", data: null },
};
