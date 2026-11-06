import { Component, type Effect, type Message } from "@pavlus/frontend";
import {
  storeEffector as store,
  timeEffector as time,
} from "@pavlus/frontend/plugins";
import {
  FRETS,
  midiAt,
  type Neck,
  neckGrid,
  type Position,
  positionsOf,
} from "../../blocks/guitar-neck/guitar-neck.ts";
import {
  type Accidental,
  className,
  frequency,
  fullName,
  intervalName,
  midiOfKey,
  noteName,
  octaveOf,
  pianoKeys,
  pitchClass,
  type WhiteKey,
} from "../../blocks/piano-keyboard/piano-keyboard.ts";
import view from "./music-training-tool.pavlus";

/** Where the piano starts (C3) and which key `a` plays (C4). */
export const PIANO_FROM = 48;
export const KEY_BASE = 60;

/** The number of questions in a round. */
export const ROUND = 12;

/** Pure: a deterministic pitch class (0-11) for every question of a round. */
export function quizSequence(seed: number, length: number): number[] {
  let x = seed >>> 0 || 1;
  const out: number[] = [];
  for (let i = 0; i < length; i++) {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    let pc = (x >>> 16) % 12;
    // never the same note twice in a row
    if (i > 0 && pc === out[i - 1]) pc = (pc + 1 + ((x >>> 8) % 11)) % 12;
    out.push(pc);
  }
  return out;
}

/** Pure: the pitch class asked in question `index` of the round `seed`. */
export const targetAt = (seed: number, index: number): number =>
  quizSequence(seed, index + 1)[index];

/** Pure: does the pressed note answer the question? */
export const isAnswer = (target: number, midi: number): boolean =>
  pitchClass(midi) === target;

/** Pure: the share of first-try answers, as a whole percent. */
export const accuracyOf = (score: number, asked: number): number =>
  asked === 0 ? 0 : Math.round((score / asked) * 100);

/** The last note played, and on what. */
export interface Played {
  kind: "" | "piano" | "guitar";
  midi: number;
  string: number;
  fret: number;
}

export interface NoteInfo {
  empty: boolean;
  name: string;
  octave: string;
  full: string;
  hz: string;
  midi: string;
  interval: string;
  where: string;
  elsewhere: string;
}

/** Pure: what the note display says about the last note. */
export function describeNote(
  played: Played,
  previous: number,
  accidental: Accidental,
): NoteInfo {
  if (played.kind === "") {
    return {
      empty: true,
      name: "–",
      octave: "",
      full: "",
      hz: "–",
      midi: "–",
      interval: "–",
      where: "Press a key or a fret",
      elsewhere: "",
    };
  }
  const { midi } = played;
  const spots = positionsOf(pitchClass(midi)).length;
  return {
    empty: false,
    name: noteName(midi, accidental),
    octave: String(octaveOf(midi)),
    full: fullName(midi, accidental),
    hz: `${frequency(midi)} Hz`,
    midi: String(midi),
    interval:
      previous < 0 || previous === midi
        ? "–"
        : `${intervalName(previous, midi)} ${midi > previous ? "up" : "down"}`,
    where:
      played.kind === "piano"
        ? "Piano"
        : `Guitar, string ${6 - played.string}, fret ${played.fret}`,
    elsewhere: `${spots} places on the neck`,
  };
}

export interface MusicState {
  tab: "free" | "quiz";
  accidental: Accidental;
  /** Note names on every key and fret. */
  labels: boolean;
  /** The quiz hint: also shows the names. */
  hint: boolean;
  octaves: number;
  played: Played;
  /** The note before the last one (MIDI), for the interval; -1 for none. */
  previous: number;
  seed: number;
  index: number;
  score: number;
  streak: number;
  best: number;
  /** Questions answered at the first try or not (a question counts once). */
  asked: number;
  attempted: boolean;
  status: "" | "correct" | "wrong" | "skipped";
  message: string;
  wrongPiano: number[];
  wrongNeck: Position[];
  /** Mark every place of the asked note (after a skip). */
  reveal: boolean;
  // ---- derived: see `derive` ----
  piano: { whites: WhiteKey[] };
  neck: Neck;
  info: NoteInfo;
  quiz: QuizView;
}

export interface QuizView {
  number: number;
  total: number;
  finished: boolean;
  target: string;
  prompt: string;
  accuracy: number;
  progress: number;
  verdict: string;
  mood: "" | "good" | "bad";
}

/** Pure: everything the template shows, from the state that changes. */
export function derive(
  s: Omit<MusicState, "piano" | "neck" | "info" | "quiz">,
): Pick<MusicState, "piano" | "neck" | "info" | "quiz"> {
  const inQuiz = s.tab === "quiz";
  const labels = s.labels || (inQuiz && s.hint);
  const finished = s.index >= ROUND;
  const target = finished ? -1 : targetAt(s.seed, s.index);
  const marked = inQuiz && s.reveal && target >= 0 ? [target] : [];
  const playedPiano = s.played.kind === "piano" ? [s.played.midi] : [];
  const playedNeck: Position[] =
    s.played.kind === "guitar"
      ? [{ string: s.played.string, fret: s.played.fret }]
      : [];
  const targetName = target < 0 ? "" : className(target, s.accidental);
  const mood =
    s.status === "correct"
      ? "good"
      : s.status === "wrong" || s.status === "skipped"
        ? "bad"
        : "";
  return {
    piano: {
      whites: pianoKeys({
        from: PIANO_FROM,
        octaves: s.octaves,
        accidental: s.accidental,
        labels,
        active: playedPiano,
        marked,
        wrong: s.wrongPiano,
      }),
    },
    neck: neckGrid({
      accidental: s.accidental,
      labels,
      frets: FRETS,
      active: playedNeck,
      marked,
      wrong: s.wrongNeck,
    }),
    info: describeNote(s.played, s.previous, s.accidental),
    quiz: {
      number: Math.min(s.index + 1, ROUND),
      total: ROUND,
      finished,
      target: targetName,
      prompt: finished ? "Round complete" : `Find ${targetName}`,
      accuracy: accuracyOf(s.score, s.asked),
      progress: Math.round((Math.min(s.index, ROUND) / ROUND) * 100),
      verdict: s.message,
      mood,
    },
  };
}

type Core = Omit<MusicState, "piano" | "neck" | "info" | "quiz">;

const core: Core = {
  tab: "free",
  accidental: "sharp",
  labels: false,
  hint: false,
  octaves: 3,
  played: { kind: "", midi: 0, string: 0, fret: 0 },
  previous: -1,
  seed: 2024,
  index: 0,
  score: 0,
  streak: 0,
  best: 0,
  asked: 0,
  attempted: false,
  status: "",
  message: "",
  wrongPiano: [],
  wrongNeck: [],
  reveal: false,
};

export const initial: MusicState = { ...core, ...derive(core) };

const TIMER = "music:next";

export class MusicTrainingTool extends Component<MusicState> {
  view = view;

  "piano.press"(msg: Message, state: MusicState): Effect[] {
    return this._press(state, {
      kind: "piano",
      midi: msg.payload as number,
      string: 0,
      fret: 0,
    });
  }

  "piano.keys"(msg: Message, state: MusicState): Effect[] {
    const midi = midiOfKey(msg.event?.key ?? "", KEY_BASE);
    if (midi === null) return [];
    return this._press(state, { kind: "piano", midi, string: 0, fret: 0 });
  }

  "neck.press"(msg: Message, state: MusicState): Effect[] {
    const [string, fret] = msg.payload as [number, number];
    return this._press(state, {
      kind: "guitar",
      midi: midiAt(string, fret),
      string,
      fret,
    });
  }

  setTab(msg: Message, state: MusicState): Effect[] {
    const tab = msg.payload as MusicState["tab"];
    return this._show(
      state,
      {
        tab,
        status: "",
        message: "",
        wrongPiano: [],
        wrongNeck: [],
        reveal: false,
      },
      [time.cancel(TIMER)],
    );
  }

  setAccidental(msg: Message, state: MusicState): Effect[] {
    return this._show(state, { accidental: msg.payload as Accidental });
  }

  setOctaves(msg: Message, state: MusicState): Effect[] {
    return this._show(state, { octaves: Number(msg.payload) });
  }

  toggleLabels(_msg: Message, state: MusicState): Effect[] {
    return this._show(state, { labels: !state.labels });
  }

  toggleHint(_msg: Message, state: MusicState): Effect[] {
    return this._show(state, { hint: !state.hint });
  }

  /** The timer after a right answer, or the "Next" button. */
  advance(_msg: Message, state: MusicState): Effect[] {
    return this._show(state, this._nextQuestion(state), [time.cancel(TIMER)]);
  }

  skip(_msg: Message, state: MusicState): Effect[] {
    if (state.index >= ROUND) return [];
    if (state.status === "skipped") return this.advance(_msg, state);
    const asked = state.attempted ? state.asked : state.asked + 1;
    const target = className(
      targetAt(state.seed, state.index),
      state.accidental,
    );
    return this._show(state, {
      asked,
      attempted: true,
      streak: 0,
      status: "skipped",
      reveal: true,
      message: `It was ${target}: every ${target} is marked. Press Next.`,
    });
  }

  restart(_msg: Message, state: MusicState): Effect[] {
    return this._show(
      state,
      {
        seed: state.seed + 7,
        index: 0,
        score: 0,
        streak: 0,
        asked: 0,
        attempted: false,
        status: "",
        message: "",
        wrongPiano: [],
        wrongNeck: [],
        reveal: false,
      },
      [time.cancel(TIMER)],
    );
  }

  /** A pending auto-advance must not fire after the page is gone. */
  leave(): Effect[] {
    return [time.cancel(TIMER)];
  }

  _nextQuestion(state: MusicState): Partial<Core> {
    return {
      index: state.index + 1,
      attempted: false,
      status: "",
      message: "",
      wrongPiano: [],
      wrongNeck: [],
      reveal: false,
    };
  }

  _press(state: MusicState, played: Played): Effect[] {
    const patch: Partial<Core> = {
      played,
      previous: state.played.kind === "" ? -1 : state.played.midi,
    };
    const extra: Effect[] = [];
    const asking =
      state.tab === "quiz" && state.index < ROUND && state.status !== "correct";
    if (asking && state.status !== "skipped") {
      const target = targetAt(state.seed, state.index);
      const targetName = className(target, state.accidental);
      if (isAnswer(target, played.midi)) {
        const firstTry = !state.attempted;
        const streak = firstTry ? state.streak + 1 : 0;
        patch.status = "correct";
        patch.attempted = true;
        patch.asked = firstTry ? state.asked + 1 : state.asked;
        patch.score = firstTry ? state.score + 1 : state.score;
        patch.streak = streak;
        patch.best = Math.max(state.best, streak);
        patch.wrongPiano = [];
        patch.wrongNeck = [];
        patch.message = firstTry
          ? `Correct, that is ${targetName}.`
          : `There it is: ${targetName}.`;
        extra.push(time.setTimeout(TIMER, 1100, "advance"));
      } else {
        patch.status = "wrong";
        patch.asked = state.attempted ? state.asked : state.asked + 1;
        patch.attempted = true;
        patch.streak = 0;
        patch.message = `That is ${noteName(played.midi, state.accidental)}, we need ${targetName}. Try again.`;
        if (played.kind === "piano") {
          patch.wrongPiano = [played.midi];
          patch.wrongNeck = [];
        } else {
          patch.wrongNeck = [{ string: played.string, fret: played.fret }];
          patch.wrongPiano = [];
        }
      }
    } else if (state.tab === "quiz") {
      patch.wrongPiano = [];
      patch.wrongNeck = [];
    }
    return this._show(state, patch, extra);
  }

  /** Apply a patch to the changing state, then recompute what is derived. */
  _show(
    state: MusicState,
    patch: Partial<Core>,
    more: Effect[] = [],
  ): Effect[] {
    const { piano, neck, info, quiz, ...rest } = state;
    void piano;
    void neck;
    void info;
    void quiz;
    const next: Core = { ...rest, ...patch };
    const derived = derive(next);
    return [
      ...(Object.keys(patch) as (keyof Core)[]).map((k) =>
        store.set(k, patch[k]),
      ),
      store.set("piano", derived.piano),
      store.set("neck", derived.neck),
      store.set("info", derived.info),
      store.set("quiz", derived.quiz),
      ...more,
    ];
  }
}

export const page = new MusicTrainingTool();
