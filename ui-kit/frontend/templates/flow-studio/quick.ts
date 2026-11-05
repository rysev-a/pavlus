// The "Quick add" command bar: one line makes a node. `POST /login` is a route,
// `pg select * from users`, `redis INCR rl:{ip}`, `respond 429 {"error":"slow"}`,
// `handler auth.login`, `event click #save` ... Pure: text in, a node description out.
import {
  EFFECTS,
  type FlowNode,
  type NodeKind,
  effectDef,
  msgOfRoute,
} from "./model.ts";

export interface QuickNode {
  kind: NodeKind;
  title: string;
  patch: Partial<FlowNode>;
}

export const QUICK_EXAMPLES = [
  "POST /login",
  "handler auth.login",
  "pg select * from users where id = $1",
  "redis GET cache:{userId}",
  "respond 200 {}",
  "event click #save",
  "state session",
  "log warn rate limited",
];

const METHOD = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|WS)\s+(\/\S*)$/i;

export function parseQuick(input: string): QuickNode | string {
  const text = input.trim();
  if (!text) return "Type what to add, e.g. POST /login or pg select 1.";
  const route = METHOD.exec(text);
  if (route) {
    const title = `${route[1].toUpperCase()} ${route[2]}`;
    return { kind: "route", title, patch: { detail: msgOfRoute(title) } };
  }
  const [head, ...restWords] = text.split(/\s+/);
  const rest = restWords.join(" ");
  const word = head.toLowerCase();
  // an effect type spelled in full: pg.query select 1
  const full = EFFECTS.find((e) => e.type === word);
  if (full)
    return {
      kind: "effect",
      title: full.type,
      patch: { detail: rest || full.detail },
    };
  switch (word) {
    case "event":
    case "ui":
      return rest
        ? { kind: "ui-event", title: rest, patch: {} }
        : "Say the event: event click #save";
    case "fe":
    case "frontend":
    case "onclick":
      return rest
        ? { kind: "fe-handler", title: rest, patch: {} }
        : "Name the frontend handler: fe login";
    case "state":
    case "key":
      return rest
        ? { kind: "fe-state", title: rest, patch: {} }
        : "Name the state key: state session";
    case "handler":
    case "h":
    case "msg":
      return rest
        ? { kind: "handler", title: rest, patch: {} }
        : "Give the message id: handler auth.login";
    case "reply":
      return rest
        ? { kind: "reply", title: rest, patch: {} }
        : "Give the reply id: reply auth.login.found";
    case "error":
    case "fail":
      return rest
        ? { kind: "error", title: rest, patch: {} }
        : "Give the error message id: error auth.failed";
    case "route":
      return METHOD.test(rest)
        ? parseQuick(rest)
        : "A route is METHOD /path, e.g. route GET /items/:id";
    case "pg":
    case "sql":
    case "query":
      return {
        kind: "effect",
        title: "pg.query",
        patch: { detail: rest || effectDef("pg.query")!.detail },
      };
    case "begin":
      return { kind: "effect", title: "pg.tx.begin", patch: {} };
    case "commit":
      return { kind: "effect", title: "pg.tx.commit", patch: {} };
    case "rollback":
      return { kind: "effect", title: "pg.tx.rollback", patch: {} };
    case "redis":
    case "cache":
      return {
        kind: "effect",
        title: "redis.cmd",
        patch: { detail: rest || "GET key" },
      };
    case "fetch":
    case "api":
    case "call":
      return {
        kind: "effect",
        title: "fetch.request",
        patch: { detail: /^[A-Z]+\s/.test(rest) ? rest : `GET ${rest || "https://api.example.com"}` },
      };
    case "timer":
    case "after":
    case "timeout":
      return {
        kind: "effect",
        title: "timer.after",
        patch: { detail: String(Number(rest) || 1000) },
      };
    case "log":
      return {
        kind: "effect",
        title: "log",
        patch: { detail: rest || "info message" },
      };
    case "respond":
    case "http": {
      const m = /^(\d{3})\s*(.*)$/.exec(rest);
      return {
        kind: "effect",
        title: "http.respond",
        patch: { status: m ? Number(m[1]) : 200, detail: m?.[2] || "{}" },
      };
    }
    case "sse":
      return { kind: "effect", title: "http.sse", patch: {} };
    case "ws":
    case "send":
      return { kind: "effect", title: "ws.send", patch: { detail: rest } };
    case "broadcast":
      return {
        kind: "effect",
        title: "ws.broadcast",
        patch: { detail: rest ? `room ${rest}` : "room general" },
      };
    case "hash":
    case "verify":
    case "token": {
      const type =
        word === "hash"
          ? "crypto.hash"
          : word === "verify"
            ? "crypto.verify"
            : "crypto.randomToken";
      return { kind: "effect", title: type, patch: {} };
    }
    case "ext":
    case "external": {
      const w = rest.toLowerCase();
      if (w.startsWith("pg") || w.startsWith("postgres"))
        return { kind: "external", title: "Postgres", patch: { plugin: "pg" } };
      if (w.startsWith("redis"))
        return { kind: "external", title: "Redis", patch: { plugin: "redis" } };
      if (w.startsWith("api") || w.startsWith("fetch") || w.startsWith("third"))
        return {
          kind: "external",
          title: "Third-party API",
          patch: { plugin: "fetch" },
        };
      return { kind: "external", title: "Client", patch: { plugin: "http" } };
    }
  }
  // a word with a dot is taken for a message id, anything else for a handler name
  if (/^[\w-]+(\.[\w-]+)+$/.test(text))
    return { kind: "handler", title: text, patch: {} };
  return `I do not know "${head}". Try: ${QUICK_EXAMPLES.slice(0, 4).join(" · ")}`;
}
