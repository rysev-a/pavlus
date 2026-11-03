import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import { patch } from "../admin-shell/shell.ts";
import {
  cycleDoc,
  type DocItem,
  docRows,
  type DocRow,
  type Progress,
  progressOf,
} from "./customs.ts";
import view from "./customs-checklist.pavlus";

const doc = (
  id: string,
  title: string,
  note: string,
  required: boolean,
  state: DocItem["state"],
): DocItem => ({ id, title, note, required, state });

const ITEMS: DocItem[] = [
  doc(
    "inv",
    "Commercial invoice",
    "Value, buyer, seller and Incoterm.",
    true,
    "approved",
  ),
  doc("pack", "Packing list", "Boxes, weights and marks.", true, "uploaded"),
  doc("bol", "Bill of lading", "Signed by the carrier.", true, "missing"),
  doc(
    "coo",
    "Certificate of origin",
    "Needed for the reduced duty rate.",
    false,
    "missing",
  ),
  doc(
    "ins",
    "Insurance certificate",
    "Cargo insurance for the declared value.",
    false,
    "approved",
  ),
];

export interface ChecklistState {
  items: DocItem[];
  rows: DocRow[];
  progress: Progress;
}

const derive = (items: DocItem[]) => ({
  items,
  rows: docRows(items),
  progress: progressOf(items),
});

export const initial: ChecklistState = derive(ITEMS);

export class ChecklistPage extends Component<ChecklistState> {
  view = view;

  "list.cycle"(msg: Message, state: ChecklistState): Effect[] {
    return patch(derive(cycleDoc(state.items, msg.payload as string)));
  }
}

export const page = new ChecklistPage();
