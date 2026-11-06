import { expect, test } from "vitest";
import { idbEffector } from "../../../framework/ui-kit/frontend/idb.ts";
import {
  createHttpBackend,
  createHttpBackendPlugin,
  OFFLINE,
} from "../frontend/http-backend.ts";

interface Call {
  url: string;
  body: unknown;
}

/** A fake server: records the calls, answers by path. */
function fake(
  answer: (
    path: string,
    body: any,
  ) => { status?: number; body: unknown } | "down",
) {
  const calls: Call[] = [];
  const fetch = (async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, body });
    const r = answer(url.replace("/api", ""), body);
    if (r === "down") throw new TypeError("fetch failed");
    return new Response(JSON.stringify(r.body), {
      status: r.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof globalThis.fetch;
  return { calls, fetch };
}

/** Runs one effect on the plugin and collects the messages it dispatches. */
function run(
  effect: ReturnType<typeof idbEffector.load>,
  fetch: typeof globalThis.fetch,
) {
  const plugin = createHttpBackendPlugin({ fetch });
  return new Promise<{ id: string; payload: any }[]>((resolve) => {
    const got: { id: string; payload: any }[] = [];
    plugin.handle(effect, { dispatch: (m: any) => got.push(m) } as any);
    setTimeout(() => resolve(got), 30);
  });
}

test("load posts the tables and replies Loaded with the rows", async () => {
  const s = fake(() => ({ body: { data: { users: [{ id: 1 }], roles: [] } } }));
  const out = await run(
    idbEffector.load("db", ["users", "roles"], "ok", "bad"),
    s.fetch,
  );
  expect(s.calls).toEqual([
    { url: "/api/sync/load", body: { tables: ["users", "roles"] } },
  ]);
  expect(out).toEqual([
    {
      id: "ok",
      payload: { data: { users: [{ id: 1 }], roles: [] }, empty: false },
    },
  ]);
});

test("load of an empty database says empty; a missing table is empty", async () => {
  const s = fake(() => ({ body: { data: { users: [] } } }));
  const out = await run(
    idbEffector.load("db", ["users", "roles"], "ok", "bad"),
    s.fetch,
  );
  expect(out[0].payload).toEqual({
    data: { users: [], roles: [] },
    empty: true,
  });
});

test("put and remove post to the sync endpoints and are silent on success", async () => {
  const s = fake(() => ({ body: { saved: 1 } }));
  expect(
    await run(idbEffector.put("db", "roles", [{ id: 5 }], "bad"), s.fetch),
  ).toEqual([]);
  expect(
    await run(idbEffector.remove("db", "roles", [5, 6], "bad"), s.fetch),
  ).toEqual([]);
  expect(s.calls).toEqual([
    { url: "/api/sync/put", body: { table: "roles", rows: [{ id: 5 }] } },
    { url: "/api/sync/remove", body: { table: "roles", ids: [5, 6] } },
  ]);
});

test("a rejected put reports the server's message to onError", async () => {
  const s = fake(() => ({
    status: 400,
    body: { error: "roles.name is required" },
  }));
  const out = await run(
    idbEffector.put("db", "roles", [{ id: 5 }], "bad"),
    s.fetch,
  );
  expect(out).toEqual([{ id: "bad", payload: "roles.name is required" }]);
});

test("replaceAll posts the data and replies with the number of rows", async () => {
  const s = fake(() => ({ body: { rows: 3 } }));
  const data = { users: [{ id: 1 }, { id: 2 }], roles: [{ id: 1 }] };
  const out = await run(
    idbEffector.replaceAll("db", data, "ok", "bad"),
    s.fetch,
  );
  expect(s.calls).toEqual([{ url: "/api/sync/replace", body: { data } }]);
  expect(out).toEqual([{ id: "ok", payload: { rows: 3 } }]);
});

test("a server that cannot be reached is reported as offline", async () => {
  const s = fake(() => "down");
  const out = await run(
    idbEffector.load("db", ["users"], "ok", "bad"),
    s.fetch,
  );
  expect(out).toEqual([{ id: "bad", payload: OFFLINE }]);
});

test("a server error without a message says the status; a bad reply is an error", async () => {
  const backend = createHttpBackend({
    fetch: (async () =>
      new Response("<html>", { status: 500 })) as unknown as typeof fetch,
  });
  await expect(backend.load("db", ["users"])).rejects.toThrow(/500/);
  const odd = createHttpBackend({
    fetch: (async () =>
      new Response("{}", { status: 200 })) as unknown as typeof fetch,
  });
  await expect(odd.load("db", ["users"])).rejects.toThrow(/no data/);
});
