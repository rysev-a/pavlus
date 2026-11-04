// STUB of the "blog" module: replace it (keep the exported names: `BlogState`, `blogModule`).
import type { Module } from "../../core.ts";

export interface BlogState {
  title: string;
}

export const blogModule: Module<BlogState> = {
  key: "blog",
  screens: ["blog"],
  initial: () => ({ title: "Posts" }),
  derive: (state) => state.blog,
  handlers: {},
};
