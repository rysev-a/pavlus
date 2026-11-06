// `emit`: a message from one module to another. The runtime dispatches it with the
// context of the effect (the rid), so a flow that crosses modules is still one request.
import type { Effect } from "@service-laboratory/pavlus";
import { requestsEffector as rq } from "pavlus-server";

export const emit = (id: string, payload?: unknown): Effect =>
  rq.dispatch({ id, payload }) as unknown as Effect;

/** Renames the messages a stage emits (the pass-through of a pipe). */
export function retarget(
  effects: Effect[],
  renames: Record<string, string>,
): Effect[] {
  return effects.map((e) => {
    const x = e as unknown as {
      plugin?: string;
      type?: string;
      message?: { id: string; payload?: unknown };
    };
    return x.plugin === "requests" &&
      x.type === "dispatch" &&
      x.message &&
      renames[x.message.id]
      ? ({
          ...x,
          message: { ...x.message, id: renames[x.message.id] },
        } as unknown as Effect)
      : e;
  });
}
