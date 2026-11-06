// The API as a fetch, for the server render: the same pure application the
// http flow runs, executed here in-process — routing, db effects over the
// shared pool (the real pg plugin), and the http respond effect turned into a
// Response. No socket, no second implementation of the API: what the browser
// gets over the wire is what the render gets.

import {
  applyRequestsEffect,
  createPostgresPlugin,
  dispatchRoute,
  newRid,
  normalizeRespond,
  type RespondEffect,
  type RouteTable,
  type Router,
  type ServerState,
  toRouter,
} from "@pavlus/backend";
import type pg from "pg";
import type { Effect, Message } from "@pavlus/frontend";
import type { AdminApp } from "./app.ts";

type PgEffect = Parameters<
  ReturnType<typeof createPostgresPlugin>["handle"]
>[0];
type PgHandle = ReturnType<typeof createPostgresPlugin>["handle"];

/** The reply of one pg effect, awaited. */
function pgReply(
  handle: PgHandle,
  effect: Effect,
): Promise<Message | undefined> {
  return new Promise((resolve) => {
    let settled = false;
    handle(
      effect as PgEffect,
      {
        dispatch: (m: Message) => {
          if (!settled && m) {
            settled = true;
            resolve(m);
          }
        },
      } as Parameters<PgHandle>[1],
    );
  });
}

/** A respond effect as a fetch Response (the flow's answer, verbatim). */
function toResponse(e: Effect, method: string): Response {
  const r = normalizeRespond(e as RespondEffect, {}, { method });
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(r.headers)) {
    if (k === "content-length" || k === "transfer-encoding") continue;
    headers[k] = Array.isArray(v) ? v.join(", ") : v;
  }
  const body = r.body ? new Uint8Array(r.body) : null;
  return new Response(body, { status: r.status, headers });
}

/**
 * `createFlowFetch(app, routes, pool)`: a fetch that runs the app. One fetch
 * is one request: its own rid, its own request slice, the same message ids.
 */
export function createFlowFetch(
  app: AdminApp,
  routes: RouteTable | Router,
  pool: pg.Pool,
): typeof fetch {
  const router = toRouter(routes);
  const pg = createPostgresPlugin({ pool });
  return async (input, init) => {
    const url = new URL(String(input), "http://ssr.local");
    let body: unknown;
    if (typeof init?.body === "string") {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = undefined;
      }
    }
    const method = init?.method ?? "GET";
    const rid = newRid();
    const ctx = { rid, conn: "ssr" };
    let state: ServerState = { requests: { [rid]: {} }, shared: {} };

    // Route the synthetic request; 404/405/OPTIONS answer themselves.
    const routed = dispatchRoute(router, {
      id: "http.request",
      payload: {
        method,
        path: url.pathname,
        query: Object.fromEntries(url.searchParams),
        body,
      },
      ctx,
    });
    const queue: Message[] = [];
    if ("effects" in routed)
      return toResponse(
        routed.effects.find((e) => e.plugin === "http") ?? routed.effects[0]!,
        method,
      );
    queue.push(routed.message);

    // Run the flow: effects out, pg replies and continuations back in, until
    // an http respond effect answers the request.
    for (let guard = 0; guard < 200 && queue.length > 0; guard++) {
      const msg = queue.shift()!;
      const effects = app(msg, state) ?? [];
      for (const e of effects) {
        state = applyRequestsEffect(state, e);
        if (e.plugin === "pg") {
          const reply = await pgReply(pg.handle, e);
          if (reply) queue.push(reply);
        } else if (e.plugin === "http" && e.type === "respond")
          return toResponse(e, method);
        else if (e.plugin === "requests" && e.type === "dispatch") {
          const d = e as unknown as { message: Message };
          queue.push({ ...d.message, ctx: d.message.ctx ?? ctx });
        }
      }
    }
    return new Response(
      JSON.stringify({ error: "ssr: the flow ended without a response" }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  };
}
