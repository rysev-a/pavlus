// Pages (module): every GET that is not an API route is a page of the frontend
// (or one of its assets). The handler stays pure: it hands the path to the
// pages plugin and answers whatever comes back with an http respond effect —
// the server render included.

import { httpEffector, type HttpReq } from "@pavlus/backend";
import type { Effect, Message } from "@pavlus/frontend";
import { type ServedPage, pagesEffector } from "../plugins/pages.ts";

export function handle(msg: Message): Effect[] | undefined {
  switch (msg.id) {
    case "pages.show": {
      const req = msg.payload as HttpReq;
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

    // The plugin's answer — html, an asset, an error page — becomes the
    // response as-is.
    case "pages.served": {
      const p = (msg.payload ?? {}) as ServedPage;
      return [
        httpEffector.respond({
          status: p.status,
          headers: p.headers,
          body: p.body,
        }),
      ];
    }

    case "pages.failed": {
      const p = (msg.payload ?? {}) as { message?: string };
      return [
        httpEffector.makeResponse(500, { error: p?.message ?? "page failed" }),
      ];
    }
  }
  return undefined;
}
