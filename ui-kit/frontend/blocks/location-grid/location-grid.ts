import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import { patch } from "../admin-shell/shell.ts";
import {
  codeOf,
  type Location,
  type ZoneDef,
  type ZoneView,
  zonesOf,
} from "./locations.ts";
import view from "./location-grid.pavlus";

export interface LocationGridState {
  locations: Location[];
  selected: string;
  query: string;
  zones: ZoneView[];
  message: string;
}

const DEFS: ZoneDef[] = [
  { id: "A", name: "Zone A", sub: "Ambient shelving" },
  { id: "B", name: "Zone B", sub: "Chilled" },
];
const NAMES: Record<string, string> = {
  rice: "Basmati rice",
  oil: "Olive oil",
  milk: "Oat milk",
  eggs: "Free-range eggs",
};
const SKUS = ["rice", "oil", "", "milk", "eggs", "rice", "", "oil"];

const LOCATIONS: Location[] = ["A", "B"].flatMap((zone, z) =>
  [1, 2, 3].flatMap((aisle) =>
    Array.from({ length: 8 }, (_, i) => {
      const sku = SKUS[(i + aisle + z * 3) % SKUS.length];
      return {
        code: codeOf(zone, aisle, i + 1),
        zone,
        aisle,
        bay: i + 1,
        sku,
        qty: sku ? 12 + ((i * 7 + aisle * 5 + z * 3) % 49) : 0,
        cap: 60,
      };
    }),
  ),
);

const draw = (selected: string, query: string, locations: Location[]) => ({
  selected,
  query,
  zones: zonesOf(DEFS, locations, {
    selected,
    query,
    names: NAMES,
    alerts: ["eggs"],
    only: "all",
  }),
});

export const initial: LocationGridState = {
  locations: LOCATIONS,
  ...draw("", "", LOCATIONS),
  message: "Click a bay to see what is in it.",
};

export class LocationGridPage extends Component<LocationGridState> {
  view = view;

  "grid.pick"(msg: Message, state: LocationGridState): Effect[] {
    const code = msg.payload as string;
    const found = state.locations.find((l) => l.code === code);
    return patch({
      ...draw(code, state.query, state.locations),
      message: found?.sku
        ? `${code}: ${found.qty} of ${found.cap} ${NAMES[found.sku]}.`
        : `${code} is empty.`,
    });
  }

  search(msg: Message, state: LocationGridState): Effect[] {
    return patch(draw(state.selected, msg.event?.value ?? "", state.locations));
  }
}

export const page = new LocationGridPage();
