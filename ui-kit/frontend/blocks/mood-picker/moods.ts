export interface Mood {
  id: string;
  emoji: string;
  label: string;
}

export interface PickerMood extends Mood {
  active: boolean;
}

export const MOODS: Mood[] = [
  { id: "happy", emoji: "😊", label: "Happy" },
  { id: "calm", emoji: "😌", label: "Calm" },
  { id: "inspired", emoji: "✨", label: "Inspired" },
  { id: "energetic", emoji: "⚡", label: "Energetic" },
  { id: "nostalgic", emoji: "🌙", label: "Nostalgic" },
  { id: "tired", emoji: "😴", label: "Tired" },
  { id: "anxious", emoji: "😟", label: "Anxious" },
  { id: "sad", emoji: "😢", label: "Sad" },
];

/** Pure: a mood by id (an unknown id gives an empty mood). */
export function moodOf(id: string): Mood {
  return MOODS.find((m) => m.id === id) ?? { id: "", emoji: "", label: "" };
}

/** Pure: the moods with the chosen one marked (`""` marks none). */
export function pickerMoods(active: string): PickerMood[] {
  return MOODS.map((m) => ({ ...m, active: m.id === active }));
}
