// Builders for the effects of the http plugin, so handlers do not repeat
// `{ plugin: "http", type: ... }`. Pure data in, pure data out.
import type { HttpEffect } from "./mod.ts";
import type { RespondEffect } from "./respond.ts";

type Of<T extends HttpEffect["type"]> = Extract<HttpEffect, { type: T }>;
type Rest<T extends HttpEffect["type"]> = Omit<Of<T>, "plugin" | "type">;

export interface HttpEffector {
  /** `httpEffector.respond({ status: 201, json: { id } })` */
  respond(o: Omit<RespondEffect, "plugin" | "type">): Of<"respond">;
  /** `httpEffector.makeResponse(201, { id })` — status first, body optional. */
  makeResponse(status: number, body?: unknown): Of<"respond">;
  json(body: unknown, status?: number, extra?: Rest<"respond">): Of<"respond">;
  text(body: string, status?: number): Of<"respond">;
  redirect(url: string, status?: number): Of<"respond">;
  header(name: string, value: string): Of<"header">;
  close(): Of<"close">;
  streamStart(o?: Rest<"stream.start">): Of<"stream.start">;
  streamChunk(data: string | Uint8Array): Of<"stream.chunk">;
  streamEnd(): Of<"stream.end">;
  sseStart(o?: Rest<"sse.start">): Of<"sse.start">;
  sseSend(data: unknown, o?: Omit<Rest<"sse.send">, "data">): Of<"sse.send">;
  sseEnd(): Of<"sse.end">;
  file(path: string, o?: Omit<Rest<"file">, "path">): Of<"file">;
}

export const httpEffector: HttpEffector = {
  respond: (o) => ({ plugin: "http", type: "respond", ...o }),
  makeResponse: (status, body) =>
    body === undefined
      ? { plugin: "http", type: "respond", status }
      : { plugin: "http", type: "respond", status, json: body },
  json: (body, status, extra) => ({
    plugin: "http",
    type: "respond",
    ...extra,
    ...(status !== undefined && { status }),
    json: body,
  }),
  text: (body, status) => ({
    plugin: "http",
    type: "respond",
    ...(status !== undefined && { status }),
    text: body,
  }),
  redirect: (url, status) => ({
    plugin: "http",
    type: "respond",
    redirect: status === undefined ? url : { url, status },
  }),
  header: (name, value) => ({ plugin: "http", type: "header", name, value }),
  close: () => ({ plugin: "http", type: "close" }),
  streamStart: (o = {}) => ({ plugin: "http", type: "stream.start", ...o }),
  streamChunk: (data) => ({ plugin: "http", type: "stream.chunk", data }),
  streamEnd: () => ({ plugin: "http", type: "stream.end" }),
  sseStart: (o = {}) => ({ plugin: "http", type: "sse.start", ...o }),
  sseSend: (data, o = {}) => ({ plugin: "http", type: "sse.send", data, ...o }),
  sseEnd: () => ({ plugin: "http", type: "sse.end" }),
  file: (path, o = {}) => ({ plugin: "http", type: "file", path, ...o }),
};
