import { describe, expect, it } from "vitest";
import { collector } from "../../testing/collector.ts";
import { createCryptoPlugin, cryptoEffector as c } from "./mod.ts";

const ctx = { rid: "r1", conn: "http" };
const setup = () => {
  const plugin = createCryptoPlugin({ N: 1024 });
  const col = collector();
  const run = (e: object) =>
    plugin.handle({ ...e, ctx } as any, { dispatch: col.dispatch } as any);
  return { plugin, col, run };
};

describe("crypto plugin", () => {
  it("hashes, verifies and rejects, replying with the ctx", async () => {
    const { col, run } = setup();
    run(c.hash("s3cret", { replyTo: "hashed" }));
    const h = await col.next("hashed");
    expect(h.ctx).toBe(ctx);
    const hash = (h.payload as { hash: string }).hash;
    expect(hash).toMatch(/^scrypt\$1024\$8\$1\$/);
    run(c.verify("s3cret", hash, { replyTo: "v" }));
    expect((await col.next("v")).payload).toEqual({ ok: true });
    run(c.verify("wrong", hash, { replyTo: "v" }));
    expect((await col.next("v")).payload).toEqual({ ok: false });
    run(c.verify("x", "garbage", { replyTo: "v" }));
    expect((await col.next("v")).payload).toEqual({ ok: false });
  });
  it("salts every hash and mints distinct tokens", async () => {
    const { col, run } = setup();
    run(c.hash("same", { replyTo: "h" }));
    run(c.hash("same", { replyTo: "h" }));
    const a = await col.next("h");
    const b = await col.next("h");
    expect((a.payload as any).hash).not.toBe((b.payload as any).hash);
    run(c.randomToken({ replyTo: "t", bytes: 16 }));
    run(c.randomToken({ replyTo: "t" }));
    const t1 = (await col.next("t")).payload as any;
    const t2 = (await col.next("t")).payload as any;
    expect(t1.token).toHaveLength(22);
    expect(t2.token).toHaveLength(43);
    expect(t1.token).not.toBe(t2.token);
  });
  it("cancel(rid) discards the answer", async () => {
    const { plugin, col, run } = setup();
    run(c.hash("x", { replyTo: "h" }));
    plugin.cancel!("r1");
    await new Promise((r) => setTimeout(r, 100));
    expect(col.messages).toEqual([]);
    expect(plugin.stats()).toMatchObject({ inflight: 0, cancelled: 1 });
  });
});
