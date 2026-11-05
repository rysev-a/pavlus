import { describe, expect, it } from "vitest";
import { createServerApp } from "../../../src/mod.ts";
import { collector } from "../../../src/testing/mod.ts";
import {
  createMailPlugin,
  mailEffector as mail,
  type Transport,
} from "./mod.ts";

// #region test
/** A transport the test controls: every send waits until the test resolves it. */
function manualTransport() {
  const calls: {
    to: string;
    resolve(id: string): void;
    reject(e: Error): void;
    signal: AbortSignal;
  }[] = [];
  const transport: Transport = (m, signal) =>
    new Promise((resolve, reject) =>
      calls.push({
        to: m.to,
        signal,
        resolve: (id) => resolve({ id }),
        reject,
      }),
    );
  return { transport, calls };
}
const ctx = { rid: "r1", conn: "http" };
const send = (
  p: ReturnType<typeof createMailPlugin>,
  c: ReturnType<typeof collector>,
  to: string,
  rid = "r1",
) =>
  p.handle(
    {
      ...mail.send(to, "hi", "body", { replyTo: "sent", onError: "failed" }),
      ctx: { ...ctx, rid },
    },
    { dispatch: c.dispatch } as any,
  );

describe("mail plugin", () => {
  it("replies to replyTo with the effect's ctx, and to onError on failure", async () => {
    const t = manualTransport();
    const p = createMailPlugin({ transport: t.transport });
    const c = collector();
    send(p, c, "a@x.co");
    send(p, c, "b@x.co");
    t.calls[0]!.resolve("m1");
    t.calls[1]!.reject(new Error("550 no such user"));
    const ok = await c.next("sent");
    expect(ok).toEqual({ id: "sent", payload: { id: "m1" }, ctx });
    const bad = await c.next("failed");
    expect(bad.payload).toMatchObject({
      code: "MAIL",
      message: "550 no such user",
    });
    expect(bad.ctx).toEqual(ctx);
  });

  it("limits concurrency and keeps the rest queued", () => {
    const t = manualTransport();
    const p = createMailPlugin({ transport: t.transport, concurrency: 2 });
    const c = collector();
    for (const to of ["a", "b", "c"]) send(p, c, to);
    expect(t.calls.map((x) => x.to)).toEqual(["a", "b"]);
    expect(p.stats()).toMatchObject({ sending: 2, queued: 1 });
    t.calls[0]!.resolve("1");
    return c
      .next("sent")
      .then(() => new Promise((r) => setTimeout(r, 0)))
      .then(() => expect(t.calls.map((x) => x.to)).toEqual(["a", "b", "c"]));
  });

  it("cancel(rid) aborts what is sending, drops what is queued, and sends no reply", async () => {
    const t = manualTransport();
    const p = createMailPlugin({ transport: t.transport, concurrency: 1 });
    const c = collector();
    send(p, c, "a", "r1");
    send(p, c, "b", "r1"); // queued behind a
    send(p, c, "z", "r2"); // another request: untouched
    p.cancel("r1");
    expect(t.calls[0]!.signal.aborted).toBe(true);
    t.calls[0]!.resolve("late"); // the transport finishes anyway: still no reply for r1
    await new Promise((r) => setTimeout(r, 10));
    expect(c.messages).toEqual([]);
    expect(t.calls.map((x) => x.to)).toEqual(["a", "z"]); // "b" never went out; "z" took its place
    expect(p.stats().cancelled).toBe(2);
  });

  it("stop() refuses new mail (with an answer), closed() waits for the queue", async () => {
    const t = manualTransport();
    const p = createMailPlugin({ transport: t.transport });
    const c = collector();
    send(p, c, "a");
    p.stop();
    send(p, c, "b");
    expect((await c.next("failed")).payload).toMatchObject({ code: "STOPPED" });
    let closed = false;
    void p.closed().then(() => (closed = true));
    await new Promise((r) => setTimeout(r, 10));
    expect(closed).toBe(false); // "a" is still in flight
    t.calls[0]!.resolve("1");
    await p.closed();
    expect(p.stats()).toMatchObject({ sending: 0, queued: 0, sent: 1 });
  });

  it("works inside the runtime: the rid finishing cancels the mail", async () => {
    const t = manualTransport();
    const p = createMailPlugin({ transport: t.transport });
    const server = createServerApp({
      plugins: [p],
      app: (m) =>
        m.id === "go"
          ? [mail.send("a@x.co", "s", "t", { replyTo: "sent" })]
          : [],
      onError: () => {},
    });
    server.dispatch({ id: "go", ctx: { rid: "job1", conn: "job" } });
    expect(t.calls).toHaveLength(1);
    await server.shutdown({ timeoutMs: 20 }); // forced: the mail never completed
    expect(t.calls[0]!.signal.aborted).toBe(true);
  });
});
// #endregion test
