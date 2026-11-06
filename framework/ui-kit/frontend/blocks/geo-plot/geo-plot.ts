import { Component, type Effect, type Message } from "@pavlus/frontend";
import { patch, type Tone } from "../admin-shell/shell.ts";
import { type GeoInput, type GeoPlot, geoPlot } from "./geo.ts";
import view from "./geo-plot.pavlus";

export interface GeoPlotState {
  worldPlaces: GeoInput[];
  worldPicked: string;
  world: Omit<GeoPlot, "box">;
  worldName: string;
  region: Omit<GeoPlot, "box">;
}

const TONES: Tone[] = ["default", "success", "warning", "destructive", "info"];
const NAMES = [
  { tone: TONES[0], label: "Flagship" },
  { tone: TONES[1], label: "Mall kiosk" },
  { tone: TONES[2], label: "Outlet" },
  { tone: TONES[3], label: "Airport" },
  { tone: TONES[4], label: "Partner store" },
];

/** A fixed pseudo-random sequence, so the demo is the same on every visit. */
function sequence(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

function places(
  n: number,
  seed: number,
  lat: [number, number],
  lng: [number, number],
  prefix: string,
): GeoInput[] {
  const rnd = sequence(seed);
  return Array.from({ length: n }, (_, i) => ({
    id: `${prefix}${i + 1}`,
    label: `${prefix === "w" ? "Shop" : "Branch"} ${i + 1}`,
    sub: `${NAMES[i % 5].label}, ${i + 1} Main Street`,
    lat: Math.round((lat[0] + rnd() * (lat[1] - lat[0])) * 100) / 100,
    lng: Math.round((lng[0] + rnd() * (lng[1] - lng[0])) * 100) / 100,
    tone: TONES[i % 5],
  }));
}

const WORLD = places(50, 7, [-38, 60], [-120, 150], "w");
const REGION = places(14, 21, [47.2, 48.9], [6.9, 11.6], "r");

const draw = (picked: string): Omit<GeoPlot, "box"> => {
  const { box: _box, ...plot } = geoPlot(WORLD, picked || null, NAMES);
  return plot;
};

export const initial: GeoPlotState = {
  worldPlaces: WORLD,
  worldPicked: "",
  world: draw(""),
  worldName: "nothing yet",
  region: (({ box: _box, ...plot }) => plot)(geoPlot(REGION, "r3", NAMES)),
};

export class GeoPlotPage extends Component<GeoPlotState> {
  view = view;

  "world.pick"(msg: Message, state: GeoPlotState): Effect[] {
    const id = msg.payload as string;
    const found = state.worldPlaces.find((p) => p.id === id);
    return patch({
      worldPicked: id,
      world: draw(id),
      worldName: found
        ? `${found.label} (${found.lat}, ${found.lng})`
        : "nothing yet",
    });
  }
}

export const page = new GeoPlotPage();
