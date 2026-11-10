import { Component, type Effect, type Message } from "@pavlus/client";
import { storeEffector as store } from "@pavlus/client/plugins";
import view from "./direction.pavlus";

export interface DirectionState {
  dir: "ltr" | "rtl";
  /** Derived from `dir` — see `derive`. */
  isLtr: boolean;
  isRtl: boolean;
  cardTitle: string;
  cardDescription: string;
  switchLabel: string;
}

/** Everything that follows from the direction — the one place. */
function derive(dir: DirectionState["dir"]): Omit<DirectionState, "dir"> {
  const rtl = dir === "rtl";
  return {
    isLtr: dir === "ltr",
    isRtl: rtl,
    cardTitle: rtl ? "بطاقة" : "Card",
    cardDescription: rtl
      ? "يتبع التخطيط اتجاه النص."
      : "The layout follows the direction of the text.",
    switchLabel: rtl ? "تشغيل" : "On",
  };
}

export const initial: DirectionState = { dir: "ltr", ...derive("ltr") };

export class Direction extends Component<DirectionState> {
  view = view;

  set(msg: Message): Effect[] {
    const dir = msg.payload as DirectionState["dir"];
    return [
      store.set("dir", dir),
      ...Object.entries(derive(dir)).map(([k, v]) => store.set(k, v)),
    ];
  }
}

export const page = new Direction();
