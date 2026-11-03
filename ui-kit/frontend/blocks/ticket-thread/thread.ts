import { initials } from "../admin-shell/shell.ts";

export type Side = "customer" | "agent" | "note";

export interface ThreadMessage {
  id: string;
  side: Side;
  who: string;
  text: string;
  /** Already worded: `Today, 09:12`. */
  when: string;
}

export interface Bubble extends ThreadMessage {
  initials: string;
  /** `Internal note` for a note, empty for the others. */
  label: string;
}

/** Pure: the bubbles of a conversation, oldest first. */
export function bubbles(list: ThreadMessage[]): Bubble[] {
  return list.map((m) => ({
    ...m,
    initials: initials(m.who),
    label: m.side === "note" ? "Internal note" : "",
  }));
}

/** Pure: the conversation with one more message at the end. */
export function appendMessage(
  list: ThreadMessage[],
  side: Side,
  who: string,
  text: string,
  when: string,
): ThreadMessage[] {
  const max = list.reduce(
    (m, x) => Math.max(m, Number(x.id.replace(/\D/g, "")) || 0),
    0,
  );
  return [...list, { id: `m${max + 1}`, side, who, text: text.trim(), when }];
}
