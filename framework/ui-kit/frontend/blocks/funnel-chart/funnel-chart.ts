import { Component } from "@pavlus/frontend";
import { type FunnelView, funnel } from "./funnel.ts";
import view from "./funnel-chart.pavlus";

export interface FunnelState {
  hiring: FunnelView;
  signup: FunnelView;
}

export const initial: FunnelState = {
  hiring: funnel([
    { id: "applied", label: "Applied", count: 148 },
    { id: "screen", label: "Screening", count: 72 },
    { id: "interview", label: "Interview", count: 31 },
    { id: "offer", label: "Offer", count: 9 },
    { id: "hired", label: "Hired", count: 7 },
  ]),
  signup: funnel([
    { id: "visit", label: "Visits", count: 5200 },
    { id: "trial", label: "Trials", count: 940 },
    { id: "paid", label: "Paying", count: 188 },
  ]),
};

/** Only data: the page has no messages of its own. */
export class FunnelPage extends Component<FunnelState> {
  view = view;
}

export const page = new FunnelPage();
