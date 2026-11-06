// The application: one pure function. Each module answers the messages it owns
// and returns undefined for the rest.
import type { Effect, Message } from "@service-laboratory/pavlus";
import type { ServerState } from "pavlus-server";
import { handle as projects } from "./projects.ts";

const modules = [projects];

export const app = (msg: Message, state: ServerState): Effect[] => {
  for (const handle of modules) {
    const effects = handle(msg, state);
    if (effects) return effects;
  }
  return [];
};
