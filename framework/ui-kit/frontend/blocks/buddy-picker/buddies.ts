import { initials } from "../admin-shell/shell.ts";

export interface Buddy {
  id: string;
  name: string;
  role: string;
  team: string;
  /** How many newcomers they look after already. */
  mentees: number;
  /** Away on these days: shown, but cannot be chosen. */
  away?: string;
}

export const MAX_MENTEES = 2;

export interface BuddyRow {
  id: string;
  name: string;
  initials: string;
  line: string;
  load: string;
  full: boolean;
  chosen: boolean;
  away: boolean;
  label: string;
}

/** Pure: a buddy is free when they have room and are not away. */
export const isFree = (b: Buddy): boolean => b.mentees < MAX_MENTEES && !b.away;

/** Pure: who is chosen after a click: the same buddy again clears the choice. */
export function choose(current: string, id: string): string {
  return current === id ? "" : id;
}

/**
 * Pure: the rows. The chosen buddy counts as one more mentee unless they
 * already looked after this newcomer (`had`).
 */
export function buddyRows(
  buddies: Buddy[],
  chosen: string,
  had = "",
): BuddyRow[] {
  return buddies.map((b) => {
    const isChosen = b.id === chosen;
    const mentees = b.mentees + (isChosen && b.id !== had ? 1 : 0);
    const away = Boolean(b.away);
    const full = !isChosen && !isFree(b);
    return {
      id: b.id,
      name: b.name,
      initials: initials(b.name),
      line: `${b.role}, ${b.team}`,
      load: away
        ? `Away ${b.away}`
        : mentees === 0
          ? "No newcomers yet"
          : `${mentees} ${mentees === 1 ? "newcomer" : "newcomers"}`,
      full,
      chosen: isChosen,
      away,
      label: isChosen ? "Chosen" : full ? (away ? "Away" : "Full") : "Choose",
    };
  });
}
