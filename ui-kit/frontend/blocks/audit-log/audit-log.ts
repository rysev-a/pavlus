import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import { storeEffector as store } from "@service-laboratory/pavlus/plugins";
import { entry, groupByDay, type LogEntry, type LogGroup } from "./log.ts";
import view from "./audit-log.pavlus";

export interface AuditPageState {
  entries: LogEntry[];
  groups: LogGroup[];
  none: LogGroup[];
  message: string;
}

const ENTRIES: LogEntry[] = [
  entry(
    "l1",
    "Ana Costa",
    "changed the plan of",
    "Northwind Ltd",
    "Today",
    "10:42",
    { text: "Growth to Scale, billed yearly.", tone: "info", tag: "Billing" },
  ),
  entry(
    "l2",
    "Leo Park",
    "rotated the API key of",
    "Brightside",
    "Today",
    "09:15",
    { tone: "warning", tag: "Security" },
  ),
  entry(
    "l3",
    "Mei Tanaka",
    "refunded an invoice for",
    "Orbit Labs",
    "Yesterday",
    "16:20",
    { text: "$240.00, duplicate charge.", tone: "success", tag: "Billing" },
  ),
  entry(
    "l4",
    "Leo Park",
    "removed the member",
    "j.silva@kiln.io",
    "Yesterday",
    "11:03",
    { tone: "destructive", tag: "Security" },
  ),
];

export const initial: AuditPageState = {
  entries: ENTRIES,
  groups: groupByDay(ENTRIES),
  none: [],
  message: "Click an entry.",
};

export class AuditLogPage extends Component<AuditPageState> {
  view = view;

  "log.pick"(msg: Message, state: AuditPageState): Effect[] {
    const found = state.entries.find((e) => e.id === msg.payload);
    return [
      store.set(
        "message",
        found ? `${found.actor} ${found.verb} ${found.target}` : "",
      ),
    ];
  }
}

export const page = new AuditLogPage();
