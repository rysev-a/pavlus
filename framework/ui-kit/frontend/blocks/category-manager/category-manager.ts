import { Component, type Effect, type Message } from "@pavlus/frontend";
import { patch } from "../admin-shell/shell.ts";
import view from "./category-manager.pavlus";
import {
  addCategory,
  type Category,
  type CategoryView,
  categoryView,
  type Draft,
  freshTone,
  recolor,
  removeCategory,
  rename,
  validateName,
} from "./cats.ts";

export interface CategoryManagerState {
  cats: Category[];
  minutes: Record<string, number>;
  draft: Draft;
  errors: Record<string, string>;
  manager: CategoryView;
}

const CATS: Category[] = [
  { id: "work", name: "Work", tone: "c1" },
  { id: "study", name: "Study", tone: "c2" },
  { id: "sport", name: "Sport", tone: "c3" },
  { id: "family", name: "Family", tone: "c4" },
  { id: "hobby", name: "Hobbies", tone: "pr" },
];

const MINUTES = { work: 1680, study: 420, sport: 330, family: 600, hobby: 0 };

const DRAFT: Draft = { name: "", tone: freshTone(CATS), error: "" };

export const initial: CategoryManagerState = {
  cats: CATS,
  minutes: MINUTES,
  draft: DRAFT,
  errors: {},
  manager: categoryView(CATS, MINUTES, DRAFT),
};

export class CategoryManagerPage extends Component<CategoryManagerState> {
  view = view;

  _commit(
    state: CategoryManagerState,
    cats: Category[],
    draft: Draft,
    errors: Record<string, string>,
  ): Effect[] {
    return patch({
      cats,
      draft,
      errors,
      manager: categoryView(cats, state.minutes, draft, errors),
    });
  }

  "cats.setname"(msg: Message, state: CategoryManagerState): Effect[] {
    const draft = { ...state.draft, name: msg.event?.value ?? "", error: "" };
    return this._commit(state, state.cats, draft, state.errors);
  }

  "cats.settone"(msg: Message, state: CategoryManagerState): Effect[] {
    const draft = { ...state.draft, tone: msg.payload as string };
    return this._commit(state, state.cats, draft, state.errors);
  }

  "cats.add"(_msg: Message, state: CategoryManagerState): Effect[] {
    const error = validateName(state.draft.name, state.cats);
    if (error) {
      return this._commit(
        state,
        state.cats,
        { ...state.draft, error },
        state.errors,
      );
    }
    const cats = addCategory(state.cats, state.draft.name, state.draft.tone);
    return this._commit(
      state,
      cats,
      { name: "", tone: freshTone(cats), error: "" },
      state.errors,
    );
  }

  "cats.rename"(msg: Message, state: CategoryManagerState): Effect[] {
    const id = msg.payload as string;
    const name = msg.event?.value ?? "";
    const error = validateName(name, state.cats, id);
    const errors = { ...state.errors, [id]: error };
    // an invalid name is shown as an error and not saved
    const cats = error ? state.cats : rename(state.cats, id, name.trim());
    return this._commit(state, cats, state.draft, errors);
  }

  "cats.recolor"(msg: Message, state: CategoryManagerState): Effect[] {
    const cats = recolor(state.cats, msg.payload as string);
    return this._commit(state, cats, state.draft, state.errors);
  }

  "cats.remove"(msg: Message, state: CategoryManagerState): Effect[] {
    const cats = removeCategory(
      state.cats,
      msg.payload as string,
      state.minutes,
    );
    return this._commit(state, cats, state.draft, state.errors);
  }
}

export const page = new CategoryManagerPage();
