import { Component, type Effect, type Message } from "@pavlus/frontend";
import { patch } from "../admin-shell/shell.ts";
import {
  type Ratings,
  type ScoreView,
  type Skill,
  scoreView,
  setRating,
} from "./score.ts";
import view from "./scorecard.pavlus";

export const SKILLS: Skill[] = [
  {
    id: "code",
    label: "Problem solving",
    hint: "Breaks a task down, tests ideas",
  },
  { id: "design", label: "System design", hint: "Trade-offs, scale, failure" },
  {
    id: "comm",
    label: "Communication",
    hint: "Clear, listens, asks questions",
  },
  { id: "culture", label: "Team fit", hint: "Feedback, ownership, kindness" },
  { id: "domain", label: "Domain knowledge", hint: "Knows the product area" },
];

export interface ScorecardState {
  ratings: Ratings;
  card: ScoreView;
}

const RATINGS: Ratings = { code: 4, design: 3, comm: 5 };

export const initial: ScorecardState = {
  ratings: RATINGS,
  card: scoreView(SKILLS, RATINGS),
};

export class ScorecardPage extends Component<ScorecardState> {
  view = view;

  "card.rate"(msg: Message, state: ScorecardState): Effect[] {
    const [skill, value] = msg.payload as [string, number];
    const ratings = setRating(state.ratings, skill, value);
    return patch({ ratings, card: scoreView(SKILLS, ratings) });
  }
}

export const page = new ScorecardPage();
