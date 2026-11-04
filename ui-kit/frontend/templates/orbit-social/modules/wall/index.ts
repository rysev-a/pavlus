// STUB of the "wall" module: replace it (keep the exported names: `WallState`, `wallModule`).
import type { Module } from "../../core.ts";

export interface WallState {
  title: string;
}

export const wallModule: Module<WallState> = {
  key: "wall",
  screens: ["wall"],
  initial: () => ({ title: "Wall" }),
  derive: (state) => state.wall,
  handlers: {},
};
