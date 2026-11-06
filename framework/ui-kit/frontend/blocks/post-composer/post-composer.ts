import { Component, type Effect, type Message } from "@pavlus/frontend";
import { storeEffector as store } from "@pavlus/frontend/plugins";
import view from "./post-composer.pavlus";

export const LIMIT = 280;

export interface MoodDef {
  id: string;
  label: string;
  emoji: string;
}

export const MOODS: MoodDef[] = [
  { id: "happy", label: "feeling happy", emoji: "😊" },
  { id: "proud", label: "feeling proud", emoji: "🏆" },
  { id: "tired", label: "feeling tired", emoji: "😴" },
  { id: "excited", label: "feeling excited", emoji: "🎉" },
];

/** What a draft needs: some text, not too long. */
export const canPost = (draft: string): boolean =>
  draft.trim().length > 0 && draft.length <= LIMIT;

/** Pure: characters left (negative when too long). */
export const charsLeft = (draft: string): number => LIMIT - draft.length;

/** Pure: a mood button list, one active. Clicking the active mood clears it. */
export function pickMood(current: string, id: string): string {
  return current === id ? "" : id;
}

/** Pure: the label a post gets from a mood id: `😊 feeling happy`, or "". */
export function moodLabel(id: string, moods: MoodDef[] = MOODS): string {
  const m = moods.find((x) => x.id === id);
  return m ? `${m.emoji} ${m.label}` : "";
}

export interface ComposerProps {
  me: string;
  placeholder: string;
  draft: string;
  left: number;
  moods: (MoodDef & { active: boolean })[];
  photo: string;
  canPost: boolean;
}

/** The tile a photo attachment shows. */
export const PHOTO = "🌄";

/** Pure: the props of the view from the parts of the state. */
export function composerProps(
  draft: string,
  mood: string,
  photo: boolean,
  me = "YO",
  placeholder = "What is on your mind?",
  moods: MoodDef[] = MOODS,
): ComposerProps {
  return {
    me,
    placeholder,
    draft,
    left: charsLeft(draft),
    moods: moods.map((m) => ({ ...m, active: m.id === mood })),
    photo: photo ? PHOTO : "",
    canPost: canPost(draft),
  };
}

export interface ComposerState {
  draft: string;
  mood: string;
  photoOn: boolean;
  composer: ComposerProps;
  last: string;
}

export const initial: ComposerState = {
  draft: "",
  mood: "",
  photoOn: false,
  composer: composerProps("", "", false),
  last: "Nothing posted yet.",
};

export class PostComposerPage extends Component<ComposerState> {
  view = view;

  _show(
    state: ComposerState,
    patch: Partial<Pick<ComposerState, "draft" | "mood" | "photoOn" | "last">>,
  ): Effect[] {
    const n = { ...state, ...patch };
    return [
      ...(Object.keys(patch) as (keyof typeof patch)[]).map((k) =>
        store.set(k, patch[k]),
      ),
      store.set("composer", composerProps(n.draft, n.mood, n.photoOn)),
    ];
  }

  "composer.draft"(msg: Message, state: ComposerState): Effect[] {
    return this._show(state, { draft: msg.event?.value ?? "" });
  }

  "composer.mood"(msg: Message, state: ComposerState): Effect[] {
    return this._show(state, {
      mood: pickMood(state.mood, msg.payload as string),
    });
  }

  "composer.photo"(_msg: Message, state: ComposerState): Effect[] {
    return this._show(state, { photoOn: !state.photoOn });
  }

  "composer.post"(_msg: Message, state: ComposerState): Effect[] {
    if (!canPost(state.draft)) return [];
    return this._show(state, {
      last: `Posted: "${state.draft.trim()}" ${moodLabel(state.mood)}`.trim(),
      draft: "",
      mood: "",
      photoOn: false,
    });
  }
}

export const page = new PostComposerPage();
