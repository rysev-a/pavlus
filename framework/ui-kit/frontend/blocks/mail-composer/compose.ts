// A message being written: the pure part. Validation of addresses, reply and
// forward drafts, the saved-state label and the attachment limit.
import {
  type Attachment,
  fullDate,
  formatSize,
  isEmail,
  type Mail,
  parseAddresses,
  recipientChips,
  type Chip,
  TODAY,
} from "../mail-list/mail.ts";

export type Mode = "new" | "reply" | "replyAll" | "forward";

export interface ComposeErrors {
  to?: string;
  cc?: string;
  body?: string;
  attach?: string;
}

export interface Compose {
  id: string;
  thread: string;
  mode: Mode;
  to: string;
  cc: string;
  subject: string;
  body: string;
  attachments: Attachment[];
  showCc: boolean;
  saved: "idle" | "saving" | "saved";
  savedAt: string;
  errors: ComposeErrors;
  minimized: boolean;
  attachOpen: boolean;
}

/** 25 MB, like most providers. */
export const MAX_ATTACHMENTS = 25 * 1024 * 1024;

/** Files the "Attach" menu offers (nothing is read from the disk). */
export const FILES: Attachment[] = [
  { id: "f-brief", name: "Q4-launch-brief.pdf", size: 2_411_520 },
  { id: "f-budget", name: "budget-2027.xlsx", size: 184_320 },
  { id: "f-mock", name: "homepage-mockup.png", size: 5_872_640 },
  { id: "f-notes", name: "meeting-notes.txt", size: 4_096 },
  { id: "f-video", name: "demo-recording.mp4", size: 21_474_836 },
];

export function newCompose(id: string, thread: string): Compose {
  return {
    id,
    thread,
    mode: "new",
    to: "",
    cc: "",
    subject: "",
    body: "",
    attachments: [],
    showCc: false,
    saved: "idle",
    savedAt: "",
    errors: {},
    minimized: false,
    attachOpen: false,
  };
}

/** Pure: nothing worth saving has been typed. */
export function isBlank(c: Compose): boolean {
  return (
    c.to.trim() === "" &&
    c.cc.trim() === "" &&
    c.subject.trim() === "" &&
    c.body.trim() === "" &&
    c.attachments.length === 0
  );
}

/** Pure: the total size of the attachments. */
export const totalSize = (list: Attachment[]): number =>
  list.reduce((sum, a) => sum + a.size, 0);

/** Pure: what stops this message from being sent, by field. */
export function validateCompose(c: Compose): ComposeErrors {
  const errors: ComposeErrors = {};
  const to = parseAddresses(c.to);
  const badTo = to.filter((a) => !isEmail(a));
  if (to.length === 0) errors.to = "Add at least one recipient.";
  else if (badTo.length > 0) {
    errors.to = `${badTo.length === 1 ? "This is not an address" : "These are not addresses"}: ${badTo.join(", ")}`;
  }
  const badCc = parseAddresses(c.cc).filter((a) => !isEmail(a));
  if (badCc.length > 0) {
    errors.cc = `${badCc.length === 1 ? "This is not an address" : "These are not addresses"}: ${badCc.join(", ")}`;
  }
  if (c.subject.trim() === "" && c.body.trim() === "") {
    errors.body = "Write a subject or a message before you send.";
  }
  if (totalSize(c.attachments) > MAX_ATTACHMENTS) {
    errors.attach = `The files are ${formatSize(totalSize(c.attachments))}; the limit is ${formatSize(MAX_ATTACHMENTS)}.`;
  }
  return errors;
}

export const hasErrors = (e: ComposeErrors): boolean =>
  Object.keys(e).length > 0;

/** Pure: `Re: Budget` for `Budget` and for `Re: Budget`. */
export function subjectWith(prefix: "Re" | "Fwd", subject: string): string {
  const p = `${prefix}: `;
  return subject.toLowerCase().startsWith(p.toLowerCase())
    ? subject
    : `${p}${subject}`;
}

/** Pure: the quoted original under a reply. */
export function quoteOf(m: Mail, today = TODAY): string {
  const lines = m.body
    .split("\n")
    .map((l) => (l.startsWith(">") ? `>${l}` : `> ${l}`.trimEnd()));
  return `On ${fullDate(m.day, m.time, today)}, ${m.from} <${m.email}> wrote:\n${lines.join("\n")}`;
}

const unique = (list: string[]): string[] => [...new Set(list)];

/** Pure: a reply, reply all or forward of a message, as a draft to edit. */
export function replyDraft(
  m: Mail,
  mode: Exclude<Mode, "new">,
  me: string,
  id: string,
  today = TODAY,
): Compose {
  const base = newCompose(id, m.thread);
  if (mode === "forward") {
    const header = [
      "---------- Forwarded message ----------",
      `From: ${m.from} <${m.email}>`,
      `Date: ${fullDate(m.day, m.time, today)}`,
      `Subject: ${m.subject}`,
      `To: ${m.to.join(", ")}`,
    ].join("\n");
    return {
      ...base,
      mode,
      subject: subjectWith("Fwd", m.subject),
      body: `\n\n${header}\n\n${m.body}`,
      attachments: m.attachments,
    };
  }
  const to =
    m.email === me
      ? m.to
      : mode === "replyAll"
        ? unique([m.email, ...m.to.filter((e) => e !== me)])
        : [m.email];
  const cc =
    mode === "replyAll"
      ? unique(m.cc.filter((e) => e !== me && !to.includes(e)))
      : [];
  return {
    ...base,
    mode,
    to: to.join(", "),
    cc: cc.join(", "),
    showCc: cc.length > 0,
    subject: subjectWith("Re", m.subject),
    body: `\n\n${quoteOf(m, today)}`,
  };
}

/** Pure: the line under the editor. */
export function savedLabel(c: Compose): string {
  if (c.saved === "saving") return "Saving...";
  if (c.saved === "saved") return `Draft saved at ${c.savedAt}`;
  return "";
}

/** Pure: a message of the user from a compose window, as a draft or as sent mail. */
export function mailFromCompose(
  c: Compose,
  who: { name: string; email: string },
  folder: "drafts" | "sent",
  day: string,
  time: string,
): Mail {
  return {
    id: c.id,
    thread: c.thread,
    from: who.name,
    email: who.email,
    to: parseAddresses(c.to),
    cc: parseAddresses(c.cc),
    subject: c.subject.trim(),
    body: c.body,
    day,
    time,
    folder,
    read: true,
    starred: false,
    labels: [],
    attachments: c.attachments,
  };
}

/** Pure: a draft opened for editing. */
export function composeFromMail(m: Mail): Compose {
  return {
    ...newCompose(m.id, m.thread),
    to: m.to.join(", "),
    cc: m.cc.join(", "),
    showCc: m.cc.length > 0,
    subject: m.subject,
    body: m.body,
    attachments: m.attachments,
    saved: "saved",
    savedAt: m.time,
  };
}

export type TextField = "to" | "cc" | "subject" | "body";

/** Pure: the draft with a field changed; its error goes away and it is no longer saved. */
export function setField(c: Compose, name: TextField, value: string): Compose {
  const errors = { ...c.errors };
  if (name === "to") delete errors.to;
  if (name === "cc") delete errors.cc;
  if (name === "body" || name === "subject") delete errors.body;
  return { ...c, [name]: value, errors, saved: "saving" };
}

/** Pure: attach a file, or detach it when it is attached already. */
export function toggleFile(c: Compose, file: Attachment): Compose {
  const has = c.attachments.some((a) => a.id === file.id);
  const attachments = has
    ? c.attachments.filter((a) => a.id !== file.id)
    : [...c.attachments, file];
  const errors = { ...c.errors };
  delete errors.attach;
  return { ...c, attachments, errors, saved: "saving" };
}

export function removeFile(c: Compose, id: string): Compose {
  const errors = { ...c.errors };
  delete errors.attach;
  return {
    ...c,
    attachments: c.attachments.filter((a) => a.id !== id),
    errors,
    saved: "saving",
  };
}

export interface MenuFile {
  id: string;
  name: string;
  sizeLabel: string;
  added: boolean;
}

/** Pure: the files of the attach menu, marking those attached. */
export function menuFiles(c: Compose, files: Attachment[] = FILES): MenuFile[] {
  return files.map((f) => ({
    id: f.id,
    name: f.name,
    sizeLabel: formatSize(f.size),
    added: c.attachments.some((a) => a.id === f.id),
  }));
}

export interface ComposeView {
  toChips: Chip[];
  ccChips: Chip[];
  savedLabel: string;
  attachments: { id: string; name: string; sizeLabel: string }[];
  totalLabel: string;
  title: string;
}

/** Pure: what the composer block shows for a draft. */
export function composeView(c: Compose): ComposeView {
  return {
    toChips: recipientChips(c.to),
    ccChips: recipientChips(c.cc),
    savedLabel: savedLabel(c),
    attachments: c.attachments.map((a) => ({
      id: a.id,
      name: a.name,
      sizeLabel: formatSize(a.size),
    })),
    totalLabel:
      c.attachments.length === 0
        ? ""
        : `${c.attachments.length} ${c.attachments.length === 1 ? "file" : "files"}, ${formatSize(totalSize(c.attachments))}`,
    title:
      c.mode === "reply" || c.mode === "replyAll"
        ? "Reply"
        : c.mode === "forward"
          ? "Forward"
          : c.subject.trim() || "New message",
  };
}
