import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import { storeEffector as store } from "@service-laboratory/pavlus/plugins";
import view from "./chart.pavlus";

type Metric = "revenue" | "visitors";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
const DATA: Record<Metric, number[]> = {
  revenue: [186, 305, 237, 73, 209, 214],
  visitors: [1200, 980, 1430, 1710, 1560, 1980],
};

export interface Bar {
  label: string;
  value: number;
  /** Percent of the tallest bar. */
  height: number;
}

export interface ChartState {
  metric: Metric;
  /** Derived from `metric`. */
  bars: Bar[];
  area: string;
  grouped: { label: string; a: number; b: number }[];
}

/** Pure: the bars of one data set, scaled to the tallest. */
export function barsOf(metric: Metric): Bar[] {
  const values = DATA[metric];
  const top = Math.max(...values);
  return values.map((value, i) => ({
    label: MONTHS[i],
    value,
    height: Math.round((value / top) * 100),
  }));
}

/** A CSS polygon that fills the plot under the line through the bars' tops. */
export function areaOf(bars: Bar[]): string {
  const step = 100 / (bars.length - 1);
  const points = bars.map(
    (b, i) => `${+(i * step).toFixed(1)}% ${100 - b.height}%`,
  );
  return `polygon(0% 100%, ${points.join(", ")}, 100% 100%)`;
}

const initialBars = barsOf("revenue");

export const initial: ChartState = {
  metric: "revenue",
  bars: initialBars,
  area: areaOf(initialBars),
  grouped: [
    { label: "Mon", a: 80, b: 45 },
    { label: "Tue", a: 55, b: 70 },
    { label: "Wed", a: 90, b: 60 },
    { label: "Thu", a: 40, b: 85 },
    { label: "Fri", a: 70, b: 50 },
  ],
};

export class Chart extends Component<ChartState> {
  view = view;

  show(msg: Message): Effect[] {
    const metric = msg.payload as Metric;
    const bars = barsOf(metric);
    return [
      store.set("metric", metric),
      store.set("bars", bars),
      store.set("area", areaOf(bars)),
    ];
  }
}

export const page = new Chart();
