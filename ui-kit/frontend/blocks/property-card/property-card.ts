import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import { patch } from "../admin-shell/shell.ts";
import {
  type Property,
  propertyViews,
  type PropertyView,
} from "./properties.ts";
import view from "./property-card.pavlus";

const LIST: Property[] = [
  {
    id: "p1",
    title: "Garden house with studio",
    address: "14 Alder Lane",
    city: "Brookfield",
    price: 735000,
    beds: 4,
    baths: 3,
    area: 188,
    kind: "house",
    status: "active",
    agent: "Ines Duarte",
    listed: "2026-10-12",
  },
  {
    id: "p2",
    title: "Bright two-bed near the park",
    address: "9 Linden Court, Apt 5",
    city: "Riverside",
    price: 412000,
    beds: 2,
    baths: 1,
    area: 78,
    kind: "apartment",
    status: "pending",
    agent: "Omar Haddad",
    listed: "2026-09-30",
  },
  {
    id: "p3",
    title: "Converted warehouse loft",
    address: "221 Mill Street",
    city: "Old Town",
    price: 598000,
    beds: 1,
    baths: 2,
    area: 112,
    kind: "loft",
    status: "active",
    agent: "Ines Duarte",
    listed: "2026-10-25",
  },
];

export interface PropertyCardState {
  properties: PropertyView[];
  none: PropertyView[];
  message: string;
}

export const initial: PropertyCardState = {
  properties: propertyViews(LIST, "", { p1: 92, p2: 64, p3: 78 }),
  none: [],
  message: "Click a listing to select it.",
};

export class PropertyCardPage extends Component<PropertyCardState> {
  view = view;

  "list.pick"(msg: Message): Effect[] {
    return patch({
      properties: propertyViews(LIST, msg.payload as string, {
        p1: 92,
        p2: 64,
        p3: 78,
      }),
      message: `Selected ${msg.payload as string}.`,
    });
  }
}

export const page = new PropertyCardPage();
