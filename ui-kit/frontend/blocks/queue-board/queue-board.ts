import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import { patch } from "../admin-shell/shell.ts";
import {
  advance,
  averageWait,
  type Lane,
  lanesOf,
  type Ticket,
} from "./queue.ts";
import view from "./queue-board.pavlus";

export interface QueuePageState {
  tickets: Ticket[];
  lanes: Lane[];
  average: number;
}

/** The demo clock is fixed: 10:20. */
const NOW = 10 * 60 + 20;

const TICKETS: Ticket[] = [
  {
    id: "t1",
    number: 41,
    name: "Grace Whitfield",
    reason: "Blood pressure check",
    doctor: "Dr. Lee",
    arrived: 9 * 60 + 55,
    status: "in",
    urgent: false,
  },
  {
    id: "t2",
    number: 42,
    name: "Tomas Varga",
    reason: "Chest pain",
    doctor: "Dr. Khan",
    arrived: 10 * 60 + 2,
    status: "called",
    urgent: true,
  },
  {
    id: "t3",
    number: 43,
    name: "Lena Fischer",
    reason: "Child fever",
    doctor: "Dr. Ruiz",
    arrived: 10 * 60 + 5,
    status: "waiting",
    urgent: false,
  },
  {
    id: "t4",
    number: 44,
    name: "Marcus Bell",
    reason: "Prescription renewal",
    doctor: "Dr. Lee",
    arrived: 10 * 60 + 11,
    status: "waiting",
    urgent: false,
  },
  {
    id: "t5",
    number: 45,
    name: "Yuki Tanaka",
    reason: "Vaccination",
    doctor: "Dr. Ruiz",
    arrived: 10 * 60 + 16,
    status: "waiting",
    urgent: false,
  },
  {
    id: "t6",
    number: 40,
    name: "Rosa Martinez",
    reason: "Lab results",
    doctor: "Dr. Lee",
    arrived: 9 * 60 + 30,
    status: "done",
    urgent: false,
  },
];

const views = (tickets: Ticket[]) => ({
  tickets,
  lanes: lanesOf(tickets, NOW),
  average: averageWait(tickets, NOW),
});

export const initial: QueuePageState = views(TICKETS);

export class QueueBoardPage extends Component<QueuePageState> {
  view = view;

  "queue.act"(msg: Message, state: QueuePageState): Effect[] {
    const [id, dir] = msg.payload as [string, "next" | "back"];
    return patch(views(advance(state.tickets, id, dir)));
  }
}

export const page = new QueueBoardPage();
