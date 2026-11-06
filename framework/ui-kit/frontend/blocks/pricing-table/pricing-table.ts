import {
  type Children,
  Component,
  type Effect,
  type Message,
} from "@pavlus/frontend";
import { storeEffector as store } from "@pavlus/frontend/plugins";
import pageView from "./pricing-table.pavlus";
import view from "./view.pavlus";

export interface Plan {
  id: string;
  name: string;
  blurb: string;
  /** The price per month when paid monthly, in dollars. */
  monthly: number;
  featured?: boolean;
  features: string[];
  cta: string;
}

/** What a plan shows for the chosen billing period. */
export interface PlanCard extends Plan {
  price: string;
  per: string;
  billed: string;
}

export interface PricingState {
  yearly: boolean;
  /** The yearly discount, in percent. */
  discount: number;
  /** Where the buttons of the plans go. */
  ctaHref: string;
  plans: Plan[];
  cards: PlanCard[];
}

/** Pure: `12` -> "12", `9.5` -> "9.50". */
export function money(amount: number): string {
  const cents = Math.round(amount * 100);
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}

/** Pure: the price of a plan per month, what is billed, and what a year saves. */
export function priceFor(
  monthly: number,
  yearly: boolean,
  discount: number,
): { perMonth: number; billedTotal: number; saved: number } {
  if (!yearly) {
    return { perMonth: monthly, billedTotal: monthly, saved: 0 };
  }
  const perMonth = Math.round(monthly * (1 - discount / 100) * 100) / 100;
  const billedTotal = Math.round(perMonth * 12 * 100) / 100;
  const saved = Math.round((monthly * 12 - billedTotal) * 100) / 100;
  return { perMonth, billedTotal, saved };
}

/** Pure: the cards for a billing period. A free plan stays free. */
export function cardsOf(
  plans: Plan[],
  yearly: boolean,
  discount: number,
): PlanCard[] {
  return plans.map((plan) => {
    if (plan.monthly === 0) {
      return {
        ...plan,
        price: "$0",
        per: "forever",
        billed: "No card needed",
      };
    }
    const p = priceFor(plan.monthly, yearly, discount);
    return {
      ...plan,
      price: `$${money(p.perMonth)}`,
      per: "per user / month",
      billed: yearly
        ? `$${money(p.billedTotal)} billed yearly, you save $${money(p.saved)}`
        : "Billed monthly, cancel any time",
    };
  });
}

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    blurb: "For one person keeping life in order.",
    monthly: 0,
    features: ["Unlimited tasks", "3 projects", "Calendar view", "Mobile apps"],
    cta: "Start for free",
  },
  {
    id: "pro",
    name: "Pro",
    blurb: "For people who plan their week seriously.",
    monthly: 12,
    featured: true,
    features: [
      "Everything in Free",
      "Unlimited projects",
      "Recurring routines",
      "Weekly review and reports",
      "Priority support",
    ],
    cta: "Try Pro for 14 days",
  },
  {
    id: "team",
    name: "Team",
    blurb: "For teams that ship together.",
    monthly: 24,
    features: [
      "Everything in Pro",
      "Shared projects and roles",
      "Workload view",
      "Single sign-on",
      "Admin controls and audit log",
    ],
    cta: "Start a team trial",
  },
];

export function pricingState(over: Partial<PricingState> = {}): PricingState {
  const base = {
    yearly: false,
    discount: 25,
    ctaHref: "#signup",
    plans: PLANS,
    ...over,
  };
  return { ...base, cards: cardsOf(base.plans, base.yearly, base.discount) };
}

export const partInitial: PricingState = pricingState();

/** The pricing part with its billing toggle: it keeps `yearly` and the cards. */
export class PricingTable extends Component<PricingState> {
  view = view;

  /** `setBilling("yearly")` or `setBilling("monthly")`. */
  setBilling(msg: Message, state: PricingState): Effect[] {
    const yearly = msg.payload === "yearly";
    return [
      store.set("yearly", yearly),
      store.set("cards", cardsOf(state.plans, yearly, state.discount)),
    ];
  }
}

export const pricingTable = new PricingTable();

/** The page of the block: the part in its own state, under `pricing`. */
export interface PricingPageState {
  pricing: PricingState;
}

export const initial: PricingPageState = { pricing: partInitial };

export class PricingTablePage extends Component<PricingPageState> {
  view = pageView;
  children: Children<PricingPageState> = {
    pricing: { component: pricingTable, key: "pricing" },
  };
}

export const page = new PricingTablePage();
