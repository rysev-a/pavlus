import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import { patch } from "../admin-shell/shell.ts";
import {
  button,
  type Detail,
  detail,
  type Field,
  field,
  isValid,
  positive,
  selectField,
  type SheetButton,
  valuesOf,
  withErrors,
  withValue,
} from "./sheet.ts";
import view from "./record-sheet.pavlus";

export interface RecordSheetState {
  open: boolean;
  name: string;
  price: number;
  status: string;
  message: string;
  details: Detail[];
  fields: Field[];
  buttons: SheetButton[];
}

/** Pure: what is wrong with the product form, by field. */
export function validate(
  values: Record<string, string>,
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!values.name?.trim()) errors.name = "Enter a name.";
  if (positive(values.price ?? "") === null) {
    errors.price = "The price must be a number above zero.";
  }
  return errors;
}

const formFor = (name: string, price: number, status: string): Field[] => [
  field("name", "Name", name),
  field("price", "Price", price, { kind: "number", hint: "In dollars." }),
  selectField("status", "Status", status, [
    ["active", "Active"],
    ["draft", "Draft"],
  ]),
];

export const initial: RecordSheetState = {
  open: false,
  name: "Linen shirt",
  price: 48,
  status: "active",
  message: "",
  details: [detail("SKU", "LS-0042"), detail("Stock", "36 pcs")],
  fields: formFor("Linen shirt", 48, "active"),
  buttons: [button("save", "Save changes")],
};

export class RecordSheetPage extends Component<RecordSheetState> {
  view = view;

  show(_msg: Message, state: RecordSheetState): Effect[] {
    return patch({
      open: true,
      fields: formFor(state.name, state.price, state.status),
    });
  }

  "sheet.close"(): Effect[] {
    return patch({ open: false });
  }

  "sheet.field"(msg: Message, state: RecordSheetState): Effect[] {
    const id = msg.payload as string;
    return patch({
      fields: withValue(state.fields, id, msg.event?.value ?? ""),
    });
  }

  "sheet.press"(_msg: Message, state: RecordSheetState): Effect[] {
    const values = valuesOf(state.fields);
    const errors = validate(values);
    if (!isValid(errors))
      return patch({ fields: withErrors(state.fields, errors) });
    return patch({
      open: false,
      name: values.name.trim(),
      price: Number(values.price),
      status: values.status,
      message: `Saved: ${values.name.trim()}`,
    });
  }
}

export const page = new RecordSheetPage();
