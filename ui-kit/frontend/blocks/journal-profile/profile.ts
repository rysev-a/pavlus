import { initials } from "../admin-shell/shell.ts";
import { dayNumber } from "../month-archive/dates.ts";
import { wordCount, type Post } from "../journal-entry/entry.ts";

export interface Profile {
  name: string;
  handle: string;
  hue: number;
  bio: string;
  location: string;
  /** `March 2019` */
  since: string;
}

export interface Stat {
  label: string;
  value: string;
}

/** Pure: the longest run of consecutive days with an entry. */
export function longestStreak(dates: string[]): number {
  const days = [...new Set(dates.map(dayNumber))].sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  days.forEach((d, i) => {
    run = i > 0 && d === days[i - 1] + 1 ? run + 1 : 1;
    best = Math.max(best, run);
  });
  return best;
}

/** Pure: the streak that ends on `today` or the day before (0 when broken). */
export function currentRun(dates: string[], today: string): number {
  const days = new Set(dates.map(dayNumber));
  let d = dayNumber(today);
  if (!days.has(d)) d -= 1;
  let run = 0;
  while (days.has(d)) {
    run += 1;
    d -= 1;
  }
  return run;
}

const group = (n: number): string =>
  String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** Pure: the numbers on a profile, from the entries of the person. */
export function profileStats(
  posts: Post[],
  friends: number,
  comments: number,
  today: string,
): Stat[] {
  const dates = posts.map((p) => p.iso);
  return [
    { label: "Entries", value: group(posts.length) },
    {
      label: "Words written",
      value: group(posts.reduce((n, p) => n + wordCount(p.body), 0)),
    },
    { label: "Days written", value: group(new Set(dates).size) },
    { label: "Longest streak", value: `${longestStreak(dates)} days` },
    { label: "Writing now", value: `${currentRun(dates, today)} days` },
    { label: "Friends", value: group(friends) },
    { label: "Comments", value: group(comments) },
  ];
}

/** A profile as the view wants it: the initials are worked out. */
export interface ProfileCard extends Profile {
  initials: string;
}

export const cardOf = (p: Profile): ProfileCard => ({
  ...p,
  initials: initials(p.name),
});
