import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import { storeEffector as store } from "@service-laboratory/pavlus/plugins";
import {
  addComment,
  type Comment,
  commentRows,
  likeComment,
  type ThreadProps,
} from "../../blocks/comment-thread/comment-thread.ts";
import { picksProps } from "../../blocks/pick-list/pick-list.ts";
import {
  type PhotoData,
  photoProps,
  type Shape,
  toggleId,
} from "../../blocks/photo-card/photo-card.ts";
import { personHeader } from "../../blocks/profile-header/profile-header.ts";
import { navProps, type Tab } from "../../blocks/social-nav/social-nav.ts";
import {
  AUTHORS,
  authorOf,
  COMMENTS,
  EMOJIS,
  ME,
  PHOTOS,
  TONES,
} from "./photo-sharing-network-data.ts";
import view from "./photo-sharing-network.pavlus";

export type View =
  "explore" | "detail" | "albums" | "upload" | "saved" | "tag" | "profile";
export type Tab2 = "explore" | "following";

export interface UploadForm {
  title: string;
  tags: string;
  /** An album name, "__new" or "". */
  album: string;
  newAlbum: string;
  emoji: string;
  tone: string;
}

export type Errors = Record<string, string>;

export const NEW_ALBUM = "__new";

/** Pure: `Sunset, #Sea  harbor` → `["#sunset", "#sea", "#harbor"]` (no duplicates, 5 at most). */
export function parseTags(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/[\s,]+/)) {
    const clean = raw
      .replace(/^#+/, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    if (clean.length >= 2 && !out.includes(`#${clean}`)) out.push(`#${clean}`);
  }
  return out.slice(0, 5);
}

/** Pure: what is wrong with the upload form, by field. */
export function validateUpload(f: UploadForm): Errors {
  const errors: Errors = {};
  const title = f.title.trim();
  if (title.length < 3)
    errors.title = "Give the photo a title of at least 3 characters.";
  else if (title.length > 60)
    errors.title = "Keep the title under 60 characters.";
  if (parseTags(f.tags).length === 0)
    errors.tags = "Add at least one tag, like sunset or street.";
  if (f.album === "") errors.album = "Choose an album, or make a new one.";
  else if (f.album === NEW_ALBUM && f.newAlbum.trim().length < 2)
    errors.newAlbum = "Name the new album (2 characters or more).";
  return errors;
}

export interface Filter {
  tab: Tab2;
  following: string[];
  album: string;
  tag: string;
  authorId: string;
  onlyIds: string[] | null;
}

/** Pure: the photos for a view: by tab, album, hashtag, author or a fixed id list. */
export function filterPhotos(list: PhotoData[], f: Filter): PhotoData[] {
  return list.filter(
    (p) =>
      (f.onlyIds === null || f.onlyIds.includes(p.id)) &&
      (f.tab === "explore" || f.following.includes(p.authorId)) &&
      (f.album === "" || p.album === f.album) &&
      (f.tag === "" || p.tags.includes(f.tag)) &&
      (f.authorId === "" || p.authorId === f.authorId),
  );
}

/** Pure: the albums with how many photos each has, in first-seen order. */
export function albumCounts(
  list: PhotoData[],
): { name: string; count: number }[] {
  const out: { name: string; count: number }[] = [];
  for (const p of list) {
    const hit = out.find((a) => a.name === p.album);
    if (hit) hit.count += 1;
    else out.push({ name: p.album, count: 1 });
  }
  return out;
}

/** Pure: the other tags that appear together with a tag, most used first. */
export function relatedTags(list: PhotoData[], tag: string): string[] {
  const counts = new Map<string, number>();
  for (const p of list.filter((x) => x.tags.includes(tag)))
    for (const t of p.tags)
      if (t !== tag) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([t]) => t);
}

const SHAPES: Shape[] = ["tall", "square", "wide"];

/** Pure: a new photo by me at the top of the list. */
export function addPhoto(
  list: PhotoData[],
  f: UploadForm,
  id: string,
  n: number,
): PhotoData[] {
  const me = authorOf(ME);
  const tone = Number(f.tone) || 1;
  return [
    {
      id,
      title: f.title.trim(),
      author: me.name,
      authorId: ME,
      tone,
      tone2: (tone % 5) + 1,
      emoji: f.emoji,
      shape: SHAPES[n % SHAPES.length] as Shape,
      likes: 0,
      tags: parseTags(f.tags),
      album: f.album === NEW_ALBUM ? f.newAlbum.trim() : f.album,
    },
    ...list,
  ];
}

export interface Core {
  view: View;
  tab: Tab2;
  photos: PhotoData[];
  liked: string[];
  saved: string[];
  following: string[];
  comments: Record<string, Comment[]>;
  detailId: string;
  commentDraft: string;
  album: string;
  tag: string;
  profileId: string;
  form: UploadForm;
  errors: Errors;
  nextId: number;
}

const TABS: Tab[] = [
  { id: "explore", label: "Explore", glyph: "home", badge: 0 },
  { id: "albums", label: "Albums", glyph: "layers", badge: 0 },
  { id: "upload", label: "Upload", glyph: "plus", badge: 0 },
  { id: "saved", label: "Saved", glyph: "star", badge: 0 },
];

const EMPTY_FORM: UploadForm = {
  title: "",
  tags: "",
  album: "",
  newAlbum: "",
  emoji: "🌄",
  tone: "1",
};

export function derive(s: Core) {
  const base: Filter = {
    tab: "explore",
    following: s.following,
    album: "",
    tag: "",
    authorId: "",
    onlyIds: null,
  };
  const shown: PhotoData[] =
    s.view === "explore"
      ? filterPhotos(s.photos, { ...base, tab: s.tab })
      : s.view === "albums"
        ? filterPhotos(s.photos, { ...base, album: s.album })
        : s.view === "saved"
          ? filterPhotos(s.photos, { ...base, onlyIds: s.saved })
          : s.view === "tag"
            ? filterPhotos(s.photos, { ...base, tag: s.tag })
            : s.view === "profile"
              ? filterPhotos(s.photos, { ...base, authorId: s.profileId })
              : [];
  const detail = s.photos.find((p) => p.id === s.detailId);
  const mine = s.comments[s.detailId] ?? [];
  const thread: ThreadProps = {
    comments: commentRows(mine),
    draft: s.commentDraft,
    canSend: s.commentDraft.trim().length > 0,
    me: "JL",
    placeholder: "Say something nice...",
  };
  const author = authorOf(s.profileId);
  const albums = albumCounts(s.photos);
  const current =
    s.view === "detail" || s.view === "tag"
      ? "explore"
      : s.view === "profile"
        ? s.profileId === ME
          ? "me"
          : "explore"
        : s.view;
  return {
    nav: navProps(
      "Lumen",
      TABS.map((t) => ({
        ...t,
        badge: t.id === "saved" ? s.saved.length : 0,
      })),
      current,
      "JL",
    ),
    tabs: picksProps(
      [
        { id: "explore", label: "Explore", emoji: "🧭", count: "" },
        { id: "following", label: "Following", emoji: "👥", count: "" },
      ],
      s.tab,
      "",
      true,
    ),
    grid: photoProps(shown, s.liked, s.saved),
    gridEmpty: shown.length === 0,
    emptyNote:
      s.view === "saved"
        ? "Tap the star on a photo to keep it here."
        : s.tab === "following"
          ? "Follow a few photographers to fill this tab."
          : "No photos here yet.",
    big: detail ? photoProps([detail], s.liked, s.saved, true)[0] : null,
    thread,
    commentCount: mine.length,
    more: detail
      ? photoProps(
          s.photos
            .filter((p) => p.album === detail.album && p.id !== detail.id)
            .slice(0, 3),
          s.liked,
          s.saved,
        )
      : [],
    albumPick: picksProps(
      [
        { id: "", label: "All albums", emoji: "🗂️", count: s.photos.length },
        ...albums.map((a) => ({
          id: a.name,
          label: a.name,
          emoji: "📁",
          count: a.count,
        })),
      ],
      s.album,
      "Albums",
    ),
    albumOptions: albums.map((a) => a.name),
    tagLabel: s.tag,
    tagCount: filterPhotos(s.photos, { ...base, tag: s.tag }).length,
    tagRelated: picksProps(
      relatedTags(s.photos, s.tag).map((t) => ({
        id: t,
        label: t,
        emoji: "",
        count: "",
      })),
      "",
      "Related tags",
      true,
    ),
    head: personHeader({
      id: author.id,
      name: author.name,
      handle: author.id,
      tone: author.tone,
      headline: author.headline,
      bio: author.bio,
      place: author.place,
      posts: s.photos.filter((p) => p.authorId === author.id).length,
      followers: author.followers,
      followingCount: author.following,
      following: s.following.includes(author.id),
      isMe: author.id === ME,
    }),
    emojiPick: picksProps(
      EMOJIS.map((e) => ({ id: e, label: "", emoji: e, count: "" })),
      s.form.emoji,
      "Picture",
      true,
    ),
    tonePick: picksProps(
      TONES.map((t) => ({ id: t.id, label: t.label, emoji: "", count: "" })),
      s.form.tone,
      "Colors",
      true,
    ),
    preview: photoProps(
      [
        {
          id: "preview",
          title: s.form.title.trim() || "Your title",
          author: authorOf(ME).name,
          authorId: ME,
          tone: Number(s.form.tone) || 1,
          tone2: ((Number(s.form.tone) || 1) % 5) + 1,
          emoji: s.form.emoji,
          shape: "wide",
          likes: 0,
          tags: parseTags(s.form.tags),
          album: "",
        },
      ],
      [],
      [],
      true,
    )[0],
    newAlbumOn: s.form.album === NEW_ALBUM,
    authors: AUTHORS.length,
  };
}

export type Derived = ReturnType<typeof derive>;

const core: Core = {
  view: "explore",
  tab: "explore",
  photos: PHOTOS,
  liked: ["f2"],
  saved: ["f3"],
  following: ["hana", "kofi"],
  comments: COMMENTS,
  detailId: "",
  commentDraft: "",
  album: "",
  tag: "",
  profileId: ME,
  form: EMPTY_FORM,
  errors: {},
  nextId: 1,
};

export type PhotoNetState = Core & Derived;

export const initial: PhotoNetState = { ...core, ...derive(core) };

const CORE_KEYS = Object.keys(core) as (keyof Core)[];
const coreOf = (state: PhotoNetState): Core => {
  const c: Record<string, unknown> = {};
  for (const k of CORE_KEYS) c[k] = state[k];
  return c as unknown as Core;
};

export class PhotoSharingNetwork extends Component<PhotoNetState> {
  view = view;

  "nav.go"(msg: Message, state: PhotoNetState): Effect[] {
    const v = msg.payload as View;
    return this._show(state, {
      view: v,
      album: v === "albums" ? state.album : "",
      errors: {},
      form: v === "upload" ? EMPTY_FORM : state.form,
    });
  }
  "nav.home"(_msg: Message, state: PhotoNetState): Effect[] {
    return this._show(state, { view: "explore", tab: "explore" });
  }
  "nav.me"(_msg: Message, state: PhotoNetState): Effect[] {
    return this._show(state, { view: "profile", profileId: ME });
  }
  "tabs.pick"(msg: Message, state: PhotoNetState): Effect[] {
    return this._show(state, { tab: msg.payload as Tab2 });
  }
  "albumPick.pick"(msg: Message, state: PhotoNetState): Effect[] {
    return this._show(state, { album: msg.payload as string });
  }
  "tagRelated.pick"(msg: Message, state: PhotoNetState): Effect[] {
    return this._show(state, { tag: msg.payload as string });
  }
  back(_msg: Message, state: PhotoNetState): Effect[] {
    return this._show(state, { view: "explore", detailId: "" });
  }

  // ---- photo cards: the grid, the large one and the more-from-album row ----
  _open(state: PhotoNetState, id: string): Effect[] {
    return this._show(state, {
      view: "detail",
      detailId: id,
      commentDraft: "",
    });
  }
  _like(state: PhotoNetState, id: string): Effect[] {
    return this._show(state, { liked: toggleId(state.liked, id) });
  }
  _save(state: PhotoNetState, id: string): Effect[] {
    return this._show(state, { saved: toggleId(state.saved, id) });
  }
  _author(state: PhotoNetState, id: string): Effect[] {
    return this._show(state, { view: "profile", profileId: id });
  }
  _tag(state: PhotoNetState, tag: string): Effect[] {
    return this._show(state, { view: "tag", tag });
  }
  "photo.open"(msg: Message, state: PhotoNetState): Effect[] {
    return this._open(state, msg.payload as string);
  }
  "photo.like"(msg: Message, state: PhotoNetState): Effect[] {
    return this._like(state, msg.payload as string);
  }
  "photo.save"(msg: Message, state: PhotoNetState): Effect[] {
    return this._save(state, msg.payload as string);
  }
  "photo.author"(msg: Message, state: PhotoNetState): Effect[] {
    return this._author(state, msg.payload as string);
  }
  "more.open"(msg: Message, state: PhotoNetState): Effect[] {
    return this._open(state, msg.payload as string);
  }
  "more.like"(msg: Message, state: PhotoNetState): Effect[] {
    return this._like(state, msg.payload as string);
  }
  "more.save"(msg: Message, state: PhotoNetState): Effect[] {
    return this._save(state, msg.payload as string);
  }
  "more.author"(msg: Message, state: PhotoNetState): Effect[] {
    return this._author(state, msg.payload as string);
  }
  "big.like"(msg: Message, state: PhotoNetState): Effect[] {
    return this._like(state, msg.payload as string);
  }
  "big.save"(msg: Message, state: PhotoNetState): Effect[] {
    return this._save(state, msg.payload as string);
  }
  "big.author"(msg: Message, state: PhotoNetState): Effect[] {
    return this._author(state, msg.payload as string);
  }
  "big.tag"(msg: Message, state: PhotoNetState): Effect[] {
    return this._tag(state, msg.payload as string);
  }

  // ---- comments ----
  "cm.like"(msg: Message, state: PhotoNetState): Effect[] {
    const id = state.detailId;
    return this._show(state, {
      comments: {
        ...state.comments,
        [id]: likeComment(state.comments[id] ?? [], msg.payload as string),
      },
    });
  }
  "cm.draft"(msg: Message, state: PhotoNetState): Effect[] {
    return this._show(state, { commentDraft: msg.event?.value ?? "" });
  }
  "cm.send"(_msg: Message, state: PhotoNetState): Effect[] {
    const id = state.detailId;
    if (id === "" || state.commentDraft.trim() === "") return [];
    return this._show(state, {
      comments: {
        ...state.comments,
        [id]: addComment(
          state.comments[id] ?? [],
          state.commentDraft,
          { name: authorOf(ME).name, tone: 1 },
          `x${state.nextId}`,
        ),
      },
      commentDraft: "",
      nextId: state.nextId + 1,
    });
  }

  // ---- profile ----
  "head.primary"(_msg: Message, state: PhotoNetState): Effect[] {
    if (state.profileId === ME) return [];
    return this._show(state, {
      following: toggleId(state.following, state.profileId),
    });
  }
  "head.secondary"(): Effect[] {
    return [];
  }

  // ---- the upload form ----
  setField(msg: Message, state: PhotoNetState): Effect[] {
    const field = msg.payload as keyof UploadForm;
    const { [field]: _gone, ...errors } = state.errors;
    return this._show(state, {
      form: { ...state.form, [field]: msg.event?.value ?? "" },
      errors,
    });
  }
  "emojiPick.pick"(msg: Message, state: PhotoNetState): Effect[] {
    return this._show(state, {
      form: { ...state.form, emoji: msg.payload as string },
    });
  }
  "tonePick.pick"(msg: Message, state: PhotoNetState): Effect[] {
    return this._show(state, {
      form: { ...state.form, tone: msg.payload as string },
    });
  }
  publish(_msg: Message, state: PhotoNetState): Effect[] {
    const errors = validateUpload(state.form);
    if (Object.keys(errors).length > 0) return this._show(state, { errors });
    const id = `u${state.nextId}`;
    return this._show(state, {
      photos: addPhoto(state.photos, state.form, id, state.nextId),
      nextId: state.nextId + 1,
      form: EMPTY_FORM,
      errors: {},
      view: "detail",
      detailId: id,
    });
  }

  _show(state: PhotoNetState, patch: Partial<Core>): Effect[] {
    const next: Core = { ...coreOf(state), ...patch };
    const derived = derive(next);
    return [
      ...(Object.keys(patch) as (keyof Core)[]).map((k) =>
        store.set(k, patch[k]),
      ),
      ...(Object.keys(derived) as (keyof Derived)[]).map((k) =>
        store.set(k, derived[k]),
      ),
    ];
  }
}

export const page = new PhotoSharingNetwork();
