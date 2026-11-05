import { Link, type LinkOptions } from "./link.ts";
import { RedisError, encodeCommand } from "./resp.ts";

export type SubKind = "s" | "p";

export interface SubMessage {
  kind: SubKind;
  /** The channel, or the pattern for kind "p". */
  key: string;
  channel: string;
  data: Buffer;
}

/** A dedicated connection in subscriber mode; resubscribes after reconnects. */
export class RedisSubscriber extends Link {
  #wanted = new Set<string>();
  #waiters = new Map<
    string,
    Array<{ ok: () => void; err: (e: Error) => void }>
  >();
  onMessage?: (m: SubMessage) => void;

  constructor(opts: LinkOptions) {
    super(opts);
  }

  get size(): number {
    return this.#wanted.size;
  }

  #send(verb: string, key: string) {
    this.write(encodeCommand([verb, key.slice(2)]));
  }

  /** Resolves when the server confirmed the subscription (or rejects after `timeoutMs`). */
  subscribe(kind: SubKind, name: string, timeoutMs = 5000): Promise<void> {
    const key = `${kind}:${name}`;
    this.#wanted.add(key);
    return new Promise((ok, err) => {
      const w = {
        ok: () => (clearTimeout(t), ok()),
        err: (e: Error) => (clearTimeout(t), err(e)),
      };
      const t =
        timeoutMs > 0
          ? setTimeout(() => {
              const l = this.#waiters.get(key);
              l?.splice(l.indexOf(w), 1);
              err(new Error(`redis: subscribe to ${name} timed out`));
            }, timeoutMs)
          : undefined;
      let l = this.#waiters.get(key);
      if (!l) this.#waiters.set(key, (l = []));
      l.push(w);
      if (this.ready)
        this.#send(kind === "s" ? "SUBSCRIBE" : "PSUBSCRIBE", key);
      else this.start();
    });
  }

  unsubscribe(kind: SubKind, name: string): void {
    const key = `${kind}:${name}`;
    if (!this.#wanted.delete(key)) return;
    if (this.ready)
      this.#send(kind === "s" ? "UNSUBSCRIBE" : "PUNSUBSCRIBE", key);
  }

  protected onReady(): void {
    for (const key of this.#wanted)
      this.#send(key[0] === "s" ? "SUBSCRIBE" : "PSUBSCRIBE", key);
  }

  protected onReply(r: unknown): void {
    if (!Array.isArray(r) || r.length < 2) return;
    const kind = String(r[0]);
    if (kind === "message" || kind === "smessage") {
      this.onMessage?.({
        kind: "s",
        key: String(r[1]),
        channel: String(r[1]),
        data: r[2] as Buffer,
      });
    } else if (kind === "pmessage") {
      this.onMessage?.({
        kind: "p",
        key: String(r[1]),
        channel: String(r[2]),
        data: r[3] as Buffer,
      });
    } else if (kind === "subscribe" || kind === "psubscribe") {
      const key = `${kind === "subscribe" ? "s" : "p"}:${String(r[1])}`;
      for (const w of this.#waiters.get(key)?.splice(0) ?? []) w.ok();
    }
  }

  protected onLost(): void {}

  protected onFatal(err: Error): void {
    for (const l of this.#waiters.values())
      for (const w of l.splice(0)) w.err(err instanceof RedisError ? err : err);
  }
}
