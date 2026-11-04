import {
  type Children,
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import {
  domEffector as dom,
  storeEffector as store,
  timeEffector as time,
} from "@service-laboratory/pavlus/plugins";
import view from "./view.pavlus";
import pageView from "./gallery.pavlus";

export type Shape = "tall" | "wide" | "square" | "pano";

export interface Photo {
  key: string;
  title: string;
  caption: string;
  category: string;
  /** 0-7: which gradient the photo uses. */
  tone: number;
  shape: Shape;
  emoji: string;
}

export interface Category {
  id: string;
  label: string;
  count: number;
}

export const ALL = "all";

export interface GalleryState {
  items: Photo[];
  categories: Category[];
  category: string;
  /** Derived: the photos of `category`. */
  shown: Photo[];
  /** The lightbox: the index in `shown`, -1 when closed. */
  index: number;
  /** Derived: the photo in the lightbox, or null. */
  current: Photo | null;
  /** Derived: `3 / 12`. */
  position: string;
}

/** Pure: the photos of a category (`all` keeps every one). */
export function filterPhotos(items: Photo[], category: string): Photo[] {
  return category === ALL
    ? items
    : items.filter((p) => p.category === category);
}

/**
 * Pure: "All" and the given categories, with how many photos each holds.
 * `labels` is the order and the names: `{ weddings: "Weddings" }`.
 */
export function categoriesOf(
  items: Photo[],
  labels: Record<string, string>,
): Category[] {
  return [
    { id: ALL, label: "All", count: items.length },
    ...Object.entries(labels).map(([id, label]) => ({
      id,
      label,
      count: items.filter((p) => p.category === id).length,
    })),
  ];
}

/** Pure: the index `by` steps away, wrapping around the ends. */
export function stepIndex(index: number, by: number, total: number): number {
  if (total <= 0) return -1;
  return (((index + by) % total) + total) % total;
}

/** Pure: `3 / 12` for a lightbox index. */
export function positionLabel(index: number, total: number): string {
  return index < 0 ? "" : `${index + 1} / ${total}`;
}

/** Pure: the derived fields of the lightbox for an index in `shown`. */
export function lightboxOf(
  shown: Photo[],
  index: number,
): Pick<GalleryState, "index" | "current" | "position"> {
  const current = shown[index] ?? null;
  return current
    ? { index, current, position: positionLabel(index, shown.length) }
    : { index: -1, current: null, position: "" };
}

/** Pure: a whole gallery state from its photos. */
export function galleryState(
  items: Photo[],
  labels: Record<string, string>,
): GalleryState {
  return {
    items,
    categories: categoriesOf(items, labels),
    category: ALL,
    shown: items,
    ...lightboxOf(items, -1),
  };
}

export class Gallery extends Component<GalleryState> {
  view = view;

  /** A category: the lightbox, if open, closes. */
  pick(msg: Message, state: GalleryState): Effect[] {
    const category = msg.payload as string;
    return [
      store.set("category", category),
      store.set("shown", filterPhotos(state.items, category)),
      ...this._lightbox([], -1),
    ];
  }

  open(msg: Message, state: GalleryState): Effect[] {
    const index = state.shown.findIndex((p) => p.key === msg.payload);
    if (index < 0) return [];
    return [
      ...this._lightbox(state.shown, index),
      // the lightbox is in the DOM after this render: focus it on the next tick
      time.setTimeout("gal-focus", 0, "focusStage"),
    ];
  }

  focusStage(): Effect[] {
    return [dom.focus("#gal-lightbox")];
  }

  close(): Effect[] {
    return this._lightbox([], -1);
  }

  next(_msg: Message, state: GalleryState): Effect[] {
    return this._lightbox(
      state.shown,
      stepIndex(state.index, 1, state.shown.length),
    );
  }

  prev(_msg: Message, state: GalleryState): Effect[] {
    return this._lightbox(
      state.shown,
      stepIndex(state.index, -1, state.shown.length),
    );
  }

  /** Arrows step, Escape closes. */
  key(msg: Message, state: GalleryState): Effect[] {
    const key = msg.event?.key;
    if (key === "Escape") return this.close();
    if (key === "ArrowRight") return this.next(msg, state);
    if (key === "ArrowLeft") return this.prev(msg, state);
    return [];
  }

  _lightbox(shown: Photo[], index: number): Effect[] {
    const box = lightboxOf(shown, index);
    return [
      store.set("index", box.index),
      store.set("current", box.current),
      store.set("position", box.position),
    ];
  }
}

export const part = new Gallery();

const photo = (
  key: string,
  title: string,
  caption: string,
  category: string,
  tone: number,
  shape: Shape,
  emoji: string,
): Photo => ({ key, title, caption, category, tone, shape, emoji });

export const demoPhotos: Photo[] = [
  photo("p1", "First dance", "Lisbon, June", "weddings", 0, "tall", "💃"),
  photo("p2", "Garden vows", "Sintra, May", "weddings", 3, "wide", "💍"),
  photo(
    "p3",
    "Studio light",
    "Portrait of Ines",
    "portraits",
    5,
    "square",
    "🧑‍🎨",
  ),
  photo("p4", "Morning fog", "Douro valley", "travel", 2, "pano", "🌄"),
  photo("p5", "Rooftops", "Porto, golden hour", "travel", 1, "wide", "🏙️"),
  photo(
    "p6",
    "Quiet hands",
    "Portrait of a potter",
    "portraits",
    6,
    "tall",
    "🏺",
  ),
];

export const demoLabels = {
  weddings: "Weddings",
  portraits: "Portraits",
  travel: "Travel",
};

export interface GalleryPageState {
  gallery: GalleryState;
}

export const initial: GalleryPageState = {
  gallery: galleryState(demoPhotos, demoLabels),
};

/** The demo page: the part as a child. */
export class GalleryPage extends Component<GalleryPageState> {
  view = pageView;

  children: Children<GalleryPageState> = {
    gallery: { component: part, key: "gallery" },
  };
}

export const page = new GalleryPage();
