// The conditions of the design (the branches of the flow). Replace each body with
// the real test on msg.payload / state.requests[rid]. Until then a condition reads
// state.shared.flags, which is how the generated scenario tests flip them.

import type { ServerState } from "@pavlus/backend";
import type { Message } from "@pavlus/frontend";

const flag = (state: ServerState, name: string, fallback: boolean): boolean =>
  ((state.shared as { flags?: Record<string, boolean> }).flags ?? {})[name] ??
  fallback;

export {};
