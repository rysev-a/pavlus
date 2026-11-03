import type { Tone } from "../admin-shell/shell.ts";

export type ActivityKind =
  | "call"
  | "email"
  | "meeting"
  | "note"
  | "stage"
  | "won"
  | "lost"
  | "system"
  | "reply"
  | "visit";

export interface Activity {
  id: string;
  kind: ActivityKind;
  title: string;
  text: string;
  who: string;
  /** Already worded: `Today, 09:40` or `Oct 28`. */
  when: string;
}

export interface FeedItem extends Activity {
  icon: string;
  tone: Tone;
}

const LOOK: Record<ActivityKind, { icon: string; tone: Tone }> = {
  call: { icon: "k-rs-icon-phone", tone: "info" },
  email: { icon: "k-icon-mail", tone: "default" },
  meeting: { icon: "k-icon-calendar", tone: "warning" },
  note: { icon: "k-ai-edit", tone: "muted" },
  stage: { icon: "k-ai-flag", tone: "default" },
  won: { icon: "k-ai-dollar", tone: "success" },
  lost: { icon: "k-ai-alert", tone: "destructive" },
  system: { icon: "k-icon-bell", tone: "muted" },
  reply: { icon: "k-ai-arrow-left", tone: "info" },
  visit: { icon: "k-ai-home", tone: "warning" },
};

/** Pure: the list with the icon and the tone of each kind worked out. */
export function feedItems(list: Activity[]): FeedItem[] {
  return list.map((a) => ({ ...a, ...LOOK[a.kind] }));
}

/** Pure: an id that no activity of the list has (`a1`, `a2`...). */
export function nextActivityId(list: Activity[]): string {
  const max = list.reduce(
    (m, a) => Math.max(m, Number(a.id.replace(/\D/g, "")) || 0),
    0,
  );
  return `a${max + 1}`;
}

/** Pure: a new activity on top of the list (newest first). */
export function logActivity(
  list: Activity[],
  kind: ActivityKind,
  title: string,
  text: string,
  who: string,
  when: string,
): Activity[] {
  return [{ id: nextActivityId(list), kind, title, text, who, when }, ...list];
}
