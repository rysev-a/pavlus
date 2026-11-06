import { Component } from "@pavlus/frontend";
import { bmi, flagged, readings, type Vital } from "./vitals.ts";
import view from "./vitals-card.pavlus";

export interface VitalsPageState {
  healthy: Vital[];
  unwell: Vital[];
  bmiText: string;
  flagCount: number;
}

const unwell = readings({
  sys: 158,
  dia: 96,
  hr: 112,
  temp: 38.4,
  spo2: 93,
  rr: 22,
});

/** Only data: the page has no messages of its own. */
export const initial: VitalsPageState = {
  healthy: readings({
    sys: 118,
    dia: 76,
    hr: 68,
    temp: 36.6,
    spo2: 98,
    rr: 15,
  }),
  unwell,
  bmiText: String(bmi(82, 178)),
  flagCount: flagged(unwell),
};

export class VitalsCardPage extends Component<VitalsPageState> {
  view = view;
}

export const page = new VitalsCardPage();
