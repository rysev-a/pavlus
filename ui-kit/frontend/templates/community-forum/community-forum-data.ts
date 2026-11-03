import type { Reply } from "../../blocks/reply-tree/reply-tree.ts";

export const ME = "sam";

export interface Member {
  id: string;
  name: string;
  tone: number;
  points: number;
  moderator: boolean;
}

export const MEMBERS: Member[] = [
  { id: "sam", name: "Sam Whitfield", tone: 4, points: 340, moderator: false },
  { id: "dana", name: "Dana Cruz", tone: 1, points: 6120, moderator: true },
  { id: "priya", name: "Priya Nair", tone: 2, points: 2480, moderator: false },
  { id: "leo", name: "Leo Park", tone: 5, points: 870, moderator: false },
  { id: "mina", name: "Mina Okafor", tone: 3, points: 130, moderator: false },
  { id: "bot", name: "bot4412", tone: 5, points: 4, moderator: false },
];

export const memberOf = (id: string): Member =>
  MEMBERS.find((m) => m.id === id) ?? (MEMBERS[0] as Member);

export interface Category {
  id: string;
  label: string;
  emoji: string;
}

export const CATEGORIES: Category[] = [
  { id: "news", label: "Announcements", emoji: "📣" },
  { id: "help", label: "Help", emoji: "🛟" },
  { id: "show", label: "Show and tell", emoji: "🎨" },
  { id: "chat", label: "Off topic", emoji: "☕" },
];

export const categoryOf = (id: string): Category =>
  CATEGORIES.find((c) => c.id === id) ?? (CATEGORIES[0] as Category);

export interface ForumThread {
  id: string;
  title: string;
  authorId: string;
  categoryId: string;
  /** Light markup, see the markup-preview block. */
  body: string;
  /** The score without my vote. */
  base: number;
  vote: -1 | 0 | 1;
  views: number;
  hours: number;
  ago: string;
  pinned: boolean;
  locked: boolean;
  hidden: boolean;
}

const t = (
  id: string,
  title: string,
  authorId: string,
  categoryId: string,
  body: string,
  base: number,
  views: number,
  hours: number,
  ago: string,
  more: Partial<ForumThread> = {},
): ForumThread => ({
  id,
  title,
  authorId,
  categoryId,
  body,
  base,
  vote: 0,
  views,
  hours,
  ago,
  pinned: false,
  locked: false,
  hidden: false,
  ...more,
});

export const THREADS: ForumThread[] = [
  t(
    "t1",
    "Read this first: how to ask a good question",
    "dana",
    "news",
    "# Welcome\n\nA good question gets a good answer. Before you post:\n\n- search for the title of your problem\n- say what you **expected** and what *happened*\n- paste the smallest code that shows it\n\n> Be kind. Everyone here was a beginner once.",
    58,
    4200,
    900,
    "5 weeks ago",
    { pinned: true, locked: true },
  ),
  t(
    "t2",
    "Memory keeps growing after every route change",
    "sam",
    "help",
    "I run **Node 22** and the heap grows after every `navigate()` call.\n\n- tried the profiler\n- no listeners left in the logs\n\n> Any idea what to look at next?",
    12,
    310,
    3,
    "3h ago",
  ),
  t(
    "t3",
    "Show: a tiny habit tracker in 300 lines",
    "leo",
    "show",
    'I built a habit tracker with nothing but pure functions and a `store.set` per field.\n\n```\nconst next = toggle(habits, id)\nreturn [store.set("habits", next)]\n```\n\nFeedback welcome!',
    34,
    520,
    20,
    "Yesterday",
  ),
  t(
    "t4",
    "How do you split a handler that grew to 200 lines?",
    "mina",
    "help",
    "One of my handlers now validates, sorts and formats. It works but I am scared to touch it.\n\nHow do you cut it into pieces without losing the tests?",
    5,
    96,
    9,
    "9h ago",
  ),
  t(
    "t5",
    "Coffee or tea while debugging?",
    "priya",
    "chat",
    "Settling this once and for all. **Coffee** or *tea*? Bonus points for the strangest brew you have ever drunk.",
    19,
    230,
    50,
    "2 days ago",
  ),
  t(
    "t6",
    "Why is my timer firing twice?",
    "mina",
    "help",
    "I start a timer in `enter` and it fires twice after I come back to the page. Do I need to cancel it somewhere?",
    2,
    41,
    1,
    "1h ago",
  ),
  t(
    "t7",
    "Spam: buy followers cheap",
    "bot",
    "help",
    "buy followers cheap cheap cheap",
    -6,
    12,
    6,
    "6h ago",
    { hidden: true },
  ),
  t(
    "t8",
    "Release notes: version 2.4 is out",
    "dana",
    "news",
    "# 2.4\n\n- faster diffing for long lists\n- a new `leave` message for routers\n- many docs fixes\n\nThanks to every contributor.",
    77,
    1800,
    72,
    "3 days ago",
  ),
];

const r = (
  id: string,
  parentId: string,
  authorId: string,
  text: string,
  ago: string,
  base: number,
  more: Partial<Reply> = {},
): Reply => {
  const m = memberOf(authorId);
  return {
    id,
    parentId,
    name: m.name,
    tone: m.tone,
    text,
    ago,
    base,
    vote: 0,
    badge: "",
    op: false,
    accepted: false,
    hidden: false,
    ...more,
  };
};

export const REPLIES: Record<string, Reply[]> = {
  t1: [
    r("t1-1", "", "sam", "Thanks, this helped me a lot.", "4 weeks ago", 6),
    r("t1-2", "t1-1", "dana", "Glad to hear it. Welcome!", "4 weeks ago", 2),
    r("t1-3", "", "leo", "Pinning this in my bookmarks.", "3 weeks ago", 3),
  ],
  t2: [
    r(
      "t2-1",
      "",
      "priya",
      "Run it with `--inspect` first. Nine times out of ten the leak is a listener that is never removed.",
      "3h ago",
      12,
    ),
    r(
      "t2-2",
      "t2-1",
      "sam",
      "That was it, the resize handler. Thank you!",
      "2h ago",
      3,
      { op: true },
    ),
    r(
      "t2-3",
      "t2-2",
      "priya",
      "Add a cleanup in the effect so it cannot come back.",
      "2h ago",
      4,
    ),
    r(
      "t2-4",
      "",
      "leo",
      "Check your timers too. A setInterval without a clear will hold the whole closure.",
      "1h ago",
      7,
    ),
    r("t2-5", "", "bot", "Spam removed.", "1h ago", -3, { hidden: true }),
  ],
  t3: [
    r(
      "t3-1",
      "",
      "priya",
      "Lovely. How do you handle the empty state?",
      "18h ago",
      5,
    ),
    r(
      "t3-2",
      "t3-1",
      "leo",
      "A single `if` in the template, the list is just empty.",
      "17h ago",
      2,
      { op: true },
    ),
  ],
  t4: [
    r(
      "t4-1",
      "",
      "dana",
      "Extract pure helpers first (`validate`, `sort`, `format`), test each, then let the handler only compose them.",
      "8h ago",
      9,
    ),
  ],
  t5: [
    r("t5-1", "", "sam", "Tea, with a lot of honey.", "1 day ago", 4),
    r("t5-2", "", "dana", "Coffee. Always coffee.", "1 day ago", 6),
  ],
  t8: [
    r(
      "t8-1",
      "",
      "leo",
      "Upgraded in five minutes. Thank you!",
      "2 days ago",
      11,
    ),
  ],
};
