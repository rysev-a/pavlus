// Pages (module): a class whose methods are the handlers of the messages with
// those ids. Every GET that is not an API route is a page of the frontend (or
// one of its assets). The handler stays pure: it hands the path to the pages
// plugin and answers whatever comes back with an http respond effect — the
// server render included.

import {
  httpEffector,
  type HttpReq,
  pagesEffector,
  type ServedPage,
} from "@pavlus/backend";
import type { Effect, Message } from "@pavlus/core";

export class PagesAPI {
  "pages.show"(message: Message): Effect[] {
    const req = message.payload as HttpReq;
    if (req.path.startsWith("/api/"))
      return [
        httpEffector.makeResponse(404, { error: `no route for ${req.path}` }),
      ];
    const search = new URLSearchParams(
      Object.entries(req.query).flatMap(([k, v]) =>
        Array.isArray(v) ? v.map((x) => [k, x]) : [[k, v]],
      ) as [string, string][],
    ).toString();
    return [pagesEffector.serve(req.path, search ? `?${search}` : "")];
  }

  /**
   * The plugin's answer — html, an asset, an error page — becomes the
   * response as-is.
   */
  "pages.served"(message: Message): Effect[] {
    const p = (message.payload ?? {}) as ServedPage;
    return [
      httpEffector.respond({
        status: p.status,
        headers: p.headers,
        body: p.body,
      }),
    ];
  }

  "pages.failed"(message: Message): Effect[] {
    const p = (message.payload ?? {}) as { message?: string };
    return [
      httpEffector.makeResponse(500, { error: p?.message ?? "page failed" }),
    ];
  }
}
