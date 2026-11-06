// Order intake (pipe): Check order > Place order
// A message goes through the stages in order. A stage passes it on by emitting the
// message the next stage takes; every other output leaves the pipe.
import type { Effect, Message } from "@service-laboratory/pavlus";
import type { ServerState } from "pavlus-server";
import { retarget } from "./emit.ts";
import * as stage0_checkOrder from "./check-order.ts";
import * as stage1_placeOrder from "./place-order.ts";

export const stages = [stage0_checkOrder, stage1_placeOrder];
export const inputs = ["orders.create"] as const;
export const outputs = ["http.respond", "order.created"] as const;

/** the name a stage gives the message it passes on -> the name the next stage takes */
const renames: Record<string, string> = {};

export function handle(msg: Message, state: ServerState): Effect[] | undefined {
  for (const stage of stages) {
    const effects = stage.handle(msg, state);
    if (effects) return retarget(effects, renames);
  }
  return undefined;
}
