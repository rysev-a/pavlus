import { Component } from "@service-laboratory/pavlus";
import view from "./table.pavlus";

export interface TableState {
  invoices: { id: string; status: string; method: string; amount: string }[];
  total: string;
}

export const initial: TableState = {
  invoices: [
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
  ],
  total: "$1,750.00",
};

/** Only data: the page has no messages of its own. */
export class Table extends Component<TableState> {
  view = view;
}

export const page = new Table();
