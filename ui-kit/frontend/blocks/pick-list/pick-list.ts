import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import { patch } from "../admin-shell/shell.ts";
import {
  nextLine,
  type PickLine,
  type PickLineView,
  type PickProgress,
  progressOf,
  tickAll,
  togglePick,
  walkOrder,
} from "./picks.ts";
import view from "./pick-list.pavlus";

export interface PickListState {
  raw: PickLine[];
  lines: PickLineView[];
  progress: PickProgress;
  next: string;
}

const line = (
  id: string,
  loc: string,
  sku: string,
  name: string,
  qty: number,
): PickLine => ({ id, loc, sku, name, qty, picked: false });

const RAW: PickLine[] = [
  line("l1", "B-01-04", "MLK-OAT-1L", "Oat milk 1 L", 24),
  line("l2", "A-03-02", "RIC-BAS-5K", "Basmati rice 5 kg", 6),
  line("l3", "A-01-07", "OIL-OLV-1L", "Olive oil 1 L", 12),
  line("l4", "D-02-01", "TEA-GRN-50", "Green tea, 50 bags", 30),
  line("l5", "B-02-06", "EGG-FR-12", "Free-range eggs, 12", 18),
];

const draw = (raw: PickLine[]) => ({
  raw,
  lines: walkOrder(raw),
  progress: progressOf(raw),
  next: nextLine(raw)?.id ?? "",
});

export const initial: PickListState = draw(RAW);

export class PickListPage extends Component<PickListState> {
  view = view;

  "pick.toggle"(msg: Message, state: PickListState): Effect[] {
    return patch(draw(togglePick(state.raw, msg.payload as string)));
  }

  all(_msg: Message, state: PickListState): Effect[] {
    return patch(draw(tickAll(state.raw)));
  }
}

export const page = new PickListPage();
