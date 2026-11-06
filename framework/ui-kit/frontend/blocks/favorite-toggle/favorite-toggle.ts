import { Component, type Effect, type Message } from "@pavlus/frontend";
import { storeEffector as store } from "@pavlus/frontend/plugins";
import view from "./favorite-toggle.pavlus";

/** Pure: the favorites after a click: add the id, or take it away. */
export function toggleFavorite(favorites: string[], id: string): string[] {
  return favorites.includes(id)
    ? favorites.filter((f) => f !== id)
    : [...favorites, id];
}

/** Pure: how many favorites, as the text next to a heart: `3 saved`. */
export const savedLabel = (count: number): string =>
  count === 0 ? "Nothing saved yet" : `${count} saved`;

export interface FavoriteState {
  favorites: string[];
  /** The three demos. */
  a: boolean;
  b: boolean;
  c: boolean;
  summary: string;
}

const sync = (favorites: string[]) => ({
  favorites,
  a: favorites.includes("a"),
  b: favorites.includes("b"),
  c: favorites.includes("c"),
  summary: savedLabel(favorites.length),
});

export const initial: FavoriteState = sync(["b"]);

export class FavoriteTogglePage extends Component<FavoriteState> {
  view = view;

  _toggle(msg: Message, state: FavoriteState): Effect[] {
    const next = sync(toggleFavorite(state.favorites, msg.payload as string));
    return (Object.keys(next) as (keyof FavoriteState)[]).map((k) =>
      store.set(k, next[k]),
    );
  }

  "icon.toggle"(msg: Message, state: FavoriteState): Effect[] {
    return this._toggle(msg, state);
  }

  "named.toggle"(msg: Message, state: FavoriteState): Effect[] {
    return this._toggle(msg, state);
  }

  "big.toggle"(msg: Message, state: FavoriteState): Effect[] {
    return this._toggle(msg, state);
  }
}

export const page = new FavoriteTogglePage();
