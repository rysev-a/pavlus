// A few chats for the demo pages of the messaging blocks.
import { type Chat, type ChatMsg, ME, type Person } from "./chat.ts";

export const DEMO_PEOPLE: Person[] = [
  { id: ME, name: "Maya Chen", status: "Product designer", online: true },
  {
    id: "lena",
    name: "Lena Fischer",
    status: "At the climbing gym",
    online: true,
  },
  { id: "jonas", name: "Jonas Weber", status: "Back at 5", online: false },
  { id: "amira", name: "Amira Haddad", status: "Hiking season", online: true },
  { id: "noah", name: "Noah Brooks", status: "Shipping Friday", online: false },
  { id: "sofia", name: "Sofia Rossi", status: "Reading", online: false },
];

export const nameOfIn =
  (people: Person[]) =>
  (id: string): string =>
    id === ME ? "You" : (people.find((p) => p.id === id)?.name ?? id);

export const onlineIn =
  (people: Person[]) =>
  (id: string): boolean =>
    people.find((p) => p.id === id)?.online ?? false;

export const msg = (
  id: string,
  from: string,
  text: string,
  day: string,
  time: string,
  extra: Partial<ChatMsg> = {},
): ChatMsg => ({
  id,
  from,
  text,
  day,
  time,
  reactions: [],
  pinned: false,
  files: [],
  ...extra,
});

export const DEMO_CHATS: Chat[] = [
  {
    id: "hike",
    kind: "group",
    name: "Weekend Hike",
    emoji: "🥾",
    members: [ME, "lena", "jonas", "amira"],
    admins: [ME, "lena"],
    about: "Saturday hikes in the Cascades. Bring layers.",
    muted: false,
    archived: false,
    pinned: true,
    unread: 2,
    typing: "",
    replies: ["Count me in!", "I will bring snacks."],
    replyIdx: 0,
    messages: [
      msg(
        "h1",
        "lena",
        "Trailhead at 7:30 on Saturday?",
        "2026-11-02",
        "18:02",
      ),
      msg(
        "h2",
        "lena",
        "Forecast says clear until noon.",
        "2026-11-02",
        "18:03",
        {
          reactions: [{ emoji: "👍", by: [ME, "jonas"] }],
        },
      ),
      msg("h3", ME, "Works for me. I will drive.", "2026-11-02", "18:10", {
        state: "read",
        replyTo: "h1",
      }),
      msg(
        "h4",
        "jonas",
        "Bringing the stove for hot chocolate.",
        "2026-11-03",
        "08:15",
        {
          pinned: true,
        },
      ),
      msg("h5", "amira", "Do we need microspikes?", "2026-11-03", "09:02"),
    ],
  },
  {
    id: "lena",
    kind: "direct",
    name: "Lena Fischer",
    emoji: "",
    members: [ME, "lena"],
    admins: [],
    about: "At the climbing gym",
    muted: false,
    archived: false,
    pinned: false,
    unread: 0,
    typing: "",
    replies: ["Haha, deal.", "See you there!"],
    replyIdx: 0,
    messages: [
      msg("l1", ME, "Did you get the tickets?", "2026-11-03", "07:48", {
        state: "read",
      }),
      msg("l2", "lena", "Yes! Row 12, aisle seats.", "2026-11-03", "07:52"),
    ],
  },
  {
    id: "book",
    kind: "group",
    name: "Book Club",
    emoji: "📚",
    members: [ME, "sofia", "amira"],
    admins: ["sofia"],
    about: "One novel a month.",
    muted: true,
    archived: false,
    pinned: false,
    unread: 5,
    typing: "",
    replies: ["Chapter 7 is wild."],
    replyIdx: 0,
    messages: [
      msg(
        "b1",
        "sofia",
        "November pick: The Remains of the Day.",
        "2026-10-30",
        "20:11",
      ),
      msg(
        "b2",
        "amira",
        "Finally, I have had it on my shelf for years.",
        "2026-10-30",
        "20:14",
      ),
    ],
  },
];
