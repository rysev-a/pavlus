import { Component, type Effect, type Message } from "@pavlus/frontend";
import { patch } from "../admin-shell/shell.ts";
import type { Privacy } from "../journal-entry/entry.ts";
import {
  counterOf,
  type Draft,
  emptyDraft,
  type PrivacyChoice,
  parseTags,
  privacyChoices,
  validateDraft,
} from "./editor.ts";
import view from "./entry-editor.pavlus";

export interface EditorDemoState {
  draft: Draft;
  errors: Record<string, string>;
  privacies: PrivacyChoice[];
  counter: string;
  said: string;
}

// The demo has no mood picker: it takes a mood so that the checks can pass.
const start = (): Draft => ({ ...emptyDraft(), mood: "calm" });

export const initial: EditorDemoState = {
  draft: start(),
  errors: {},
  privacies: privacyChoices("friends"),
  counter: counterOf(""),
  said: "Nothing published yet.",
};

export class EditorPage extends Component<EditorDemoState> {
  view = view;

  "editor.field"(msg: Message, state: EditorDemoState): Effect[] {
    const key = msg.payload as keyof Draft;
    const draft = { ...state.draft, [key]: msg.event?.value ?? "" };
    return patch({ draft, counter: counterOf(draft.body) });
  }

  "editor.privacy"(msg: Message, state: EditorDemoState): Effect[] {
    const privacy = msg.payload as Privacy;
    return patch({
      draft: { ...state.draft, privacy },
      privacies: privacyChoices(privacy),
    });
  }

  "editor.save"(_msg: Message, state: EditorDemoState): Effect[] {
    const errors = validateDraft(state.draft);
    if (Object.keys(errors).length > 0) {
      return patch({ errors, said: "Fix the marked fields first." });
    }
    return patch({
      errors: {},
      said: `Published "${state.draft.title.trim()}" with ${parseTags(state.draft.tags).length} tags.`,
    });
  }

  "editor.discard"(): Effect[] {
    return patch({
      draft: start(),
      errors: {},
      counter: counterOf(""),
      said: "Draft discarded.",
    });
  }
}

export const page = new EditorPage();
