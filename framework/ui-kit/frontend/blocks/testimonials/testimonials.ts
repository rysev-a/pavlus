import { Component } from "@pavlus/frontend";
import view from "./testimonials.pavlus";

export interface Quote {
  quote: string;
  name: string;
  role: string;
  stars: number;
  tone: number;
}

export interface TestimonialsState {
  items: Quote[];
}

export const initial: TestimonialsState = {
  items: [
    {
      quote:
        "We dropped three tools the week we switched. The team finally agrees on what is next.",
      name: "Maya Fischer",
      role: "Head of Product, Lumio",
      stars: 5,
      tone: 1,
    },
    {
      quote:
        "The weekly review alone is worth the price. I close Friday knowing exactly where I stand.",
      name: "Tomas Reyes",
      role: "Freelance designer",
      stars: 5,
      tone: 2,
    },
    {
      quote:
        "Quiet, fast and it does not nag. Our support team has cut missed follow-ups to almost zero.",
      name: "Priya Nair",
      role: "Support lead, Brightwave",
      stars: 4,
      tone: 3,
    },
  ],
};

/** Only data: the page has no messages of its own. */
export class TestimonialsPage extends Component<TestimonialsState> {
  view = view;
}

export const page = new TestimonialsPage();
