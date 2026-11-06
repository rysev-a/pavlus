import { Component } from "@pavlus/frontend";
import view from "./faq.pavlus";

export interface Question {
  q: string;
  a: string;
}

export interface FaqState {
  items: Question[];
}

export const initial: FaqState = {
  items: [
    {
      q: "Can I try it before paying?",
      a: "Yes. Every paid plan starts with a 14-day trial, no card needed.",
    },
    {
      q: "What happens to my data if I cancel?",
      a: "You keep read-only access for 60 days and can export everything as JSON or CSV at any time.",
    },
    {
      q: "Do you offer discounts for students or non-profits?",
      a: "Students and registered non-profits get 50% off any plan. Write to us from your school or organisation address.",
    },
    {
      q: "Is there a mobile app?",
      a: "iOS and Android apps are included in every plan and work offline; changes sync when you are back online.",
    },
  ],
};

/** Only data: the answers open and close natively (<details>). */
export class FaqPage extends Component<FaqState> {
  view = view;
}

export const page = new FaqPage();
