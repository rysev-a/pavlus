// Private reply helpers shared by the plugins of this folder. Behaviour is the
// one described in DESIGN.md: a reply is a message that carries the `ctx` of
// the effect it answers, so the flow continues with the same `rid`.
import type { Message } from "@service-laboratory/pavlus";

export type Ctx = Record<string, unknown>;

/** What every server effect may carry. */
export interface ReplyFields {
  ctx?: Ctx;
  replyTo?: string;
  onError?: string;
}

export type Dispatch = (message: Message) => void;

export interface PluginError {
  code: string;
  message: string;
  [key: string]: unknown;
}

/** Plugins that keep in-flight work per request implement this. */
export interface Cancellable {
  cancel(rid: string): void;
}

export function ridOf(effect: { ctx?: Ctx }): string | undefined {
  const rid = effect.ctx?.rid;
  return typeof rid === "string" ? rid : undefined;
}

/** Answers `effect` with message `id`, copying the effect's ctx onto it. */
export function reply(
  dispatch: Dispatch,
  effect: { ctx?: Ctx },
  msg: { id: string; payload?: unknown },
): void {
  const m: Message = { id: msg.id };
  if (msg.payload !== undefined) m.payload = msg.payload;
  if (effect.ctx) m.ctx = effect.ctx;
  dispatch(m);
}

/** Replies to `effect.onError` (or `${fallback}` when absent) with `{code, message, ...}`. */
export function fail(
  dispatch: Dispatch,
  effect: ReplyFields,
  error: PluginError,
  fallback = "plugin.error",
): void {
  reply(dispatch, effect, { id: effect.onError ?? fallback, payload: error });
}

/** Replies to `effect.replyTo` when there is one (fire-and-forget otherwise). */
export function ok(
  dispatch: Dispatch,
  effect: ReplyFields,
  payload?: unknown,
): void {
  if (effect.replyTo !== undefined)
    reply(dispatch, effect, { id: effect.replyTo, payload });
}

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
