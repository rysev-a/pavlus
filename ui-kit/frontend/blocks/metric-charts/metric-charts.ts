import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import { storeEffector as store } from "@service-laboratory/pavlus/plugins";
import { type Chart, RANGES, type RangeId, chartsFor } from "./metrics.ts";
import view from "./metric-charts.pavlus";

export interface MetricChartsState {
  range: RangeId;
  ranges: { id: RangeId; label: string }[];
  charts: Chart[];
  offline: Chart[];
}

export const initial: MetricChartsState = {
  range: "1h",
  ranges: RANGES.map(({ id, label }) => ({ id, label })),
  charts: chartsFor("web-frontend-01", "1h", true),
  offline: chartsFor("build-runner", "1h", false),
};

export class MetricChartsPage extends Component<MetricChartsState> {
  view = view;

  _pick(range: RangeId): Effect[] {
    return [
      store.set("range", range),
      store.set("charts", chartsFor("web-frontend-01", range, true)),
      store.set("offline", chartsFor("build-runner", range, false)),
    ];
  }

  "charts.pick"(msg: Message): Effect[] {
    return this._pick(msg.payload as RangeId);
  }

  "off.pick"(msg: Message): Effect[] {
    return this._pick(msg.payload as RangeId);
  }
}

export const page = new MetricChartsPage();
