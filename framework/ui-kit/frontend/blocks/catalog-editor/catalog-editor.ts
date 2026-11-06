import { Component, type Effect, type Message } from "@pavlus/frontend";
import { patch } from "../admin-shell/shell.ts";
import {
  type Entry,
  type EntryView,
  entry,
  onCount,
  parsePrice,
  rowsOf,
  toggle,
  typePrice,
} from "./catalog.ts";
import view from "./catalog-editor.pavlus";

export interface CatalogEditorState {
  items: Entry[];
  rows: EntryView[];
  message: string;
}

const ITEMS: Entry[] = [
  entry("soup", "🍅", "Tomato soup", "Starters", 7.5, "with basil oil"),
  entry("salad", "🥗", "Caesar salad", "Starters", 9),
  entry("risotto", "🍄", "Mushroom risotto", "Mains", 16.5, "vegetarian"),
  entry("bass", "🐟", "Sea bass", "Mains", 21, "grilled, with fennel", false),
  entry("tiramisu", "🍰", "Tiramisu", "Desserts", 7),
];

const draw = (items: Entry[]) => ({ items, rows: rowsOf(items) });

export const initial: CatalogEditorState = {
  ...draw(ITEMS),
  message:
    "Switch a dish off when the kitchen runs out. Edit a price in its box.",
};

export class CatalogEditorPage extends Component<CatalogEditorState> {
  view = view;

  "menu.toggle"(msg: Message, state: CatalogEditorState): Effect[] {
    const items = toggle(state.items, msg.payload as string);
    return patch({
      ...draw(items),
      message: `${onCount(items)} of ${items.length} dishes are on the menu.`,
    });
  }

  "menu.price"(msg: Message, state: CatalogEditorState): Effect[] {
    const text = msg.event?.value ?? "";
    const items = typePrice(state.items, msg.payload as string, text);
    return patch({
      ...draw(items),
      message:
        parsePrice(text) === null ? "That is not a price yet." : "Price saved.",
    });
  }
}

export const page = new CatalogEditorPage();
