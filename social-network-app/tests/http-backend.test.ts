import { expect, test } from "vitest";
import type { Message } from "@service-laboratory/pavlus";
import { createIdbPlugin, idbEffector } from "../../ui-kit/frontend/idb.ts";
import { createHttpBackend, OFFLINE } from "../frontend/http-backend.ts";

interface Call {
  url: string;
  body: Record<string, unknown>;
}

/** A fake server: records the calls and answers like the contract says. */
function rig(
  answer: (c: Call) => { status?: number; body: unknown } = () => ({
    body: {},
  }),
) {
  const calls: Call[] = [];
  const store = new Map<string, string>();
  const fakeFetch = (async (url: string, init?: RequestInit) => {
    const call = { url, body: init?.body ? JSON.parse(String(init.body)) : {} };
    if (url === "/api/health")
      return new Response('{"ok":true}', { status: 200 });
    calls.push(call);
    const { status = 200, body } = answer(call);
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  const sent: Message[] = [];
  const plugin = createIdbPlugin(
    createHttpBackend({ fetch: fakeFetch, storage }),
  );
  const run = async (
    e: ReturnType<(typeof idbEffector)[keyof typeof idbEffector]>,
  ) => {
    plugin.handle(
      e as never,
      { dispatch: (m: Message) => sent.push(m) } as never,
    );
    await new Promise((r) => setTimeout(r, 0));
  };
  return { calls, sent, run, store };
}

test("load asks the server once for every table and replies like the idb plugin", async () => {
  const r = rig(() => ({ body: { data: { users: [{ id: 1 }], posts: [] } } }));
  await r.run(
    idbEffector.load(
      "orbit",
      ["users", "posts", "session"],
      "loaded",
      "failed",
    ),
  );
  expect(r.calls).toEqual([
    { url: "/api/sync/load", body: { tables: ["users", "posts"] } },
  ]);
  expect(r.sent).toEqual([
    {
      id: "loaded",
      payload: {
        data: { users: [{ id: 1 }], posts: [], session: [] },
        empty: false,
      },
    },
  ]);
});

test("an empty server replies empty: true", async () => {
  const r = rig(() => ({ body: { data: {} } }));
  await r.run(idbEffector.load("orbit", ["users"], "loaded", "failed"));
  expect((r.sent[0].payload as { empty: boolean }).empty).toBe(true);
});

test("put, remove and replaceAll go to /api/sync/*", async () => {
  const r = rig();
  await r.run(idbEffector.put("orbit", "posts", [{ id: 3, text: "hi" }]));
  await r.run(idbEffector.remove("orbit", "posts", [3]));
  await r.run(
    idbEffector.replaceAll(
      "orbit",
      { users: [{ id: 1 }] },
      "persisted",
      "failed",
    ),
  );
  expect(r.calls).toEqual([
    {
      url: "/api/sync/put",
      body: { table: "posts", rows: [{ id: 3, text: "hi" }] },
    },
    { url: "/api/sync/remove", body: { table: "posts", ids: [3] } },
    { url: "/api/sync/replace", body: { data: { users: [{ id: 1 }] } } },
  ]);
  expect(r.sent).toEqual([{ id: "persisted", payload: { rows: 1 } }]);
});

test("empty writes make no request", async () => {
  const r = rig();
  await r.run(idbEffector.put("orbit", "posts", []));
  await r.run(idbEffector.remove("orbit", "posts", []));
  expect(r.calls).toEqual([]);
});

test("the session stays in this browser", async () => {
  const r = rig(() => ({ body: { data: {} } }));
  await r.run(idbEffector.put("orbit", "session", [{ id: 1, userId: 5 }]));
  await r.run(
    idbEffector.load("orbit", ["users", "session"], "loaded", "failed"),
  );
  expect(
    (r.sent[0].payload as { data: { session: unknown[] } }).data.session,
  ).toEqual([{ id: 1, userId: 5 }]);
  await r.run(idbEffector.remove("orbit", "session", [1]));
  await r.run(
    idbEffector.replaceAll(
      "orbit",
      { session: [{ id: 1, userId: 2 }], users: [] },
      "ok",
      "failed",
    ),
  );
  expect(r.calls.map((c) => c.url)).toEqual([
    "/api/sync/load",
    "/api/sync/replace",
  ]);
  expect(r.calls[1].body).toEqual({ data: { users: [] } });
  expect(r.store.get("orbit:session")).toBe('[{"id":1,"userId":2}]');
});

test("a server error reaches onError with its text", async () => {
  const r = rig(() => ({
    status: 400,
    body: { error: "posts.text is required" },
  }));
  await r.run(idbEffector.put("orbit", "posts", [{ id: 1 }], "failed"));
  expect(r.sent).toEqual([{ id: "failed", payload: "posts.text is required" }]);
});

test("an unreachable server is reported as offline", async () => {
  const down = (async () => {
    throw new TypeError("fetch failed");
  }) as typeof fetch;
  const sent: Message[] = [];
  const plugin = createIdbPlugin(
    createHttpBackend({ fetch: down, storage: null }),
  );
  plugin.handle(
    idbEffector.load("orbit", ["users"], "loaded", "failed") as never,
    {
      dispatch: (m: Message) => sent.push(m),
    } as never,
  );
  await new Promise((r) => setTimeout(r, 0));
  expect(sent).toEqual([{ id: "failed", payload: OFFLINE }]);
});
