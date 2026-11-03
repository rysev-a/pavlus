import { Component } from "@service-laboratory/pavlus";
import { type Card, card, change } from "./cards.ts";
import view from "./stat-cards.pavlus";

export interface StatCardsState {
  cards: Card[];
  plain: Card[];
}

const revenue = change(48200, 42900);
const orders = change(1284, 1310);

export const initial: StatCardsState = {
  cards: [
    card("revenue", "Revenue", "$48,200", {
      ...revenue,
      hint: "vs last week",
      icon: "k-ai-dollar",
      tone: "success",
      series: [31, 36, 33, 41, 38, 45, 48],
    }),
    card("orders", "Orders", "1,284", {
      ...orders,
      hint: "vs last week",
      icon: "k-ai-cart",
      tone: "info",
      series: [44, 40, 47, 43, 39, 41, 38],
    }),
    card("visitors", "Visitors", "9,420", {
      ...change(9420, 8100),
      hint: "vs last week",
      icon: "k-ai-users",
      tone: "default",
      series: [20, 24, 22, 28, 31, 30, 36],
    }),
    card("refunds", "Refunds", "14", {
      ...change(14, 9),
      hint: "vs last week",
      icon: "k-ai-alert",
      tone: "warning",
      series: [1, 2, 1, 3, 2, 3, 2],
    }),
  ],
  plain: [
    card("rooms", "Rooms free", "18", { hint: "of 42", icon: "k-ai-bed" }),
    card("staff", "Staff on shift", "9", { icon: "k-ai-users", tone: "teal" }),
  ],
};

/** Only data: the page has no messages of its own. */
export class StatCardsPage extends Component<StatCardsState> {
  view = view;
}

export const page = new StatCardsPage();
