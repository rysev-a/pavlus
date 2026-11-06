import {
  button,
  type Field,
  field,
  type SheetButton,
  selectField,
} from "../../blocks/record-sheet/sheet.ts";
import { CONTACTS, type DealDraft, REPS, STAGES } from "./sales.ts";

/** What the "new deal" sheet holds. */
export interface SheetState {
  open: boolean;
  draft: DealDraft;
  title: string;
  description: string;
  fields: Field[];
  buttons: SheetButton[];
}

export function dealFields(
  d: DealDraft,
  errors: Record<string, string> = {},
): Field[] {
  const fields = [
    field("title", "Deal name", d.title, {
      placeholder: "Annual plan, 40 seats",
    }),
    field("company", "Company", d.company, {
      placeholder: "Northwind Logistics",
    }),
    selectField(
      "contact",
      "Contact",
      d.contact,
      CONTACTS.map((c) => [c.id, `${c.name}, ${c.company}`]),
    ),
    field("amount", "Amount (USD)", d.amount, {
      kind: "number",
      placeholder: "25000",
      hint: "The yearly value of the deal.",
    }),
    selectField(
      "stage",
      "Stage",
      d.stage,
      STAGES.filter((s) => s.id !== "lost" && s.id !== "won").map((s) => [
        s.id,
        s.title,
      ]),
    ),
    field("close", "Expected close", d.close, { kind: "date" }),
    selectField(
      "owner",
      "Owner",
      d.owner,
      REPS.map((r) => [r.initials, r.name]),
    ),
  ];
  return fields.map((f) => ({ ...f, error: errors[f.id] ?? "" }));
}

export function dealSheet(
  d: DealDraft,
  errors: Record<string, string> = {},
): SheetState {
  return {
    open: true,
    draft: d,
    title: "New deal",
    description: "It lands in the stage you choose and shows on the board.",
    fields: dealFields(d, errors),
    buttons: [button("save", "Add deal")],
  };
}

export const closedSheet = (d: DealDraft): SheetState => ({
  ...dealSheet(d),
  open: false,
});
