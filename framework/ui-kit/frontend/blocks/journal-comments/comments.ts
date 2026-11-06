import { initials } from "../admin-shell/shell.ts";

export interface Comment {
  id: string;
  entryId: string;
  author: string;
  hue: number;
  text: string;
  /** Already worded: `2 days ago`. */
  when: string;
}

export interface CommentCard {
  id: string;
  author: string;
  initials: string;
  hue: number;
  text: string;
  when: string;
}

export const MAX_COMMENT = 500;

/** Pure: why a comment cannot be sent, or an empty string. */
export function validateComment(text: string): string {
  const t = text.trim();
  if (!t) return "Write something first.";
  if (t.length < 2) return "That is a bit short.";
  if (t.length > MAX_COMMENT) {
    return `Too long: ${t.length} of ${MAX_COMMENT} characters.`;
  }
  return "";
}

/** Pure: the comments of one entry, oldest first (the list is kept in order). */
export const commentsOf = (list: Comment[], entryId: string): Comment[] =>
  list.filter((c) => c.entryId === entryId);

/** Pure: how many comments each entry has. */
export function commentCounts(list: Comment[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const c of list) counts[c.entryId] = (counts[c.entryId] ?? 0) + 1;
  return counts;
}

/** Pure: the list with a new comment at the end. */
export function addComment(
  list: Comment[],
  entryId: string,
  author: string,
  hue: number,
  text: string,
  when = "just now",
): Comment[] {
  const n = list.reduce((m, c) => Math.max(m, Number(c.id.slice(1)) || 0), 0);
  return [
    ...list,
    { id: `c${n + 1}`, entryId, author, hue, text: text.trim(), when },
  ];
}

export const cardOf = (c: Comment): CommentCard => ({
  id: c.id,
  author: c.author,
  initials: initials(c.author),
  hue: c.hue,
  text: c.text,
  when: c.when,
});
