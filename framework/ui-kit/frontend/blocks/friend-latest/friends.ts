import { initials } from "../admin-shell/shell.ts";
import { excerptOf, type Person, type Post } from "../journal-entry/entry.ts";
import { relativeDay } from "../month-archive/dates.ts";
import { moodOf } from "../mood-picker/moods.ts";

export interface FriendCard {
  id: string;
  name: string;
  initials: string;
  hue: number;
  handle: string;
  hasPost: boolean;
  postId: string;
  title: string;
  excerpt: string;
  when: string;
  moodEmoji: string;
  music: string;
  /** The entry was not opened yet. */
  fresh: boolean;
}

const stamp = (p: Post): string => `${p.iso} ${p.time}`;

/** Pure: the newest entry of a person that a friend may read (not private). */
export function latestVisible(posts: Post[], author: string): Post | undefined {
  return posts
    .filter((p) => p.author === author && p.privacy !== "private")
    .sort((a, b) => stamp(b).localeCompare(stamp(a)))[0];
}

/** Pure: the friends with their latest entry, the freshest friend first. */
export function friendCards(
  friends: Person[],
  posts: Post[],
  today: string,
  seen: string[],
): FriendCard[] {
  return friends
    .map((f) => {
      const post = latestVisible(posts, f.id);
      return {
        id: f.id,
        name: f.name,
        initials: initials(f.name),
        hue: f.hue,
        handle: f.handle,
        hasPost: post !== undefined,
        postId: post?.id ?? "",
        title: post?.title ?? "",
        excerpt: post ? excerptOf(post.body, 150) : "No public entries yet.",
        when: post ? relativeDay(post.iso, today) : "",
        moodEmoji: post ? moodOf(post.mood).emoji : "",
        music: post?.music ?? "",
        fresh: post !== undefined && !seen.includes(post.id),
        sort: post ? stamp(post) : "",
      };
    })
    .sort((a, b) => b.sort.localeCompare(a.sort))
    .map(({ sort: _sort, ...card }) => card);
}
