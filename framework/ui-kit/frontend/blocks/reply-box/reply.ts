export interface Canned {
  id: string;
  label: string;
  text: string;
}

export interface StatusOption {
  value: string;
  label: string;
  selected: boolean;
}

/** Pure: the options of a status select with one chosen. */
export function statusOptions(
  choices: [string, string][],
  selected: string,
): StatusOption[] {
  return choices.map(([value, label]) => ({
    value,
    label,
    selected: value === selected,
  }));
}

/** Pure: a canned reply inserted into the draft (on a new line when there is text). */
export function insertCanned(
  draft: string,
  canned: Canned[],
  id: string,
  name: string,
): string {
  const found = canned.find((c) => c.id === id);
  if (!found) return draft;
  const text = found.text.replace("{name}", name);
  return draft.trim() ? `${draft.replace(/\s+$/, "")}\n\n${text}` : text;
}

/** Pure: what is wrong with a reply before it is sent. */
export function replyError(draft: string): string {
  const text = draft.trim();
  if (!text) return "Write something first.";
  if (text.length < 4) return "That is too short to send.";
  return "";
}
