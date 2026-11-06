import { Component, type Effect, type Message } from "@pavlus/frontend";
import { patch, type Tone } from "../admin-shell/shell.ts";
import type { Freq, Habit } from "../habit-grid/habits.ts";
import {
  type Choice,
  emptyHabit,
  freqChoices,
  type HabitDraft,
  iconChoices,
  saveHabit,
  toneChoices,
  validateHabit,
} from "./form.ts";
import view from "./habit-form.pavlus";

export interface HabitFormState {
  habits: Habit[];
  draft: HabitDraft;
  errors: Record<string, string>;
  tones: Choice<Tone>[];
  icons: Choice<string>[];
  freqs: Choice<Freq>[];
  said: string;
}

const choices = (d: HabitDraft) => ({
  draft: d,
  tones: toneChoices(d.tone),
  icons: iconChoices(d.icon),
  freqs: freqChoices(d.freq),
});

export const initial: HabitFormState = {
  habits: [
    {
      id: "h1",
      name: "Read 20 pages",
      icon: "📖",
      tone: "info",
      freq: "daily",
    },
  ],
  errors: {},
  said: "Nothing saved yet.",
  ...choices(emptyHabit()),
};

export class HabitFormPage extends Component<HabitFormState> {
  view = view;

  "form.name"(msg: Message, state: HabitFormState): Effect[] {
    return patch({ draft: { ...state.draft, name: msg.event?.value ?? "" } });
  }
  "form.tone"(msg: Message, state: HabitFormState): Effect[] {
    return patch(choices({ ...state.draft, tone: msg.payload as Tone }));
  }
  "form.icon"(msg: Message, state: HabitFormState): Effect[] {
    return patch(choices({ ...state.draft, icon: msg.payload as string }));
  }
  "form.freq"(msg: Message, state: HabitFormState): Effect[] {
    return patch(choices({ ...state.draft, freq: msg.payload as Freq }));
  }

  "form.save"(_msg: Message, state: HabitFormState): Effect[] {
    const errors = validateHabit(state.draft, state.habits, "");
    if (Object.keys(errors).length > 0) return patch({ errors });
    return patch({
      habits: saveHabit(state.habits, state.draft, ""),
      errors: {},
      said: `Saved "${state.draft.name.trim()}". You track ${state.habits.length + 1} habits now.`,
      ...choices(emptyHabit()),
    });
  }

  "form.cancel"(): Effect[] {
    return patch({ errors: {}, said: "Cancelled.", ...choices(emptyHabit()) });
  }
}

export const page = new HabitFormPage();
