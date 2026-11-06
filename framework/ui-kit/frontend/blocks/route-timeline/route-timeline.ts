import { Component } from "@pavlus/frontend";
import { type Stop, type StopView, stopViews } from "./route.ts";
import view from "./route-timeline.pavlus";

const stop = (
  id: string,
  place: string,
  kind: Stop["kind"],
  planned: string,
  actual: string,
  note = "",
): Stop => ({ id, place, kind, planned, actual, note });

const SEA: Stop[] = [
  stop(
    "a",
    "Shanghai warehouse",
    "origin",
    "2026-11-02",
    "2026-11-02",
    "Loaded 14 pallets.",
  ),
  stop("b", "Port of Shanghai", "port", "2026-11-03", "2026-11-03"),
  stop(
    "c",
    "Port of Singapore",
    "port",
    "2026-11-09",
    "2026-11-11",
    "Berth was full, waited two days.",
  ),
  stop("d", "Port of Hamburg", "port", "2026-11-26", ""),
  stop("e", "Customs, Hamburg", "customs", "2026-11-27", ""),
  stop("f", "Berlin depot", "destination", "2026-11-29", ""),
];

const TRUCK: Stop[] = [
  stop("a", "Gdansk depot", "origin", "2026-10-29", "2026-10-29"),
  stop("b", "Szczecin hub", "hub", "2026-10-30", "2026-10-30"),
  stop(
    "c",
    "Oslo terminal",
    "destination",
    "2026-11-01",
    "2026-11-01",
    "Signed by T. Berg.",
  ),
];

export interface RouteDemoState {
  stops: StopView[];
  doneStops: StopView[];
}

export const initial: RouteDemoState = {
  stops: stopViews(SEA, 2, false),
  doneStops: stopViews(TRUCK, 2, true),
};

/** Only data: the page has no messages of its own. */
export class RoutePage extends Component<RouteDemoState> {
  view = view;
}

export const page = new RoutePage();
