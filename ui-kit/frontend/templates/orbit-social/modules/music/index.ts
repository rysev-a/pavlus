// STUB of the "music" module: replace it (keep the exported names: `MusicState`, `musicModule`).
import type { Module } from "../../core.ts";

export interface MusicState {
  title: string;
}

export const musicModule: Module<MusicState> = {
  key: "music",
  screens: ["music"],
  initial: () => ({ title: "Music" }),
  derive: (state) => state.music,
  handlers: {},
};
