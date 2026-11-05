// The app shown on the front page of the README (the code between the
// markers is copied there verbatim; readme-app.test.ts keeps it honest).
// #region app
import type { Effect, Message } from "@service-laboratory/pavlus";
import {
  httpEffector as http,
  logEffector as log,
  pgEffector as pg,
  redisEffector as redis,
  requestsEffector as rq,
  sql,
  type ServerState,
} from "../../src/mod.ts";

export const routes = { "GET /users/:id": "user.get" };
const ask = (replyTo: string) => ({ replyTo, onError: "failed" });

export const app = (msg: Message, state: ServerState): Effect[] => {
  const p = msg.payload as any;
  const mine = state.requests[msg.ctx?.rid as string] as any;
  switch (msg.id) {
    case "user.get":
      return [
        pg.query(
          sql`select * from users where id = ${p.params.id}`,
          ask("loaded"),
        ),
      ];
    case "loaded":
      return p.rows[0]
        ? [
            rq.set("user", p.rows[0]),
            redis.incr(`views:${p.rows[0].id}`, ask("counted")),
          ]
        : [http.json({ error: "not found" }, 404)];
    case "counted":
      return [http.json({ ...mine.user, views: p })];
    case "failed":
      return [
        log.error("dependency failed", { error: p }),
        http.json({ error: "unavailable" }, 503),
      ];
  }
  return [];
};
// #endregion app
