import { Component, type Effect, type Message } from "@pavlus/frontend";
import { patch } from "../admin-shell/shell.ts";
import view from "./shipment-tracker.pavlus";
import { type Lane, lanesOf, type TrackItem } from "./tracker.ts";

const ITEMS: TrackItem[] = [
  {
    id: "s1",
    ref: "FRT-20418",
    status: "booked",
    origin: "Rotterdam",
    destination: "Warsaw",
    carrier: "Nordline",
    mode: "road",
    pct: 0,
    eta: "Nov 8",
  },
  {
    id: "s2",
    ref: "FRT-20411",
    status: "transit",
    origin: "Shanghai",
    destination: "Hamburg",
    carrier: "BlueWave",
    mode: "sea",
    pct: 62,
    eta: "Nov 21",
  },
  {
    id: "s3",
    ref: "FRT-20405",
    status: "transit",
    origin: "Milan",
    destination: "Vienna",
    carrier: "AlpRail",
    mode: "rail",
    pct: 35,
    eta: "Nov 5",
  },
  {
    id: "s4",
    ref: "FRT-20397",
    status: "customs",
    origin: "Istanbul",
    destination: "Lyon",
    carrier: "TransAnatolia",
    mode: "road",
    pct: 88,
    eta: "Nov 6",
  },
  {
    id: "s5",
    ref: "FRT-20390",
    status: "delayed",
    origin: "Dubai",
    destination: "Frankfurt",
    carrier: "SkyBridge",
    mode: "air",
    pct: 74,
    eta: "Nov 7",
  },
  {
    id: "s6",
    ref: "FRT-20372",
    status: "delivered",
    origin: "Gdansk",
    destination: "Oslo",
    carrier: "Nordline",
    mode: "road",
    pct: 100,
    eta: "Nov 1",
  },
];

export interface TrackerDemoState {
  lanes: Lane[];
  said: string;
}

export const initial: TrackerDemoState = {
  lanes: lanesOf(ITEMS),
  said: "No shipment selected.",
};

export class TrackerPage extends Component<TrackerDemoState> {
  view = view;

  "board.pick"(msg: Message): Effect[] {
    const item = ITEMS.find((x) => x.id === msg.payload);
    return patch({
      said: item
        ? `${item.ref}: ${item.origin} to ${item.destination}, ${item.pct}% of the way.`
        : "No shipment selected.",
    });
  }
}

export const page = new TrackerPage();
