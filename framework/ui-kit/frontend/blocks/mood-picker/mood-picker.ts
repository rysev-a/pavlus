import { Component, type Effect, type Message } from "@pavlus/frontend";
import { patch } from "../admin-shell/shell.ts";
import view from "./mood-picker.pavlus";
import { moodOf, type PickerMood, pickerMoods } from "./moods.ts";

export interface MoodState {
  active: string;
  moods: PickerMood[];
  said: string;
}

const say = (id: string): string =>
  id
    ? `Feeling ${moodOf(id).label.toLowerCase()} ${moodOf(id).emoji}`
    : "No mood chosen";

export const initial: MoodState = {
  active: "calm",
  moods: pickerMoods("calm"),
  said: say("calm"),
};

export class MoodPage extends Component<MoodState> {
  view = view;

  "mood.pick"(msg: Message, state: MoodState): Effect[] {
    const id = msg.payload as string;
    const active = id === state.active ? "" : id;
    return patch({ active, moods: pickerMoods(active), said: say(active) });
  }
}

export const page = new MoodPage();
