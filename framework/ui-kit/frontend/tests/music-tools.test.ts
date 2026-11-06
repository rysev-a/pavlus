import { expect, test } from "vitest";
import {
  dotsAt,
  midiAt,
  neckGrid,
  noteAt,
  positionsOf,
  STANDARD_TUNING,
} from "../blocks/guitar-neck/guitar-neck.ts";
import {
  className,
  frequency,
  fullName,
  intervalName,
  isBlack,
  midiOf,
  midiOfKey,
  noteName,
  octaveOf,
  pianoKeys,
  pitchClass,
  semitones,
  transpose,
} from "../blocks/piano-keyboard/piano-keyboard.ts";
import {
  accuracyOf,
  describeNote,
  derive,
  isAnswer,
  quizSequence,
  ROUND,
  targetAt,
} from "../templates/music-training-tool/music-training-tool.ts";

test("note names, octaves and MIDI numbers", () => {
  expect(pitchClass(60)).toBe(0);
  expect(pitchClass(-1)).toBe(11);
  expect(octaveOf(60)).toBe(4);
  expect(octaveOf(21)).toBe(0);
  expect(noteName(61, "sharp")).toBe("C♯");
  expect(noteName(61, "flat")).toBe("D♭");
  expect(fullName(69, "sharp")).toBe("A4");
  expect(className(10, "flat")).toBe("B♭");
  expect(isBlack(61)).toBe(true);
  expect(isBlack(62)).toBe(false);
});

test("parsing a note name gives its MIDI number", () => {
  expect(midiOf("C4")).toBe(60);
  expect(midiOf("A4")).toBe(69);
  expect(midiOf("C#4")).toBe(61);
  expect(midiOf("Db4")).toBe(61);
  expect(midiOf("A♭2")).toBe(44);
  expect(midiOf("E", 2)).toBe(40);
  expect(midiOf("H4")).toBeNull();
});

test("semitone math, intervals and frequencies", () => {
  expect(transpose(60, 7)).toBe(67);
  expect(semitones(60, 64)).toBe(4);
  expect(semitones(64, 60)).toBe(-4);
  expect(intervalName(60, 67)).toBe("perfect 5th");
  expect(intervalName(67, 60)).toBe("perfect 5th");
  expect(intervalName(60, 72)).toBe("octave");
  expect(intervalName(60, 84)).toBe("2 octaves + unison");
  expect(frequency(69)).toBe(440);
  expect(frequency(57)).toBe(220);
  expect(frequency(60)).toBe(261.63);
});

test("the computer keyboard plays the piano", () => {
  expect(midiOfKey("a", 60)).toBe(60);
  expect(midiOfKey("w", 60)).toBe(61);
  expect(midiOfKey("J", 60)).toBe(71);
  expect(midiOfKey("z", 60)).toBeNull();
  expect(midiOfKey("Enter", 60)).toBeNull();
});

test("a piano has white keys with their black keys on top", () => {
  const keys = pianoKeys({
    from: 48,
    octaves: 2,
    accidental: "sharp",
    labels: false,
    active: [49],
    marked: [4],
  });
  // 2 octaves of 7 white keys, and the closing C
  expect(keys).toHaveLength(15);
  expect(keys[0].name).toBe("C3");
  expect(keys[0].black?.name).toBe("C♯3");
  expect(keys[0].black?.state).toBe("active");
  expect(keys[0].black?.label).toBe("C♯");
  // no black key between E and F, or after the last C
  expect(keys[2].name).toBe("E3");
  expect(keys[2].black).toBeNull();
  expect(keys[2].state).toBe("marked");
  expect(keys[14].black).toBeNull();
  // labels are empty while off, except lit keys
  expect(keys[1].label).toBe("");
  const labelled = pianoKeys({
    from: 48,
    octaves: 1,
    accidental: "flat",
    labels: true,
  });
  expect(labelled[0].black?.label).toBe("D♭");
  expect(labelled.map((k) => k.label).join("")).toBe("CDEFGABC");
});

test("the note at a string and fret", () => {
  expect(midiAt(0, 0)).toBe(40);
  expect(midiAt(5, 0)).toBe(64);
  expect(midiAt(1, 5)).toBe(50);
  expect(noteAt(0, 0, "sharp")).toBe("E");
  expect(noteAt(1, 2, "sharp")).toBe("B");
  expect(noteAt(2, 1, "sharp")).toBe("D♯");
  expect(noteAt(2, 1, "flat")).toBe("E♭");
  expect(noteAt(3, 4, "sharp")).toBe("B");
  expect(STANDARD_TUNING.map((m) => noteName(m, "sharp"))).toEqual([
    "E",
    "A",
    "D",
    "G",
    "B",
    "E",
  ]);
  expect(dotsAt(5)).toBe(1);
  expect(dotsAt(12)).toBe(2);
  expect(dotsAt(4)).toBe(0);
});

test("every place of a note on the neck", () => {
  // E (pitch class 4): open E strings, the 5th fret of B...
  const spots = positionsOf(4);
  expect(spots).toContainEqual({ string: 0, fret: 0 });
  expect(spots).toContainEqual({ string: 0, fret: 12 });
  expect(spots).toContainEqual({ string: 4, fret: 5 });
  expect(spots.every((p) => pitchClass(midiAt(p.string, p.fret)) === 4)).toBe(
    true,
  );
});

test("the neck grid: 6 strings by 13 cells, thinnest on top", () => {
  const neck = neckGrid({
    accidental: "sharp",
    labels: false,
    active: [{ string: 1, fret: 3 }],
    marked: [0],
  });
  expect(neck.rows).toHaveLength(6);
  expect(neck.rows.map((r) => r.tuning)).toEqual([
    "e",
    "B",
    "G",
    "D",
    "A",
    "E",
  ]);
  expect(neck.rows[0].cells).toHaveLength(13);
  const a3 = neck.rows[4].cells[3];
  expect(a3.midi).toBe(48);
  expect(a3.state).toBe("active");
  expect(a3.label).toBe("C");
  // C elsewhere is marked but unlabelled
  expect(neck.rows[1].cells[1].state).toBe("marked");
  expect(neck.frets).toHaveLength(12);
  expect(neck.frets[11].dots).toHaveLength(2);
});

test("the quiz sequence is deterministic, in range and never repeats at once", () => {
  const a = quizSequence(2024, ROUND);
  expect(a).toEqual(quizSequence(2024, ROUND));
  expect(a).toHaveLength(ROUND);
  expect(a.every((n) => n >= 0 && n < 12)).toBe(true);
  for (let i = 1; i < a.length; i++) expect(a[i]).not.toBe(a[i - 1]);
  expect(quizSequence(2031, ROUND)).not.toEqual(a);
  expect(targetAt(2024, 3)).toBe(a[3]);
  expect(isAnswer(a[0], a[0] + 24)).toBe(true);
  expect(isAnswer(a[0], a[0] + 1)).toBe(false);
});

test("accuracy and the note display", () => {
  expect(accuracyOf(0, 0)).toBe(0);
  expect(accuracyOf(3, 4)).toBe(75);
  const empty = describeNote(
    { kind: "", midi: 0, string: 0, fret: 0 },
    -1,
    "sharp",
  );
  expect(empty.empty).toBe(true);
  const info = describeNote(
    { kind: "guitar", midi: 66, string: 2, fret: 11 },
    60,
    "flat",
  );
  expect(info.full).toBe("G♭4");
  expect(info.interval).toBe("tritone up");
  expect(info.where).toBe("Guitar, string 4, fret 11");
});

test("the derived view of a quiz round follows the state", () => {
  const base = {
    tab: "quiz" as const,
    accidental: "sharp" as const,
    labels: false,
    hint: true,
    octaves: 2,
    played: { kind: "" as const, midi: 0, string: 0, fret: 0 },
    previous: -1,
    seed: 2024,
    index: 0,
    score: 0,
    streak: 0,
    best: 0,
    asked: 0,
    attempted: false,
    status: "" as const,
    message: "",
    wrongPiano: [],
    wrongNeck: [],
    reveal: false,
  };
  const d = derive(base);
  expect(d.piano.whites).toHaveLength(15);
  // the hint shows the names
  expect(d.piano.whites[0].label).toBe("C");
  expect(d.quiz.prompt).toBe(`Find ${d.quiz.target}`);
  expect(derive({ ...base, hint: false }).piano.whites[0].label).toBe("");
  expect(derive({ ...base, index: ROUND }).quiz.finished).toBe(true);
});
