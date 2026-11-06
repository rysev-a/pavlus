import { Component, type Effect, type Message } from "@pavlus/frontend";
import { storeEffector as store } from "@pavlus/frontend/plugins";
import {
  type Accidental,
  frequency,
  fullName,
  noteName,
  pitchClass,
} from "../piano-keyboard/piano-keyboard.ts";
import view from "./guitar-neck.pavlus";

/** Standard tuning, from the thickest string: E2 A2 D3 G3 B3 E4. */
export const STANDARD_TUNING = [40, 45, 50, 55, 59, 64];

/** The frets with an inlay dot on a real neck (12 has two). */
export const MARKER_FRETS = [3, 5, 7, 9, 12];

export const FRETS = 12;

/** Pure: the MIDI note of a string (0 = the thickest) pressed at a fret (0 = open). */
export const midiAt = (
  string: number,
  fret: number,
  tuning: number[] = STANDARD_TUNING,
): number => tuning[string] + fret;

/** Pure: the name of the note at a string and fret, `A♯` / `B♭`. */
export const noteAt = (
  string: number,
  fret: number,
  accidental: Accidental,
  tuning: number[] = STANDARD_TUNING,
): string => noteName(midiAt(string, fret, tuning), accidental);

/** Pure: the number of inlay dots under a fret: 0, 1 or 2. */
export const dotsAt = (fret: number): number =>
  fret === 12 ? 2 : MARKER_FRETS.includes(fret) ? 1 : 0;

/** Pure: every (string, fret) of the neck that plays the pitch class `pc`. */
export function positionsOf(
  pc: number,
  frets = FRETS,
  tuning: number[] = STANDARD_TUNING,
): { string: number; fret: number }[] {
  const found: { string: number; fret: number }[] = [];
  for (let string = 0; string < tuning.length; string++) {
    for (let fret = 0; fret <= frets; fret++) {
      if (pitchClass(midiAt(string, fret, tuning)) === pc) {
        found.push({ string, fret });
      }
    }
  }
  return found;
}

export type CellState = "" | "active" | "marked" | "wrong";

export interface Cell {
  /** `"s2f5"`: unique in the neck. */
  id: string;
  string: number;
  fret: number;
  midi: number;
  name: string;
  label: string;
  state: CellState;
}

export interface StringRow {
  string: number;
  /** `E`, `A`, `D`, `G`, `B`, `e`: the tuning letter in front of the row. */
  tuning: string;
  cells: Cell[];
}

export interface Position {
  string: number;
  fret: number;
}

export interface NeckOptions {
  accidental: Accidental;
  labels: boolean;
  frets?: number;
  tuning?: number[];
  active?: Position[];
  /** Pitch classes marked everywhere on the neck (a hint, a chord). */
  marked?: number[];
  wrong?: Position[];
}

export interface Neck {
  /** Rows from the thinnest string (top) to the thickest, as on a chord chart. */
  rows: StringRow[];
  /** The fret numbers 1..n with their inlay dots, under the neck. */
  frets: { fret: number; dots: number[] }[];
}

const same = (a: Position, s: number, f: number): boolean =>
  a.string === s && a.fret === f;

/** Pure: the grid of the neck: strings × frets with the state of every cell. */
export function neckGrid(o: NeckOptions): Neck {
  const frets = o.frets ?? FRETS;
  const tuning = o.tuning ?? STANDARD_TUNING;
  const active = o.active ?? [];
  const marked = o.marked ?? [];
  const wrong = o.wrong ?? [];
  const rows: StringRow[] = [];
  for (let string = tuning.length - 1; string >= 0; string--) {
    const cells: Cell[] = [];
    for (let fret = 0; fret <= frets; fret++) {
      const midi = midiAt(string, fret, tuning);
      const state: CellState = wrong.some((p) => same(p, string, fret))
        ? "wrong"
        : active.some((p) => same(p, string, fret))
          ? "active"
          : marked.includes(pitchClass(midi))
            ? "marked"
            : "";
      cells.push({
        id: `s${string}f${fret}`,
        string,
        fret,
        midi,
        name: `${fullName(midi, o.accidental)}, string ${tuning.length - string}, fret ${fret}`,
        label: o.labels || state !== "" ? noteName(midi, o.accidental) : "",
        state,
      });
    }
    const letter = noteName(tuning[string], "sharp");
    rows.push({
      string,
      tuning: string === tuning.length - 1 ? letter.toLowerCase() : letter,
      cells,
    });
  }
  const marks: Neck["frets"] = [];
  for (let fret = 1; fret <= frets; fret++) {
    marks.push({
      fret,
      dots: Array.from({ length: dotsAt(fret) }, (_, i) => i),
    });
  }
  return { rows, frets: marks };
}

export interface GuitarPageState {
  neck: Neck;
  active: Position[];
  labels: boolean;
  accidental: Accidental;
  played: string;
}

const build = (
  active: Position[],
  labels: boolean,
  accidental: Accidental,
): Neck => neckGrid({ active, labels, accidental });

export const initial: GuitarPageState = {
  neck: build([], false, "sharp"),
  active: [],
  labels: false,
  accidental: "sharp",
  played: "Click a fret to see the note under your finger.",
};

export class GuitarNeckPage extends Component<GuitarPageState> {
  view = view;

  "neck.press"(msg: Message, state: GuitarPageState): Effect[] {
    const [string, fret] = msg.payload as [number, number];
    const active = [{ string, fret }];
    const midi = midiAt(string, fret);
    return [
      store.set("active", active),
      store.set("neck", build(active, state.labels, state.accidental)),
      store.set(
        "played",
        `${fullName(midi, state.accidental)}: string ${6 - string}, fret ${fret}, ${frequency(midi)} Hz`,
      ),
    ];
  }

  toggleLabels(_msg: Message, state: GuitarPageState): Effect[] {
    const labels = !state.labels;
    return [
      store.set("labels", labels),
      store.set("neck", build(state.active, labels, state.accidental)),
    ];
  }

  toggleAccidental(_msg: Message, state: GuitarPageState): Effect[] {
    const accidental: Accidental =
      state.accidental === "sharp" ? "flat" : "sharp";
    return [
      store.set("accidental", accidental),
      store.set("neck", build(state.active, state.labels, accidental)),
    ];
  }
}

export const page = new GuitarNeckPage();
