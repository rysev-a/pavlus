import { Component, type Effect, type Message } from "@pavlus/frontend";
import { patch } from "../admin-shell/shell.ts";
import view from "./flag-list.pavlus";
import {
  enabled,
  type Flag,
  type FlagRow,
  flagRows,
  setRollout,
  toggleFlag,
} from "./flags.ts";

export interface FlagPageState {
  flags: Flag[];
  rows: FlagRow[];
  count: number;
  total: number;
}

const FLAGS: Flag[] = [
  {
    id: "f1",
    name: "New billing page",
    key: "billing_v2",
    desc: "Invoices, receipts and the plan picker in one place.",
    on: true,
    rollout: 50,
    env: "prod",
    owner: "Payments",
  },
  {
    id: "f2",
    name: "AI report summaries",
    key: "ai_summaries",
    desc: "A written summary on top of every weekly report.",
    on: true,
    rollout: 10,
    env: "prod",
    owner: "Insights",
  },
  {
    id: "f3",
    name: "Dark sidebar",
    key: "dark_sidebar",
    desc: "A darker navigation for the dashboard.",
    on: false,
    rollout: 100,
    env: "staging",
    owner: "Design",
  },
];

const views = (flags: Flag[]) => ({
  flags,
  rows: flagRows(flags),
  count: enabled(flags),
  total: flags.length,
});

export const initial: FlagPageState = views(FLAGS);

export class FlagListPage extends Component<FlagPageState> {
  view = view;

  "flags.toggle"(msg: Message, state: FlagPageState): Effect[] {
    return patch(views(toggleFlag(state.flags, msg.payload as string)));
  }

  "flags.rollout"(msg: Message, state: FlagPageState): Effect[] {
    const id = msg.payload as string;
    return patch(views(setRollout(state.flags, id, Number(msg.event?.value))));
  }
}

export const page = new FlagListPage();
