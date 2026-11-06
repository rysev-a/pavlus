// The model of a mail client and everything about it that is pure: folders,
// threads, counts, search, filters, bulk actions and dates. Shared by the mail
// blocks and the Web Mail Panel template. Dates are plain strings
// (`2026-11-03`, `09:12`), so nothing reads a clock.

export type Folder = "inbox" | "sent" | "drafts" | "spam" | "trash" | "archive";

export interface Attachment {
  id: string;
  name: string;
  /** In bytes. */
  size: number;
}

export interface Mail {
  id: string;
  /** Messages with the same `thread` are one conversation. */
  thread: string;
  /** The display name of the sender. */
  from: string;
  /** The sender's address. */
  email: string;
  to: string[];
  cc: string[];
  subject: string;
  body: string;
  /** `2026-11-03`. */
  day: string;
  /** `09:12`. */
  time: string;
  folder: Folder;
  read: boolean;
  starred: boolean;
  labels: string[];
  attachments: Attachment[];
}

/** What the list can show: a folder, the starred mail, or a label (`label:Work`). */
export type View = Folder | "starred" | `label:${string}`;

export type Filter = "all" | "unread" | "starred" | "attachments";

export const FILTERS: { id: Filter; name: string }[] = [
  { id: "all", name: "All" },
  { id: "unread", name: "Unread" },
  { id: "starred", name: "Starred" },
  { id: "attachments", name: "With files" },
];

export const TODAY = "2026-11-03";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Pure: the weekday of `2026-11-03` as `Tue`. */
export function weekdayOf(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/** Pure: `2026-11-02` → `Nov 2` (with the year when it is not the year of `today`). */
export function shortDay(day: string, today = TODAY): string {
  const [y, m, d] = day.split("-").map(Number);
  const base = `${MONTHS[m - 1]} ${d}`;
  return y === Number(today.slice(0, 4)) ? base : `${base}, ${y}`;
}

/** Pure: the date in a list: the time for today, else `Nov 2`. */
export function dateLabel(day: string, time: string, today = TODAY): string {
  return day === today ? time : shortDay(day, today);
}

/** Pure: the date above a message: `Mon, Nov 2, 09:12`. */
export function fullDate(day: string, time: string, today = TODAY): string {
  return `${weekdayOf(day)}, ${shortDay(day, today)}, ${time}`;
}

/** Pure: sortable stamp of a message. */
export const stampOf = (m: { day: string; time: string }): string =>
  `${m.day} ${m.time}`;

/** Pure: `1536` → `1.5 KB`, `2400000` → `2.3 MB`. */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 102.4) / 10} KB`;
  return `${Math.round(bytes / (1024 * 102.4)) / 10} MB`;
}

/** Pure: is the message part of what a view shows? */
export function inView(m: Mail, view: View): boolean {
  if (view === "starred") {
    return m.starred && m.folder !== "trash" && m.folder !== "spam";
  }
  if (view.startsWith("label:")) {
    return (
      m.labels.includes(view.slice(6)) &&
      m.folder !== "trash" &&
      m.folder !== "spam"
    );
  }
  return m.folder === view;
}

/** Pure: every word of the query is somewhere in the message. */
export function matchesQuery(m: Mail, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay =
    `${m.from} ${m.email} ${m.subject} ${m.body} ${m.labels.join(" ")} ${m.attachments.map((a) => a.name).join(" ")}`.toLowerCase();
  return words.every((w) => hay.includes(w));
}

export interface Thread {
  id: string;
  /** The newest message the view shows. */
  latest: Mail;
  /** How many messages of the thread the view shows. */
  count: number;
  unread: number;
  starred: boolean;
  attachments: boolean;
  /** The labels of every message, once. */
  labels: string[];
}

/**
 * Pure: the conversations a view shows, newest first. A thread is listed when
 * one of its messages is in the view; the query and the filter apply to it.
 */
export function threadsOf(
  mails: Mail[],
  view: View,
  query = "",
  filter: Filter = "all",
): Thread[] {
  const groups = new Map<string, Mail[]>();
  for (const m of mails) {
    if (!inView(m, view)) continue;
    const list = groups.get(m.thread);
    if (list) list.push(m);
    else groups.set(m.thread, [m]);
  }
  const out: Thread[] = [];
  for (const [id, list] of groups) {
    if (query.trim() && !list.some((m) => matchesQuery(m, query))) continue;
    const sorted = [...list].sort((a, b) =>
      stampOf(b).localeCompare(stampOf(a)),
    );
    const t: Thread = {
      id,
      latest: sorted[0],
      count: list.length,
      unread: list.filter((m) => !m.read).length,
      starred: list.some((m) => m.starred),
      attachments: list.some((m) => m.attachments.length > 0),
      labels: [...new Set(list.flatMap((m) => m.labels))],
    };
    if (filter === "unread" && t.unread === 0) continue;
    if (filter === "starred" && !t.starred) continue;
    if (filter === "attachments" && !t.attachments) continue;
    out.push(t);
  }
  return out.sort((a, b) => stampOf(b.latest).localeCompare(stampOf(a.latest)));
}

export interface Count {
  unread: number;
  total: number;
}

/** Pure: unread and total messages of every folder, and of the starred mail. */
export function folderCounts(mails: Mail[]): Record<string, Count> {
  const counts: Record<string, Count> = {};
  const views: View[] = [
    "inbox",
    "starred",
    "sent",
    "drafts",
    "spam",
    "trash",
    "archive",
  ];
  for (const v of views) {
    const list = mails.filter((m) => inView(m, v));
    counts[v] = {
      unread: list.filter((m) => !m.read).length,
      total: list.length,
    };
  }
  return counts;
}

/** Pure: unread messages per label. */
export function labelCounts(
  mails: Mail[],
  labels: string[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of labels) {
    out[l] = mails.filter((m) => inView(m, `label:${l}`) && !m.read).length;
  }
  return out;
}

export type Action =
  | "read"
  | "unread"
  | "star"
  | "unstar"
  | "archive"
  | "trash"
  | "spam"
  | "inbox"
  | "delete";

/**
 * Pure: an action on whole conversations. `delete` removes what is already in
 * the trash and sends the rest there. Drafts stay drafts unless trashed.
 */
export function applyAction(
  mails: Mail[],
  threadIds: string[],
  action: Action,
): Mail[] {
  const ids = new Set(threadIds);
  const out: Mail[] = [];
  for (const m of mails) {
    if (!ids.has(m.thread)) {
      out.push(m);
      continue;
    }
    switch (action) {
      case "read":
        out.push({ ...m, read: true });
        break;
      case "unread":
        out.push(m.folder === "sent" ? m : { ...m, read: false });
        break;
      case "star":
        out.push({ ...m, starred: true });
        break;
      case "unstar":
        out.push({ ...m, starred: false });
        break;
      case "delete":
        if (m.folder !== "trash") out.push({ ...m, folder: "trash" });
        break;
      case "trash":
        out.push({ ...m, folder: "trash" });
        break;
      default: {
        // archive, spam, inbox: sent mail and drafts keep their folder
        if (m.folder === "sent" || m.folder === "drafts") out.push(m);
        else out.push({ ...m, folder: action });
      }
    }
  }
  return out;
}

/** Pure: star a conversation, or unstar it when any message is starred. */
export function toggleStar(mails: Mail[], threadId: string): Mail[] {
  const any = mails.some((m) => m.thread === threadId && m.starred);
  return applyAction(mails, [threadId], any ? "unstar" : "star");
}

/** Pure: the mail with this message replaced (same id) or added. */
export function upsertMail(mails: Mail[], mail: Mail): Mail[] {
  return mails.some((m) => m.id === mail.id)
    ? mails.map((m) => (m.id === mail.id ? mail : m))
    : [...mails, mail];
}

/** Pure: the mail without a message. */
export const removeMail = (mails: Mail[], id: string): Mail[] =>
  mails.filter((m) => m.id !== id);

/** Pure: add or remove an id from a list. */
export function toggleIn(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

// ---- addresses ----

/** Pure: is this a plausible address? */
export function isEmail(text: string): boolean {
  return /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;.]{2,}$/.test(text);
}

/** Pure: the addresses typed in a field (`Name <a@b.co>`, commas, semicolons, spaces). */
export function parseAddresses(text: string): string[] {
  return text
    .split(/[,;\n]+/)
    .map((part) => {
      const t = part.trim();
      const angle = /<([^>]*)>/.exec(t);
      return (angle ? angle[1] : t).trim();
    })
    .filter(Boolean);
}

export interface Chip {
  text: string;
  ok: boolean;
}

/** Pure: the addresses of a field, each marked valid or not. */
export function recipientChips(text: string): Chip[] {
  return parseAddresses(text).map((t) => ({ text: t, ok: isEmail(t) }));
}

/** Pure: the field with one more address, unless it is already there. */
export function addAddress(text: string, email: string): string {
  const have = parseAddresses(text).map((a) => a.toLowerCase());
  if (have.includes(email.toLowerCase())) return text;
  const clean = text.trim().replace(/[,;]+$/, "");
  return clean ? `${clean}, ${email}` : email;
}

export interface Contact {
  name: string;
  email: string;
}

/** Pure: contacts whose name or address contains every word. */
export function filterContacts(contacts: Contact[], query: string): Contact[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return contacts.filter((c) =>
    words.every((w) => `${c.name} ${c.email}`.toLowerCase().includes(w)),
  );
}

/** Pure: `09:58` plus 5 minutes is `10:03` (the clock of the demos is a counter). */
export function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = (h * 60 + m + minutes) % (24 * 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

/** Pure: `to me`, `to me, Daniel Okafor`, `to Priya and 2 more`. */
export function recipientsLabel(
  m: Mail,
  me: string,
  nameOf: (email: string) => string,
): string {
  const all = [...m.to, ...m.cc];
  const names = all.map((e) => (e === me ? "me" : nameOf(e)));
  if (names.length === 0) return "no recipients";
  if (names.length <= 2) return `to ${names.join(", ")}`;
  return `to ${names[0]} and ${names.length - 1} more`;
}
