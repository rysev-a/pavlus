// A test dispatcher that records messages and lets a test await one (for plugin tests).
import type { Message } from "@pavlus/core";
import type { Dispatch } from "../ctx.ts";

/** A test dispatcher that records messages and lets a test await one. */
export function collector() {
  const messages: Message[] = [];
  const waiters: Array<{ ids: string[]; resolve: (m: Message) => void }> = [];
  const dispatch: Dispatch = (m) => {
    messages.push(m);
    for (let i = waiters.length - 1; i >= 0; i--) {
      if (waiters[i]!.ids.includes(m.id)) waiters.splice(i, 1)[0]!.resolve(m);
    }
  };
  /** Awaits the first message whose id is `id` (or any of `ids`). */
  const next = (id: string | string[], ms = 5000): Promise<Message> => {
    const ids = Array.isArray(id) ? id : [id];
    const seen = messages.find((m) => ids.includes(m.id));
    if (seen) {
      messages.splice(messages.indexOf(seen), 1);
      return Promise.resolve(seen);
    }
    return new Promise((resolve, reject) => {
      const w = {
        ids,
        resolve: (m: Message) => {
          clearTimeout(t);
          messages.splice(messages.indexOf(m), 1);
          resolve(m);
        },
      };
      const t = setTimeout(() => {
        waiters.splice(waiters.indexOf(w), 1);
        reject(new Error(`timeout waiting ${ids.join("|")}`));
      }, ms);
      waiters.push(w);
    });
  };
  return { messages, dispatch, next };
}
