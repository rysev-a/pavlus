import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import {
  storeEffector as store,
  timeEffector as time,
} from "@service-laboratory/pavlus/plugins";
import { patch } from "../admin-shell/shell.ts";
import {
  type Cat,
  type Entry,
  newTracker,
  startTracker,
  stopTracker,
  tickTracker,
  type Tracker,
  trackerView,
  type TrackerView,
} from "./tracker.ts";
import view from "./time-tracker.pavlus";

export const TIMER_ID = "time-tracker:demo";

export interface TimeTrackerState {
  cats: Cat[];
  tracker: Tracker;
  entries: Entry[];
  track: TrackerView;
}

const CATS: Cat[] = [
  { id: "work", name: "Work", tone: "c1" },
  { id: "study", name: "Study", tone: "c2" },
  { id: "sport", name: "Sport", tone: "c3" },
  { id: "family", name: "Family", tone: "c4" },
  { id: "home", name: "Errands", tone: "c5" },
];

const ENTRIES: Entry[] = [
  { id: "e1", title: "Inbox and planning", cat: "work", start: 540, dur: 35 },
  { id: "e2", title: "Spanish: past tense", cat: "study", start: 600, dur: 50 },
];

const TRACKER = newTracker(14 * 60 + 20, "work");

export const initial: TimeTrackerState = {
  cats: CATS,
  tracker: TRACKER,
  entries: ENTRIES,
  track: trackerView(TRACKER, CATS, ENTRIES),
};

export class TimeTrackerPage extends Component<TimeTrackerState> {
  view = view;

  /** Store the new timer and every field of the view that depends on it. */
  _commit(
    state: TimeTrackerState,
    tracker: Tracker,
    entries: Entry[] = state.entries,
  ): Effect[] {
    return patch({
      tracker,
      entries,
      track: trackerView(tracker, state.cats, entries),
    });
  }

  "tt.start"(_msg: Message, state: TimeTrackerState): Effect[] {
    if (state.tracker.running) return [];
    return [
      ...this._commit(state, startTracker(state.tracker)),
      time.setInterval(TIMER_ID, 1000, "tick"),
    ];
  }

  tick(_msg: Message, state: TimeTrackerState): Effect[] {
    return this._commit(state, tickTracker(state.tracker));
  }

  "tt.stop"(_msg: Message, state: TimeTrackerState): Effect[] {
    const cat = state.cats.find((c) => c.id === state.tracker.cat);
    const id = `e${state.entries.length + 1}`;
    const { tracker, entry } = stopTracker(
      state.tracker,
      id,
      cat?.name ?? "Time",
    );
    return [
      time.cancel(TIMER_ID),
      ...this._commit(
        state,
        tracker,
        entry ? [...state.entries, entry] : state.entries,
      ),
    ];
  }

  "tt.pickcat"(msg: Message, state: TimeTrackerState): Effect[] {
    return this._commit(state, {
      ...state.tracker,
      cat: msg.payload as string,
    });
  }

  "tt.setnote"(msg: Message, state: TimeTrackerState): Effect[] {
    return [
      store.set("tracker", {
        ...state.tracker,
        note: msg.event?.value ?? "",
      }),
    ];
  }

  "tt.setfast"(msg: Message, state: TimeTrackerState): Effect[] {
    return this._commit(state, {
      ...state.tracker,
      fast: Boolean(msg.event?.checked),
    });
  }

  leave(): Effect[] {
    return [time.cancel(TIMER_ID)];
  }
}

export const page = new TimeTrackerPage();
