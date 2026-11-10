import { Component } from "@pavlus/client";
import view from "./table.pavlus";

export interface Invoice {
  id: string;
  status: string;
  method: string;
  amount: string;
  /** What the pill's classes read of the status (no comparisons in templates). */
  paid: boolean;
  pending: boolean;
  unpaid: boolean;
}

export interface TableState {
  invoices: Invoice[];
  total: string;
}

const INVOICES = [
  { id: "INV001", status: "Paid", method: "Credit Card", amount: "$250.00" },
  { id: "INV002", status: "Pending", method: "PayPal", amount: "$150.00" },
  {
    id: "INV003",
    status: "Unpaid",
    method: "Bank Transfer",
    amount: "$350.00",
  },
  { id: "INV004", status: "Paid", method: "Credit Card", amount: "$450.00" },
  { id: "INV005", status: "Paid", method: "PayPal", amount: "$550.00" },
];

/** The invoices with their status flags, mapped once. */
const flagged = (x: Omit<Invoice, "paid" | "pending" | "unpaid">): Invoice => ({
  ...x,
  paid: x.status === "Paid",
  pending: x.status === "Pending",
  unpaid: x.status === "Unpaid",
});

export const initial: TableState = {
  invoices: INVOICES.map(flagged),
  total: "$1,750.00",
};

/** Only data: the page has no messages of its own. */
export class Table extends Component<TableState> {
  view = view;
}

export const page = new Table();
