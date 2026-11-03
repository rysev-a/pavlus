import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import { timeEffector as time } from "@service-laboratory/pavlus/plugins";
import { patch } from "../admin-shell/shell.ts";
import {
  advance,
  boardOf,
  type ColumnView,
  timerText,
  type Ticket,
} from "./orders.ts";
import view from "./order-board.pavlus";

export interface OrderBoardState {
  tickets: Ticket[];
  clock: number;
  clockText: string;
  columns: ColumnView[];
}

const line = (qty: number, name: string, note = "") => ({ qty, name, note });

const TICKETS: Ticket[] = [
  {
    id: "o41",
    title: "Table 4",
    who: "Ana",
    lines: [
      line(2, "Mushroom risotto"),
      line(1, "Caesar salad", "no croutons"),
    ],
    stage: "cooking",
    placedAt: -9 * 60,
    doneAt: null,
  },
  {
    id: "o42",
    title: "Table 9",
    who: "Leo",
    lines: [line(1, "Sea bass"), line(1, "Beef tartare")],
    stage: "cooking",
    placedAt: -14 * 60,
    doneAt: null,
  },
  {
    id: "o43",
    title: "Takeaway",
    who: "Desk",
    lines: [line(3, "Margherita pizza")],
    stage: "new",
    placedAt: -90,
    doneAt: null,
  },
  {
    id: "o44",
    title: "Table 2",
    who: "Ana",
    lines: [line(2, "Tomato soup"), line(2, "Focaccia")],
    stage: "ready",
    placedAt: -6 * 60,
    doneAt: null,
  },
  {
    id: "o40",
    title: "Table 7",
    who: "Leo",
    lines: [line(1, "Lamb shank", "medium")],
    stage: "served",
    placedAt: -22 * 60,
    doneAt: -8 * 60,
  },
];

const draw = (tickets: Ticket[], clock: number) => ({
  tickets,
  clock,
  clockText: timerText(clock),
  columns: boardOf(tickets, clock),
});

export const initial: OrderBoardState = draw(TICKETS, 0);

export class OrderBoardPage extends Component<OrderBoardState> {
  view = view;

  /** One second goes by (the page started this timer in `enter`). */
  tick(_msg: Message, state: OrderBoardState): Effect[] {
    return patch(draw(state.tickets, state.clock + 1));
  }

  enter(): Effect[] {
    return [time.setInterval("ticker", 1000, "tick")];
  }

  leave(): Effect[] {
    return [time.cancel("ticker")];
  }

  "board.advance"(msg: Message, state: OrderBoardState): Effect[] {
    return patch(
      draw(
        advance(state.tickets, msg.payload as string, state.clock),
        state.clock,
      ),
    );
  }
}

export const page = new OrderBoardPage();
