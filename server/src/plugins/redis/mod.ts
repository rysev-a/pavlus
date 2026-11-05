import type { Plugin, PluginContext } from "@service-laboratory/pavlus";
import {
  type Cancellable,
  type Ctx,
  type Dispatch,
  fail,
  ok,
  ridOf,
} from "../_reply.ts";
import { RedisClient, type ClientOptions, errorPayload } from "./client.ts";
import { type LinkOptions, parseRedisUrl } from "./link.ts";
import { type RedisArg, decode } from "./resp.ts";
import {
  RedisSubscriber,
  type SubKind,
  type SubMessage,
} from "./subscriber.ts";

export { redisEffector } from "./helpers.ts";
export type { RedisEffector } from "./helpers.ts";
export { RedisClient, RedisClientError } from "./client.ts";
export type { ClientOptions, PipelineItem } from "./client.ts";
export { RedisSubscriber } from "./subscriber.ts";
export { RespParser, RedisError, encodeCommand } from "./resp.ts";
export type { RedisArg } from "./resp.ts";
export { parseRedisUrl } from "./link.ts";

/** How the raw reply is shaped before it is sent back. */
export type RedisShape = "hash" | "scores" | "bool";

type Base = { plugin: "redis"; ctx?: Ctx; replyTo?: string; onError?: string };
type Opts = { timeoutMs?: number; binary?: boolean };

export type RedisEffect =
  /** Any command. Replies the value: string | number | null | array | (object with `as: "hash"`). */
  | (Base & Opts & { type: "cmd"; args: RedisArg[]; as?: RedisShape })
  /** Replies `{results: [{ok, value} | {ok: false, error}]}`; one write, no atomicity. */
  | (Base & Opts & { type: "pipeline"; cmds: RedisArg[][] })
  /** MULTI/EXEC: replies `{results}` like pipeline, or `{results: null}` when EXEC was aborted. */
  | (Base & Opts & { type: "multi"; cmds: RedisArg[][] })
  /** Messages arrive as `onMessage` with payload `{channel, message, pattern?}` and the ctx of this effect. */
  | (Base & {
      type: "subscribe";
      channel?: string;
      pattern?: string;
      onMessage: string;
      binary?: boolean;
    })
  | (Base & {
      type: "unsubscribe";
      channel?: string;
      pattern?: string;
      onMessage?: string;
    })
  /** Replies the number of receivers. */
  | (Base & { type: "publish"; channel: string; message: RedisArg });

export interface RedisPluginOptions extends Partial<ClientOptions> {
  /** redis://[user:pass@]host[:port][/db][?protocol=3] or rediss:// for TLS. */
  url?: string;
  now?: () => number;
}

export interface RedisMetrics {
  status: string;
  commands: number;
  errors: number;
  timeouts: number;
  inflight: number;
  queued: number;
  reconnects: number;
  subscriptions: number;
}

export interface RedisPlugin extends Plugin<RedisEffect, any>, Cancellable {
  readonly client: RedisClient;
  /** Resolves once connected. */
  ready(): Promise<void>;
  metrics(): RedisMetrics;
}

interface Sub {
  id: number;
  kind: SubKind;
  name: string;
  rid?: string;
  owner?: string;
  onMessage: string;
  ctx?: Ctx;
  binary: boolean;
}

function shape(v: unknown, as: RedisShape | undefined): unknown {
  switch (as) {
    case "hash": {
      if (!Array.isArray(v)) return v ?? {};
      const o: Record<string, unknown> = {};
      for (let i = 0; i + 1 < v.length; i += 2) o[String(v[i])] = v[i + 1];
      return o;
    }
    case "scores": {
      if (!Array.isArray(v)) return v;
      const out: { member: unknown; score: number }[] = [];
      for (let i = 0; i + 1 < v.length; i += 2)
        out.push({ member: v[i], score: Number(v[i + 1]) });
      return out;
    }
    case "bool":
      return v === 1 || v === "OK" || v === true;
    default:
      return v;
  }
}

export function createRedisPlugin(
  options: RedisPluginOptions = {},
): RedisPlugin {
  const { url, now: nowFn, ...rest } = options;
  const link: LinkOptions = {
    ...(url ? parseRedisUrl(url) : { host: "127.0.0.1", port: 6379 }),
  };
  Object.assign(
    link,
    Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)),
  );
  const client = new RedisClient(link as ClientOptions);
  const now = nowFn ?? Date.now;
  let subscriber: RedisSubscriber | undefined;
  let dispatchRef: Dispatch | undefined;
  let subSeq = 0;
  /** key "s:chan" -> subscriptions */
  const subs = new Map<string, Map<number, Sub>>();
  const confirmed = new Map<string, Promise<void>>();
  const cancelledRids = new Set<string>();
  void cancelledRids;

  function timeoutFor(effect: {
    timeoutMs?: number;
    ctx?: Ctx;
  }): number | undefined {
    let ms = effect.timeoutMs;
    const deadline = effect.ctx?.deadline;
    if (typeof deadline === "number") {
      const left = deadline - now();
      ms = ms === undefined || ms === 0 ? left : Math.min(ms, left);
    }
    return ms;
  }

  function callOpts(effect: {
    ctx?: Ctx;
    timeoutMs?: number;
    binary?: boolean;
  }) {
    const o: { rid?: string; timeoutMs?: number; binary?: boolean } = {};
    const rid = ridOf(effect);
    if (rid !== undefined) o.rid = rid;
    const t = timeoutFor(effect);
    if (t !== undefined) o.timeoutMs = Math.max(1, t);
    if (effect.binary) o.binary = true;
    return o;
  }

  const reportError = (dispatch: Dispatch, effect: Base, e: unknown) => {
    const p = errorPayload(e);
    if (p.code === "CANCELLED") return;
    fail(dispatch, effect, p, "redis.error");
  };

  function ensureSubscriber(): RedisSubscriber {
    if (subscriber) return subscriber;
    const s = new RedisSubscriber({ ...link });
    s.onMessage = (m: SubMessage) => {
      const set = subs.get(`${m.kind}:${m.key}`);
      if (!set || !dispatchRef) return;
      for (const sub of set.values()) {
        const payload: Record<string, unknown> = {
          channel: sub.binary ? Buffer.from(m.channel) : m.channel,
          message: decode(m.data, sub.binary),
        };
        if (m.kind === "p") payload.pattern = m.key;
        dispatchRef({
          id: sub.onMessage,
          payload,
          ...(sub.ctx && { ctx: sub.ctx }),
        });
      }
    };
    s.start();
    subscriber = s;
    return s;
  }

  function removeSub(key: string, id: number): void {
    const set = subs.get(key);
    if (!set) return;
    set.delete(id);
    if (set.size === 0) {
      subs.delete(key);
      confirmed.delete(key);
      subscriber?.unsubscribe(key[0] as SubKind, key.slice(2));
    }
  }

  const ownerOf = (ctx?: Ctx): string | undefined => {
    const v = ctx?.connId ?? ctx?.rid;
    return typeof v === "string" ? v : undefined;
  };

  return {
    name: "redis",
    client,
    init(pc) {
      dispatchRef = pc.dispatch;
      client.start();
    },
    handle(effect: RedisEffect, pc: PluginContext) {
      dispatchRef = pc.dispatch;
      const d = pc.dispatch;
      switch (effect.type) {
        case "cmd":
          client.call(effect.args, callOpts(effect)).then(
            (v) => ok(d, effect, shape(v, effect.as)),
            (e) => reportError(d, effect, e),
          );
          return;
        case "publish":
          client
            .call(["PUBLISH", effect.channel, effect.message], callOpts(effect))
            .then(
              (v) => ok(d, effect, v),
              (e) => reportError(d, effect, e),
            );
          return;
        case "pipeline":
          client.pipeline(effect.cmds, callOpts(effect)).then(
            (results) => ok(d, effect, { results }),
            (e) => reportError(d, effect, e),
          );
          return;
        case "multi":
          client.multi(effect.cmds, callOpts(effect)).then(
            (results) => ok(d, effect, { results }),
            (e) => reportError(d, effect, e),
          );
          return;
        case "subscribe": {
          const kind: SubKind = effect.pattern !== undefined ? "p" : "s";
          const name = effect.pattern ?? effect.channel;
          if (name === undefined) {
            fail(
              d,
              effect,
              {
                code: "ERR",
                message: "redis.subscribe needs `channel` or `pattern`",
              },
              "redis.error",
            );
            return;
          }
          const key = `${kind}:${name}`;
          const sub: Sub = {
            id: ++subSeq,
            kind,
            name,
            onMessage: effect.onMessage,
            binary: effect.binary === true,
          };
          const rid = ridOf(effect);
          if (rid !== undefined) sub.rid = rid;
          const owner = ownerOf(effect.ctx);
          if (owner !== undefined) sub.owner = owner;
          if (effect.ctx) sub.ctx = effect.ctx;
          let set = subs.get(key);
          if (!set) subs.set(key, (set = new Map()));
          set.set(sub.id, sub);
          let p = confirmed.get(key);
          if (!p) {
            p = ensureSubscriber().subscribe(
              kind,
              name,
              link.connectTimeoutMs ? undefined : 10_000,
            );
            confirmed.set(key, p);
          }
          p.then(
            () => ok(d, effect, { subscribed: name }),
            (e) => {
              removeSub(key, sub.id);
              reportError(d, effect, e);
            },
          );
          return;
        }
        case "unsubscribe": {
          const kind: SubKind = effect.pattern !== undefined ? "p" : "s";
          const name = effect.pattern ?? effect.channel;
          if (name === undefined) return;
          const key = `${kind}:${name}`;
          const owner = ownerOf(effect.ctx);
          for (const sub of [...(subs.get(key)?.values() ?? [])]) {
            if (
              effect.onMessage !== undefined &&
              sub.onMessage !== effect.onMessage
            )
              continue;
            if (owner !== undefined && sub.owner !== owner) continue;
            removeSub(key, sub.id);
          }
          ok(d, effect, { unsubscribed: name });
          return;
        }
      }
    },
    /** Drops pending replies of `rid` and removes its subscriptions. */
    cancel(rid) {
      client.dropRid(rid);
      for (const [key, set] of [...subs])
        for (const sub of [...set.values()])
          if (sub.rid === rid) removeSub(key, sub.id);
    },
    ready: () => client.whenReady(),
    metrics() {
      let n = 0;
      for (const s of subs.values()) n += s.size;
      return {
        status: client.status,
        commands: client.stats.commands,
        errors: client.stats.errors,
        timeouts: client.stats.timeouts,
        inflight: client.pending,
        queued: client.queued,
        reconnects: client.reconnects + (subscriber?.reconnects ?? 0),
        subscriptions: n,
      };
    },
    dispose() {
      subscriber?.stop();
      client.close();
      subs.clear();
    },
  };
}
