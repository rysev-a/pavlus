import { initials } from "../admin-shell/shell.ts";
import { longDate } from "../month-archive/dates.ts";
import { moodOf } from "../mood-picker/moods.ts";

export type Privacy = "public" | "friends" | "private";

export interface Person {
  id: string;
  name: string;
  /** The userpic colour: a hue, 0 to 359. */
  hue: number;
  handle: string;
}

/** A diary entry as it is stored. */
export interface Post {
  id: string;
  /** The id of its author (a `Person`). */
  author: string;
  /** `2026-11-03` */
  iso: string;
  /** `21:40` */
  time: string;
  title: string;
  /** Paragraphs are separated by a blank line. */
  body: string;
  /** A mood id (see moods.ts), or empty. */
  mood: string;
  /** What the author is listening to, or empty. */
  music: string;
  location: string;
  tags: string[];
  privacy: Privacy;
}

/** An entry as the view shows it. */
export interface EntryCard {
  id: string;
  title: string;
  dateText: string;
  time: string;
  authorName: string;
  initials: string;
  hue: number;
  moodEmoji: string;
  moodLabel: string;
  music: string;
  location: string;
  tags: string[];
  privacy: Privacy;
  privacyLabel: string;
  privacyTone: "success" | "info" | "muted";
  paragraphs: string[];
  excerpt: string;
  truncated: boolean;
  comments: number;
  commentsText: string;
  minutes: number;
  minutesText: string;
}

export const PRIVACY: {
  id: Privacy;
  label: string;
  hint: string;
  tone: "success" | "info" | "muted";
}[] = [
  {
    id: "public",
    label: "Public",
    hint: "Anyone can read it",
    tone: "success",
  },
  { id: "friends", label: "Friends", hint: "Only your friends", tone: "info" },
  { id: "private", label: "Private", hint: "Only you", tone: "muted" },
];

/** Pure: the paragraphs of a body (a blank line between them). */
export function paragraphsOf(body: string): string[] {
  return body
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

export function wordCount(body: string): number {
  return body.split(/\s+/).filter(Boolean).length;
}

/** Pure: minutes to read a text (about 200 words a minute, at least 1). */
export const readingMinutes = (body: string): number =>
  Math.max(1, Math.ceil(wordCount(body) / 200));

/** Pure: the start of a body, cut at a word, with an ellipsis when cut. */
export function excerptOf(body: string, max = 220): string {
  const flat = paragraphsOf(body).join(" ");
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > 40 ? cut.slice(0, space) : cut).replace(/[\s,;:.-]+$/, "")}…`;
}

const plural = (n: number, one: string, many: string): string =>
  `${n} ${n === 1 ? one : many}`;

/** Pure: the view of one entry. */
export function entryCard(
  post: Post,
  author: Person,
  comments: number,
): EntryCard {
  const mood = moodOf(post.mood);
  const privacy = PRIVACY.find((p) => p.id === post.privacy) ?? PRIVACY[0];
  const excerpt = excerptOf(post.body);
  const minutes = readingMinutes(post.body);
  return {
    id: post.id,
    title: post.title,
    dateText: longDate(post.iso),
    time: post.time,
    authorName: author.name,
    initials: initials(author.name),
    hue: author.hue,
    moodEmoji: mood.emoji,
    moodLabel: mood.label,
    music: post.music,
    location: post.location,
    tags: post.tags,
    privacy: post.privacy,
    privacyLabel: privacy.label,
    privacyTone: privacy.tone,
    paragraphs: paragraphsOf(post.body),
    excerpt,
    truncated: excerpt !== paragraphsOf(post.body).join(" "),
    comments,
    commentsText: plural(comments, "comment", "comments"),
    minutes,
    minutesText: `${minutes} min read`,
  };
}
