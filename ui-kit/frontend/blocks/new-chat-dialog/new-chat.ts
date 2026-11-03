// The "new chat" dialog: pure helpers.
import {
  ME,
  type NewMode,
  type Person,
  validateNewChat,
} from "../conversation-list/chat.ts";
import { toggleIn } from "../mail-list/mail.ts";
import { hueOf, initialsOf } from "../msg-basics/msg-basics.ts";

export interface PersonRow {
  id: string;
  name: string;
  initials: string;
  hue: number;
  sub: string;
  online: boolean;
  picked: boolean;
}

/** Pure: a click on a person: direct chats keep one, groups toggle. */
export function pickPerson(
  mode: NewMode,
  picked: string[],
  id: string,
): string[] {
  if (mode === "direct") return picked.includes(id) ? [] : [id];
  return toggleIn(picked, id);
}

/** Pure: switching from a group to a direct chat keeps at most one person. */
export function changeMode(mode: NewMode, picked: string[]): string[] {
  return mode === "direct" ? picked.slice(0, 1) : picked;
}

/** Pure: the people to choose from (not you), filtered by the query. */
export function personRows(
  people: Person[],
  query: string,
  picked: string[],
): PersonRow[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return people
    .filter((p) => p.id !== ME)
    .filter((p) =>
      words.every((w) => `${p.name} ${p.status}`.toLowerCase().includes(w)),
    )
    .map((p) => ({
      id: p.id,
      name: p.name,
      initials: initialsOf(p.name),
      hue: hueOf(p.name),
      sub: p.status,
      online: p.online,
      picked: picked.includes(p.id),
    }));
}

export interface DialogView {
  rows: PersonRow[];
  error: string;
  canCreate: boolean;
  pickedCount: number;
  summary: string;
}

/** Pure: everything the dialog shows besides its inputs. */
export function dialogView(
  people: Person[],
  mode: NewMode,
  picked: string[],
  name: string,
  query: string,
): DialogView {
  const error = validateNewChat(mode, picked, name);
  return {
    rows: personRows(people, query, picked),
    error,
    canCreate: error === "",
    pickedCount: picked.length,
    summary:
      picked.length === 0
        ? "Nobody picked yet"
        : `${picked.length} ${picked.length === 1 ? "person" : "people"} picked`,
  };
}
