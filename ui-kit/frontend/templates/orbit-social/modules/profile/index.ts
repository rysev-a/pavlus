// STUB of the "profile" module: replace it (keep the exported names: `ProfileState`, `profileModule`).
import type { Module } from "../../core.ts";

export interface ProfileState {
  title: string;
}

export const profileModule: Module<ProfileState> = {
  key: "profile",
  screens: ["profile"],
  initial: () => ({ title: "Profile" }),
  derive: (state) => state.profile,
  handlers: {},
};
