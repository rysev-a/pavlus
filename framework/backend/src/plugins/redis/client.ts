import { Link, type LinkOptions } from "./link.ts";
import { type RedisArg, RedisError, decode, encodeCommand } from "./resp.ts";

export class RedisClientError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "RedisClientError";
    this.code = code;
  }
}

export interface ClientOptions extends LinkOptions {
  /** Default per-command timeout in ms (default 5000, 0 = none). */
  commandTimeoutMs?: number;
  /** Queue commands while disconnected (default true). */
  offlineQueue?: boolean;
  maxOfflineQueue?: number;
}

export interface CallOptions {
  timeoutMs?: number;
  rid?: string;
  /** Keep bulk strings as Buffers. */
  binary?: boolean;
}

export type PipelineItem =
  | { ok: true; value: unknown }
  | { ok: false; error: { code: string; message: string } };

interface Slot {
  resolve(v: unknown): void;
  reject(e: Error): void;
  rid?: string;
  binary: boolean;
  settled: boolean;
  timer?: ReturnType<typeof setTimeout>;
  data: Buffer;
}

/** A pipelining command connection. */
export class RedisClient extends Link {
  #inflight: Slot[] = [];
  #offline: Slot[] = [];
  readonly #copts: ClientOptions;
  stats = { commands: 0, errors: 0, timeouts: 0 };
  #readyWaiters: Array<{ ok: () => void; err: (e: Error) => void }> = [];

  constructor(opts: ClientOptions) {
    super(opts);
    this.#copts = opts;
  }

  /** Resolves when connected (rejects if connecting fails for good). */
  whenReady(): Promise<void> {
    if (this.ready) return Promise.resolve();
    if (this.fatal) return Promise.reject(this.fatal);
    this.start();
    return new Promise((ok, err) => this.#readyWaiters.push({ ok, err }));
  }

  protected onReady(): void {
    for (const w of this.#readyWaiters.splice(0)) w.ok();
    const queued = this.#offline.splice(0);
    for (const s of queued) {
      if (s.settled) continue;
      this.#inflight.push(s);
      this.write(s.data);
    }
  }

  protected onReply(reply: unknown): void {
    const slot = this.#inflight.shift();
    if (!slot) return; // unsolicited push (RESP3), ignore
    if (slot.timer) clearTimeout(slot.timer);
    if (slot.settled) return;
    slot.settled = true;
    if (reply instanceof RedisError) {
      this.stats.errors++;
      slot.reject(reply);
    } else slot.resolve(decode(reply, slot.binary));
  }

  protected onLost(err: Error): void {
    const lost = this.#inflight.splice(0);
    for (const s of lost)
      this.#settle(
        s,
        new RedisClientError("CONNECTION", `connection lost: ${err.message}`),
      );
  }

  protected onFatal(err: Error): void {
    for (const s of [...this.#inflight.splice(0), ...this.#offline.splice(0)])
      this.#settle(s, new RedisClientError("CONNECTION", err.message));
    for (const w of this.#readyWaiters.splice(0)) w.err(err);
  }

  #settle(s: Slot, err: Error): void {
    if (s.timer) clearTimeout(s.timer);
    if (s.settled) return;
    s.settled = true;
    s.reject(err);
  }

  #enqueue(
    args: readonly RedisArg[],
    o: CallOptions,
    resolve: (v: unknown) => void,
    reject: (e: Error) => void,
  ): Slot {
    const slot: Slot = {
      resolve,
      reject,
      binary: o.binary === true,
      settled: false,
      data: undefined as unknown as Buffer,
    };
    if (o.rid !== undefined) slot.rid = o.rid;
    try {
      slot.data = encodeCommand(args);
    } catch (e) {
      slot.settled = true;
      reject(e as Error);
      return slot;
    }
    this.stats.commands++;
    if (this.fatal) {
      this.#settle(
        slot,
        new RedisClientError("CONNECTION", this.fatal.message),
      );
      return slot;
    }
    if (this.status === "closed" && this.#stoppedByUser) {
      this.#settle(
        slot,
        new RedisClientError("CONNECTION", "client is closed"),
      );
      return slot;
    }
    const ms = o.timeoutMs ?? this.#copts.commandTimeoutMs ?? 5000;
    if (ms > 0)
      slot.timer = setTimeout(() => {
        this.stats.timeouts++;
        // keep the slot in the queue: its reply still arrives and must be skipped
        this.#settle(
          slot,
          new RedisClientError(
            "TIMEOUT",
            `redis command timed out after ${ms}ms`,
          ),
        );
      }, ms);
    if (this.ready) {
      this.#inflight.push(slot);
      this.write(slot.data);
    } else {
      this.start();
      if (this.#copts.offlineQueue === false)
        this.#settle(
          slot,
          new RedisClientError("CONNECTION", "redis is not connected"),
        );
      else if (this.#offline.length >= (this.#copts.maxOfflineQueue ?? 1000))
        this.#settle(
          slot,
          new RedisClientError("CONNECTION", "offline queue is full"),
        );
      else this.#offline.push(slot);
    }
    return slot;
  }

  #stoppedByUser = false;

  /** Runs one command. Bulk strings are utf8 strings unless `binary`. */
  call(args: readonly RedisArg[], o: CallOptions = {}): Promise<unknown> {
    return new Promise(
      (resolve, reject) => void this.#enqueue(args, o, resolve, reject),
    );
  }

  /** Sends all commands in one write; every command gets its own result. */
  async pipeline(
    cmds: readonly (readonly RedisArg[])[],
    o: CallOptions = {},
  ): Promise<PipelineItem[]> {
    return Promise.all(cmds.map((c) => this.call(c, o).then(okItem, errItem)));
  }

  /** MULTI ... EXEC. Resolves null when EXEC was aborted (WATCH). */
  async multi(
    cmds: readonly (readonly RedisArg[])[],
    o: CallOptions = {},
  ): Promise<PipelineItem[] | null> {
    const all = [["MULTI"], ...cmds, ["EXEC"]] as const;
    const results = await Promise.allSettled(all.map((c) => this.call(c, o)));
    const exec = results[results.length - 1]!;
    if (exec.status === "rejected") {
      // surface the queueing error that caused EXECABORT when there is one
      const first = results.find(
        (r, i) => i > 0 && i < results.length - 1 && r.status === "rejected",
      );
      throw (first as PromiseRejectedResult | undefined)?.reason ?? exec.reason;
    }
    if (exec.value === null) return null;
    return (exec.value as unknown[]).map((v) =>
      v instanceof RedisError ? errItem(v) : okItem(v),
    );
  }

  /** Silently drops everything pending for `rid` (blocked replies are still read off the wire). */
  dropRid(rid: string): number {
    let n = 0;
    for (const s of [...this.#inflight, ...this.#offline]) {
      if (s.rid === rid && !s.settled) {
        s.settled = true;
        if (s.timer) clearTimeout(s.timer);
        s.reject(new RedisClientError("CANCELLED", "cancelled"));
        n++;
      }
    }
    return n;
  }

  get pending(): number {
    return this.#inflight.length;
  }
  get queued(): number {
    return this.#offline.filter((s) => !s.settled).length;
  }

  close(): void {
    this.#stoppedByUser = true;
    this.stop();
    for (const s of [...this.#inflight.splice(0), ...this.#offline.splice(0)])
      this.#settle(s, new RedisClientError("CONNECTION", "client is closed"));
  }
}

const okItem = (value: unknown): PipelineItem => ({ ok: true, value });
export function errorPayload(e: unknown): { code: string; message: string } {
  const x = e as { code?: unknown; message?: string };
  return {
    code: typeof x.code === "string" ? x.code : "ERROR",
    message: x.message ?? String(e),
  };
}
const errItem = (e: unknown): PipelineItem => ({
  ok: false,
  error: errorPayload(e),
});
