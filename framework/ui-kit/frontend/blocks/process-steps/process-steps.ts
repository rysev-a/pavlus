import { Component } from "@pavlus/frontend";
import view from "./process-steps.pavlus";

export interface Step {
  title: string;
  text: string;
  note?: string;
}

export interface ProcessStepsState {
  steps: Step[];
}

export const initial: ProcessStepsState = {
  steps: [
    {
      title: "Discovery call",
      text: "Thirty minutes to understand the goal, the users and the deadline.",
      note: "Free",
    },
    {
      title: "Proposal",
      text: "A fixed scope, a timeline and a price you can put in a budget.",
      note: "2 days",
    },
    {
      title: "Build in sprints",
      text: "Two-week iterations with a demo at the end of each one.",
      note: "4-12 weeks",
    },
    {
      title: "Launch and care",
      text: "We ship, monitor and fix for 30 days at no extra cost.",
    },
  ],
};

/** Only data: the page has no messages of its own. */
export class ProcessStepsPage extends Component<ProcessStepsState> {
  view = view;
}

export const page = new ProcessStepsPage();
