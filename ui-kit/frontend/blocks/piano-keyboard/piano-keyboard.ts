import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import { storeEffector as store } from "@service-laboratory/pavlus/plugins";
import view from "./piano-keyboard.pavlus";

/** Sharps (C♯) or flats (D♭): the same key has two names. */
export type Accidental = "sharp" | "flat";

export const SHARP_NAMES = [
  "C",
  "C♯",
  "D",
  "D♯",
  "E",
  "F",
  "F♯",
  "G",
  "G♯",
  "A",
  "A♯",
  "B",
];
export const FLAT_NAMES = [
  "C",
  "D♭",
  "D",
  "E♭",
  "E",
  "F",
  "G♭",
  "G",
  "A♭",
  "A",
  "B♭",
  "B",
];

const BLACK = new Set([1, 3, 6, 8, 10]);

/** Pure: 0 = C ... 11 = B, for any MIDI number. */
export const pitchClass = (midi: number): number => ((midi % 12) + 12) % 12;

/** Pure: the octave in scientific notation (middle C, MIDI 60, is C4). */
export const octaveOf = (midi: number): number => Math.floor(midi / 12) - 1;

export const isBlack = (midi: number): boolean => BLACK.has(pitchClass(midi));

/** Pure: `C`, `C♯` / `D♭`: the name of a pitch class. */
export const className = (pc: number, accidental: Accidental): string =>
  (accidental === "flat" ? FLAT_NAMES : SHARP_NAMES)[pitchClass(pc)];

/** Pure: `C♯`, without the octave. */
export const noteName = (midi: number, accidental: Accidental): string =>
  className(pitchClass(midi), accidental);

/** Pure: `C♯4`. */
export const fullName = (midi: number, accidental: Accidental): string =>
  `${noteName(midi, accidental)}${octaveOf(midi)}`;

const LETTERS: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

/**
 * Pure: `"C#4"`, `"Db3"`, `"A♭2"` → a MIDI number. Without an octave the
 * `octave` argument is used. `null` if it is not a note.
 */
export function midiOf(name: string, octave = 4): number | null {
  const m = /^([A-Ga-g])([#♯b♭]?)(-?\d+)?$/.exec(name.trim());
  if (!m) return null;
  let pc = LETTERS[m[1].toUpperCase()];
  if (m[2] === "#" || m[2] === "♯") pc += 1;
  if (m[2] === "b" || m[2] === "♭") pc -= 1;
  const oct = m[3] === undefined ? octave : Number(m[3]);
  return (oct + 1) * 12 + pc;
}

/** Pure: a note `by` semitones away. */
export const transpose = (midi: number, by: number): number => midi + by;

/** Pure: the distance in semitones from `a` up to `b` (negative: down). */
export const semitones = (a: number, b: number): number => b - a;

/** Pure: the frequency in Hz, equal temperament, A4 = 440. */
export const frequency = (midi: number): number =>
  Math.round(440 * 2 ** ((midi - 69) / 12) * 100) / 100;

const INTERVALS = [
  "unison",
  "minor 2nd",
  "major 2nd",
  "minor 3rd",
  "major 3rd",
  "perfect 4th",
  "tritone",
  "perfect 5th",
  "minor 6th",
  "major 6th",
  "minor 7th",
  "major 7th",
  "octave",
];

/** Pure: the name of the interval between two notes, up to an octave. */
export function intervalName(a: number, b: number): string {
  const d = Math.abs(b - a);
  return d <= 12
    ? INTERVALS[d]
    : `${Math.floor(d / 12)} octaves + ${INTERVALS[d % 12]}`;
}

/** The computer keyboard as a piano: `a` is the first C, `w` the C♯... */
export const KEYBOARD_ROW = "awsedftgyhujkolp;'";

/** Pure: which MIDI note a computer key plays, `base` being the note of `a`. */
export function midiOfKey(key: string, base: number): number | null {
  if (key.length !== 1) return null;
  const i = KEYBOARD_ROW.indexOf(key.toLowerCase());
  return i < 0 ? null : base + i;
}

export type KeyState = "" | "active" | "marked" | "wrong";

export interface Key {
  midi: number;
  /** Spoken name with octave, for `aria-label`. */
  name: string;
  /** What is printed on the key (empty when the labels are off). */
  label: string;
  state: KeyState;
}

export interface WhiteKey extends Key {
  /** The black key to the right of this white one, if the scale has one. */
  black: Key | null;
}

export interface PianoOptions {
  /** The MIDI number of the first key (a C: 48 is C3). */
  from: number;
  octaves: number;
  accidental: Accidental;
  /** Print the note name on every key (the active ones always show it). */
  labels: boolean;
  /** Keys that are lit (MIDI numbers). */
  active?: number[];
  /** Pitch classes that are marked on every octave (a chord, a hint). */
  marked?: number[];
  /** Keys that were a wrong answer. */
  wrong?: number[];
}

/** Pure: the keys of a keyboard: `octaves` octaves and the C that closes it. */
export function pianoKeys(o: PianoOptions): WhiteKey[] {
  const active = o.active ?? [];
  const marked = o.marked ?? [];
  const wrong = o.wrong ?? [];
  const last = o.from + o.octaves * 12;
  const make = (midi: number): Key => {
    const state: KeyState = wrong.includes(midi)
      ? "wrong"
      : active.includes(midi)
        ? "active"
        : marked.includes(pitchClass(midi))
          ? "marked"
          : "";
    return {
      midi,
      name: fullName(midi, o.accidental),
      label: o.labels || state !== "" ? noteName(midi, o.accidental) : "",
      state,
    };
  };
  const whites: WhiteKey[] = [];
  for (let midi = o.from; midi <= last; midi++) {
    if (isBlack(midi)) continue;
    const next = midi + 1;
    whites.push({
      ...make(midi),
      black: next < last && isBlack(next) ? make(next) : null,
    });
  }
  return whites;
}

export interface PianoPageState {
  playable: { whites: WhiteKey[] };
  chord: { whites: WhiteKey[] };
  active: number[];
  labels: boolean;
  accidental: Accidental;
  /** Shown under the keyboard: what was played. */
  played: string;
}

const FROM = 48;
const BASE = 60;

const playable = (
  active: number[],
  labels: boolean,
  accidental: Accidental,
): { whites: WhiteKey[] } => ({
  whites: pianoKeys({ from: FROM, octaves: 2, accidental, labels, active }),
});

export const initial: PianoPageState = {
  playable: playable([], false, "sharp"),
  // C major: C E G, marked on every octave
  chord: {
    whites: pianoKeys({
      from: 60,
      octaves: 1,
      accidental: "sharp",
      labels: true,
      marked: [0, 4, 7],
    }),
  },
  active: [],
  labels: false,
  accidental: "sharp",
  played: "Click a key, or type A W S E D F T G Y H U J on the keyboard.",
};

export class PianoKeyboardPage extends Component<PianoPageState> {
  view = view;

  "piano.press"(msg: Message, state: PianoPageState): Effect[] {
    return this._play(msg.payload as number, state);
  }

  "piano.keys"(msg: Message, state: PianoPageState): Effect[] {
    const midi = midiOfKey(msg.event?.key ?? "", BASE);
    return midi === null ? [] : this._play(midi, state);
  }

  toggleLabels(_msg: Message, state: PianoPageState): Effect[] {
    const labels = !state.labels;
    return [
      store.set("labels", labels),
      store.set("playable", playable(state.active, labels, state.accidental)),
    ];
  }

  toggleAccidental(_msg: Message, state: PianoPageState): Effect[] {
    const accidental: Accidental =
      state.accidental === "sharp" ? "flat" : "sharp";
    return [
      store.set("accidental", accidental),
      store.set("playable", playable(state.active, state.labels, accidental)),
    ];
  }

  _play(midi: number, state: PianoPageState): Effect[] {
    const active = [midi];
    return [
      store.set("active", active),
      store.set("playable", playable(active, state.labels, state.accidental)),
      store.set(
        "played",
        `${fullName(midi, state.accidental)}: ${frequency(midi)} Hz, MIDI ${midi}`,
      ),
    ];
  }
}

export const page = new PianoKeyboardPage();
