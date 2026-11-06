import { Component, type Effect, type Message } from "@pavlus/frontend";
import { storeEffector as store } from "@pavlus/frontend/plugins";
import {
  columnAverages,
  columnsFrom,
  type HeatColumn,
  type HeatRow,
  heatRow,
  heatSteps,
  retention,
} from "./heat.ts";
import view from "./heat-table.pavlus";

export interface HeatTableState {
  cohortCols: HeatColumn[];
  cohortRows: HeatRow[];
  hourCols: HeatColumn[];
  visitRows: HeatRow[];
  steps: number[];
  message: string;
}

const COHORTS: [string, number, number[]][] = [
  ["May", 120, [120, 92, 80, 72, 66, 62]],
  ["Jun", 134, [134, 105, 91, 83, 77]],
  ["Jul", 151, [151, 120, 104, 96]],
  ["Aug", 148, [148, 121, 108]],
  ["Sep", 166, [166, 139]],
  ["Oct", 172, [172]],
];
const MONTHS = ["M0", "M1", "M2", "M3", "M4", "M5"];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOURS = ["8", "10", "12", "14", "16", "18", "20"];
const VISITS = [
  [12, 41, 58, 49, 52, 30, 14],
  [15, 44, 61, 55, 50, 28, 12],
  [14, 47, 66, 58, 54, 33, 16],
  [13, 43, 60, 52, 49, 35, 18],
  [11, 38, 52, 44, 41, 29, 22],
  [4, 9, 18, 24, 26, 31, 27],
  [3, 6, 11, 16, 19, 24, 21],
];

const cohortCols = columnsFrom(MONTHS);
const hourCols = columnsFrom(HOURS);
const pct = (v: number) => `${v}%`;
const retained = COHORTS.map(([, size, active]) => retention(size, active));

export const initial: HeatTableState = {
  cohortCols,
  cohortRows: COHORTS.map(([name, size], i) =>
    heatRow(name, name, `${size} customers`, retained[i], cohortCols, {
      min: 40,
      max: 100,
      format: pct,
    }),
  ),
  hourCols,
  visitRows: DAYS.map((day, i) =>
    heatRow(day, day, "", VISITS[i], hourCols, { min: 0, max: 66 }),
  ),
  steps: heatSteps(),
  message: `Average month-1 retention: ${columnAverages(retained)[1]}%. Click a cell.`,
};

export class HeatTablePage extends Component<HeatTableState> {
  view = view;

  "cohort.pick"(msg: Message): Effect[] {
    const [row, cell] = msg.payload as [string, string];
    return [store.set("message", `Cohort ${row}, cell ${cell}`)];
  }
}

export const page = new HeatTablePage();
