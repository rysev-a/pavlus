import {
  Component,
  type Children,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import { storeEffector as store } from "@service-laboratory/pavlus/plugins";
import {
  type Feature,
  initial as gridInitial,
} from "../../blocks/feature-grid/feature-grid.ts";
import { initial as faqInitial } from "../../blocks/faq/faq.ts";
import {
  type PricingState,
  pricingState,
  pricingTable,
} from "../../blocks/pricing-table/pricing-table.ts";
import {
  type SignupState,
  signupForm,
  signupState,
} from "../../blocks/signup-form/signup-form.ts";
import { initial as quotesInitial } from "../../blocks/testimonials/testimonials.ts";
import type { NavLink } from "../../blocks/site-nav/site-nav.ts";
import type { Stat } from "../../blocks/stats-strip/stats-strip.ts";
import {
  type TaskMockState,
  taskMock,
  taskMockState,
} from "../../blocks/task-mock/task-mock.ts";
import view from "./task-planner-landing.pavlus";

export interface TaskPlannerState {
  nav: NavLink[];
  stats: Stat[];
  features: Feature[];
  faqs: typeof faqInitial.items;
  quotes: typeof quotesInitial.items;
  perks: string[];
  pricing: PricingState;
  signup: SignupState;
  mock: TaskMockState;
}

export const initial: TaskPlannerState = {
  nav: [
    { label: "Features", href: "#features" },
    { label: "Try it", href: "#product" },
    { label: "Pricing", href: "#pricing" },
    { label: "FAQ", href: "#faq" },
  ],
  stats: [
    { value: "120k", label: "people planning with Tidy" },
    { value: "4.8/5", label: "rating in the app stores" },
    { value: "2.3M", label: "tasks finished last month" },
    { value: "3 min", label: "to set up your first week" },
  ],
  features: [
    ...gridInitial.items.slice(0, 5),
    {
      icon: "lock",
      title: "Private by default",
      text: "End-to-end encrypted notes, and a full export whenever you want to leave.",
    },
  ],
  faqs: [
    ...faqInitial.items,
    {
      q: "Can I bring my tasks from another app?",
      a: "Yes. Import a CSV or connect Todoist, Things or Trello; projects, due dates and labels come along.",
    },
  ],
  quotes: quotesInitial.items,
  perks: [
    "14 days of Pro, no card needed",
    "Import from Todoist, Things or Trello",
    "Cancel in two clicks, keep your data",
  ],
  pricing: pricingState({ ctaHref: "#signup" }),
  signup: signupState({
    title: "Start your first week",
    intro: "Free for 14 days. No card needed.",
    button: "Create my account",
  }),
  mock: taskMockState({ title: "Today, Thursday" }),
};

/** The page: its parts keep their own state; it only connects the pricing to the sign-up. */
export class TaskPlannerLanding extends Component<TaskPlannerState> {
  view = view;

  children: Children<TaskPlannerState> = {
    pricing: { component: pricingTable, key: "pricing" },
    signup: { component: signupForm, key: "signup" },
    mock: { component: taskMock, key: "mock" },
  };

  /** A plan button sends `pricing.choose`: the sign-up form starts with that plan. */
  "pricing.choose"(msg: Message): Effect[] {
    return [store.set("signup.plan", msg.payload as string)];
  }
}

export const page = new TaskPlannerLanding();
