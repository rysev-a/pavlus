import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import { patch } from "../admin-shell/shell.ts";
import { moodOf, pickerMoods, type PickerMood } from "./moods.ts";
import view from "./mood-picker.pavlus";

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
