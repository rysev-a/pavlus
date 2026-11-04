import { Component } from "@service-laboratory/pavlus";
import { type Area, areaChart, lastChange, short } from "./area.ts";
import view from "./area-chart.pavlus";

export interface AreaPageState {
  mrr: Area;
  signups: Area;
  change: number;
}

const MONTHS = [
  "Dec",
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
];
const MRR = [
  61200, 63800, 66100, 70400, 73900, 78200, 83500, 88100, 92600, 99800, 106400,
  112900,
];
const WEEKS = [38, 44, 41, 52, 49, 61, 58, 66];

const mrr = MONTHS.map((label, i) => ({ id: label, label, value: MRR[i] }));

/** Only data: the page has no messages of its own. */
export const initial: AreaPageState = {
  mrr: areaChart(mrr, { format: (v) => short(v, "$") }),
  signups: areaChart(
    WEEKS.map((value, i) => ({ id: `w${i}`, label: `W${i + 1}`, value })),
  ),
  change: lastChange(mrr),
};

export class AreaChartPage extends Component<AreaPageState> {
  view = view;
}

export const page = new AreaChartPage();
