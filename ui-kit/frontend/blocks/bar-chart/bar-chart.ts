import { Component } from "@service-laboratory/pavlus";
import { loadTone } from "../admin-shell/shell.ts";
import { type BarInput, type Column, columns } from "./chart.ts";
import view from "./bar-chart.pavlus";

export interface BarChartState {
  sales: Column[];
  load: Column[];
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SALES = [320, 410, 380, 520, 610, 780, 540];
const LOAD = [34, 52, 71, 88, 93, 64, 41];

const asInput = (values: number[], tone: boolean): BarInput[] =>
  values.map((value, i) => ({
    id: DAYS[i],
    label: DAYS[i],
    value,
    show: tone,
    tone: tone ? loadTone(value) : "default",
  }));

export const initial: BarChartState = {
  sales: columns(asInput(SALES, false)),
  load: columns(asInput(LOAD, true), 100, "%"),
};

/** Only data: the page has no messages of its own. */
export class BarChartPage extends Component<BarChartState> {
  view = view;
}

export const page = new BarChartPage();
