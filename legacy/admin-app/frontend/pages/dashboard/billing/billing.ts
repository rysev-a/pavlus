import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import {
  httpEffector as http,
  storeEffector as store,
} from "@service-laboratory/pavlus/plugins";
import view from "./billing.pavlus";

export interface Payment {
  id: number;
  /** The name of the user who paid, joined in by the backend. */
  customer: string;
  amount: string;
  status: string;
  /** Formatted by the backend, so both sides render the same text. */
  paid_at: string;
}

export interface BillingState {
  items: Payment[];
  status: "idle" | "loading" | "failed";
}

export const initialBilling: BillingState = { items: [], status: "idle" };

/** The `/dashboard/billing` page: the last payments, loaded on enter. */
export class Billing extends Component<BillingState> {
  view = view;

  load(): Effect[] {
    return [
      store.set("status", "loading"),
      http.request({
        id: "payments",
        url: "/api/payments",
        onSuccess: "loaded",
        onError: "failed",
      }),
    ];
  }

  // Entered by the router: start loading the payments.
  enter(): Effect[] {
    return this.load();
  }

  loaded(msg: Message): Effect[] {
    return [
      store.set("items", (msg.payload as { data: Payment[] }).data),
      store.set("status", "idle"),
    ];
  }

  failed(): Effect[] {
    return [store.set("status", "failed")];
  }
}

export const billing = new Billing();
