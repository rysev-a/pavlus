import { expect, test } from "vitest";
import { headerView, pinnedBanner } from "../blocks/chat-header/chat-header.ts";
import { infoView, sortMembers } from "../blocks/chat-info-panel/info.ts";
import {
  directWith,
  filterChats,
  lastOf,
  ME,
  newChat,
  previewOf,
  rowsOf,
  sortChats,
  tabItems,
  unreadTotal,
  validateNewChat,
  dayLabel,
  listTime,
} from "../blocks/chat-list/chat.ts";
import {
  pickerView,
  pushRecent,
  searchEmoji,
  GROUPS,
} from "../blocks/emoji-picker/emoji.ts";
import {
  groupMessages,
  deliveryIcon,
  deliveryLabel,
  nextDelivery,
  reactionChips,
  sameGroup,
  toggleReaction,
  typingText,
} from "../blocks/msg-bubbles/messages.ts";
import {
  attachMenu,
  canSend,
  chipsOf,
  CHAT_FILES,
  cleanDraft,
  isSendKey,
  toggleChatFile,
} from "../blocks/msg-composer/composer.ts";
import {
  changeMode,
  dialogView,
  personRows,
  pickPerson,
} from "../blocks/new-chat-dialog/new-chat.ts";
import { CHATS, PEOPLE } from "../templates/chat-messenger/chat-data.ts";
import {
  appendMessage,
  derive,
  initial,
  markOwnRead,
  nameOf,
  nextReply,
  receiveReply,
  responderOf,
  setDelivery,
  stampTime,
} from "../templates/chat-messenger/chat-messenger.ts";

const chat = (id: string) => CHATS.find((c) => c.id === id)!;
const isOnline = (id: string) =>
  PEOPLE.find((p) => p.id === id)?.online ?? false;

test("day labels and list times", () => {
  expect(dayLabel("2026-11-03")).toBe("Today");
  expect(dayLabel("2026-11-02")).toBe("Yesterday");
  expect(dayLabel("2026-10-31")).toBe("Sat, Oct 31");
  expect(listTime("2026-11-03", "09:41")).toBe("09:41");
  expect(listTime("2026-11-02", "09:41")).toBe("Yesterday");
  expect(listTime("2026-10-29", "21:50")).toBe("Thu");
  expect(listTime("2026-10-14", "12:00")).toBe("Oct 14");
});

test("messages are grouped by day and by sender", () => {
  const rows = groupMessages(chat("hike"), nameOf);
  // Oct 31: Lena (2 messages in a row), then me; Nov 3: Jonas, Amira
  expect(rows.map((r) => r.kind)).toEqual([
    "day",
    "group",
    "group",
    "day",
    "group",
    "group",
  ]);
  const first = rows[1];
  if (first.kind !== "group") throw new Error("group expected");
  expect(first.bubbles).toHaveLength(2);
  expect(first.bubbles.map((b) => [b.first, b.last])).toEqual([
    [true, false],
    [false, true],
  ]);
  expect(first.showName).toBe(true);
  expect(first.name).toBe("Lena Fischer");
  const mine = rows[2];
  if (mine.kind !== "group") throw new Error("group expected");
  expect(mine.own).toBe(true);
  expect(mine.showName).toBe(false);
  expect(mine.bubbles[0].reply).toEqual({
    id: "h1",
    name: "Lena Fischer",
    text: "Trailhead at 7:30 on Saturday?",
  });
  expect(mine.bubbles[0].state).toBe("read");
  expect(mine.bubbles[0].stateIcon).toBe("k-mi-check-check");
  const day = rows[3];
  if (day.kind !== "day") throw new Error("day expected");
  expect(day.label).toBe("Today");
  // the quick reaction bar opens on one bubble only
  const withMenu = groupMessages(chat("hike"), nameOf, "h2");
  const flat = withMenu.flatMap((r) => (r.kind === "group" ? r.bubbles : []));
  expect(flat.filter((b) => b.menu).map((b) => b.id)).toEqual(["h2"]);
  // a direct chat shows no names
  const direct = groupMessages(chat("lena"), nameOf).find(
    (r) => r.kind === "group",
  );
  expect(direct && direct.kind === "group" && direct.showName).toBe(false);
});

test("a pause or another day starts a new group", () => {
  const a = { ...chat("hike").messages[0] };
  const b = { ...a, id: "x", time: "18:07" };
  const c = { ...a, id: "y", time: "18:20" };
  const d = { ...a, id: "z", day: "2026-11-01" };
  expect(sameGroup(a, b)).toBe(true);
  expect(sameGroup(a, c)).toBe(false);
  expect(sameGroup(a, d)).toBe(false);
  expect(sameGroup(a, { ...b, from: "jonas" })).toBe(false);
  expect(groupMessages({ kind: "group", messages: [] }, nameOf)).toEqual([]);
});

test("delivery goes sending, sent, read", () => {
  expect(nextDelivery("sending")).toBe("sent");
  expect(nextDelivery("sent")).toBe("read");
  expect(nextDelivery("read")).toBe("read");
  expect(deliveryLabel("sending")).toBe("Sending...");
  expect(deliveryLabel("sent")).toBe("Sent");
  expect(deliveryLabel("read")).toBe("Read");
  expect(deliveryLabel(undefined)).toBe("");
  expect(deliveryIcon("sent")).toBe("k-icon-check");
  expect(deliveryIcon("sending")).toBe("k-mi-clock");
  expect(deliveryIcon(undefined)).toBe("");
  const c = chat("team");
  const msg = { ...c.messages[2], id: "n1", state: "sending" as const };
  const sent = setDelivery(appendMessage(c, msg), "n1", "sent");
  expect(lastOf(sent)?.state).toBe("sent");
  // the answer marks what was sent as read, and only what was sent
  const read = markOwnRead(sent);
  expect(read.messages.find((m) => m.id === "n1")?.state).toBe("read");
  const still = markOwnRead(setDelivery(sent, "n1", "sending"));
  expect(still.messages.find((m) => m.id === "n1")?.state).toBe("sending");
});

test("an answer arrives in turn, with the next scripted line", () => {
  const c = chat("team");
  expect(responderOf(c)).toBe("noah");
  expect(responderOf({ ...c, replyIdx: 1 })).toBe("sofia");
  expect(responderOf({ ...c, replyIdx: 4 })).toBe("noah");
  expect(nextReply(c)).toBe("Agreed, let us do that.");
  expect(nextReply({ ...c, replyIdx: 5 })).toBe(
    "I will update the doc after lunch.",
  );
  const typing = { ...c, typing: "noah", unread: 0 };
  const hidden = receiveReply(typing, "n9", 2, false);
  expect(hidden.typing).toBe("");
  expect(hidden.unread).toBe(1);
  expect(hidden.replyIdx).toBe(1);
  expect(lastOf(hidden)?.from).toBe("noah");
  expect(lastOf(hidden)?.time).toBe(stampTime(2));
  expect(stampTime(0)).toBe("09:41");
  expect(receiveReply(typing, "n9", 2, true).unread).toBe(0);
  expect(responderOf({ ...c, members: [ME] })).toBe("");
});

test("reactions toggle per person and group by emoji", () => {
  const one = toggleReaction([], "👍", ME);
  expect(one).toEqual([{ emoji: "👍", by: [ME] }]);
  expect(toggleReaction(one, "👍", "lena")[0].by).toEqual([ME, "lena"]);
  expect(toggleReaction(one, "👍", ME)).toEqual([]);
  expect(toggleReaction(one, "❤️", ME)).toHaveLength(2);
  const chips = reactionChips([{ emoji: "👍", by: [ME, "lena"] }], nameOf);
  expect(chips).toEqual([
    { emoji: "👍", count: 2, mine: true, title: "You, Lena Fischer" },
  ]);
  expect(typingText("noah", nameOf)).toBe("Noah Brooks is typing...");
  expect(typingText("", nameOf)).toBe("");
});

test("previews, search, tabs and sorting of the list", () => {
  expect(previewOf(chat("team"), nameOf)).toEqual({
    text: "Ravi Patel: Thanks, I would have missed that.",
    typing: false,
  });
  expect(previewOf(chat("jonas"), nameOf).text).toBe(
    "You: You are the best. I will pick it up Friday.",
  );
  expect(previewOf({ ...chat("lena"), typing: "lena" }, nameOf)).toEqual({
    text: "typing...",
    typing: true,
  });
  expect(previewOf({ ...chat("team"), typing: "noah" }, nameOf).text).toBe(
    "Noah Brooks is typing...",
  );
  expect(previewOf({ ...chat("lena"), messages: [] }, nameOf).text).toBe(
    "No messages yet",
  );
  const file = {
    ...chat("team"),
    messages: [chat("team").messages[5]].map((m) => ({ ...m, text: "" })),
  };
  expect(previewOf(file, nameOf).text).toBe(
    "Kenji Watanabe: 📎 onboarding-v3.pdf",
  );
  // search looks at names and messages; archived chats only in their tab
  expect(filterChats(CHATS, "tent", "all").map((c) => c.id)).toEqual(["jonas"]);
  expect(filterChats(CHATS, "product", "all").map((c) => c.id)).toEqual([
    "team",
  ]);
  expect(filterChats(CHATS, "", "all").map((c) => c.id)).not.toContain("flat");
  expect(filterChats(CHATS, "", "archived").map((c) => c.id)).toEqual(["flat"]);
  expect(
    filterChats(CHATS, "", "groups").every((c) => c.kind === "group"),
  ).toBe(true);
  expect(filterChats(CHATS, "", "unread").every((c) => c.unread > 0)).toBe(
    true,
  );
  // pinned first, then the newest message
  const sorted = sortChats(filterChats(CHATS, "", "all")).map((c) => c.id);
  expect(sorted[0]).toBe("team");
  expect(sorted.slice(1, 4)).toEqual(["hike", "lena", "book"]);
  // unread totals ignore muted and archived chats
  expect(unreadTotal(CHATS)).toBe(3 + 1 + 2);
  expect(tabItems(CHATS, "unread").find((t) => t.id === "unread")?.count).toBe(
    11,
  );
  expect(tabItems(CHATS, "all").find((t) => t.active)?.id).toBe("all");
});

test("rows of the list show time, badges and presence", () => {
  const rows = rowsOf(
    sortChats(CHATS.filter((c) => !c.archived)),
    "hike",
    nameOf,
    isOnline,
  );
  const hike = rows.find((r) => r.id === "hike")!;
  expect(hike.active).toBe(true);
  expect(hike.emoji).toBe("🥾");
  expect(hike.time).toBe("09:02");
  expect(hike.unread).toBe(2);
  expect(rows.find((r) => r.id === "lena")?.online).toBe(true);
  expect(rows.find((r) => r.id === "jonas")?.online).toBe(false);
  expect(rows.find((r) => r.id === "book")?.muted).toBe(true);
  expect(rows.find((r) => r.id === "jonas")?.time).toBe("Thu");
  expect(rows.find((r) => r.id === "team")?.pinned).toBe(true);
});

test("new chats are validated and created", () => {
  expect(validateNewChat("direct", [], "")).toBe("Pick one person.");
  expect(validateNewChat("direct", ["lena"], "")).toBe("");
  expect(validateNewChat("group", ["lena"], "Crit")).toBe(
    "Pick at least two people for a group.",
  );
  expect(validateNewChat("group", ["lena", "noah"], " ")).toBe(
    "Give the group a name.",
  );
  expect(validateNewChat("group", ["lena", "noah"], "Crit")).toBe("");
  const g = newChat("n1", "group", ["lena", "noah"], " Design Crit ", nameOf);
  expect(g.name).toBe("Design Crit");
  expect(g.members).toEqual([ME, "lena", "noah"]);
  expect(g.admins).toEqual([ME]);
  const d = newChat("n2", "direct", ["lena"], "", nameOf);
  expect(d.name).toBe("Lena Fischer");
  expect(directWith(CHATS, "lena")?.id).toBe("lena");
  expect(directWith(CHATS, "noah")).toBeUndefined();
  // picking in the dialog
  expect(pickPerson("direct", ["a"], "b")).toEqual(["b"]);
  expect(pickPerson("direct", ["a"], "a")).toEqual([]);
  expect(pickPerson("group", ["a"], "b")).toEqual(["a", "b"]);
  expect(pickPerson("group", ["a", "b"], "a")).toEqual(["b"]);
  expect(changeMode("direct", ["a", "b"])).toEqual(["a"]);
  expect(changeMode("group", ["a", "b"])).toEqual(["a", "b"]);
  const rows = personRows(PEOPLE, "amir", ["amira"]);
  expect(rows.map((r) => r.id)).toEqual(["amira"]);
  expect(rows[0].picked).toBe(true);
  expect(personRows(PEOPLE, "", []).map((r) => r.id)).not.toContain(ME);
  const view = dialogView(PEOPLE, "group", ["lena"], "x", "");
  expect(view.canCreate).toBe(false);
  expect(view.summary).toBe("1 person picked");
  expect(dialogView(PEOPLE, "direct", ["lena"], "", "").canCreate).toBe(true);
  expect(dialogView(PEOPLE, "group", [], "", "").summary).toBe(
    "Nobody picked yet",
  );
});

test("the header and the info panel describe the chat", () => {
  const h = headerView(chat("hike"), nameOf, isOnline);
  expect(h.subtitle).toBe("4 members, 2 online");
  expect(h.emoji).toBe("🥾");
  expect(h.pinned).toEqual({
    id: "h4",
    text: "Bringing the stove for hot chocolate.",
    count: 1,
  });
  expect(headerView(chat("lena"), nameOf, isOnline).subtitle).toBe("online");
  expect(
    headerView(
      chat("jonas"),
      nameOf,
      isOnline,
      (id) => PEOPLE.find((p) => p.id === id)?.status ?? "",
    ).subtitle,
  ).toBe("Back at 5");
  expect(
    headerView({ ...chat("lena"), typing: "lena" }, nameOf, isOnline),
  ).toMatchObject({ subtitle: "typing...", live: true });
  expect(
    headerView({ ...chat("hike"), typing: "amira" }, nameOf, isOnline).subtitle,
  ).toBe("Amira Haddad is typing...");
  expect(
    headerView({ ...chat("book"), muted: true }, nameOf, isOnline).muteIcon,
  ).toBe("k-mi-bell-off");
  expect(pinnedBanner(chat("jonas"))).toBeNull();
  const info = infoView(chat("hike"), PEOPLE);
  expect(info.group).toBe(true);
  expect(info.members.map((m) => m.name)).toEqual([
    "Lena Fischer",
    "Maya Chen (you)",
    "Amira Haddad",
    "Jonas Weber",
  ]);
  expect(info.members[0].role).toBe("Admin");
  expect(info.pinned).toHaveLength(1);
  expect(info.canLeave).toBe(true);
  const direct = infoView(chat("lena"), PEOPLE);
  expect(direct.group).toBe(false);
  expect(direct.canLeave).toBe(false);
  expect(direct.subtitle).toBe("At the climbing gym");
  expect(infoView(chat("team"), PEOPLE).files.map((f) => f.name)).toEqual([
    "onboarding-v3.pdf",
  ]);
  expect(sortMembers([])).toEqual([]);
});

test("the composer sends text or files, and Enter", () => {
  expect(canSend("  ", [])).toBe(false);
  expect(canSend("hi", [])).toBe(true);
  expect(canSend("", [CHAT_FILES[0]])).toBe(true);
  expect(isSendKey("Enter")).toBe(true);
  expect(isSendKey("a")).toBe(false);
  expect(isSendKey(undefined)).toBe(false);
  expect(cleanDraft("  hello  there ")).toBe("hello  there");
  const one = toggleChatFile([], "cf-photo");
  expect(one).toHaveLength(1);
  expect(toggleChatFile(one, "cf-photo")).toEqual([]);
  expect(toggleChatFile(one, "nope")).toEqual(one);
  expect(chipsOf(one)[0].sizeLabel).toBe("3 MB");
  expect(
    attachMenu(one)
      .filter((f) => f.added)
      .map((f) => f.id),
  ).toEqual(["cf-photo"]);
});

test("emoji: search, recent and the picker view", () => {
  expect(searchEmoji("party").map((e) => e.e)).toEqual(["🥳", "🎉"]);
  expect(searchEmoji("")).toEqual([]);
  expect(searchEmoji("zzzz")).toEqual([]);
  expect(pushRecent(["a", "b"], "b")).toEqual(["b", "a"]);
  expect(pushRecent(["a", "b"], "c")).toEqual(["c", "a", "b"]);
  expect(pushRecent(Array.from("abcdefgh"), "z")).toHaveLength(8);
  const v = pickerView("food", "", ["🍕", "nope"]);
  expect(v.title).toBe("Food");
  expect(v.emojis).toHaveLength(GROUPS[3].list.length);
  expect(v.tabs.find((t) => t.active)?.id).toBe("food");
  expect(v.recent.map((e) => e.e)).toEqual(["🍕"]);
  const s = pickerView("food", "fire", []);
  expect(s.title).toBe('Results for "fire"');
  expect(s.tabs.some((t) => t.active)).toBe(false);
  expect(pickerView("missing", "", []).title).toBe("Smileys");
});

test("the template derives the visible chat", () => {
  expect(initial.activeId).toBe("hike");
  expect(initial.header?.title).toBe("Weekend Hike");
  expect(initial.sendable).toBe(false);
  expect(initial.placeholder).toBe("Message Weekend Hike");
  expect(initial.unreadAll).toBe(6);
  const s = (patch: Partial<typeof initial>) =>
    derive({ ...initial, ...patch });
  expect(s({ drafts: { hike: "hello" } }).sendable).toBe(true);
  expect(s({ drafts: { hike: "hello" } }).draft).toBe("hello");
  expect(s({ activeId: "" }).hasChat).toBe(false);
  expect(s({ activeId: "" }).messageRows).toEqual([]);
  expect(s({ query: "zzz" }).emptyText).toBe('No chats match "zzz".');
  expect(s({ tab: "archived" }).rows.map((r) => r.id)).toEqual(["flat"]);
  expect(s({ replyTo: "h4" }).replyBanner).toEqual({
    id: "h4",
    name: "Jonas Weber",
    text: "Bringing the stove for hot chocolate.",
  });
  expect(s({ files: [CHAT_FILES[1]] }).sendable).toBe(true);
  expect(s({ files: [CHAT_FILES[1]] }).chips).toHaveLength(1);
  expect(
    s({
      dialog: {
        ...initial.dialog,
        mode: "group",
        picked: ["lena", "noah"],
        name: "Crit",
      },
    }).dialogUi.canCreate,
  ).toBe(true);
});
