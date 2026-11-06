import { expect, test } from "vitest";
import {
  ANSWERS,
  answerFor,
  appendMessage,
  canSend,
} from "../blocks/chat-thread/chat-thread.ts";
import {
  addComment,
  countLabel,
  likeComment,
  type Comment,
} from "../blocks/comment-thread/comment-thread.ts";
import {
  bumpConversation,
  chatOf,
  ensureConversation,
  openConversation,
  searchConversations,
  totalUnread,
  type Conversation,
} from "../blocks/conversation-list/conversation-list.ts";
import {
  duration,
  monthLabel,
  positionRows,
} from "../blocks/experience-list/experience-list.ts";
import {
  compact,
  initialsOf,
  toggleLike,
  toggleShare,
  type Post,
} from "../blocks/feed-post/feed-post.ts";
import {
  addId,
  jobProps,
  salaryLabel,
  toggleId,
} from "../blocks/job-card/job-card.ts";
import {
  parseInline,
  parseMarkup,
} from "../blocks/markup-preview/markup-preview.ts";
import {
  readAllNotes,
  readNote,
  unreadCount,
  type Note,
} from "../blocks/notification-list/notification-list.ts";
import { personRows } from "../blocks/people-list/people-list.ts";
import { photoProps, type PhotoData } from "../blocks/photo-card/photo-card.ts";
import {
  canPost,
  charsLeft,
  composerProps,
  LIMIT,
  moodLabel,
  pickMood,
} from "../blocks/post-composer/post-composer.ts";
import {
  followers,
  personStats,
} from "../blocks/profile-header/profile-header.ts";
import { badgeOf, tierOf } from "../blocks/rep-badge/rep-badge.ts";
import {
  acceptReply,
  addReply,
  descendants,
  flattenReplies,
  hideReply,
  rowsOf,
  voteOn,
  type Reply,
} from "../blocks/reply-tree/reply-tree.ts";
import {
  skillRows,
  toggleEndorse,
  whoLine,
} from "../blocks/skill-endorse/skill-endorse.ts";
import { navProps } from "../blocks/social-nav/social-nav.ts";
import { markSeen, ringsOf, viewerOf } from "../blocks/story-row/story-row.ts";
import {
  isUnanswered,
  sortThreads,
  type ThreadItem,
} from "../blocks/thread-row/thread-row.ts";
import { trendRows } from "../blocks/trend-list/trend-list.ts";
import {
  applyVote,
  scoreOf,
  voteTotal,
} from "../blocks/vote-buttons/vote-buttons.ts";
import {
  derive as forumDerive,
  validateThread,
  visibleThreads,
} from "../templates/community-forum/community-forum.ts";
import {
  CATEGORIES,
  REPLIES,
  THREADS,
} from "../templates/community-forum/community-forum-data.ts";
import {
  addPhoto,
  albumCounts,
  filterPhotos,
  NEW_ALBUM,
  parseTags,
  relatedTags,
  validateUpload,
  derive as photoDerive,
  type UploadForm,
} from "../templates/photo-sharing-network/photo-sharing-network.ts";
import { PHOTOS } from "../templates/photo-sharing-network/photo-sharing-network-data.ts";
import {
  answerInvite,
  filterJobs,
  relationTo,
  derive as proDerive,
  initial as proInitial,
  type Core as ProCore,
  type JobFilter,
} from "../templates/professional-network/professional-network.ts";
import { JOBS } from "../templates/professional-network/professional-network-data.ts";
import {
  derive as feedDerive,
  feedItems,
  postsOf,
  publish,
  visiblePosts,
  initial as feedInitial,
  type Core as FeedCore,
} from "../templates/social-network-feed/social-network-feed.ts";
import {
  COMMENTS,
  POSTS,
} from "../templates/social-network-feed/social-network-feed-data.ts";

const reply = (
  id: string,
  parentId: string,
  base: number,
  more: Partial<Reply> = {},
): Reply => ({
  id,
  parentId,
  name: "Ann Lee",
  tone: 1,
  text: id,
  ago: "1h",
  base,
  vote: 0,
  badge: "",
  op: false,
  accepted: false,
  hidden: false,
  ...more,
});

test("votes: the same arrow twice takes the vote back", () => {
  expect(applyVote(0, 1)).toBe(1);
  expect(applyVote(1, 1)).toBe(0);
  expect(applyVote(1, -1)).toBe(-1);
  expect(applyVote(-1, -1)).toBe(0);
  expect(scoreOf(10, -1)).toBe(9);
  expect(
    voteTotal([
      { base: 3, vote: 1 },
      { base: 5, vote: 0 },
      { base: 0, vote: -1 },
    ]),
  ).toBe(8);
});

test("replies are flattened depth first, accepted then best first", () => {
  const list = [
    reply("a", "", 1),
    reply("b", "", 5),
    reply("a1", "a", 0),
    reply("b1", "b", 2),
    reply("b2", "b", 9),
    reply("c", "", 0, { accepted: true }),
  ];
  expect(flattenReplies(list).map((x) => [x.reply.id, x.depth])).toEqual([
    ["c", 0],
    ["b", 0],
    ["b2", 1],
    ["b1", 1],
    ["a", 0],
    ["a1", 1],
  ]);
});

test("a deep chain stops growing in depth, an orphan becomes a root", () => {
  const chain = ["r0", "r1", "r2", "r3", "r4", "r5", "r6"].map((id, i) =>
    reply(id, i === 0 ? "" : `r${i - 1}`, 0),
  );
  expect(Math.max(...flattenReplies(chain).map((x) => x.depth))).toBe(4);
  const orphan = [reply("o", "missing", 0)];
  expect(flattenReplies(orphan)).toHaveLength(1);
  expect(descendants(chain, "r0")).toBe(6);
});

test("rows: who can accept, hide and which is being answered", () => {
  const list = [reply("a", "", 1), reply("a1", "a", 0)];
  const rows = rowsOf(list, "a1", true, true);
  expect(rows.map((r) => r.canAccept)).toEqual([true, false]);
  expect(rows.map((r) => r.replying)).toEqual([false, true]);
  expect(rows.every((r) => r.canMod)).toBe(true);
  expect(rowsOf(list, "", false)[0]?.canAccept).toBe(false);
});

test("replies: vote, accept one, hide, add", () => {
  const list = [reply("a", "", 1), reply("b", "", 2)];
  expect(voteOn(list, "a", 1)[0]?.vote).toBe(1);
  const accepted = acceptReply(list, "a");
  expect(accepted.map((r) => r.accepted)).toEqual([true, false]);
  expect(
    acceptReply(acceptReply(accepted, "b"), "b").every((r) => !r.accepted),
  ).toBe(true);
  expect(hideReply(list, "b")[1]?.hidden).toBe(true);
  const author = { name: "Me", tone: 2, badge: "" };
  expect(addReply(list, "a", "  hi  ", author, "n1")).toHaveLength(3);
  expect(addReply(list, "a", "   ", author, "n1")).toBe(list);
});

test("markup: headings, lists, quotes, code and inline styles", () => {
  const blocks = parseMarkup(
    "# Title\n\nSome **bold** and *it* and `x`\nsecond line\n\n- one\n- two\n> said\n```\nlet a;\n let b;\n```\nend",
  );
  expect(blocks.map((b) => b.kind)).toEqual([
    "h",
    "p",
    "li",
    "li",
    "quote",
    "code",
    "p",
  ]);
  expect(blocks[1]?.parts.map((p) => p.style)).toEqual([
    "",
    "b",
    "",
    "i",
    "",
    "c",
    "",
  ]);
  expect(blocks[1]?.parts.at(-1)?.text).toBe(
    "\nsecond line".replace("\n", " "),
  );
  expect(blocks[5]?.parts[0]?.text).toBe("let a;\n let b;");
  expect(parseMarkup("")).toEqual([]);
  expect(parseInline("a * b", "x")).toHaveLength(1);
  expect(parseMarkup("```\nopen").at(0)?.kind).toBe("code");
});

test("reputation tiers follow the points", () => {
  expect(tierOf(-5).label).toBe("Newcomer");
  expect(tierOf(100).label).toBe("Regular");
  expect(tierOf(499).label).toBe("Regular");
  expect(tierOf(5000).label).toBe("Legend");
  expect(badgeOf(1234).points).toBe("1.2k");
  expect(badgeOf(0, true).label).toBe("Moderator");
  expect(badgeOf(900, false, false).points).toBe("");
});

const item = (id: string, more: Partial<ThreadItem> = {}): ThreadItem => ({
  id,
  title: id,
  name: "x",
  category: "c",
  emoji: "",
  score: 0,
  replies: 1,
  views: 0,
  hours: 10,
  ago: "",
  pinned: false,
  locked: false,
  solved: false,
  hidden: false,
  ...more,
});

test("thread sorting: pinned first, then new, top or unanswered", () => {
  const list = [
    item("a", { hours: 5, score: 1 }),
    item("b", { hours: 1, score: 9, replies: 0 }),
    item("c", { hours: 99, score: 50, pinned: true }),
    item("d", { hours: 2, score: 3, replies: 0, solved: true }),
  ];
  expect(sortThreads(list, "new").map((t) => t.id)).toEqual([
    "c",
    "b",
    "d",
    "a",
  ]);
  expect(sortThreads(list, "top").map((t) => t.id)).toEqual([
    "c",
    "b",
    "d",
    "a",
  ]);
  expect(sortThreads(list, "unanswered").map((t) => t.id)).toEqual(["b"]);
  expect(isUnanswered(item("z", { replies: 0 }))).toBe(true);
  expect(isUnanswered(item("z", { replies: 0, solved: true }))).toBe(false);
});

test("posts: counts, likes, shares, initials", () => {
  expect(compact(999)).toBe("999");
  expect(compact(1234)).toBe("1.2k");
  expect(compact(15400)).toBe("15k");
  expect(compact(2_500_000)).toBe("2.5M");
  expect(initialsOf("Ann Marie Lee")).toBe("AM");
  const p = { likes: 0, liked: false, shares: 2, shared: true } as Post;
  expect(toggleLike(p)).toMatchObject({ likes: 1, liked: true });
  expect(toggleLike(toggleLike(p)).likes).toBe(0);
  expect(toggleShare(p)).toMatchObject({ shares: 1, shared: false });
});

test("chat: appending and answering", () => {
  expect(canSend("  ")).toBe(false);
  expect(canSend("hi")).toBe(true);
  const list = appendMessage([], "  hello ", true, "now", "m1");
  expect(list).toEqual([{ id: "m1", mine: true, text: "hello", time: "now" }]);
  expect(appendMessage(list, "  ", true, "now", "m2")).toBe(list);
  expect(answerFor(0)).toBe(ANSWERS[0]);
  expect(answerFor(ANSWERS.length + 1)).toBe(ANSWERS[1]);
  expect(answerFor(-1)).toBe(ANSWERS.at(-1));
});

const convs: Conversation[] = [
  {
    id: "a",
    name: "Ann Lee",
    tone: 1,
    preview: "see you",
    time: "1h",
    unread: 2,
    online: true,
  },
  {
    id: "b",
    name: "Bo Ray",
    tone: 2,
    preview: "thanks",
    time: "2h",
    unread: 3,
    online: false,
  },
];

test("conversations: search, read, bump, create", () => {
  expect(searchConversations(convs, "ANN")).toHaveLength(1);
  expect(searchConversations(convs, "thank")[0]?.id).toBe("b");
  expect(searchConversations(convs, " ")).toBe(convs);
  expect(totalUnread(convs)).toBe(5);
  expect(totalUnread(openConversation(convs, "a"))).toBe(3);
  const bumped = bumpConversation(convs, "b", "later");
  expect(bumped[0]).toMatchObject({ id: "b", preview: "later", unread: 0 });
  expect(bumpConversation(convs, "zzz", "x")).toBe(convs);
  const made = ensureConversation(
    convs,
    {},
    { id: "c", name: "Cy Dee", tone: 3 },
  );
  expect(made.list[0]?.id).toBe("c");
  expect(made.messages.c).toEqual([]);
  expect(
    ensureConversation(convs, {}, { id: "a", name: "x", tone: 1 }).list,
  ).toBe(convs);
  const chat = chatOf(convs, { a: [] }, "a", "hey", true);
  expect(chat).toMatchObject({
    title: "Ann Lee",
    subtitle: "Active now",
    canSend: true,
    typing: true,
  });
  expect(chatOf(convs, {}, "nope", "", false).title).toBe("Nobody selected");
});

const comment = (id: string): Comment => ({
  id,
  name: "A",
  tone: 1,
  text: "t",
  ago: "1h",
  likes: 0,
  liked: false,
});

test("comments: like, add, label", () => {
  const liked = likeComment([comment("a"), comment("b")], "b");
  expect(liked[1]).toMatchObject({ liked: true, likes: 1 });
  expect(likeComment(liked, "b")[1]?.likes).toBe(0);
  expect(addComment([], " hi ", { name: "Me", tone: 1 }, "n")).toHaveLength(1);
  expect(addComment([], " ", { name: "Me", tone: 1 }, "n")).toEqual([]);
  expect(countLabel(1)).toBe("1 comment");
  expect(countLabel(0)).toBe("0 comments");
});

test("stories: unseen first, seen once, viewer", () => {
  const stories = [
    { id: "1", label: "Ann Lee", tone: 1, emoji: "a", text: "t", ago: "1h" },
    { id: "2", label: "Bo", tone: 2, emoji: "b", text: "t", ago: "1h" },
  ];
  expect(ringsOf(stories, ["1"]).map((r) => r.id)).toEqual(["2", "1"]);
  expect(ringsOf(stories, []).map((r) => r.seen)).toEqual([false, false]);
  expect(markSeen(["1"], "1")).toEqual(["1"]);
  expect(markSeen(["1"], "2")).toEqual(["1", "2"]);
  expect(viewerOf(stories, "1")?.initials).toBe("AL");
  expect(viewerOf(stories, "x")).toBeNull();
});

test("composer: limit, mood and props", () => {
  expect(canPost("")).toBe(false);
  expect(canPost("x".repeat(LIMIT))).toBe(true);
  expect(canPost("x".repeat(LIMIT + 1))).toBe(false);
  expect(charsLeft("abc")).toBe(LIMIT - 3);
  expect(pickMood("happy", "happy")).toBe("");
  expect(pickMood("", "tired")).toBe("tired");
  expect(moodLabel("happy")).toBe("😊 feeling happy");
  expect(moodLabel("nope")).toBe("");
  const props = composerProps("hi", "happy", true);
  expect(props.moods.filter((m) => m.active)).toHaveLength(1);
  expect(props.photo).not.toBe("");
  expect(props.canPost).toBe(true);
});

test("notifications and trends", () => {
  const notes: Note[] = [
    {
      id: "1",
      name: "A",
      tone: 1,
      glyph: "heart",
      text: "t",
      ago: "1h",
      unread: true,
    },
    {
      id: "2",
      name: "B",
      tone: 1,
      glyph: "heart",
      text: "t",
      ago: "1h",
      unread: true,
    },
  ];
  expect(unreadCount(notes)).toBe(2);
  expect(unreadCount(readNote(notes, "1"))).toBe(1);
  expect(unreadCount(readAllNotes(notes))).toBe(0);
  const rows = trendRows(
    [
      { id: "a", tag: "#a", posts: 10 },
      { id: "b", tag: "#b", posts: 2500 },
    ],
    "a",
  );
  expect(rows.map((r) => r.id)).toEqual(["b", "a"]);
  expect(rows[0]?.sub).toBe("2.5k posts");
  expect(rows[1]?.active).toBe(true);
});

test("people rows and header counters", () => {
  const rows = personRows(
    [
      { id: "a", name: "Ann Lee", tone: 1, sub: "x" },
      { id: "b", name: "Bo Ray", tone: 2, sub: "y" },
    ],
    ["a"],
    "Follow",
    "Following",
    "Ignore",
  );
  expect(rows[0]).toMatchObject({
    done: true,
    primaryLabel: "Following",
    secondaryLabel: "",
  });
  expect(rows[1]).toMatchObject({
    done: false,
    primaryLabel: "Follow",
    secondaryLabel: "Ignore",
  });
  expect(personStats(12, 3400, 8).map((s) => s.value)).toEqual([
    "12",
    "3.4k",
    "8",
  ]);
  expect(followers(10, true)).toBe(11);
  const nav = navProps(
    "Hello",
    [{ id: "a", label: "A", glyph: "home", badge: 0 }],
    "me",
  );
  expect(nav.meActive).toBe(true);
  expect(nav.mark).toBe("H");
});

test("experience and skills", () => {
  expect(monthLabel(2021.03)).toBe("Mar 2021");
  expect(monthLabel(2020.12)).toBe("Dec 2020");
  expect(duration(2021.01, 2022.12, 2026.11)).toBe("2 yrs");
  expect(duration(2021.03, 0, 2021.04)).toBe("2 mos");
  const rows = positionRows(
    [
      {
        id: "a",
        role: "r",
        company: "c",
        companyId: "c",
        emoji: "",
        tone: 1,
        start: 2018.01,
        end: 2020.01,
        place: "",
        text: "",
      },
      {
        id: "b",
        role: "r",
        company: "c",
        companyId: "c",
        emoji: "",
        tone: 1,
        start: 2020.02,
        end: 0,
        place: "",
        text: "",
      },
    ],
    2026.11,
  );
  expect(rows.map((r) => r.id)).toEqual(["b", "a"]);
  expect(rows[0]?.current).toBe(true);
  expect(rows[0]?.period).toContain("Present");
  const skills = [
    { id: "x", name: "X", count: 4, by: ["Ann"] },
    { id: "y", name: "Y", count: 9, by: [] },
  ];
  const sr = skillRows(skills, ["x"]);
  expect(sr.map((s) => s.id)).toEqual(["y", "x"]);
  expect(sr[0]?.share).toBe(100);
  expect(sr[1]).toMatchObject({ count: 5, endorsed: true, share: 56 });
  expect(whoLine(["Ann", "Bo"], 12, false)).toBe("Ann, Bo and 10 others");
  expect(whoLine(["Ann"], 1, false)).toBe("Ann");
  expect(whoLine([], 0, false)).toBe("No endorsements yet");
  expect(toggleEndorse(["x"], "x")).toEqual([]);
});

test("jobs: labels and marks", () => {
  expect(salaryLabel(0)).toBe("Pay not shown");
  expect(salaryLabel(95)).toBe("$95k a year");
  expect(toggleId(["a"], "a")).toEqual([]);
  expect(addId(["a"], "a")).toEqual(["a"]);
  const props = jobProps(JOBS.slice(0, 2), ["j1"], ["j2"]);
  expect(props.map((p) => [p.saved, p.applied])).toEqual([
    [true, false],
    [false, true],
  ]);
});

const nofilter: JobFilter = {
  query: "",
  kind: "All",
  level: "Any",
  savedOnly: false,
};

test("professional: job filters, invitations, relations", () => {
  expect(filterJobs(JOBS, nofilter, [])[0]?.id).toBe("j6");
  expect(
    filterJobs(JOBS, { ...nofilter, query: "design lumo" }, []).map(
      (j) => j.id,
    ),
  ).toEqual(["j1"]);
  expect(
    filterJobs(JOBS, { ...nofilter, kind: "Remote" }, []).every(
      (j) => j.kind === "Remote",
    ),
  ).toBe(true);
  expect(
    filterJobs(JOBS, { ...nofilter, level: "Junior" }, []).map((j) => j.level),
  ).toEqual(["Junior", "Junior", "Junior"]);
  expect(
    filterJobs(JOBS, { ...nofilter, savedOnly: true }, ["j3"]).map((j) => j.id),
  ).toEqual(["j3"]);
  expect(answerInvite(["a", "b"], [], "a", true)).toEqual({
    invites: ["b"],
    connections: ["a"],
  });
  expect(answerInvite(["a", "b"], [], "a", false)).toEqual({
    invites: ["b"],
    connections: [],
  });
  expect(relationTo("riley", [], [], [])).toBe("me");
  expect(relationTo("a", ["a"], [], [])).toBe("connected");
  expect(relationTo("a", [], ["a"], [])).toBe("sent");
  expect(relationTo("a", [], [], ["a"])).toBe("invited");
  expect(relationTo("a", [], [], [])).toBe("none");
});

test("photos: tags, validation, filters, albums", () => {
  expect(parseTags("Sunset, #Sea  harbor #sea !!")).toEqual([
    "#sunset",
    "#sea",
    "#harbor",
  ]);
  expect(parseTags("a b")).toEqual([]);
  expect(parseTags("one two three four five six seven")).toHaveLength(5);
  const ok: UploadForm = {
    title: "Golden hour",
    tags: "sunset",
    album: "Coast",
    newAlbum: "",
    emoji: "🌄",
    tone: "2",
  };
  expect(validateUpload(ok)).toEqual({});
  expect(
    Object.keys(
      validateUpload({ ...ok, title: "ab", tags: "", album: "" }),
    ).sort(),
  ).toEqual(["album", "tags", "title"]);
  expect(
    validateUpload({ ...ok, album: NEW_ALBUM, newAlbum: "x" }).newAlbum,
  ).toBeTruthy();
  const base = {
    tab: "explore" as const,
    following: ["hana"],
    album: "",
    tag: "",
    authorId: "",
    onlyIds: null,
  };
  expect(filterPhotos(PHOTOS, base)).toHaveLength(PHOTOS.length);
  expect(
    filterPhotos(PHOTOS, { ...base, tab: "following" }).every(
      (p) => p.authorId === "hana",
    ),
  ).toBe(true);
  expect(
    filterPhotos(PHOTOS, { ...base, album: "Lyon" }).every(
      (p) => p.album === "Lyon",
    ),
  ).toBe(true);
  expect(filterPhotos(PHOTOS, { ...base, onlyIds: ["f1", "f2"] })).toHaveLength(
    2,
  );
  expect(albumCounts(PHOTOS).find((a) => a.name === "Tokyo")?.count).toBe(3);
  expect(relatedTags(PHOTOS, "#city")).toContain("#night");
  const added = addPhoto(
    PHOTOS,
    { ...ok, album: NEW_ALBUM, newAlbum: " Trip " },
    "u1",
    4,
  );
  expect(added[0]).toMatchObject({
    id: "u1",
    album: "Trip",
    tags: ["#sunset"],
    tone: 2,
    tone2: 3,
  });
  const cards = photoProps(PHOTOS.slice(0, 1) as PhotoData[], ["f1"], []);
  expect(cards[0]).toMatchObject({ liked: true, likes: 215 });
});

test("forum: validation and visibility", () => {
  const f = {
    title: "A real question",
    category: "help",
    body: "x".repeat(20),
  };
  expect(validateThread(f)).toEqual({});
  expect(
    Object.keys(
      validateThread({ title: "short", category: "", body: "" }),
    ).sort(),
  ).toEqual(["body", "category", "title"]);
  expect(CATEGORIES.length).toBeGreaterThan(2);
  expect(visibleThreads(THREADS, "all", "", false).some((t) => t.hidden)).toBe(
    false,
  );
  expect(visibleThreads(THREADS, "all", "", true).some((t) => t.hidden)).toBe(
    true,
  );
  expect(
    visibleThreads(THREADS, "chat", "", true).every(
      (t) => t.categoryId === "chat",
    ),
  ).toBe(true);
  expect(visibleThreads(THREADS, "all", "memory growing", false)).toHaveLength(
    1,
  );
});

test("feed: topics, following, publishing, comments", () => {
  expect(visiblePosts(POSTS, "all", [], "").at(0)?.id).toBe("p1");
  expect(visiblePosts(POSTS, "all", [], "sourdough").map((p) => p.id)).toEqual([
    "p4",
    "p9",
  ]);
  expect(
    visiblePosts(POSTS, "following", ["maya"], "")
      .map((p) => p.handle)
      .sort(),
  ).toEqual(["alex", "alex", "maya"]);
  expect(postsOf(POSTS, "alex").map((p) => p.id)).toEqual(["p5", "p10"]);
  expect(publish(POSTS, "  ", "", false, "n")).toBe(POSTS);
  const next = publish(POSTS, " Hello ", "happy", true, "n1");
  expect(next[0]).toMatchObject({
    id: "n1",
    text: "Hello",
    mood: "😊 feeling happy",
    photo: "🌄",
    hours: 0,
  });
  const items = feedItems(POSTS.slice(0, 2), COMMENTS, "p1", "draft");
  expect(items[0]?.post.comments).toBe(3);
  expect(items[0]?.open).toBe(true);
  expect(items[0]?.thread.comments).toHaveLength(3);
  expect(items[1]?.thread.comments).toHaveLength(0);
});

test("every template derives its first screen", () => {
  const feed = feedDerive(feedInitial as FeedCore);
  expect(feed.feed.length).toBe(POSTS.length);
  expect(feed.nav.items.find((i) => i.id === "messages")?.badge).toBe(7);
  expect(feed.suggest.people).toHaveLength(4);
  expect(feed.alertList.unread).toBe(3);
  expect(
    photoDerive({
      view: "explore",
      tab: "explore",
      photos: PHOTOS,
      liked: [],
      saved: ["f3"],
      following: [],
      comments: {},
      detailId: "f1",
      commentDraft: "",
      album: "",
      tag: "#city",
      profileId: "jordan",
      form: {
        title: "",
        tags: "",
        album: "",
        newAlbum: "",
        emoji: "🌄",
        tone: "1",
      },
      errors: {},
      nextId: 1,
    }).grid,
  ).toHaveLength(PHOTOS.length);
  const f = forumDerive({
    view: "thread",
    threads: THREADS,
    replies: REPLIES,
    category: "all",
    sort: "new",
    query: "",
    openId: "t2",
    replyingTo: "",
    replyDraft: "",
    answerDraft: "",
    mod: false,
    form: { title: "", category: "", body: "" },
    errors: {},
    nextId: 1,
  });
  expect(f.detail?.title).toContain("Memory");
  expect(f.tree.rows.find((r) => r.id === "t2-2")?.op).toBe(true);
  expect(f.list.some((t) => t.hidden)).toBe(false);
  const pro = proDerive(proInitial as ProCore);
  expect(pro.invites.people).toHaveLength(2);
  expect(pro.head.primaryLabel).toBe("");
  expect(pro.jobs).toHaveLength(JOBS.length);
});
