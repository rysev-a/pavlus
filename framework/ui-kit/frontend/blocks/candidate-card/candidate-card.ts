import { Component, type Effect, type Message } from "@pavlus/frontend";
import { patch } from "../admin-shell/shell.ts";
import {
  type CandidateView,
  candidateView,
  nextStage,
  type Person,
  type Stage,
} from "./candidate.ts";
import view from "./candidate-card.pavlus";

export const STAGES: Stage[] = [
  { id: "applied", title: "Applied", tone: "muted" },
  { id: "screening", title: "Screening", tone: "info" },
  { id: "interview", title: "Interview", tone: "warning" },
  { id: "offer", title: "Offer", tone: "default" },
  { id: "hired", title: "Hired", tone: "success" },
  { id: "rejected", title: "Rejected", tone: "destructive" },
];

export const ORDER = ["applied", "screening", "interview", "offer", "hired"];

const PERSON: Person = {
  id: "p1",
  name: "Mira Okonkwo",
  role: "Senior product designer",
  email: "mira.okonkwo@example.com",
  location: "Lagos, remote",
  source: "Referral",
  expected: 96,
  skills: ["Figma", "Design systems", "User research", "Prototyping"],
  note: "Led the redesign of a payments app used by 2M people. Strong portfolio, asks good questions.",
  stage: "screening",
};

export interface CandidateCardState {
  person: Person;
  card: CandidateView;
  message: string;
}

export const initial: CandidateCardState = {
  person: PERSON,
  card: candidateView(PERSON, STAGES, ORDER),
  message: "Move the candidate on or reject them.",
};

export class CandidateCardPage extends Component<CandidateCardState> {
  view = view;

  _set(state: CandidateCardState, stage: string, message: string): Effect[] {
    const person = { ...state.person, stage };
    return patch({
      person,
      card: candidateView(person, STAGES, ORDER),
      message,
    });
  }

  "card.advance"(_msg: Message, state: CandidateCardState): Effect[] {
    const stage = nextStage(ORDER, state.person.stage);
    return this._set(state, stage, `Moved to ${stage}.`);
  }

  "card.reject"(_msg: Message, state: CandidateCardState): Effect[] {
    return this._set(state, "rejected", "Rejected.");
  }

  "card.offer"(_msg: Message, state: CandidateCardState): Effect[] {
    return this._set(state, "offer", "An offer form would open here.");
  }
}

export const page = new CandidateCardPage();
