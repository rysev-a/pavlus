import { Component, type Effect, type Message } from "@pavlus/frontend";
import { storeEffector as store } from "@pavlus/frontend/plugins";
import view from "./worker-picker.pavlus";

export interface Worker {
  id: string;
  name: string;
  role: string;
  initials: string;
  specialties: string[];
  rating: number;
  reviews: number;
  /** 1..5: which `--chart-N` colors the avatar. */
  tone: number;
  selected: boolean;
}

/** Pure: `4.9` → `★★★★★`, `4.4` → `★★★★☆` (rounded to the nearest star). */
export function stars(rating: number): string {
  const full = Math.max(0, Math.min(5, Math.round(rating)));
  return "★".repeat(full) + "☆".repeat(5 - full);
}

/** Pure: the cards with `selected` set from the chosen id. */
export function withSelected(
  workers: Omit<Worker, "selected">[],
  id: string,
): Worker[] {
  return workers.map((w) => ({ ...w, selected: w.id === id }));
}

/** Pure: the average rating of the people, weighted by their reviews. */
export function averageRating(
  workers: Pick<Worker, "rating" | "reviews">[],
): number {
  const total = workers.reduce((sum, w) => sum + w.reviews, 0);
  if (total === 0) return 0;
  const sum = workers.reduce((s, w) => s + w.rating * w.reviews, 0);
  return Math.round((sum / total) * 10) / 10;
}

const PEOPLE: Omit<Worker, "selected">[] = [
  {
    id: "marco",
    name: "Marco Bellini",
    role: "Master barber",
    initials: "MB",
    specialties: ["Classic cuts", "Fades", "Scissor work"],
    rating: 4.9,
    reviews: 212,
    tone: 1,
  },
  {
    id: "elena",
    name: "Elena Rossi",
    role: "Senior stylist",
    initials: "ER",
    specialties: ["Colour", "Long hair", "Kids"],
    rating: 4.8,
    reviews: 164,
    tone: 2,
  },
  {
    id: "dmitri",
    name: "Dmitri Volkov",
    role: "Barber",
    initials: "DV",
    specialties: ["Beard design", "Hot towel shave"],
    rating: 4.6,
    reviews: 98,
    tone: 3,
  },
];

export interface WorkerPickerState {
  people: Omit<Worker, "selected">[];
  workers: Worker[];
  chosen: string;
}

export const initial: WorkerPickerState = {
  people: PEOPLE,
  workers: withSelected(PEOPLE, "elena"),
  chosen: "elena",
};

export class WorkerPickerPage extends Component<WorkerPickerState> {
  view = view;

  "workers.pick"(msg: Message, state: WorkerPickerState): Effect[] {
    const id = msg.payload as string;
    return [
      store.set("chosen", id),
      store.set("workers", withSelected(state.people, id)),
    ];
  }
}

export const page = new WorkerPickerPage();
