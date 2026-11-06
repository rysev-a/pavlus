// A conversation as the reading pane shows it: pure.
import { hueOf, initialsOf } from "../msg-basics/msg-basics.ts";
import {
  dateLabel,
  formatSize,
  fullDate,
  type Mail,
  recipientsLabel,
  stampOf,
  TODAY,
} from "../mail-list/mail.ts";

export interface Paragraph {
  text: string;
  quote: boolean;
}

/** Pure: a body cut into paragraphs; lines that start with `>` are quotes. */
export function paragraphsOf(body: string): Paragraph[] {
  const runs: { quote: boolean; lines: string[] }[] = [];
  let open = false; // is the last run still taking lines?
  for (const line of body.split("\n")) {
    if (line.trim() === "") {
      open = false;
      continue;
    }
    const quote = line.startsWith(">");
    const text = quote ? line.replace(/^>+\s?/, "") : line;
    const last = runs[runs.length - 1];
    if (open && last && last.quote === quote) last.lines.push(text);
    else runs.push({ quote, lines: [text] });
    open = true;
  }
  return runs.map((r) => ({ quote: r.quote, text: r.lines.join("\n") }));
}

/** Pure: the first words of a body, for a collapsed message. */
export function snippetOf(body: string, max = 90): string {
  const flat = body
    .split("\n")
    .filter((l) => !l.startsWith(">") && l.trim() !== "")
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

export interface ReaderMessage {
  id: string;
  from: string;
  email: string;
  initials: string;
  hue: number;
  recipients: string;
  date: string;
  short: string;
  paragraphs: Paragraph[];
  snippet: string;
  attachments: { id: string; name: string; sizeLabel: string }[];
  expanded: boolean;
  unread: boolean;
  own: boolean;
}

export interface ReaderThread {
  id: string;
  subject: string;
  labels: string[];
  starred: boolean;
  count: number;
  messages: ReaderMessage[];
  /** The message the reply buttons act on. */
  lastId: string;
  draft: boolean;
}

/** Pure: the messages to open when a thread is opened: the unread ones and the last. */
export function defaultExpanded(mails: Mail[], threadId: string): string[] {
  const list = mails
    .filter((m) => m.thread === threadId)
    .sort((a, b) => stampOf(a).localeCompare(stampOf(b)));
  if (list.length === 0) return [];
  const ids = list.filter((m) => !m.read).map((m) => m.id);
  const last = list[list.length - 1].id;
  return ids.includes(last) ? ids : [...ids, last];
}

/** Pure: the reading pane's view of a thread, oldest message first. */
export function threadView(
  mails: Mail[],
  threadId: string,
  me: string,
  expanded: string[],
  nameOf: (email: string) => string,
  today = TODAY,
): ReaderThread | null {
  const list = mails
    .filter((m) => m.thread === threadId)
    .sort((a, b) => stampOf(a).localeCompare(stampOf(b)));
  if (list.length === 0) return null;
  const first = list[0];
  return {
    id: threadId,
    subject: first.subject,
    labels: [...new Set(list.flatMap((m) => m.labels))],
    starred: list.some((m) => m.starred),
    count: list.length,
    lastId: list[list.length - 1].id,
    draft: list.every((m) => m.folder === "drafts"),
    messages: list.map((m) => ({
      id: m.id,
      from: m.from,
      email: m.email,
      initials: initialsOf(m.from),
      hue: hueOf(m.from),
      recipients: recipientsLabel(m, me, nameOf),
      date: fullDate(m.day, m.time, today),
      short: dateLabel(m.day, m.time, today),
      paragraphs: paragraphsOf(m.body),
      snippet: snippetOf(m.body),
      attachments: m.attachments.map((a) => ({
        id: a.id,
        name: a.name,
        sizeLabel: formatSize(a.size),
      })),
      expanded: expanded.includes(m.id) || list.length === 1,
      unread: !m.read,
      own: m.email === me,
    })),
  };
}
