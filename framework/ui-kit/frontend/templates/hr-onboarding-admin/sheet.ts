import {
  button,
  type Field,
  field,
  selectField,
  type SheetButton,
  valuesOf,
} from "../../blocks/record-sheet/sheet.ts";
import { CATALOG, type EquipmentDraft, type Hire } from "./hr.ts";

/** What the side sheet holds: the new equipment request being written. */
export interface SheetState {
  open: boolean;
  title: string;
  description: string;
  fields: Field[];
  buttons: SheetButton[];
}

export const newDraft = (hire: string): EquipmentDraft => ({
  hire,
  item: CATALOG[0][0],
  note: "",
});

/** Pure: the request form, with the errors by field. */
export function equipmentSheet(
  hires: Hire[],
  d: EquipmentDraft,
  errors: Record<string, string> = {},
): SheetState {
  const fields: Field[] = [
    selectField(
      "hire",
      "New hire",
      d.hire,
      hires.map((h) => [h.id, h.name]),
    ),
    selectField(
      "item",
      "Item",
      d.item,
      CATALOG.map(([id, label, price]) => [id, `${label}, $${price}`]),
    ),
    field("note", "Note", d.note, {
      kind: "textarea",
      placeholder: "Anything the IT team should know",
    }),
  ].map((f) => ({ ...f, error: errors[f.id] ?? "" }));
  return {
    open: true,
    title: "New equipment request",
    description: "It starts as requested and goes through approval.",
    fields,
    buttons: [button("save", "Send request")],
  };
}

export const closedSheet = (hires: Hire[]): SheetState => ({
  ...equipmentSheet(hires, newDraft(hires[0].id)),
  open: false,
});

/** Pure: the draft that the fields hold. */
export function draftOf(fields: Field[]): EquipmentDraft {
  const v = valuesOf(fields);
  return { hire: v.hire, item: v.item, note: v.note };
}
