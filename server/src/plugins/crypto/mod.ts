// Plugin `crypto`: password hashing and random tokens as effects, so handlers
// stay pure. scrypt runs on node's libuv thread pool, so it never blocks the
// single dispatch queue; the answer arrives as a message with the same rid.
import {
  randomBytes,
  scrypt,
  timingSafeEqual,
  type ScryptOptions,
} from "node:crypto";
import type { Plugin, PluginContext } from "@service-laboratory/pavlus";
import {
  type Cancellable,
  type EffectCtx,
  deliver,
  fail,
  ok,
  ridOf,
} from "../../ctx.ts";

type Base = {
  plugin: "crypto";
  ctx?: EffectCtx;
  replyTo?: string;
  onError?: string;
};

export type CryptoEffect =
  /** Replies `{hash}`: `scrypt$N$r$p$salt$key` (base64url), self-describing. */
  | (Base & { type: "hash"; password: string })
  /** Replies `{ok: boolean}`; a malformed hash is `ok: false`. */
  | (Base & { type: "verify"; password: string; hash: string })
  /** Replies `{token}` (base64url of `bytes` random bytes, default 32). */
  | (Base & { type: "randomToken"; bytes?: number });

export interface CryptoPluginOptions {
  /** scrypt cost (power of two). Default 16384; tests may lower it. */
  N?: number;
  r?: number;
  p?: number;
  keyLength?: number;
}

export interface CryptoPlugin extends Plugin<CryptoEffect, any>, Cancellable {
  stats(): { inflight: number; done: number; cancelled: number };
}

const derive = (
  password: string,
  salt: Buffer,
  len: number,
  opts: ScryptOptions,
): Promise<Buffer> =>
  new Promise((resolve, reject) =>
    scrypt(password, salt, len, opts, (e, key) =>
      e ? reject(e) : resolve(key),
    ),
  );

export function createCryptoPlugin(
  opts: CryptoPluginOptions = {},
): CryptoPlugin {
  const N = opts.N ?? 16384;
  const r = opts.r ?? 8;
  const p = opts.p ?? 1;
  const keyLength = opts.keyLength ?? 32;
  const cancelled = new Set<object>();
  const byRid = new Map<string, Set<object>>();
  let inflight = 0;
  let done = 0;
  let nCancelled = 0;

  async function run(effect: CryptoEffect): Promise<unknown> {
    switch (effect.type) {
      case "hash": {
        const salt = randomBytes(16);
        const key = await derive(effect.password, salt, keyLength, {
          N,
          r,
          p,
          maxmem: 128 * N * r * 2,
        });
        return {
          hash: `scrypt$${N}$${r}$${p}$${salt.toString("base64url")}$${key.toString("base64url")}`,
        };
      }
      case "verify": {
        const parts = effect.hash.split("$");
        if (parts.length !== 6 || parts[0] !== "scrypt") return { ok: false };
        const [n, rr, pp] = [parts[1], parts[2], parts[3]].map(Number) as [
          number,
          number,
          number,
        ];
        const salt = Buffer.from(parts[4]!, "base64url");
        const want = Buffer.from(parts[5]!, "base64url");
        if (!n || !rr || !pp || want.length === 0) return { ok: false };
        const got = await derive(effect.password, salt, want.length, {
          N: n,
          r: rr,
          p: pp,
          maxmem: 128 * n * rr * 2,
        });
        return { ok: timingSafeEqual(got, want) };
      }
      case "randomToken":
        return {
          token: randomBytes(effect.bytes ?? 32).toString("base64url"),
        };
    }
  }

  return {
    name: "crypto",
    handle(effect: CryptoEffect, ctx: PluginContext<any>) {
      const token = {};
      const rid = ridOf(effect);
      if (rid) {
        let set = byRid.get(rid);
        if (!set) byRid.set(rid, (set = new Set()));
        set.add(token);
      }
      inflight++;
      run(effect)
        .then(
          (payload) => {
            if (!cancelled.has(token))
              deliver(ctx.dispatch, ok(effect, payload));
          },
          (e) => {
            if (!cancelled.has(token))
              deliver(
                ctx.dispatch,
                fail(
                  effect,
                  { code: "CRYPTO", message: (e as Error).message },
                  "crypto.error",
                ),
              );
          },
        )
        .finally(() => {
          inflight--;
          done++;
          cancelled.delete(token);
          if (rid) {
            const set = byRid.get(rid);
            set?.delete(token);
            if (set?.size === 0) byRid.delete(rid);
          }
        });
    },
    cancel(rid) {
      for (const token of byRid.get(rid) ?? []) {
        cancelled.add(token);
        nCancelled++;
      }
    },
    stats: () => ({ inflight, done, cancelled: nCancelled }),
  };
}

type Of<T extends CryptoEffect["type"]> = Extract<CryptoEffect, { type: T }>;
type Opts = { replyTo: string; onError?: string };

export interface CryptoEffector {
  hash(password: string, o: Opts): Of<"hash">;
  verify(password: string, hash: string, o: Opts): Of<"verify">;
  randomToken(o: Opts & { bytes?: number }): Of<"randomToken">;
}

const defined = <T extends object>(o: T) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

export const cryptoEffector: CryptoEffector = {
  hash: (password, o) =>
    ({ plugin: "crypto", type: "hash", password, ...defined(o) }) as Of<"hash">,
  verify: (password, hash, o) =>
    ({
      plugin: "crypto",
      type: "verify",
      password,
      hash,
      ...defined(o),
    }) as Of<"verify">,
  randomToken: (o) =>
    ({
      plugin: "crypto",
      type: "randomToken",
      ...defined(o),
    }) as Of<"randomToken">,
};
