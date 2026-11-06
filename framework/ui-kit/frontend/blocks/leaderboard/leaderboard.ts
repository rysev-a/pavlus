import { Component, type Effect, type Message } from "@pavlus/frontend";
import { money, patch } from "../admin-shell/shell.ts";
import { type Rank, rankRows, type Score } from "./board.ts";
import view from "./leaderboard.pavlus";

const SCORES: Score[] = [
  {
    id: "s1",
    name: "Priya Nair",
    value: 128000,
    target: 120000,
    sub: "9 deals won",
  },
  {
    id: "s2",
    name: "Maya Chen",
    value: 174500,
    target: 160000,
    sub: "12 deals won",
  },
  {
    id: "s3",
    name: "Diego Alvarez",
    value: 96200,
    target: 140000,
    sub: "7 deals won",
  },
  {
    id: "s4",
    name: "Tom Becker",
    value: 41800,
    target: 100000,
    sub: "4 deals won",
  },
];

export interface LeaderboardState {
  rows: Rank[];
  message: string;
}

export const initial: LeaderboardState = {
  rows: rankRows(SCORES, (n) => money(n, "$", 0)),
  message: "Click a row.",
};

export class LeaderboardPage extends Component<LeaderboardState> {
  view = view;

  "board.pick"(msg: Message, state: LeaderboardState): Effect[] {
    const row = state.rows.find((r) => r.id === msg.payload);
    return patch({ message: row ? `${row.name} is number ${row.rank}.` : "" });
  }
}

export const page = new LeaderboardPage();
