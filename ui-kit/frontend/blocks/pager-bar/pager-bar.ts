import { Component } from "@service-laboratory/pavlus";
import view from "./pager-bar.pavlus";

export const initial = {
  pager: {
    page: 2,
    pages: 5,
    total: 47,
    label: "47 posts",
    hasPrev: true,
    hasNext: true,
    prevLabel: "Newer",
    nextLabel: "Older",
  },
};

export class PagerBarPage extends Component<typeof initial> {
  view = view;
}
export const page = new PagerBarPage();
