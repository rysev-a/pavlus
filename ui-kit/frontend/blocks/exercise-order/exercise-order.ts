import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import { storeEffector as store } from "@service-laboratory/pavlus/plugins";
import {
  type OrderExercise,
  type OrderProps,
  checkOrder,
  moveItem,
  orderProps,
  scramble,
} from "./order.ts";
import view from "./exercise-order.pavlus";

export const DEMO: OrderExercise = {
  prompt: "Put the steps of saving your work in git in the right order.",
  mono: true,
  items: [
    { id: "edit", text: "echo hello > a.txt" },
    { id: "status", text: "git status" },
    { id: "add", text: "git add a.txt" },
    { id: "commit", text: 'git commit -m "add a.txt"' },
    { id: "log", text: "git log --oneline" },
  ],
  alternatives: [["edit", "add", "status", "commit", "log"]],
};

export interface ExerciseOrderState {
  seed: number;
  ids: string[];
  order: OrderProps;
  result: string;
  resultTone: "success" | "destructive";
}

const start = scramble(DEMO, 3);

export const initial: ExerciseOrderState = {
  seed: 3,
  ids: start,
  order: orderProps(DEMO, start, false, false),
  result: "",
  resultTone: "success",
};

export class ExerciseOrderPage extends Component<ExerciseOrderState> {
  view = view;

  "order.move"(msg: Message, s: ExerciseOrderState): Effect[] {
    const [id, dir] = msg.payload as [string, -1 | 1];
    const ids = moveItem(s.ids, id, dir);
    return [
      store.set("ids", ids),
      store.set("order", orderProps(DEMO, ids, false, false)),
      store.set("result", ""),
    ];
  }

  check(_msg: Message, s: ExerciseOrderState): Effect[] {
    const ok = checkOrder(DEMO, s.ids);
    return [
      store.set("order", orderProps(DEMO, s.ids, !ok, ok)),
      store.set(
        "result",
        ok ? "In the right order" : "Not yet: green lines are in place",
      ),
      store.set("resultTone", ok ? "success" : "destructive"),
    ];
  }

  shuffle(_msg: Message, s: ExerciseOrderState): Effect[] {
    const seed = s.seed + 1;
    const ids = scramble(DEMO, seed);
    return [
      store.set("seed", seed),
      store.set("ids", ids),
      store.set("order", orderProps(DEMO, ids, false, false)),
      store.set("result", ""),
    ];
  }
}

export const page = new ExerciseOrderPage();
