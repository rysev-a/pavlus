/**
 * The "photos" module: the albums of a user (yours, or another user's through
 * `go` with `params: { userId }`, read-only), an album page with its photos
 * (24 per page), upload into an album (several files at once, scaled to 1280px
 * by the files plugin) and a viewer (caption, previous/next, edit caption, move
 * to another of my albums, set as my avatar, delete).
 *
 * `enter` also understands `{ albumId }` and `{ photoId }` (the photo is opened in
 * its album). The replies of the upload effect come back as `photos.picked` and
 * `photos.pickFailed`.
 */
import {
  domEffector as dom,
  timeEffector as time,
} from "@service-laboratory/pavlus/plugins";
import {
  filesEffector,
  isImageDataUrl,
  type PickedImages,
} from "../../../../files.ts";
import {
  byId,
  nextId,
  paged,
  when,
  type Handler,
  type Module,
  type Update,
} from "../../core.ts";
import { glyphOf, pictureStyle } from "../../pictures.ts";
import type { Db, Photo, PhotoAlbum } from "../../schema.ts";

export const PAGE_SIZE = 24;
/** At most this many files are taken from one upload. */
export const MAX_UPLOAD = 30;
/** A stored upload longer than this (a data URL) is refused. */
export const MAX_PHOTO_CHARS = 1_200_000;

export interface AlbumCard {
  id: number;
  title: string;
  description: string;
  count: number;
  countLabel: string;
  style: string;
  glyph: string;
  confirming: boolean;
}

export interface PhotoTile {
  id: number;
  style: string;
  glyph: string;
  caption: string;
}

export interface ViewerProps {
  id: number;
  style: string;
  glyph: string;
  caption: string;
  position: string;
  hasPrev: boolean;
  hasNext: boolean;
  albumTitle: string;
  date: string;
  moveTargets: { id: number; title: string }[];
}

export interface AlbumForm {
  open: boolean;
  /** 0 = a new album */
  id: number;
  title: string;
  description: string;
}

export interface PhotosState {
  // --- UI state
  /** whose albums; 0 = the signed-in user's */
  userId: number;
  /** the open album, 0 = the list of albums */
  albumId: number;
  /** the photo open in the viewer, 0 = none */
  photoId: number;
  page: number;
  form: AlbumForm;
  errors: Record<string, string>;
  /** an album waiting for the answer of "delete?" on the list */
  confirmAlbum: number;
  confirmPhoto: boolean;
  editingCaption: boolean;
  captionText: string;
  // --- view props (derived)
  found: boolean;
  own: boolean;
  ownerId: number;
  ownerName: string;
  heading: string;
  albums: AlbumCard[];
  hasAlbums: boolean;
  album: {
    id: number;
    title: string;
    description: string;
    count: number;
    countLabel: string;
  } | null;
  photos: PhotoTile[];
  hasPhotos: boolean;
  pageNo: number;
  pages: number;
  hasPrev: boolean;
  hasNext: boolean;
  viewer: ViewerProps | null;
}

const EMPTY_FORM: AlbumForm = {
  open: false,
  id: 0,
  title: "",
  description: "",
};

const plural = (n: number): string => `${n} photo${n === 1 ? "" : "s"}`;

/** "IMG_0412.jpeg" -> "IMG_0412" */
export const captionFromName = (name: string): string =>
  name
    .replace(/\.[a-z0-9]{1,5}$/i, "")
    .replace(/[_-]+/g, " ")
    .trim()
    .slice(0, 80);

export function checkAlbum(f: {
  title: string;
  description: string;
}): Record<string, string> {
  const e: Record<string, string> = {};
  if (f.title.trim().length === 0) e.title = "Give the album a title";
  else if (f.title.trim().length > 60) e.title = "At most 60 characters";
  if (f.description.length > 300) e.description = "At most 300 characters";
  return e;
}

/** The photos of an album in the order they are shown (oldest first). */
export const albumPhotos = (db: Db, albumId: number): Photo[] =>
  db.photos.filter((p) => p.albumId === albumId).sort((a, b) => a.id - b.id);

const cardOf = (
  a: PhotoAlbum,
  photos: Photo[],
  confirming: boolean,
): AlbumCard => {
  const cover = photos[0]?.src ?? "grad:210:260:🖼️";
  return {
    id: a.id,
    title: a.title,
    description: a.description,
    count: photos.length,
    countLabel: plural(photos.length),
    style: pictureStyle(cover),
    glyph: glyphOf(cover),
    confirming,
  };
};

const NO_VIEW = {
  found: false,
  own: false,
  ownerId: 0,
  ownerName: "",
  heading: "",
  albums: [],
  hasAlbums: false,
  album: null,
  photos: [],
  hasPhotos: false,
  pageNo: 1,
  pages: 1,
  hasPrev: false,
  hasNext: false,
  viewer: null,
};

export const photosModule: Module<PhotosState> = {
  key: "photos",
  screens: ["photos"],

  initial: () => ({
    userId: 0,
    albumId: 0,
    photoId: 0,
    page: 1,
    form: EMPTY_FORM,
    errors: {},
    confirmAlbum: 0,
    confirmPhoto: false,
    editingCaption: false,
    captionText: "",
    ...NO_VIEW,
  }),

  derive(state) {
    const s = state.photos;
    const db = state.db;
    const uid = s.userId > 0 ? s.userId : state.me;
    const owner = byId(db.users).get(uid);
    if (!owner) return { ...s, ...NO_VIEW };
    const own = uid === state.me && state.me > 0;
    const heading = own ? "My albums" : `Albums of ${owner.name}`;
    const mine = db.photoAlbums.filter((a) => a.ownerId === uid);
    const mineIds = new Set(mine.map((a) => a.id));
    const photosOf = db.photos.filter((p) => mineIds.has(p.albumId));
    const byAlbum = new Map<number, Photo[]>();
    for (const p of photosOf) {
      const l = byAlbum.get(p.albumId);
      if (l) l.push(p);
      else byAlbum.set(p.albumId, [p]);
    }
    for (const l of byAlbum.values()) l.sort((a, b) => a.id - b.id);
    const base = {
      ...s,
      found: true,
      own,
      ownerId: uid,
      ownerName: owner.name,
      heading,
    };
    const open = mine.find((a) => a.id === s.albumId);
    if (!open) {
      const albums = [...mine]
        .sort((a, b) => b.id - a.id)
        .map((a) =>
          cardOf(a, byAlbum.get(a.id) ?? [], s.confirmAlbum === a.id),
        );
      return {
        ...base,
        albumId: 0,
        photoId: 0,
        albums,
        hasAlbums: albums.length > 0,
        album: null,
        photos: [],
        hasPhotos: false,
        viewer: null,
        pageNo: 1,
        pages: 1,
        hasPrev: false,
        hasNext: false,
      };
    }
    const list = byAlbum.get(open.id) ?? [];
    const pg = paged(list, s.page, PAGE_SIZE);
    const at = list.findIndex((p) => p.id === s.photoId);
    let viewer: ViewerProps | null = null;
    if (at >= 0) {
      const p = list[at];
      viewer = {
        id: p.id,
        style: pictureStyle(p.src),
        glyph: glyphOf(p.src),
        caption: p.caption,
        position: `${at + 1} of ${list.length}`,
        hasPrev: at > 0,
        hasNext: at < list.length - 1,
        albumTitle: open.title,
        date: when(p.createdAt, state.now),
        moveTargets: own
          ? mine
              .filter((a) => a.id !== open.id)
              .map((a) => ({ id: a.id, title: a.title }))
          : [],
      };
    }
    return {
      ...base,
      albums: [],
      hasAlbums: true,
      album: {
        id: open.id,
        title: open.title,
        description: open.description,
        count: list.length,
        countLabel: plural(list.length),
      },
      photos: pg.items.map((p) => ({
        id: p.id,
        style: pictureStyle(p.src),
        glyph: glyphOf(p.src),
        caption: p.caption,
      })),
      hasPhotos: list.length > 0,
      pageNo: pg.page,
      pages: pg.pages,
      hasPrev: pg.page > 1,
      hasNext: pg.page < pg.pages,
      photoId: viewer ? s.photoId : 0,
      viewer,
    };
  },

  enter(params, state) {
    const reset = {
      page: 1,
      photoId: 0,
      form: EMPTY_FORM,
      errors: {},
      confirmAlbum: 0,
      confirmPhoto: false,
      editingCaption: false,
    };
    const photoId = Number(params?.photoId) || 0;
    const photo =
      photoId > 0 ? state.db.photos.find((p) => p.id === photoId) : undefined;
    if (photo) {
      const list = albumPhotos(state.db, photo.albumId);
      const at = list.findIndex((p) => p.id === photo.id);
      return {
        slice: {
          ...reset,
          userId: photo.ownerId === state.me ? 0 : photo.ownerId,
          albumId: photo.albumId,
          photoId: photo.id,
          page: Math.floor(at / PAGE_SIZE) + 1,
        },
      };
    }
    const id = Number(params?.userId);
    const userId = Number.isFinite(id) && id > 0 && id !== state.me ? id : 0;
    const albumId = Number(params?.albumId) || 0;
    return { slice: { ...reset, userId, albumId } };
  },

  handlers: {} as Record<string, Handler>,
};

// ---- handlers ----

const h = photosModule.handlers;
const text = (e: { value?: string } | undefined): string => e?.value ?? "";

/** Mutations need a signed-in user and an album of theirs. */
const myAlbum = (
  s: { db: Db; me: number },
  id: number,
): PhotoAlbum | undefined =>
  s.me > 0
    ? s.db.photoAlbums.find((a) => a.id === id && a.ownerId === s.me)
    : undefined;

// -- navigation

h.open = (p) => ({
  slice: {
    albumId: Number(p) || 0,
    page: 1,
    photoId: 0,
    confirmAlbum: 0,
    form: EMPTY_FORM,
    errors: {},
  },
});
h.back = () => ({
  slice: {
    albumId: 0,
    page: 1,
    photoId: 0,
    confirmPhoto: false,
    form: EMPTY_FORM,
    errors: {},
  },
});
h.turn = (p, _e, s) => ({
  slice: { page: Math.max(1, s.photos.page + (Number(p) || 0)) },
});
h.owner = (p) => {
  const userId = Number(p);
  return userId > 0
    ? { go: { screen: "profile", params: { userId } } }
    : undefined;
};

// -- albums

h.newAlbum = (_p, _e, s) =>
  s.me > 0
    ? {
        slice: {
          form: { open: true, id: 0, title: "", description: "" },
          errors: {},
          confirmAlbum: 0,
        },
      }
    : undefined;
h.editAlbum = (p, _e, s) => {
  const a = myAlbum(s, Number(p));
  if (!a) return;
  return {
    slice: {
      form: {
        open: true,
        id: a.id,
        title: a.title,
        description: a.description,
      },
      errors: {},
      confirmAlbum: 0,
    },
  };
};
h.field = (p, e, s) => {
  const key = String(p);
  if (key !== "title" && key !== "description") return;
  const errors = { ...s.photos.errors };
  delete errors[key];
  return { slice: { form: { ...s.photos.form, [key]: text(e) }, errors } };
};
h.cancelForm = () => ({ slice: { form: EMPTY_FORM, errors: {} } });
h.saveAlbum = (_p, _e, s) => {
  if (s.me <= 0) return;
  const f = s.photos.form;
  if (!f.open) return;
  const errors = checkAlbum(f);
  if (Object.keys(errors).length > 0) return { slice: { errors } };
  if (f.id > 0) {
    const a = myAlbum(s, f.id);
    if (!a) return;
    return {
      put: {
        photoAlbums: [
          { ...a, title: f.title.trim(), description: f.description.trim() },
        ],
      },
      slice: { form: EMPTY_FORM, errors: {} },
      notice: "Album saved",
    };
  }
  const album: PhotoAlbum = {
    id: nextId(s.db.photoAlbums),
    ownerId: s.me,
    title: f.title.trim(),
    description: f.description.trim(),
    createdAt: s.now,
  };
  return {
    put: { photoAlbums: [album] },
    slice: { form: EMPTY_FORM, errors: {} },
    notice: "Album created",
  };
};
h.askDelete = (p, _e, s) =>
  myAlbum(s, Number(p))
    ? { slice: { confirmAlbum: Number(p), form: EMPTY_FORM } }
    : undefined;
h.cancelDelete = () => ({ slice: { confirmAlbum: 0 } });
h.confirmDelete = (p, _e, s) => {
  const id = Number(p) || s.photos.confirmAlbum;
  const a = myAlbum(s, id);
  if (!a || s.photos.confirmAlbum !== id) return;
  const photos = s.db.photos.filter((x) => x.albumId === id).map((x) => x.id);
  return {
    remove: { photoAlbums: [id], photos },
    slice: {
      confirmAlbum: 0,
      albumId: s.photos.albumId === id ? 0 : s.photos.albumId,
      photoId: 0,
      page: 1,
    },
    notice: `Album "${a.title}" deleted`,
  };
};

// -- upload

h.upload = (_p, _e, s) => {
  if (!myAlbum(s, s.photos.albumId)) return;
  return {
    effects: [
      filesEffector.pickImages(
        1280,
        true,
        "photos.picked",
        "photos.pickFailed",
      ),
    ],
  };
};
h.picked = (p, _e, s) => {
  const album = myAlbum(s, s.photos.albumId);
  const images = (p as Partial<PickedImages> | undefined)?.images;
  if (!album || !images) return;
  const ok = images
    .filter(
      (i) => i && isImageDataUrl(i.src) && i.src.length <= MAX_PHOTO_CHARS,
    )
    .slice(0, MAX_UPLOAD);
  if (ok.length === 0)
    return { notice: "Those images are too large or not pictures" };
  const first = nextId(s.db.photos);
  const rows: Photo[] = ok.map((i, k) => ({
    id: first + k,
    albumId: album.id,
    ownerId: s.me,
    src: i.src,
    caption: captionFromName(i.name),
    createdAt: s.now,
  }));
  const total = albumPhotos(s.db, album.id).length + rows.length;
  return {
    put: { photos: rows },
    slice: { page: Math.ceil(total / PAGE_SIZE) },
    notice: `${plural(rows.length)} added to "${album.title}"`,
  };
};
h.pickFailed = (p) => ({ notice: `Could not load the photos: ${String(p)}` });

// -- viewer

h.show = (p, _e, s) => {
  const id = Number(p);
  if (!s.db.photos.some((x) => x.id === id && x.albumId === s.photos.albumId))
    return;
  return {
    slice: { photoId: id, confirmPhoto: false, editingCaption: false },
    effects: [time.setTimeout("photos.focusTimer", 0, "photos.focusViewer")],
  };
};
h.focusViewer = () => ({ effects: [dom.focus("#orbph-viewer")] });
h.close = () => ({
  slice: { photoId: 0, confirmPhoto: false, editingCaption: false },
});

function step(
  s: { db: Db; photos: PhotosState },
  d: number,
): Update | undefined {
  const list = albumPhotos(s.db, s.photos.albumId);
  const at = list.findIndex((x) => x.id === s.photos.photoId);
  const to = list[at + d];
  if (at < 0 || !to) return;
  return {
    slice: {
      photoId: to.id,
      page: Math.floor((at + d) / PAGE_SIZE) + 1,
      confirmPhoto: false,
      editingCaption: false,
    },
  };
}
h.prev = (_p, _e, s) => step(s, -1);
h.next = (_p, _e, s) => step(s, 1);
h.key = (_p, e, s) => {
  const k = e?.key;
  if (k === "Escape") return h.close(undefined, undefined, s);
  if (k === "ArrowLeft") return step(s, -1);
  if (k === "ArrowRight") return step(s, 1);
};

const current = (s: {
  db: Db;
  me: number;
  photos: PhotosState;
}): Photo | undefined => {
  const p = s.db.photos.find(
    (x) => x.id === s.photos.photoId && x.albumId === s.photos.albumId,
  );
  return p && s.me > 0 && p.ownerId === s.me && myAlbum(s, p.albumId)
    ? p
    : undefined;
};

h.editCaption = (_p, _e, s) => {
  const p = current(s);
  return p
    ? { slice: { editingCaption: true, captionText: p.caption } }
    : undefined;
};
h.captionField = (_p, e) => ({ slice: { captionText: text(e) } });
h.cancelCaption = () => ({ slice: { editingCaption: false } });
h.saveCaption = (_p, _e, s) => {
  const p = current(s);
  if (!p || !s.photos.editingCaption) return;
  return {
    put: {
      photos: [{ ...p, caption: s.photos.captionText.trim().slice(0, 140) }],
    },
    slice: { editingCaption: false },
    notice: "Caption saved",
  };
};
/** Move the open photo to another of my albums (`event.value` is the album id). */
h.move = (_p, e, s) => {
  const p = current(s);
  const target = myAlbum(s, Number(text(e)));
  if (!p || !target || target.id === p.albumId) return;
  const list = albumPhotos(s.db, p.albumId);
  const at = list.findIndex((x) => x.id === p.id);
  const neighbour = list[at + 1] ?? list[at - 1];
  return {
    put: { photos: [{ ...p, albumId: target.id }] },
    slice: { photoId: neighbour?.id ?? 0, editingCaption: false },
    notice: `Moved to "${target.title}"`,
  };
};
h.setAvatar = (_p, _e, s) => {
  const p = current(s);
  const u = s.db.users.find((x) => x.id === s.me);
  if (!p || !u) return;
  return {
    put: { users: [{ ...u, avatar: p.src }] },
    notice: "This photo is your avatar now",
  };
};
h.askRemove = (_p, _e, s) =>
  current(s) ? { slice: { confirmPhoto: true } } : undefined;
h.cancelRemove = () => ({ slice: { confirmPhoto: false } });
h.remove = (_p, _e, s) => {
  const p = current(s);
  if (!p || !s.photos.confirmPhoto) return;
  const list = albumPhotos(s.db, p.albumId);
  const at = list.findIndex((x) => x.id === p.id);
  const neighbour = list[at + 1] ?? list[at - 1];
  return {
    remove: { photos: [p.id] },
    slice: {
      photoId: neighbour?.id ?? 0,
      confirmPhoto: false,
      editingCaption: false,
    },
    notice: "Photo deleted",
  };
};
