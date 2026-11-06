import { Component } from "@pavlus/frontend";
import view from "./music-pager.pavlus";

export interface MusicPagerState {
  pager: {
    label: string;
    page: number;
    pages: number;
    jumps: { n: number; active: boolean }[];
  };
}

export const initial: MusicPagerState = {
  pager: {
    label: "26-50 of 2,413",
    page: 2,
    pages: 97,
    jumps: [1, 2, 3, 4, 5].map((n) => ({ n, active: n === 2 })),
  },
};

export class MusicPagerPage extends Component<MusicPagerState> {
  view = view;
}

export const page = new MusicPagerPage();
