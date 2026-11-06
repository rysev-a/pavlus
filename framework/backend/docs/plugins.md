# Writing a plugin

A plugin is an object. It owns a piece of the outside world and a family of effects; it turns effects into I/O and I/O into messages. It never calls the app and never reads application state.

```ts
interface ServerPlugin {
  readonly name: string; // the `plugin` field of its effects
  init?(ctx: PluginContext): void; // once, when the server is created
  handle(effect, ctx: PluginContext): void; // once per effect
  cancel?(rid: string): void; // the request is over: abandon its work
  stop?(): void; // shutdown: stop accepting (must not block)
  closed?(): Promise<void>; // resolves when everything is released
  dispose?(): void; // last: tear down, synchronously
  onState?(state, ctx): void; // optional, state changed
}
```

`ctx.dispatch(message)` is the only way back into the app. It is safe to call from any callback, at any time; the runtime wraps it so an exception in the app never reaches the plugin.

## The contract

1. **Effects in.** `handle(effect, ctx)` is called synchronously from the dispatch loop, so it must return fast: start the I/O and return. Never `await` inside `handle` (an `async` helper whose promise you attach callbacks to is fine). An exception thrown from `handle` is caught by the runtime and turned into the effect's `onError` message (or `request.error`), so throw for programmer errors, reply for operational ones.
2. **Replies carry the effect's ctx.** This is the whole mechanism by which a flow continues with the same `rid`. Use the helpers of `ctx.ts`, never hand-build the message:

   ```ts
   deliver(ctx.dispatch, ok(effect, payload)); // success: to effect.replyTo (nothing if it has none)
   deliver(ctx.dispatch, fail(effect, err, "mail.error")); // failure: to effect.onError, else to the fallback id
   ctx.dispatch(reply(effect, { id: "mail.bounced", payload })); // any other message, same ctx
   ```

   `fail` accepts an `Error`, a string or a `{ code, message }` and normalises it to `{ code, message, ... }`. Always pass a **fallback id** named `<plugin>.error` so a failure of an effect that named no `onError` still reaches the app (where a catch-all can log it) instead of disappearing. Document your error `code`s: they are part of the plugin's API.

3. **Effects may be fire-and-forget.** No `replyTo` means "no success message": `ok()` returns `undefined` and `deliver` skips it.
4. **`cancel(rid)`: forget the request.** When a request ends (finished, client gone, deadline, shutdown) the runtime calls `cancel(rid)` on every plugin that received an effect for it. Release what the rid holds (abort the `AbortController`, clear the timer, drop the queued command, roll back the transaction), and **send no reply**: a reply after `cancel` is discarded by the runtime anyway, but the point is not to do the work. Track in-flight work by `ridOf(effect)`; effects without a rid (system effects) are never cancelled. `cancel` must be idempotent and must not throw.
5. **`stop()`, `closed()`, `dispose()`: shutdown.** `server.shutdown()` calls `stop()` on every plugin in reverse order (listener plugins stop accepting; do not drop what is in flight), waits for the in-flight requests, then `dispose()`s in reverse order and awaits `closed()` (max 2 s). `stop()` must not block; `closed()` resolves when the plugin holds no more sockets, timers or pool clients (`Promise.resolve()` if it holds nothing); `dispose()` is synchronous and final (abort whatever is left).
6. **No leaks, observable.** Expose `stats()`/`metrics()` with the counts that must return to zero when the server is idle (in-flight, timers, open transactions, subscriptions). The e2e tests assert them after every scenario.
7. **Effects are data; add a builder.** Ship `xEffector` with typed builders, so apps write `mail.send(...)` and tests can match `{ plugin: "mail", type: "send" }`. Effects are plain, serialisable objects (a function in an effect cannot be traced or replayed).
8. **Mind the rid you reply with.** A plugin that originates messages without an effect (the http server accepting a connection, cron firing, a Redis subscription delivering) must mint or reuse a ctx: `{ rid: newRid(), conn: "..." }`. A subscription delivers with the _subscribing effect's_ ctx, so the message lands in the request that asked, and is cancelled with it.

## A worked example: `mail.send`

The whole plugin (`docs/examples/mailer/mod.ts`; it is compiled and tested with the docs). It queues mails, sends at most `concurrency` at once through an injected `transport`, and supports cancellation and shutdown:

```ts
export type MailEffect = {
  plugin: "mail";
  type: "send";
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
  onError?: string;
  ctx?: EffectCtx;
};

export type Transport = (
  mail: { to: string; subject: string; text: string },
  signal: AbortSignal,
) => Promise<{ id: string }>;

export function createMailPlugin(o: {
  transport: Transport;
  concurrency?: number;
}): MailPlugin {
  const max = o.concurrency ?? 2;
  const queue: Job[] = [];
  const byRid = new Map<string, Set<Job>>();
  let sending = 0,
    sent = 0,
    cancelled = 0,
    stopped = false;
  let idle: (() => void) | undefined;

  const pump = () => {
    while (sending < max && queue.length) {
      const job = queue.shift()!;
      sending++;
      o.transport(job.effect, job.ac.signal)
        .then(
          (r) =>
            !job.ac.signal.aborted &&
            deliver(job.ctx.dispatch, ok(job.effect, r)),
          (e) =>
            !job.ac.signal.aborted &&
            deliver(
              job.ctx.dispatch,
              fail(
                job.effect,
                { code: "MAIL", message: String(e?.message ?? e) },
                "mail.error",
              ),
            ),
        )
        .finally(() => {
          sending--;
          sent++;
          byRid.get(ridOf(job.effect)!)?.delete(job);
          pump();
          if (!sending && !queue.length) idle?.();
        });
    }
  };

  return {
    name: "mail",
    handle(effect, ctx) {
      if (stopped)
        return deliver(
          ctx.dispatch,
          fail(
            effect,
            { code: "STOPPED", message: "mailer is stopping" },
            "mail.error",
          ),
        );
      const job = { effect, ctx, ac: new AbortController() };
      // ... register under ridOf(effect), queue.push(job), pump()
    },
    cancel(rid) {
      /* abort in-flight, drop queued, count; no reply */
    },
    stop() {
      stopped = true;
    },
    closed: () =>
      sending || queue.length
        ? new Promise<void>((r) => (idle = r))
        : Promise.resolve(),
    dispose() {
      stopped = true;
      for (const job of queue) job.ac.abort();
      queue.length = 0;
    },
    stats: () => ({ queued: queue.length, sending, sent, cancelled }),
  };
}
```

Use it from a handler like any other plugin:

```ts
case "user.signup.created":
  return [mail.send(user.email, "Welcome", "...", { replyTo: "welcome.sent", onError: "welcome.failed" }), http.json({ user }, 201)];
```

Two design choices to notice: the transport is injected (so the plugin is tested without SMTP, and the app test never sees it), and the `job.ac.signal.aborted` guard in `.then` is what makes "cancel sends no reply" true even when the transport ignores the signal and finishes anyway.

## A plugin of the box: `pages`

`src/plugins/pages` is a real plugin written exactly this way — worth reading next to the mailer. It serves a frontend (one effect: `pages.serve(path, search)`, one reply: `pages.served` with the whole `{status, headers, body}`) and shows two patterns the mailer does not:

- **The plugin owns a mode, the app owns the rendering.** `dev` boots Vite in middleware mode (writing into a buffer that stands in for the response — the bytes go back as the one reply, so the flow keeps its `rid`), `dist` serves the build, `none` answers 404 json. The _document_ — the server render through `@pavlus/frontend` — is injected as a `document({ template, frontend, path, search })` option, because everything that imports the frontend package stays in the app; the plugin only serves.
- **A failure of the render is an answer, not an error.** A `document` hook that throws is logged and the plain template is served (200 — the app still renders in the browser); only a failure of serving itself reaches `pages.failed`.

See [its README](../src/plugins/pages/README.md) for the fields and the modes.

## Testing a plugin

A plugin needs no runtime to be tested: give it an effect and a `collector()` (a dispatcher that records messages and lets you `await next("id")`). Make the I/O controllable from the test (here a transport you resolve by hand), so there are no sleeps and no flakiness:

```ts
/** A transport the test controls: every send waits until the test resolves it. */
function manualTransport() {
  const calls = [];
  const transport = (m, signal) =>
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

it("replies to replyTo with the effect's ctx, and to onError on failure", async () => {
  const t = manualTransport();
  const p = createMailPlugin({ transport: t.transport });
  const c = collector();
  send(p, c, "a@x.co");
  send(p, c, "b@x.co");
  t.calls[0].resolve("m1");
  t.calls[1].reject(new Error("550 no such user"));
  expect(await c.next("sent")).toEqual({
    id: "sent",
    payload: { id: "m1" },
    ctx,
  });
  expect((await c.next("failed")).payload).toMatchObject({
    code: "MAIL",
    message: "550 no such user",
  });
});

it("cancel(rid) aborts what is sending, drops what is queued, and sends no reply", async () => {
  // concurrency 1: "a" sending, "b" queued (both rid r1), "z" queued (rid r2)
  p.cancel("r1");
  expect(t.calls[0].signal.aborted).toBe(true);
  t.calls[0].resolve("late"); // the transport finishes anyway: still no reply for r1
  expect(c.messages).toEqual([]);
  expect(t.calls.map((x) => x.to)).toEqual(["a", "z"]); // "b" never went out
});
```

The full file also tests concurrency limiting, `stop()` + `closed()`, and the plugin inside the real runtime (`createServerApp({ plugins: [p], app })`: when the request's rid finishes, the runtime calls `cancel`). What to cover for any plugin: a reply carries the ctx; an error reaches `onError` and, without one, the fallback id; `cancel` sends nothing and frees everything; the counters return to zero; `stop`/`closed`/`dispose` leave nothing running.

For plugins against a real service (`pg`, `redis`) the repository's tests run against the real thing in a throwaway schema / a throwaway `redis-server` and skip themselves when it is not there (`postgres.test.ts`, `redis.test.ts`); the _app_ never needs that.
