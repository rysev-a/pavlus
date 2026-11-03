import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import { timeEffector as time } from "@service-laboratory/pavlus/plugins";
import { shiftMonth } from "../../lib/calendar.ts";
import { notice, patch } from "../../blocks/admin-shell/shell.ts";
import {
  addComment,
  validateComment,
} from "../../blocks/journal-comments/comments.ts";
import {
  draftOf,
  emptyDraft,
  nextId,
  postFromDraft,
  validateDraft,
  type Draft,
} from "../../blocks/entry-editor/editor.ts";
import type { Privacy } from "../../blocks/journal-entry/entry.ts";
import type { ToolbarAction } from "../../blocks/list-filter/filters.ts";
import {
  type Core,
  derive,
  type Derived,
  NOW_TIME,
  personOf,
  ME_ID,
  startCore,
  TODAY,
} from "./diary.ts";
import view from "./live-journal-diary.pavlus";

export type Screen =
  "journal" | "entry" | "write" | "archive" | "friends" | "profile" | "read";

export interface DiaryState extends Derived {
  screen: Screen;
  /** Where "Back" and "Leave reading mode" return to. */
  back: Screen;
  readBack: Screen;
  notice: string;
  core: Core;
  /** No buttons in a toolbar. */
  none: ToolbarAction[];
}

const core = startCore();

export const initial: DiaryState = {
  screen: "journal",
  back: "journal",
  readBack: "journal",
  notice: "",
  core,
  none: [],
  ...derive(core),
};

/** The diary: tabs, the filters of the journal, the editor and the comments. */
export class LiveJournalDiary extends Component<DiaryState> {
  view = view;

  /** Change some of the core; every list worked out from it follows. */
  _commit(state: DiaryState, changes: Partial<Core>): Effect[] {
    const next: Core = { ...state.core, ...changes };
    return patch({ core: next, ...derive(next) });
  }

  _show(screen: Screen, state: DiaryState): Effect[] {
    return patch({ screen, back: screen === "entry" ? state.back : screen });
  }

  clearNotice(): Effect[] {
    return patch({ notice: "" });
  }

  go(msg: Message, state: DiaryState): Effect[] {
    return this._show(msg.payload as Screen, state);
  }

  /** The Write tab starts a clean draft unless one is being written. */
  write(_msg: Message, state: DiaryState): Effect[] {
    const fresh = state.core.editingId !== "";
    return [
      ...(fresh
        ? this._commit(state, {
            draft: emptyDraft(),
            editingId: "",
            errors: {},
          })
        : []),
      ...this._show("write", state),
    ];
  }

  goBack(_msg: Message, state: DiaryState): Effect[] {
    return patch({ screen: state.back });
  }

  clearFilters(_msg: Message, state: DiaryState): Effect[] {
    return this._commit(state, { tag: "", day: "", privacy: "all" });
  }

  // ---- opening an entry: from the feed, the archive and the friends
  _open(id: string, state: DiaryState): Effect[] {
    const seen = state.core.seen.includes(id)
      ? state.core.seen
      : [...state.core.seen, id];
    return [
      ...this._commit(state, {
        openId: id,
        seen,
        commentDraft: "",
        commentError: "",
      }),
      ...patch({
        screen: "entry",
        back: state.screen === "entry" ? state.back : state.screen,
      }),
    ];
  }

  "feed.open"(msg: Message, state: DiaryState): Effect[] {
    return this._open(msg.payload as string, state);
  }
  "feed.comments"(msg: Message, state: DiaryState): Effect[] {
    return this._open(msg.payload as string, state);
  }
  "archlist.open"(msg: Message, state: DiaryState): Effect[] {
    return this._open(msg.payload as string, state);
  }
  "archlist.comments"(msg: Message, state: DiaryState): Effect[] {
    return this._open(msg.payload as string, state);
  }
  "friends.open"(msg: Message, state: DiaryState): Effect[] {
    return this._open(msg.payload as string, state);
  }

  // ---- reading mode
  _read(id: string, state: DiaryState): Effect[] {
    return [
      ...this._commit(state, { readerId: id }),
      ...patch({ screen: "read", readBack: state.screen }),
    ];
  }
  "feed.read"(msg: Message, state: DiaryState): Effect[] {
    return this._read(msg.payload as string, state);
  }
  "ent.read"(msg: Message, state: DiaryState): Effect[] {
    return this._read(msg.payload as string, state);
  }
  "archlist.read"(msg: Message, state: DiaryState): Effect[] {
    return this._read(msg.payload as string, state);
  }
  exitRead(_msg: Message, state: DiaryState): Effect[] {
    return patch({ screen: state.readBack });
  }

  // ---- filters: tags, days, privacy
  _tag(tag: string, state: DiaryState): Effect[] {
    const picked = tag === state.core.tag ? "" : tag;
    return this._commit(state, { tag: picked });
  }
  /** A tag under an entry sends you to the journal, filtered by it. */
  _tagAndShow(tag: string, state: DiaryState): Effect[] {
    return [
      ...this._commit(state, { tag, day: "" }),
      ...patch({ screen: "journal", back: "journal" }),
    ];
  }
  "feed.tag"(msg: Message, state: DiaryState): Effect[] {
    return this._tagAndShow(msg.payload as string, state);
  }
  "ent.tag"(msg: Message, state: DiaryState): Effect[] {
    return this._tagAndShow(msg.payload as string, state);
  }
  "archlist.tag"(msg: Message, state: DiaryState): Effect[] {
    return this._tagAndShow(msg.payload as string, state);
  }
  "cloud.pick"(msg: Message, state: DiaryState): Effect[] {
    return this._tag(msg.payload as string, state);
  }
  "atags.pick"(msg: Message, state: DiaryState): Effect[] {
    return this._tagAndShow(msg.payload as string, state);
  }
  "ptags.pick"(msg: Message, state: DiaryState): Effect[] {
    return this._tagAndShow(msg.payload as string, state);
  }
  "priv.pick"(msg: Message, state: DiaryState): Effect[] {
    return this._commit(state, { privacy: msg.payload as string });
  }

  _month(by: number, state: DiaryState): Effect[] {
    return this._commit(state, { month: shiftMonth(state.core.month, by) });
  }
  _day(iso: string, state: DiaryState): Effect[] {
    const day = iso === state.core.day ? "" : iso;
    return this._commit(state, { day });
  }
  "cal.prev"(_msg: Message, state: DiaryState): Effect[] {
    return this._month(-1, state);
  }
  "cal.next"(_msg: Message, state: DiaryState): Effect[] {
    return this._month(1, state);
  }
  "cal.pick"(msg: Message, state: DiaryState): Effect[] {
    return this._day(msg.payload as string, state);
  }
  "arch.prev"(_msg: Message, state: DiaryState): Effect[] {
    return this._month(-1, state);
  }
  "arch.next"(_msg: Message, state: DiaryState): Effect[] {
    return this._month(1, state);
  }
  "arch.pick"(msg: Message, state: DiaryState): Effect[] {
    return this._day(msg.payload as string, state);
  }

  // ---- the editor
  "mood.pick"(msg: Message, state: DiaryState): Effect[] {
    const id = msg.payload as string;
    const mood = id === state.core.draft.mood ? "" : id;
    return this._commit(state, { draft: { ...state.core.draft, mood } });
  }

  "editor.field"(msg: Message, state: DiaryState): Effect[] {
    const key = msg.payload as keyof Draft;
    const draft = { ...state.core.draft, [key]: msg.event?.value ?? "" };
    const errors = { ...state.core.errors };
    delete errors[key];
    return this._commit(state, { draft, errors });
  }

  "editor.privacy"(msg: Message, state: DiaryState): Effect[] {
    const privacy = msg.payload as Privacy;
    return this._commit(state, { draft: { ...state.core.draft, privacy } });
  }

  "editor.save"(_msg: Message, state: DiaryState): Effect[] {
    const { draft, editingId, posts } = state.core;
    const errors = validateDraft(draft);
    if (Object.keys(errors).length > 0) return this._commit(state, { errors });
    const before = posts.find((x) => x.id === editingId);
    const id = before ? before.id : nextId(posts.map((x) => x.id));
    const post = postFromDraft(
      draft,
      id,
      personOf(state.core, ME_ID),
      before?.iso ?? TODAY,
      before?.time ?? NOW_TIME,
    );
    const next = before
      ? posts.map((x) => (x.id === id ? post : x))
      : [...posts, post];
    return [
      ...this._commit(state, {
        posts: next,
        draft: emptyDraft(),
        editingId: "",
        errors: {},
        openId: id,
        commentDraft: "",
        commentError: "",
      }),
      ...patch({ screen: "entry", back: "journal" }),
      ...notice(before ? "Your changes are saved" : "Your entry is published"),
    ];
  }

  "editor.discard"(_msg: Message, state: DiaryState): Effect[] {
    return [
      ...this._commit(state, {
        draft: emptyDraft(),
        editingId: "",
        errors: {},
      }),
      ...patch({ screen: "journal", back: "journal" }),
    ];
  }

  editEntry(_msg: Message, state: DiaryState): Effect[] {
    const post = state.core.posts.find((x) => x.id === state.core.openId);
    if (!post) return [];
    return [
      ...this._commit(state, {
        draft: draftOf(post),
        editingId: post.id,
        errors: {},
      }),
      ...patch({ screen: "write", back: "write" }),
    ];
  }

  // ---- comments
  "com.type"(msg: Message, state: DiaryState): Effect[] {
    return this._commit(state, {
      commentDraft: msg.event?.value ?? "",
      commentError: "",
    });
  }

  "com.send"(_msg: Message, state: DiaryState): Effect[] {
    const { commentDraft, comments, openId, hue } = state.core;
    const error = validateComment(commentDraft);
    if (error) return this._commit(state, { commentError: error });
    return [
      ...this._commit(state, {
        comments: addComment(comments, openId, "Anna Wren", hue, commentDraft),
        commentDraft: "",
        commentError: "",
      }),
      ...notice("Comment posted"),
    ];
  }

  // ---- the profile
  "profile.shuffle"(_msg: Message, state: DiaryState): Effect[] {
    return this._commit(state, { hue: (state.core.hue + 47) % 360 });
  }

  /** The page was left: the notice timer stops. */
  leave(): Effect[] {
    return [time.cancel("notice")];
  }
}

export const page = new LiveJournalDiary();
