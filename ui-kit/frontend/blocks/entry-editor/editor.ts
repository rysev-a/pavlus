import {
  PRIVACY,
  type Person,
  type Post,
  type Privacy,
  wordCount,
} from "../journal-entry/entry.ts";

/** What the form holds: strings, as typed. */
export interface Draft {
  title: string;
  body: string;
  /** Comma separated: `autumn, walks`. */
  tags: string;
  music: string;
  location: string;
  privacy: Privacy;
  mood: string;
}

export const emptyDraft = (): Draft => ({
  title: "",
  body: "",
  tags: "",
  music: "",
  location: "",
  privacy: "friends",
  mood: "",
});

export const MAX_TITLE = 80;
export const MIN_BODY = 40;
export const MAX_TAGS = 8;

/** Pure: `#Autumn, walks ,, autumn` becomes `["autumn", "walks"]`. */
export function parseTags(text: string): string[] {
  const seen: string[] = [];
  for (const raw of text.split(/[,\n]/)) {
    const tag = raw
      .trim()
      .replace(/^#+/, "")
      .toLowerCase()
      .replace(/\s+/g, "-");
    if (tag && !seen.includes(tag)) seen.push(tag);
  }
  return seen;
}

/** Pure: the errors of a draft by field (an empty object means it can be published). */
export function validateDraft(d: Draft): Record<string, string> {
  const errors: Record<string, string> = {};
  const title = d.title.trim();
  if (!title) errors.title = "Give the entry a title.";
  else if (title.length > MAX_TITLE) {
    errors.title = `A title is at most ${MAX_TITLE} characters (now ${title.length}).`;
  }
  const body = d.body.trim();
  if (!body) errors.body = "There is nothing to publish yet.";
  else if (body.length < MIN_BODY) {
    errors.body = `A little more, please: ${MIN_BODY - body.length} more characters.`;
  }
  if (parseTags(d.tags).length > MAX_TAGS) {
    errors.tags = `Use at most ${MAX_TAGS} tags.`;
  }
  if (!d.mood) errors.mood = "Pick a mood.";
  return errors;
}

/** Pure: the entry a draft becomes. */
export function postFromDraft(
  d: Draft,
  id: string,
  author: Person,
  iso: string,
  time: string,
): Post {
  return {
    id,
    author: author.id,
    iso,
    time,
    title: d.title.trim(),
    body: d.body.trim(),
    mood: d.mood,
    music: d.music.trim(),
    location: d.location.trim(),
    tags: parseTags(d.tags),
    privacy: d.privacy,
  };
}

/** Pure: the draft that edits an entry. */
export const draftOf = (p: Post): Draft => ({
  title: p.title,
  body: p.body,
  tags: p.tags.join(", "),
  music: p.music,
  location: p.location,
  privacy: p.privacy,
  mood: p.mood,
});

/** Pure: the next free entry id (`e12`). */
export function nextId(ids: string[]): string {
  const n = ids.reduce((m, id) => Math.max(m, Number(id.slice(1)) || 0), 0);
  return `e${n + 1}`;
}

export interface PrivacyChoice {
  id: Privacy;
  label: string;
  hint: string;
  active: boolean;
}

export const privacyChoices = (active: Privacy): PrivacyChoice[] =>
  PRIVACY.map((p) => ({
    id: p.id,
    label: p.label,
    hint: p.hint,
    active: p.id === active,
  }));

/** Pure: the line under the text box: `12 words`. */
export const counterOf = (body: string): string => {
  const n = wordCount(body);
  return `${n} ${n === 1 ? "word" : "words"}`;
};
