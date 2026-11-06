// The data and the pure logic of the diary: every list the page shows is
// worked out from one `Core` object by `derive`.
import { type Month, titleOf } from "../../lib/calendar.ts";
import { type Filter, filtersOf } from "../../blocks/list-filter/filters.ts";
import {
  type Comment,
  type CommentCard,
  cardOf as commentCard,
  commentCounts,
  commentsOf,
} from "../../blocks/journal-comments/comments.ts";
import {
  type Draft,
  counterOf,
  emptyDraft,
  type PrivacyChoice,
  privacyChoices,
  postFromDraft,
} from "../../blocks/entry-editor/editor.ts";
import {
  type EntryCard,
  entryCard,
  PRIVACY,
  type Person,
  type Post,
} from "../../blocks/journal-entry/entry.ts";
import {
  type FriendCard,
  friendCards,
} from "../../blocks/friend-latest/friends.ts";
import {
  type ArchiveView,
  archiveView,
  countByDay,
} from "../../blocks/month-archive/archive.ts";
import { longDate } from "../../blocks/month-archive/dates.ts";
import {
  type PickerMood,
  pickerMoods,
} from "../../blocks/mood-picker/moods.ts";
import {
  cardOf as profileCard,
  type Profile,
  type ProfileCard,
  profileStats,
  type Stat,
} from "../../blocks/journal-profile/profile.ts";
import {
  cloud,
  countTags,
  type CloudTag,
} from "../../blocks/tag-cloud/tags.ts";

export const TODAY = "2026-11-03";
export const NOW_TIME = "22:15";

export const ME_ID = "anna";

export const FRIENDS: Person[] = [
  { id: "martha", name: "Martha Kell", hue: 24, handle: "marthak" },
  { id: "tomas", name: "Tomas Ruiz", hue: 200, handle: "tomasr" },
  { id: "jonas", name: "Jonas Lindqvist", hue: 280, handle: "jonasl" },
  { id: "ida", name: "Ida Holm", hue: 140, handle: "idaholm" },
];

const p = (
  id: string,
  author: string,
  iso: string,
  time: string,
  title: string,
  mood: string,
  tags: string[],
  privacy: Post["privacy"],
  body: string,
  music = "",
  location = "",
): Post => ({
  id,
  author,
  iso,
  time,
  title,
  body,
  mood,
  music,
  location,
  tags,
  privacy,
});

export const POSTS: Post[] = [
  p(
    "e1",
    ME_ID,
    "2026-11-03",
    "21:40",
    "The first evening the heating came back on",
    "calm",
    ["autumn", "home"],
    "friends",
    "The radiators ticked and groaned around six, the way they do every November, and the whole flat smelled of warm dust for an hour. I made tea and sat on the floor next to the one that works best.\n\nI keep thinking how much of a year is made of small thresholds like this: the first coat, the first dark commute, the first time you turn on a lamp at four in the afternoon and do not feel sad about it.\n\nTomorrow I will finally write to Martha. Tonight I only wanted to notice the warmth.",
    "Nils Frahm, Says",
    "Lisbon, at home",
  ),
  p(
    "e2",
    ME_ID,
    "2026-11-02",
    "08:15",
    "Coffee at the station kiosk",
    "energetic",
    ["coffee", "city", "mornings"],
    "public",
    "There is a man at the Cais do Sodre kiosk who remembers my order after one visit and has never once pretended to remember my name. I find that more respectful than the alternative.\n\nThe ferry was late, the sky was the colour of a pigeon, and I drank the whole espresso standing up, watching people run for a boat that had not even arrived.",
    "Khruangbin, Maria Tambien",
    "Cais do Sodre",
  ),
  p(
    "e3",
    ME_ID,
    "2026-11-02",
    "23:05",
    "A list of things I owe people",
    "anxious",
    ["work", "family"],
    "private",
    "A letter to Martha. The second half of the translation, due Friday. A phone call to my mother that is now three weeks late. Fifty euros to Tomas for the concert tickets. An apology to nobody in particular, which is the hardest one to pay.\n\nWriting it down makes it smaller. Slightly.",
    "",
    "Lisbon",
  ),
  p(
    "e4",
    ME_ID,
    "2026-11-01",
    "17:30",
    "All Saints' Day, with soup",
    "nostalgic",
    ["cooking", "family", "autumn"],
    "friends",
    "My grandmother made caldo verde on the first of November every year, and every year I complained that it was too much cabbage. Today I made it from her handwritten card, with the potato stirred in the way she insisted on.\n\nIt was too much cabbage. I had two bowls.",
    "Cesaria Evora, Sodade",
    "Lisbon, at home",
  ),
  p(
    "e5",
    ME_ID,
    "2026-10-30",
    "19:10",
    "Vinyl Friday",
    "happy",
    ["music", "vinyl", "city"],
    "public",
    "I came home from the record fair with three albums I did not need and a stranger's pencilled note in one of the sleeves: 'play the second side first'. So I did. It was right.\n\nThe neighbours knocked at ten, but kindly, to ask what was playing.",
    "Bill Evans, Waltz for Debby",
    "Feira da Ladra",
  ),
  p(
    "e6",
    ME_ID,
    "2026-10-29",
    "07:45",
    "Tram 28 before anyone else",
    "calm",
    ["walks", "city", "mornings"],
    "public",
    "At seven the tram is almost empty and the whole of Alfama looks like it has been washed. A woman was hanging sheets over a balcony rail and, in the quiet, I heard each one snap in the wind.\n\nI got off two stops early just to keep walking.",
    "",
    "Alfama",
  ),
  p(
    "e7",
    ME_ID,
    "2026-10-27",
    "22:20",
    "Deadline week, day four",
    "tired",
    ["work", "coffee"],
    "friends",
    "Eleven thousand words translated, nine thousand to go. My brain has started to produce sentences in two languages at once and I no longer trust either of them.\n\nBed, finally. The poem can wait until the morning, and so can I.",
    "Brian Eno, Music for Airports",
    "Lisbon, at the desk",
  ),
  p(
    "e8",
    ME_ID,
    "2026-10-27",
    "09:00",
    "Translating a poem about rain",
    "inspired",
    ["work", "autumn"],
    "public",
    "Portuguese has four words for the kind of rain that does not quite fall, and English has one and a half. I spent the whole morning on a single line, and I would do it again.\n\nThe trick, I think, is to stop translating the words and translate the weather.",
    "Max Richter, On the Nature of Daylight",
    "Lisbon, at the desk",
  ),
  p(
    "e9",
    ME_ID,
    "2026-10-21",
    "18:00",
    "Long walk to the lighthouse",
    "energetic",
    ["walks", "autumn"],
    "public",
    "Cabo Raso on a windy Wednesday: eleven kilometres, one flask of tea, and a lighthouse keeper's dog that walked the last two with us as if we had hired him.\n\nThe sea was every shade of slate. I took no photographs and I remember all of it.",
    "Fleet Foxes, Helplessness Blues",
    "Cabo Raso",
  ),
  p(
    "e10",
    ME_ID,
    "2026-10-14",
    "20:45",
    "My mother's recipe for fig jam",
    "nostalgic",
    ["cooking", "family", "autumn"],
    "friends",
    "She dictated it over the phone and I wrote it on the back of an electricity bill: equal weight of figs and sugar, the juice of one lemon, patience. 'Patience' is underlined twice.\n\nThe kitchen smelled like her house for the whole afternoon.",
    "Amalia Rodrigues, Estranha Forma de Vida",
    "Lisbon, at home",
  ),
  p(
    "e11",
    ME_ID,
    "2026-10-12",
    "11:30",
    "Sunday market",
    "happy",
    ["city", "cooking", "walks"],
    "public",
    "Chestnuts, a bag of lemons the size of fists, and a man selling only one kind of cheese who talked about it like a lost love. I bought too much and carried it home in my arms.",
    "",
    "Mercado de Campo de Ourique",
  ),
  // friends
  p(
    "m1",
    "martha",
    "2026-11-02",
    "21:10",
    "A bakery that opens at five",
    "happy",
    ["city", "mornings"],
    "friends",
    "I walked past it on the way to the night bus and the whole street smelled of cardamom. The baker waved me in and gave me the heel of a loaf without asking for money.\n\nI have been thinking about small kindnesses like that all day: they cost nothing and they hold up whole weeks.",
    "Khruangbin, Time (You and I)",
    "Porto",
  ),
  p(
    "m2",
    "martha",
    "2026-10-25",
    "10:00",
    "Moving boxes",
    "tired",
    ["home"],
    "public",
    "Forty-one boxes, six of them labelled 'misc', one labelled 'do not open until Christmas' in handwriting I do not remember. The new flat has a window that faces east and I am already in love with it.",
  ),
  p(
    "t1",
    "tomas",
    "2026-10-30",
    "18:20",
    "Notes on a quiet week",
    "calm",
    ["walks", "home"],
    "friends",
    "Nothing happened and I want to remember it exactly like that: the slow coffee, the long emails not sent, a book finished on a tram and left on the seat for whoever came next.",
    "Brian Eno, An Ending (Ascent)",
  ),
  p(
    "t2",
    "tomas",
    "2026-11-01",
    "23:10",
    "A letter I will not send",
    "sad",
    ["family"],
    "private",
    "Private. Only for me.",
  ),
  p(
    "j1",
    "jonas",
    "2026-11-03",
    "12:05",
    "The bakery strike, day two",
    "energetic",
    ["city", "work"],
    "public",
    "The union has asked everyone to buy bread from the small shops instead, so I queued for forty minutes at a place I had walked past for years and came out with a loaf that was still warm. If this is what a strike looks like, I am for it.",
    "Rage Against the Machine, Bulls on Parade",
    "Stockholm",
  ),
  p(
    "i1",
    "ida",
    "2026-10-12",
    "20:00",
    "The lake in October",
    "nostalgic",
    ["autumn", "walks"],
    "public",
    "Mist until eleven. We rowed out to the middle and stopped talking. When the sun finally cleared the pines, the water went from pewter to bronze in under a minute, and nobody said a word about it.",
    "",
    "Lake Siljan",
  ),
];

const c = (
  id: string,
  entryId: string,
  author: string,
  hue: number,
  when: string,
  text: string,
): Comment => ({ id, entryId, author, hue, when, text });

export const COMMENTS: Comment[] = [
  c(
    "c1",
    "e1",
    "Martha Kell",
    24,
    "yesterday",
    "I read this twice. The radiators here do exactly the same thing, and I had never noticed the smell was a ritual.",
  ),
  c(
    "c2",
    "e1",
    "Tomas Ruiz",
    200,
    "yesterday",
    "Write to her. You will feel lighter by Thursday.",
  ),
  c(
    "c3",
    "e1",
    "Ida Holm",
    140,
    "today",
    "A lamp at four in the afternoon. Yes. Exactly that.",
  ),
  c(
    "c4",
    "e2",
    "Jonas Lindqvist",
    280,
    "2 days ago",
    "Respect the man at the kiosk. A good barista is a quiet kind of librarian.",
  ),
  c(
    "c5",
    "e4",
    "Martha Kell",
    24,
    "2 days ago",
    "Too much cabbage is the correct amount of cabbage.",
  ),
  c(
    "c6",
    "e4",
    "Ida Holm",
    140,
    "2 days ago",
    "Send me the card. I will pretend it is mine.",
  ),
  c(
    "c7",
    "e5",
    "Tomas Ruiz",
    200,
    "4 days ago",
    "Second side first is a rule I will now follow for life.",
  ),
  c(
    "c8",
    "e6",
    "Jonas Lindqvist",
    280,
    "5 days ago",
    "I can hear those sheets from here.",
  ),
  c(
    "c9",
    "e8",
    "Ida Holm",
    140,
    "a week ago",
    "Translate the weather. I am stealing that for my own work.",
  ),
  c(
    "c10",
    "e9",
    "Martha Kell",
    24,
    "2 weeks ago",
    "The dog has clearly decided you were the right kind of people.",
  ),
  c(
    "c11",
    "m1",
    "Anna Wren",
    336,
    "yesterday",
    "The heel of a loaf is the best part, and everybody knows it.",
  ),
  c(
    "c12",
    "j1",
    "Anna Wren",
    336,
    "today",
    "Queue solidarity. Report back on the bread.",
  ),
];

/** Everything that changes while the page is used. */
export interface Core {
  posts: Post[];
  comments: Comment[];
  /** The userpic hue of the owner. */
  hue: number;
  /** Filters of the journal. */
  tag: string;
  day: string;
  privacy: string;
  month: Month;
  /** The entry open on its own page, and the one in reading mode. */
  openId: string;
  readerId: string;
  /** Friends' entries that were opened. */
  seen: string[];
  draft: Draft;
  editingId: string;
  errors: Record<string, string>;
  commentDraft: string;
  commentError: string;
}

export const startCore = (): Core => ({
  posts: POSTS,
  comments: COMMENTS,
  hue: 336,
  tag: "",
  day: "",
  privacy: "all",
  month: { year: 2026, month: 10 },
  openId: "",
  readerId: "",
  seen: ["i1", "m2"],
  draft: emptyDraft(),
  editingId: "",
  errors: {},
  commentDraft: "",
  commentError: "",
});

export const peopleOf = (core: Core): Person[] => [
  { id: ME_ID, name: "Anna Wren", hue: core.hue, handle: "annawren" },
  ...FRIENDS,
];

export const personOf = (core: Core, id: string): Person =>
  peopleOf(core).find((x) => x.id === id) ?? peopleOf(core)[0];

const stamp = (x: Post): string => `${x.iso} ${x.time}`;
const newestFirst = (list: Post[]): Post[] =>
  [...list].sort((a, b) => stamp(b).localeCompare(stamp(a)));

export const minePosts = (core: Core): Post[] =>
  core.posts.filter((x) => x.author === ME_ID);

/** Pure: does an entry pass the tag, day and privacy filters of the journal? */
export function passes(core: Core, x: Post): boolean {
  return (
    (!core.tag || x.tags.includes(core.tag)) &&
    (!core.day || x.iso === core.day) &&
    (core.privacy === "all" || x.privacy === core.privacy)
  );
}

export const profileOf = (core: Core): Profile => ({
  name: "Anna Wren",
  handle: "annawren",
  hue: core.hue,
  location: "Lisbon",
  since: "March 2019",
  bio: "Translator by day, notebook hoarder by night. I write about weather, trams and the people I almost call.",
});

function cards(core: Core, list: Post[]): EntryCard[] {
  const counts = commentCounts(core.comments);
  return list.map((x) =>
    entryCard(x, personOf(core, x.author), counts[x.id] ?? 0),
  );
}

/** Pure: the entry a half-written draft would become, with placeholders. */
export function previewCard(core: Core): EntryCard {
  const d = core.draft;
  const post = postFromDraft(
    {
      ...d,
      title: d.title.trim() || "Untitled entry",
      body: d.body.trim() || "Your entry appears here as you type it.",
    },
    "preview",
    personOf(core, ME_ID),
    TODAY,
    NOW_TIME,
  );
  return entryCard(post, personOf(core, ME_ID), 0);
}

export interface Derived {
  feed: EntryCard[];
  privFilters: Filter[];
  filterText: string;
  hasFilter: boolean;
  tags: CloudTag[];
  archive: ArchiveView;
  archiveTitle: string;
  archiveList: EntryCard[];
  friends: FriendCard[];
  profile: ProfileCard;
  stats: Stat[];
  opened: EntryCard[];
  openedMine: boolean;
  comments: CommentCard[];
  commentsHeading: string;
  reader: EntryCard[];
  preview: EntryCard[];
  moods: PickerMood[];
  privacies: PrivacyChoice[];
  counter: string;
  editing: boolean;
  entryCount: string;
}

const PRIV_DEFS: [string, string][] = [
  ["all", "All entries"],
  ...PRIVACY.map((x): [string, string] => [x.id, x.label]),
];

/** Pure: every list and number the page shows, from the core. */
export function derive(core: Core): Derived {
  const mine = minePosts(core);
  const byDay = countByDay(mine.map((x) => x.iso));
  const open = core.posts.find((x) => x.id === core.openId);
  const reading = core.posts.find((x) => x.id === core.readerId);
  const monthPrefix = `${core.month.year}-${String(core.month.month + 1).padStart(2, "0")}`;
  const inArchive = mine.filter((x) =>
    core.day ? x.iso === core.day : x.iso.startsWith(monthPrefix),
  );
  const filterParts = [
    core.tag ? `tagged #${core.tag}` : "",
    core.day ? `written on ${longDate(core.day)}` : "",
  ].filter(Boolean);
  const feedPosts = newestFirst(mine.filter((x) => passes(core, x)));
  const openComments = open ? commentsOf(core.comments, open.id) : [];
  return {
    feed: cards(core, feedPosts),
    privFilters: filtersOf(
      PRIV_DEFS,
      core.privacy,
      mine.filter(
        (x) =>
          (!core.tag || x.tags.includes(core.tag)) &&
          (!core.day || x.iso === core.day),
      ),
      (x, id) => x.privacy === id,
    ),
    filterText: filterParts.length ? `Entries ${filterParts.join(", ")}` : "",
    hasFilter: filterParts.length > 0,
    tags: cloud(countTags(mine.map((x) => x.tags)), core.tag),
    archive: archiveView(core.month, byDay, core.day, TODAY),
    archiveTitle: core.day ? longDate(core.day) : titleOf(core.month),
    archiveList: cards(core, newestFirst(inArchive)),
    friends: friendCards(FRIENDS, core.posts, TODAY, core.seen),
    profile: profileCard(profileOf(core)),
    stats: profileStats(mine, FRIENDS.length, commentsOnMine(core), TODAY),
    opened: open ? cards(core, [open]) : [],
    openedMine: open?.author === ME_ID,
    comments: openComments.map(commentCard),
    commentsHeading: `${openComments.length} ${openComments.length === 1 ? "comment" : "comments"}`,
    reader: reading ? cards(core, [reading]) : [],
    preview: [previewCard(core)],
    moods: pickerMoods(core.draft.mood),
    privacies: privacyChoices(core.draft.privacy),
    counter: counterOf(core.draft.body),
    editing: core.editingId !== "",
    entryCount: `${mine.length} entries`,
  };
}

/** Pure: comments left under the owner's entries by other people. */
export function commentsOnMine(core: Core): number {
  const ids = new Set(minePosts(core).map((x) => x.id));
  return core.comments.filter(
    (x) => ids.has(x.entryId) && x.author !== "Anna Wren",
  ).length;
}
