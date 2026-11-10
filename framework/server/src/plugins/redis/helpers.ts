import type { RedisEffect, RedisShape } from "./mod.ts";
import type { RedisArg } from "./resp.ts";

type Of<T extends RedisEffect["type"]> = Extract<RedisEffect, { type: T }>;

/** Reply routing shared by all builders. */
export interface Reply {
  replyTo?: string;
  onError?: string;
  timeoutMs?: number;
  binary?: boolean;
}

export interface SetOptions extends Reply {
  /** Seconds to live. */
  ex?: number;
  /** Milliseconds to live. */
  px?: number;
  /** Only if the key does not exist. */
  nx?: boolean;
  /** Only if the key exists. */
  xx?: boolean;
  keepTtl?: boolean;
  /** Reply the old value instead of OK. */
  get?: boolean;
}

export interface RedisEffector {
  /** Any command: `redis.cmd(["INCRBY", "k", 5], { replyTo: "done" })`. */
  cmd(args: RedisArg[], o?: Reply & { as?: RedisShape }): Of<"cmd">;
  get(key: string, o?: Reply): Of<"cmd">;
  /** Replies "OK", or null when nx/xx prevented it. */
  set(key: string, value: RedisArg, o?: SetOptions): Of<"cmd">;
  del(keys: string | string[], o?: Reply): Of<"cmd">;
  exists(keys: string | string[], o?: Reply): Of<"cmd">;
  incr(key: string, o?: Reply): Of<"cmd">;
  incrBy(key: string, by: number, o?: Reply): Of<"cmd">;
  decr(key: string, o?: Reply): Of<"cmd">;
  /** Replies true/false. */
  expire(key: string, seconds: number, o?: Reply): Of<"cmd">;
  pexpire(key: string, ms: number, o?: Reply): Of<"cmd">;
  ttl(key: string, o?: Reply): Of<"cmd">;
  hget(key: string, field: string, o?: Reply): Of<"cmd">;
  /** `hset(key, { a: 1, b: "x" })` or `hset(key, "a", 1)`. */
  hset(key: string, fields: Record<string, RedisArg>, o?: Reply): Of<"cmd">;
  hset(key: string, field: string, value: RedisArg, o?: Reply): Of<"cmd">;
  /** Replies an object. */
  hgetall(key: string, o?: Reply): Of<"cmd">;
  hdel(key: string, fields: string | string[], o?: Reply): Of<"cmd">;
  lpush(key: string, values: RedisArg | RedisArg[], o?: Reply): Of<"cmd">;
  rpush(key: string, values: RedisArg | RedisArg[], o?: Reply): Of<"cmd">;
  lpop(key: string, o?: Reply): Of<"cmd">;
  rpop(key: string, o?: Reply): Of<"cmd">;
  lrange(key: string, start: number, stop: number, o?: Reply): Of<"cmd">;
  llen(key: string, o?: Reply): Of<"cmd">;
  sadd(key: string, members: RedisArg | RedisArg[], o?: Reply): Of<"cmd">;
  srem(key: string, members: RedisArg | RedisArg[], o?: Reply): Of<"cmd">;
  smembers(key: string, o?: Reply): Of<"cmd">;
  zadd(
    key: string,
    entries: { score: number; member: RedisArg }[],
    o?: Reply,
  ): Of<"cmd">;
  /** With `withScores` replies `[{member, score}]`. */
  zrange(
    key: string,
    start: number,
    stop: number,
    o?: Reply & { withScores?: boolean; rev?: boolean },
  ): Of<"cmd">;
  mget(keys: string[], o?: Reply): Of<"cmd">;
  /** `mset({ a: "1", b: "2" })` */
  mset(entries: Record<string, RedisArg>, o?: Reply): Of<"cmd">;
  eval(script: string, keys: string[], args: RedisArg[], o?: Reply): Of<"cmd">;
  evalsha(sha: string, keys: string[], args: RedisArg[], o?: Reply): Of<"cmd">;
  pipeline(cmds: RedisArg[][], o: Reply): Of<"pipeline">;
  multi(cmds: RedisArg[][], o: Reply): Of<"multi">;
  subscribe(
    channel: string,
    o: {
      onMessage: string;
      replyTo?: string;
      onError?: string;
      binary?: boolean;
    },
  ): Of<"subscribe">;
  psubscribe(
    pattern: string,
    o: {
      onMessage: string;
      replyTo?: string;
      onError?: string;
      binary?: boolean;
    },
  ): Of<"subscribe">;
  unsubscribe(
    channel: string,
    o?: { onMessage?: string; replyTo?: string },
  ): Of<"unsubscribe">;
  punsubscribe(
    pattern: string,
    o?: { onMessage?: string; replyTo?: string },
  ): Of<"unsubscribe">;
  publish(channel: string, message: RedisArg, o?: Reply): Of<"publish">;
}

const defined = <T extends object>(o: T) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
const arr = <T>(v: T | T[]): T[] => (Array.isArray(v) ? v : [v]);

const cmd = (
  args: RedisArg[],
  o: Reply & { as?: RedisShape } = {},
): Of<"cmd"> =>
  ({ plugin: "redis", type: "cmd", args, ...defined(o) }) as Of<"cmd">;

export const redisEffector: RedisEffector = {
  cmd,
  get: (k, o) => cmd(["GET", k], o),
  set: (k, v, o = {}) => {
    const { ex, px, nx, xx, keepTtl, get, ...reply } = o;
    const args: RedisArg[] = ["SET", k, v];
    if (nx) args.push("NX");
    if (xx) args.push("XX");
    if (get) args.push("GET");
    if (ex !== undefined) args.push("EX", ex);
    if (px !== undefined) args.push("PX", px);
    if (keepTtl) args.push("KEEPTTL");
    return cmd(args, reply);
  },
  del: (k, o) => cmd(["DEL", ...arr(k)], o),
  exists: (k, o) => cmd(["EXISTS", ...arr(k)], o),
  incr: (k, o) => cmd(["INCR", k], o),
  incrBy: (k, by, o) => cmd(["INCRBY", k, by], o),
  decr: (k, o) => cmd(["DECR", k], o),
  expire: (k, s, o) => cmd(["EXPIRE", k, s], { ...o, as: "bool" }),
  pexpire: (k, ms, o) => cmd(["PEXPIRE", k, ms], { ...o, as: "bool" }),
  ttl: (k, o) => cmd(["TTL", k], o),
  hget: (k, f, o) => cmd(["HGET", k, f], o),
  hset: ((
    k: string,
    a: Record<string, RedisArg> | string,
    b?: RedisArg | Reply,
    c?: Reply,
  ) => {
    if (typeof a === "string") return cmd(["HSET", k, a, b as RedisArg], c);
    return cmd(
      ["HSET", k, ...Object.entries(a).flat()],
      b as Reply | undefined,
    );
  }) as RedisEffector["hset"],
  hgetall: (k, o) => cmd(["HGETALL", k], { ...o, as: "hash" }),
  hdel: (k, f, o) => cmd(["HDEL", k, ...arr(f)], o),
  lpush: (k, v, o) => cmd(["LPUSH", k, ...arr(v)], o),
  rpush: (k, v, o) => cmd(["RPUSH", k, ...arr(v)], o),
  lpop: (k, o) => cmd(["LPOP", k], o),
  rpop: (k, o) => cmd(["RPOP", k], o),
  lrange: (k, a, b, o) => cmd(["LRANGE", k, a, b], o),
  llen: (k, o) => cmd(["LLEN", k], o),
  sadd: (k, m, o) => cmd(["SADD", k, ...arr(m)], o),
  srem: (k, m, o) => cmd(["SREM", k, ...arr(m)], o),
  smembers: (k, o) => cmd(["SMEMBERS", k], o),
  zadd: (k, entries, o) =>
    cmd(["ZADD", k, ...entries.flatMap((e) => [e.score, e.member])], o),
  zrange: (k, a, b, o = {}) => {
    const { withScores, rev, ...reply } = o;
    const args: RedisArg[] = ["ZRANGE", k, a, b];
    if (rev) args.push("REV");
    if (withScores) args.push("WITHSCORES");
    return cmd(args, withScores ? { ...reply, as: "scores" } : reply);
  },
  mget: (keys, o) => cmd(["MGET", ...keys], o),
  mset: (entries, o) => cmd(["MSET", ...Object.entries(entries).flat()], o),
  eval: (script, keys, args, o) =>
    cmd(["EVAL", script, keys.length, ...keys, ...args], o),
  evalsha: (sha, keys, args, o) =>
    cmd(["EVALSHA", sha, keys.length, ...keys, ...args], o),
  pipeline: (cmds, o) =>
    ({
      plugin: "redis",
      type: "pipeline",
      cmds,
      ...defined(o),
    }) as Of<"pipeline">,
  multi: (cmds, o) =>
    ({ plugin: "redis", type: "multi", cmds, ...defined(o) }) as Of<"multi">,
  subscribe: (channel, o) =>
    ({
      plugin: "redis",
      type: "subscribe",
      channel,
      ...defined(o),
    }) as Of<"subscribe">,
  psubscribe: (pattern, o) =>
    ({
      plugin: "redis",
      type: "subscribe",
      pattern,
      ...defined(o),
    }) as Of<"subscribe">,
  unsubscribe: (channel, o = {}) =>
    ({
      plugin: "redis",
      type: "unsubscribe",
      channel,
      ...defined(o),
    }) as Of<"unsubscribe">,
  punsubscribe: (pattern, o = {}) =>
    ({
      plugin: "redis",
      type: "unsubscribe",
      pattern,
      ...defined(o),
    }) as Of<"unsubscribe">,
  publish: (channel, message, o) =>
    ({
      plugin: "redis",
      type: "publish",
      channel,
      message,
      ...defined(o ?? {}),
    }) as Of<"publish">,
};
