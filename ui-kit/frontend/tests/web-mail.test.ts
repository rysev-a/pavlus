import { expect, test } from "vitest";
import {
  composeView,
  FILES,
  hasErrors,
  isBlank,
  mailFromCompose,
  composeFromMail,
  MAX_ATTACHMENTS,
  menuFiles,
  newCompose,
  quoteOf,
  removeFile,
  replyDraft,
  savedLabel,
  setField,
  subjectWith,
  toggleFile,
  validateCompose,
} from "../blocks/mail-composer/compose.ts";
import { contactRows } from "../blocks/contact-pop/contact-pop.ts";
import {
  folderItems,
  labelItems,
} from "../blocks/mail-folders/mail-folders.ts";
import { rowsOf, senderLabel } from "../blocks/mail-list/mail-list.ts";
import {
  addAddress,
  addMinutes,
  applyAction,
  dateLabel,
  filterContacts,
  folderCounts,
  formatSize,
  fullDate,
  inView,
  isEmail,
  labelCounts,
  matchesQuery,
  parseAddresses,
  recipientChips,
  recipientsLabel,
  removeMail,
  shortDay,
  threadsOf,
  toggleIn,
  toggleStar,
  upsertMail,
  weekdayOf,
} from "../blocks/mail-list/mail.ts";
import { readerActions } from "../blocks/mail-reader/mail-reader.ts";
import {
  defaultExpanded,
  paragraphsOf,
  snippetOf,
  threadView,
} from "../blocks/mail-reader/thread.ts";
import {
  bulkButtons,
  filterChips,
  moveTargets,
  toolbarLabel,
} from "../blocks/mail-toolbar/mail-toolbar.ts";
import { hueOf, initialsOf } from "../blocks/msg-basics/msg-basics.ts";
import {
  bulkToast,
  derive,
  emptyOf,
  leavesView,
  listTitleOf,
  nameOf,
  neighbour,
  initial,
} from "../templates/web-mail-panel/web-mail-panel.ts";
import {
  CONTACTS,
  LABELS,
  MAILS,
  ME,
} from "../templates/web-mail-panel/web-mail-data.ts";

test("initials and hue come from the name", () => {
  expect(initialsOf("Maya Chen")).toBe("MC");
  expect(initialsOf("daniel.okafor@halcyon.example")).toBe("DO");
  expect(initialsOf("Wei")).toBe("W");
  expect(initialsOf("")).toBe("?");
  expect(hueOf("Maya Chen")).toBe(hueOf("maya chen"));
  expect(hueOf("Maya Chen")).toBeGreaterThanOrEqual(0);
  expect(hueOf("Maya Chen")).toBeLessThan(360);
});

test("dates: weekday, short day, list label, full date", () => {
  expect(weekdayOf("2026-11-03")).toBe("Tue");
  expect(shortDay("2026-11-02")).toBe("Nov 2");
  expect(shortDay("2025-12-31")).toBe("Dec 31, 2025");
  expect(dateLabel("2026-11-03", "09:12")).toBe("09:12");
  expect(dateLabel("2026-11-02", "09:12")).toBe("Nov 2");
  expect(fullDate("2026-11-02", "09:12")).toBe("Mon, Nov 2, 09:12");
  expect(addMinutes("09:58", 5)).toBe("10:03");
  expect(addMinutes("23:59", 2)).toBe("00:01");
  expect(formatSize(512)).toBe("512 B");
  expect(formatSize(1536)).toBe("1.5 KB");
  expect(formatSize(2_411_520)).toBe("2.3 MB");
});

test("folder counts follow read and starred state", () => {
  const c = folderCounts(MAILS);
  const unreadInbox = MAILS.filter((m) => m.folder === "inbox" && !m.read);
  expect(c.inbox.unread).toBe(unreadInbox.length);
  expect(c.drafts.total).toBe(2);
  expect(c.trash.total).toBe(2);
  expect(c.spam.unread).toBe(2);
  // reading a conversation lowers the inbox count by its unread messages
  const read = applyAction(MAILS, ["t2"], "read");
  expect(folderCounts(read).inbox.unread).toBe(c.inbox.unread - 1);
  // starring adds to the starred view (not for trash or spam)
  const starred = c.starred.total;
  const next = toggleStar(MAILS, "t2");
  expect(folderCounts(next).starred.total).toBe(starred + 1);
  expect(
    inView({ ...MAILS[0], starred: true, folder: "trash" }, "starred"),
  ).toBe(false);
  expect(labelCounts(MAILS, LABELS).Work).toBe(
    MAILS.filter(
      (m) =>
        m.labels.includes("Work") &&
        !m.read &&
        m.folder !== "trash" &&
        m.folder !== "spam",
    ).length,
  );
});

test("threads group messages, newest first, and carry counts", () => {
  const inbox = threadsOf(MAILS, "inbox");
  const t1 = inbox.find((t) => t.id === "t1");
  // the sent reply is in Sent, so the inbox shows two messages of the thread
  expect(t1?.count).toBe(2);
  expect(t1?.latest.id).toBe("m3");
  expect(t1?.unread).toBe(1);
  expect(t1?.starred).toBe(true);
  const stamps = inbox.map((t) => `${t.latest.day} ${t.latest.time}`);
  expect([...stamps].sort().reverse()).toEqual(stamps);
  // the same thread is listed in Sent with its own latest message
  const sent = threadsOf(MAILS, "sent");
  expect(sent.find((t) => t.id === "t1")?.latest.id).toBe("m2");
});

test("search, filters and labels narrow the list", () => {
  expect(matchesQuery(MAILS[0], "launch BRIEF")).toBe(true);
  expect(matchesQuery(MAILS[0], "launch zzz")).toBe(false);
  expect(matchesQuery(MAILS[0], "")).toBe(true);
  expect(threadsOf(MAILS, "inbox", "invoice").map((t) => t.id)).toEqual(["t4"]);
  expect(threadsOf(MAILS, "inbox", "pdf").length).toBeGreaterThan(0);
  const unread = threadsOf(MAILS, "inbox", "", "unread");
  expect(unread.every((t) => t.unread > 0)).toBe(true);
  const files = threadsOf(MAILS, "inbox", "", "attachments");
  expect(files.every((t) => t.attachments)).toBe(true);
  const starred = threadsOf(MAILS, "inbox", "", "starred");
  expect(starred.every((t) => t.starred)).toBe(true);
  const work = threadsOf(MAILS, "label:Work");
  expect(work.length).toBeGreaterThan(2);
  expect(work.every((t) => t.labels.includes("Work"))).toBe(true);
  expect(threadsOf(MAILS, "inbox", "nobody writes this")).toEqual([]);
});

test("actions move whole conversations", () => {
  const archived = applyAction(MAILS, ["t4"], "archive");
  expect(archived.find((m) => m.id === "m6")?.folder).toBe("archive");
  // sent mail and drafts keep their folder when archived
  const t1 = applyAction(MAILS, ["t1"], "archive");
  expect(t1.find((m) => m.id === "m2")?.folder).toBe("sent");
  expect(t1.find((m) => m.id === "m1")?.folder).toBe("archive");
  // trash then delete removes for good
  const trashed = applyAction(MAILS, ["t4"], "trash");
  expect(trashed.find((m) => m.id === "m6")?.folder).toBe("trash");
  const gone = applyAction(trashed, ["t4"], "delete");
  expect(gone.find((m) => m.id === "m6")).toBeUndefined();
  // delete outside the trash sends to the trash
  expect(
    applyAction(MAILS, ["t4"], "delete").find((m) => m.id === "m6")?.folder,
  ).toBe("trash");
  // read and unread
  expect(
    applyAction(MAILS, ["t2"], "read").find((m) => m.id === "m4")?.read,
  ).toBe(true);
  expect(
    applyAction(MAILS, ["t4"], "unread").find((m) => m.id === "m6")?.read,
  ).toBe(false);
  // others are untouched
  expect(
    applyAction(MAILS, ["t4"], "spam").filter((m) => m.folder === "spam"),
  ).toHaveLength(3);
  // toggling the star twice returns to the start
  expect(toggleStar(toggleStar(MAILS, "t2"), "t2")).toEqual(MAILS);
  expect(toggleIn(["a"], "b")).toEqual(["a", "b"]);
  expect(toggleIn(["a", "b"], "a")).toEqual(["b"]);
});

test("upsert and remove", () => {
  const m = MAILS[0];
  expect(
    upsertMail(MAILS, { ...m, subject: "x" }).find((x) => x.id === m.id)
      ?.subject,
  ).toBe("x");
  expect(upsertMail(MAILS, { ...m, id: "new" })).toHaveLength(MAILS.length + 1);
  expect(removeMail(MAILS, m.id)).toHaveLength(MAILS.length - 1);
});

test("addresses are parsed and validated", () => {
  expect(isEmail("a@b.co")).toBe(true);
  expect(isEmail("a@b")).toBe(false);
  expect(isEmail("a b@c.com")).toBe(false);
  expect(isEmail("@c.com")).toBe(false);
  expect(parseAddresses("a@b.co, Maya <maya@x.org>; z@y.io")).toEqual([
    "a@b.co",
    "maya@x.org",
    "z@y.io",
  ]);
  expect(parseAddresses("  ")).toEqual([]);
  expect(recipientChips("a@b.co, nope")).toEqual([
    { text: "a@b.co", ok: true },
    { text: "nope", ok: false },
  ]);
  expect(addAddress("", "a@b.co")).toBe("a@b.co");
  expect(addAddress("x@y.io, ", "a@b.co")).toBe("x@y.io, a@b.co");
  expect(addAddress("A@B.co", "a@b.co")).toBe("A@B.co");
  expect(filterContacts(CONTACTS, "daniel")).toHaveLength(1);
  expect(filterContacts(CONTACTS, "halcyon").length).toBeGreaterThan(2);
  expect(filterContacts(CONTACTS, "")).toHaveLength(CONTACTS.length);
});

test("compose validation names what is wrong", () => {
  const c = newCompose("c1", "t-new");
  expect(validateCompose(c).to).toBe("Add at least one recipient.");
  expect(validateCompose(c).body).toContain("subject or a message");
  const bad = { ...c, to: "a@b.co, nope, also bad", subject: "Hi" };
  expect(validateCompose(bad).to).toBe(
    "These are not addresses: nope, also bad",
  );
  expect(validateCompose({ ...bad, to: "a@b.co, nope" }).to).toBe(
    "This is not an address: nope",
  );
  expect(validateCompose({ ...bad, to: "a@b.co", cc: "x" }).cc).toContain("x");
  const ok = { ...c, to: "a@b.co", subject: "Hi" };
  expect(hasErrors(validateCompose(ok))).toBe(false);
  // too many megabytes
  const big = { ...ok, attachments: [FILES[2], FILES[4]] };
  expect(validateCompose(big).attach).toContain("limit");
  expect(FILES[2].size + FILES[4].size).toBeGreaterThan(MAX_ATTACHMENTS);
});

test("typing, attaching and removing files change the draft", () => {
  const c = { ...newCompose("c1", "t"), errors: { to: "x", body: "y" } };
  const typed = setField(c, "to", "a@b.co");
  expect(typed.to).toBe("a@b.co");
  expect(typed.errors.to).toBeUndefined();
  expect(typed.errors.body).toBe("y");
  expect(typed.saved).toBe("saving");
  expect(setField(typed, "subject", "Hi").errors.body).toBeUndefined();
  const one = toggleFile(c, FILES[0]);
  expect(one.attachments).toHaveLength(1);
  expect(toggleFile(one, FILES[0]).attachments).toHaveLength(0);
  expect(removeFile(one, FILES[0].id).attachments).toHaveLength(0);
  expect(
    menuFiles(one)
      .filter((f) => f.added)
      .map((f) => f.id),
  ).toEqual([FILES[0].id]);
  expect(isBlank(c)).toBe(true);
  expect(isBlank(one)).toBe(false);
  expect(savedLabel({ ...c, saved: "saving" })).toBe("Saving...");
  expect(savedLabel({ ...c, saved: "saved", savedAt: "09:42" })).toBe(
    "Draft saved at 09:42",
  );
  expect(savedLabel(c)).toBe("");
  const v = composeView({ ...one, to: "a@b.co, bad" });
  expect(v.toChips.map((x) => x.ok)).toEqual([true, false]);
  expect(v.totalLabel).toBe("1 file, 2.3 MB");
  expect(v.title).toBe("New message");
});

test("reply, reply all and forward make the right drafts", () => {
  const m3 = MAILS.find((m) => m.id === "m3")!;
  const reply = replyDraft(m3, "reply", ME, "d1");
  expect(reply.to).toBe("daniel.okafor@halcyon.example");
  expect(reply.cc).toBe("");
  expect(reply.subject).toBe("Re: Q4 launch brief: final read before Thursday");
  expect(reply.body.startsWith("\n\nOn Tue, Nov 3, 08:47, Daniel Okafor")).toBe(
    true,
  );
  expect(reply.body).toContain("> Good catch");
  expect(reply.thread).toBe("t1");
  const all = replyDraft(m3, "replyAll", ME, "d2");
  expect(all.to).toBe("daniel.okafor@halcyon.example");
  expect(all.cc).toBe("tomas.herrera@halcyon.example");
  expect(all.showCc).toBe(true);
  const fwd = replyDraft(m3, "forward", ME, "d3");
  expect(fwd.to).toBe("");
  expect(fwd.subject).toBe(
    "Fwd: Re: Q4 launch brief: final read before Thursday",
  );
  expect(fwd.attachments).toHaveLength(1);
  expect(fwd.body).toContain("Forwarded message");
  // replying to my own sent message goes to the people I wrote to
  const m2 = MAILS.find((m) => m.id === "m2")!;
  expect(replyDraft(m2, "reply", ME, "d4").to).toBe(
    "daniel.okafor@halcyon.example",
  );
  // reply all drops me from the recipients
  const withMe = { ...m3, to: [ME, "x@y.io"], cc: [] };
  expect(replyDraft(withMe, "replyAll", ME, "d5").to).toBe(
    "daniel.okafor@halcyon.example, x@y.io",
  );
  expect(subjectWith("Re", "Re: hi")).toBe("Re: hi");
  expect(subjectWith("Fwd", "hi")).toBe("Fwd: hi");
  expect(quoteOf({ ...m3, body: "a\n> b" })).toContain("> a\n>> b");
});

test("a draft round-trips through a mail", () => {
  const c = {
    ...newCompose("m50", "t50"),
    to: "a@b.co, c@d.io",
    subject: " Hi ",
    body: "text",
  };
  const mail = mailFromCompose(
    c,
    { name: "Maya Chen", email: ME },
    "drafts",
    "2026-11-03",
    "09:41",
  );
  expect(mail.to).toEqual(["a@b.co", "c@d.io"]);
  expect(mail.subject).toBe("Hi");
  expect(mail.folder).toBe("drafts");
  const back = composeFromMail(mail);
  expect(back.to).toBe("a@b.co, c@d.io");
  expect(back.id).toBe("m50");
  expect(back.saved).toBe("saved");
});

test("a thread is cut into paragraphs and quotes", () => {
  expect(paragraphsOf("Hi\n\nBody line 1\nline 2\n\n> quoted\n> more")).toEqual(
    [
      { quote: false, text: "Hi" },
      { quote: false, text: "Body line 1\nline 2" },
      { quote: true, text: "quoted\nmore" },
    ],
  );
  expect(paragraphsOf("text\n> quote\nafter")).toHaveLength(3);
  expect(snippetOf("> old\nHello there\n\nSecond line", 100)).toBe(
    "Hello there Second line",
  );
  expect(snippetOf("a".repeat(200), 20)).toHaveLength(20);
  expect(defaultExpanded(MAILS, "t1")).toEqual(["m3"]);
  expect(defaultExpanded(MAILS, "t4")).toEqual(["m6"]);
  expect(defaultExpanded(MAILS, "t2")).toEqual(["m4"]);
  expect(defaultExpanded(MAILS, "none")).toEqual([]);
});

test("the reading pane view orders and expands messages", () => {
  const v = threadView(MAILS, "t1", ME, ["m3"], nameOf)!;
  expect(v.messages.map((m) => m.id)).toEqual(["m1", "m2", "m3"]);
  expect(v.messages.map((m) => m.expanded)).toEqual([false, false, true]);
  expect(v.messages[1].own).toBe(true);
  expect(v.messages[0].recipients).toBe("to me, Tomás Herrera");
  expect(v.count).toBe(3);
  expect(v.starred).toBe(true);
  expect(v.lastId).toBe("m3");
  expect(v.labels).toEqual(["Work"]);
  expect(v.messages[2].attachments[0].sizeLabel).toBe("2.3 MB");
  // a single message is always expanded
  expect(threadView(MAILS, "t4", ME, [], nameOf)!.messages[0].expanded).toBe(
    true,
  );
  expect(threadView(MAILS, "missing", ME, [], nameOf)).toBeNull();
  expect(
    recipientsLabel(
      { ...MAILS[0], to: [ME, "a@b.co", "c@d.io"], cc: [] },
      ME,
      nameOf,
    ),
  ).toBe("to me and 2 more");
  expect(recipientsLabel({ ...MAILS[0], to: [], cc: [] }, ME, nameOf)).toBe(
    "no recipients",
  );
});

test("reader actions and toolbar buttons depend on the folder", () => {
  expect(readerActions("inbox", false).map((a) => a.id)).toEqual([
    "archive",
    "trash",
    "spam",
    "unread",
    "star",
  ]);
  expect(readerActions("inbox", true).at(-1)?.icon).toBe("k-mi-star-fill");
  expect(readerActions("trash", false).map((a) => a.id)).toEqual([
    "restore",
    "delete",
  ]);
  expect(readerActions("spam", false).map((a) => a.id)).toEqual([
    "restore",
    "trash",
  ]);
  expect(bulkButtons("inbox").map((b) => b.id)).toContain("archive");
  expect(bulkButtons("trash").map((b) => b.id)).toEqual(["inbox", "delete"]);
  expect(bulkButtons("drafts").map((b) => b.id)).not.toContain("archive");
  expect(moveTargets("inbox").map((t) => t.id)).toEqual([
    "archive",
    "spam",
    "trash",
  ]);
  expect(moveTargets("trash")).toEqual([]);
  expect(toolbarLabel(0, 1)).toBe("1 conversation");
  expect(toolbarLabel(0, 12)).toBe("12 conversations");
  expect(toolbarLabel(3, 12)).toBe("3 selected");
  expect(
    filterChips("unread")
      .filter((c) => c.active)
      .map((c) => c.id),
  ).toEqual(["unread"]);
});

test("folder and label items carry the counts", () => {
  const items = folderItems(folderCounts(MAILS), "inbox");
  expect(items.find((i) => i.id === "inbox")?.active).toBe(true);
  expect(items.find((i) => i.id === "drafts")?.count).toBe(2);
  expect(items.find((i) => i.id === "sent")?.count).toBe(0);
  const labels = labelItems(LABELS, labelCounts(MAILS, LABELS), "label:Work");
  expect(labels.find((l) => l.name === "Work")?.active).toBe(true);
  expect(labels.find((l) => l.name === "Work")?.id).toBe("label:Work");
});

test("list rows say who, when and how many", () => {
  const threads = threadsOf(MAILS, "inbox");
  const rows = rowsOf(threads, ["t2"], "t1", ME, nameOf);
  const q4 = rows.find((r) => r.id === "t1")!;
  expect(q4.count).toBe(2);
  expect(q4.open).toBe(true);
  expect(q4.unread).toBe(true);
  expect(q4.starIcon).toBe("k-mi-star-fill");
  expect(q4.date).toBe("08:47");
  expect(rows.find((r) => r.id === "t2")?.selected).toBe(true);
  expect(rows.find((r) => r.id === "t4")?.date).toBe("Nov 2");
  const sent = threadsOf(MAILS, "sent")[0];
  expect(senderLabel(sent.latest, ME, nameOf)).toMatch(/^To: /);
  const draft = MAILS.find((m) => m.id === "m22")!;
  expect(senderLabel(draft, ME, nameOf)).toBe("Draft");
  expect(
    senderLabel(
      MAILS.find((m) => m.id === "m21")!,
      ME,
      nameOf,
    ),
  ).toBe("Draft to Daniel Okafor");
});

test("contacts popover marks the contacts already in the field", () => {
  const rows = contactRows(
    CONTACTS,
    "",
    "daniel.okafor@halcyon.example, x@y.io",
    ME,
  );
  expect(rows.find((r) => r.name === "Daniel Okafor")?.added).toBe(true);
  expect(rows.find((r) => r.name === "Priya Raman")?.added).toBe(false);
  expect(contactRows(CONTACTS, "priya", "", ME)).toHaveLength(1);
});

test("the template derives counts, rows, empty states and toasts", () => {
  expect(initial.inboxUnread).toBe(folderCounts(MAILS).inbox.unread);
  expect(initial.reader?.id).toBe("t1");
  expect(initial.rows.length).toBe(12);
  const s = (patch: Partial<typeof initial>) =>
    derive({ ...initial, ...patch });
  expect(s({ view: "trash" }).rows).toHaveLength(2);
  expect(s({ view: "trash" }).buttons.map((b) => b.id)).toEqual([
    "inbox",
    "delete",
  ]);
  expect(s({ query: "zzz" }).emptyTitle).toBe('No results for "zzz"');
  expect(s({ selected: ["t2", "t4", "nope"] }).selectedCount).toBe(2);
  expect(s({ selected: initial.rows.map((r) => r.id) }).allSelected).toBe(true);
  expect(s({ selected: [] }).allSelected).toBe(false);
  expect(s({ compose: newCompose("x", "y") }).composeUi?.title).toBe(
    "New message",
  );
  expect(emptyOf("inbox", "", "all").title).toBe("Inbox zero");
  expect(emptyOf("inbox", "", "unread").title).toBe(
    "Nothing matches this filter",
  );
  expect(emptyOf("label:Work", "", "all").title).toBe(
    "No mail with this label",
  );
  expect(listTitleOf("label:Work")).toBe("Label: Work");
  expect(listTitleOf("drafts")).toBe("Drafts");
  expect(bulkToast("archive", 1)).toBe("1 conversation archived");
  expect(bulkToast("trash", 3)).toBe("3 conversations moved to Trash");
  expect(leavesView("archive")).toBe(true);
  expect(leavesView("read")).toBe(false);
  expect(neighbour(["a", "b", "c"], "a", 1)).toBe("b");
  expect(neighbour(["a", "b", "c"], "a", -1)).toBe("a");
  expect(neighbour(["a", "b", "c"], "c", 1)).toBe("c");
  expect(neighbour(["a", "b"], "zz", 1)).toBe("a");
  expect(neighbour([], "a", 1)).toBe("");
});
