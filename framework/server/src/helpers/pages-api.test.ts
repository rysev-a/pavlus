// The pages route-helper: what its three handlers answer for the messages the
// routes table and the pages plugin produce.
import { expect, test } from "vitest";
import type { Message } from "@pavlus/core";
import { PagesAPI } from "./pages-api.ts";

/** Calls the method named like the message (what the module dispatch does). */
const answer = (api: PagesAPI, msg: Message) =>
  (api as unknown as Record<string, (m: Message) => unknown>)[msg.id]!(msg);

test("pages.show: an api path answers 404 json, a page goes to the plugin", () => {
  const api = new PagesAPI();

  const nope = answer(api, {
    id: "pages.show",
    payload: { path: "/api/nope", query: {} },
  }) as { json: unknown; status: number }[];
  expect(nope[0]?.status).toBe(404);
  expect(nope[0]?.json).toEqual({ error: "no route for /api/nope" });

  const page = answer(api, {
    id: "pages.show",
    payload: { path: "/3/edit", query: {} },
  }) as { plugin: string; type: string; path: string; search: string }[];
  expect(page).toEqual([
    {
      plugin: "pages",
      type: "serve",
      path: "/3/edit",
      search: "",
      replyTo: "pages.served",
      onError: "pages.failed",
    },
  ]);

  // the query string is rebuilt, arrays included
  const withQuery = answer(api, {
    id: "pages.show",
    payload: { path: "/", query: { a: "1", b: ["x", "y"] } },
  }) as { search: string }[];
  expect(withQuery[0]?.search).toBe("?a=1&b=x&b=y");
});

test("pages.served: the plugin's answer becomes the response as-is", () => {
  const api = new PagesAPI();
  const effects = answer(api, {
    id: "pages.served",
    payload: {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
      body: "<html></html>",
    },
  }) as { plugin: string; type: string; status: number; body: string }[];
  expect(effects).toEqual([
    {
      plugin: "http",
      type: "respond",
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
      body: "<html></html>",
    },
  ]);
});

test("pages.failed: answers 500 with the message", () => {
  const api = new PagesAPI();
  const effects = answer(api, {
    id: "pages.failed",
    payload: { code: "pages_error", message: "boom" },
  }) as { status: number; json: unknown }[];
  expect(effects[0]?.status).toBe(500);
  expect(effects[0]?.json).toEqual({ error: "boom" });
});
