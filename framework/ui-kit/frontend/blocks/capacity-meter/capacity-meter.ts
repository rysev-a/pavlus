import { Component, type Effect, type Message } from "@pavlus/frontend";
import { patch } from "../admin-shell/shell.ts";
import view from "./capacity-meter.pavlus";
import { adjust, hasRoom, type Meter, meterOf } from "./meter.ts";

export interface CapacityMeterState {
  count: number;
  gym: Meter;
  room: Meter;
  dock: Meter;
  full: Meter;
}

const MAX = 40;

export const initial: CapacityMeterState = {
  count: 27,
  gym: meterOf("Floor now", 27, MAX),
  room: meterOf("Dining room", 31, 48, "seats"),
  dock: meterOf("Loading docks", 5, 6, "docks"),
  full: meterOf("Studio 2", 12, 12, "spots"),
};

export class CapacityMeterPage extends Component<CapacityMeterState> {
  view = view;

  enterOne(_msg: Message, state: CapacityMeterState): Effect[] {
    if (!hasRoom(state.count, MAX)) return [];
    const count = adjust(state.count, 1, MAX);
    return patch({ count, gym: meterOf("Floor now", count, MAX) });
  }

  leaveOne(_msg: Message, state: CapacityMeterState): Effect[] {
    const count = adjust(state.count, -1, MAX);
    return patch({ count, gym: meterOf("Floor now", count, MAX) });
  }
}

export const page = new CapacityMeterPage();
