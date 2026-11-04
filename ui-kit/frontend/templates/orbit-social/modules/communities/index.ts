// STUB of the "communities" module: replace it (keep the exported names: `CommunitiesState`, `communitiesModule`).
import type { Module } from "../../core.ts";

export interface CommunitiesState {
  title: string;
}

export const communitiesModule: Module<CommunitiesState> = {
  key: "communities",
  screens: ["communities"],
  initial: () => ({ title: "Communities" }),
  derive: (state) => state.communities,
  handlers: {},
};
