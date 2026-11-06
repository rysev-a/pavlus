import { Component, type Effect, type Message } from "@pavlus/frontend";
import { storeEffector as store } from "@pavlus/frontend/plugins";
import view from "./vote-buttons.pavlus";

export type Vote = -1 | 0 | 1;

/** Pure: the vote after a click on an arrow (the same arrow twice = none). */
export function applyVote(current: number, direction: number): Vote {
  const dir: Vote = direction > 0 ? 1 : -1;
  return current === dir ? 0 : dir;
}

/** Pure: the score shown, from the score without own vote and the vote. */
export function scoreOf(base: number, vote: number): number {
  return base + vote;
}

export interface Voted {
  base: number;
  vote: Vote;
}

/** Pure: the sum of the shown scores. */
export function voteTotal(items: Voted[]): number {
  return items.reduce((sum, it) => sum + scoreOf(it.base, it.vote), 0);
}

export interface Counter extends Voted {
  score: number;
}

const counter = (base: number, vote: Vote): Counter => ({
  base,
  vote,
  score: scoreOf(base, vote),
});

export interface VoteState {
  a: Counter;
  b: Counter;
  summary: string;
}

const summaryOf = (a: Counter, b: Counter): string =>
  `${a.score} and ${b.score}`;

export const initial: VoteState = {
  a: counter(41, 1),
  b: counter(7, 0),
  summary: summaryOf(counter(41, 1), counter(7, 0)),
};

export class VoteButtonsPage extends Component<VoteState> {
  view = view;

  _vote(state: VoteState, which: "a" | "b", dir: number): Effect[] {
    const cur = state[which];
    const next = counter(cur.base, applyVote(cur.vote, dir));
    const a = which === "a" ? next : state.a;
    const b = which === "b" ? next : state.b;
    return [store.set(which, next), store.set("summary", summaryOf(a, b))];
  }

  "a.vote"(msg: Message, state: VoteState): Effect[] {
    return this._vote(state, "a", (msg.payload as [string, number])[1]);
  }

  "b.vote"(msg: Message, state: VoteState): Effect[] {
    return this._vote(state, "b", (msg.payload as [string, number])[1]);
  }
}

export const page = new VoteButtonsPage();
