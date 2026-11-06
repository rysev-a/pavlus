import { Component, type Effect, type Message } from "@pavlus/frontend";
import { storeEffector as store } from "@pavlus/frontend/plugins";
import { durationLabel } from "../time-slots/time-slots.ts";
import view from "./service-list.pavlus";

export interface Service {
  id: string;
  name: string;
  note: string;
  emoji: string;
  /** Whole currency units. */
  price: number;
  /** Minutes. */
  duration: number;
}

export interface ServiceRow extends Service {
  priceLabel: string;
  durationLabel: string;
  selected: boolean;
}

/** Pure: `35` → `$35`. */
export const money = (amount: number): string =>
  `$${Number.isInteger(amount) ? amount : amount.toFixed(2)}`;

/** Pure: the rows of the list with their labels and the chosen one marked. */
export function serviceRows(list: Service[], selected: string): ServiceRow[] {
  return list.map((s) => ({
    ...s,
    priceLabel: money(s.price),
    durationLabel: durationLabel(s.duration),
    selected: s.id === selected,
  }));
}

export const SERVICES: Service[] = [
  {
    id: "haircut",
    name: "Classic haircut",
    note: "Consultation, wash, cut and style",
    emoji: "✂️",
    price: 35,
    duration: 45,
  },
  {
    id: "fade",
    name: "Skin fade",
    note: "A clean taper, blended by hand",
    emoji: "💈",
    price: 40,
    duration: 45,
  },
  {
    id: "beard",
    name: "Beard trim",
    note: "Shape, line-up and a warm oil finish",
    emoji: "🧔",
    price: 20,
    duration: 30,
  },
  {
    id: "shave",
    name: "Hot towel shave",
    note: "Straight razor, hot towels, aftershave",
    emoji: "🪒",
    price: 38,
    duration: 45,
  },
  {
    id: "combo",
    name: "Haircut and beard",
    note: "The full treatment, one chair",
    emoji: "⭐",
    price: 52,
    duration: 75,
  },
  {
    id: "kids",
    name: "Kids cut (under 12)",
    note: "Quick, patient and with a lollipop",
    emoji: "🧒",
    price: 22,
    duration: 30,
  },
];

export interface ServiceListState {
  services: Service[];
  rows: ServiceRow[];
  chosen: string;
}

export const initial: ServiceListState = {
  services: SERVICES,
  rows: serviceRows(SERVICES, "combo"),
  chosen: "combo",
};

export class ServiceListPage extends Component<ServiceListState> {
  view = view;

  "list.pick"(msg: Message, state: ServiceListState): Effect[] {
    const id = msg.payload as string;
    return [
      store.set("chosen", id),
      store.set("rows", serviceRows(state.services, id)),
    ];
  }
}

export const page = new ServiceListPage();
