// STUB of the "photos" module: replace it (keep the exported names: `PhotosState`, `photosModule`).
import type { Module } from "../../core.ts";

export interface PhotosState {
  title: string;
}

export const photosModule: Module<PhotosState> = {
  key: "photos",
  screens: ["photos"],
  initial: () => ({ title: "Photos" }),
  derive: (state) => state.photos,
  handlers: {},
};
