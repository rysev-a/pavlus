import { Component } from "@pavlus/frontend";
import { compact } from "../feed-post/feed-post.ts";
import view from "./rep-badge.pavlus";

export interface Tier {
  /** The least points of the tier. */
  from: number;
  tier: number;
  emoji: string;
  label: string;
}

export const TIERS: Tier[] = [
  { from: 0, tier: 0, emoji: "🌱", label: "Newcomer" },
  { from: 100, tier: 1, emoji: "🌿", label: "Regular" },
  { from: 500, tier: 2, emoji: "⭐", label: "Trusted" },
  { from: 1500, tier: 3, emoji: "🏆", label: "Expert" },
  { from: 5000, tier: 4, emoji: "👑", label: "Legend" },
];

export interface BadgeProps {
  emoji: string;
  label: string;
  tier: number;
  points: string;
}

/** Pure: the tier of a number of points (negative counts as 0). */
export function tierOf(points: number): Tier {
  let found = TIERS[0] as Tier;
  for (const t of TIERS) if (points >= t.from) found = t;
  return found;
}

/** Pure: the badge of a member; a moderator is shown as such, with no tier. */
export function badgeOf(
  points: number,
  moderator = false,
  showPoints = true,
): BadgeProps {
  if (moderator) return { emoji: "🛡️", label: "Moderator", tier: 6, points: "" };
  const t = tierOf(points);
  return {
    emoji: t.emoji,
    label: t.label,
    tier: t.tier,
    points: showPoints ? compact(Math.max(0, points)) : "",
  };
}

export interface RepBadgeState {
  badges: BadgeProps[];
}

export const initial: RepBadgeState = {
  badges: [
    badgeOf(12),
    badgeOf(240),
    badgeOf(870),
    badgeOf(2300),
    badgeOf(7800),
    badgeOf(0, true),
  ],
};

export class RepBadgePage extends Component<RepBadgeState> {
  view = view;
}

export const page = new RepBadgePage();
