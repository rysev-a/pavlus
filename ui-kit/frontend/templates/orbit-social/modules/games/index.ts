// STUB of the "games" module: replace it (keep the exported names: `GamesState`, `gamesModule`).
import type { Module } from "../../core.ts";

export interface GamesState {
  title: string;
}

export const gamesModule: Module<GamesState> = {
  key: "games",
  screens: ["games"],
  initial: () => ({ title: "Games" }),
  derive: (state) => state.games,
  handlers: {},
};
