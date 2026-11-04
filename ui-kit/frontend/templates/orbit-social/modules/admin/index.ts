// STUB of the "admin" module: replace it (keep the exported names: `AdminState`, `adminModule`).
import type { Module } from "../../core.ts";

export interface AdminState {
  title: string;
}

export const adminModule: Module<AdminState> = {
  key: "admin",
  screens: ["admin"],
  initial: () => ({ title: "Admin" }),
  derive: (state) => state.admin,
  handlers: {},
};
