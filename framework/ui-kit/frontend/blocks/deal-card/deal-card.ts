import { Component, type Effect, type Message } from "@pavlus/frontend";
import { patch } from "../admin-shell/shell.ts";
import { dayLabel } from "../month-grid/dates.ts";
import view from "./deal-card.pavlus";
import {
  type DealColumn,
  type DealLite,
  dealBoard,
  moveStage,
  type StageDef,
  usd,
  weightedOf,
} from "./deals.ts";

const TODAY = "2026-11-03";

const STAGES: StageDef[] = [
  { id: "lead", title: "Lead", prob: 10, tone: "muted" },
  { id: "proposal", title: "Proposal", prob: 50, tone: "info" },
  { id: "negotiation", title: "Negotiation", prob: 75, tone: "warning" },
  { id: "won", title: "Won", prob: 100, tone: "success" },
];

const DEALS: DealLite[] = [
  {
    id: "d1",
    title: "Annual plan, 40 seats",
    company: "Northwind Logistics",
    amount: 48000,
    stage: "proposal",
    owner: "MC",
    close: "2026-11-20",
  },
  {
    id: "d2",
    title: "Pilot for two stores",
    company: "Fernhill Grocers",
    amount: 12500,
    stage: "lead",
    owner: "DA",
    close: "2026-12-04",
  },
  {
    id: "d3",
    title: "Platform migration",
    company: "Brightwave Media",
    amount: 96000,
    stage: "negotiation",
    owner: "MC",
    close: "2026-11-01",
  },
  {
    id: "d4",
    title: "Support add-on",
    company: "Kestrel Energy",
    amount: 18400,
    stage: "won",
    owner: "PN",
    close: "2026-10-29",
  },
];

export interface DealCardState {
  deals: DealLite[];
  columns: DealColumn[];
  message: string;
}

const board = (deals: DealLite[]) => dealBoard(STAGES, deals, TODAY, dayLabel);

export const initial: DealCardState = {
  deals: DEALS,
  columns: board(DEALS),
  message: `Forecast ${usd(weightedOf(DEALS, STAGES))}. Use the arrows to move a deal.`,
};

export class DealCardPage extends Component<DealCardState> {
  view = view;

  "deals.move"(msg: Message, state: DealCardState): Effect[] {
    const [id, dir] = msg.payload as [string, "left" | "right"];
    const deals = moveStage(state.deals, STAGES, id, dir);
    return patch({
      deals,
      columns: board(deals),
      message: `Forecast ${usd(weightedOf(deals, STAGES))}.`,
    });
  }

  "deals.open"(msg: Message): Effect[] {
    return patch({ message: `Opened ${msg.payload as string}.` });
  }
}

export const page = new DealCardPage();
