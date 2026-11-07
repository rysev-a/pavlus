import { connectWs, request, type WsTestClient } from "@pavlus/backend/testing";
import {
  reseedDatabase,
  type StartedServer,
  startServer,
} from "../backend/server.ts";

export interface Backend {
  /** `METHOD url` of every request the tests made. */
  requests: string[];
  /** The app's relative urls (`/api/users`), sent to this server. */
  fetch: typeof fetch;
  /** Login helper: returns the Set-Cookie header's value for the user. */
  login(email: string): Promise<string>;
  /** `fetch` with a member's cookie. */
  as(cookie: string): typeof fetch;
  /** A ws at /ws with the member's cookie; resolves at the `welcome`. */
  chat(cookie: string): Promise<WsTestClient>;
  /** Pop the notification queue until empty. */
  drainNotifications(): Promise<void>;
  /** Back to the demo world (seed.ts). */
  reseed(): Promise<void>;
  close(): Promise<void>;
}

/**
 * The real API (backend/server.ts on @pavlus/backend, API only) on a free
 * port, over the real Postgres and Redis (`docker-compose.yml`), reseeded.
 * No fakes: what the tests see is what the browser sees.
 */
export async function startBackend(): Promise<Backend> {
  const started: StartedServer = startServer(0, {
    quiet: true,
    frontend: "none",
  });
  await started.listening();
  await started.subscribed();
  const base = `http://127.0.0.1:${started.port()}`;
  const requests: string[] = [];
  const nodeFetch = globalThis.fetch;

  const raw = async (
    url: string,
    init: RequestInit = {},
  ): Promise<Response> => {
    requests.push(`${init.method ?? "GET"} ${url}`);
    return nodeFetch(base + url, init);
  };

  const login = async (email: string): Promise<string> => {
    const r = await request(base, {
      method: "POST",
      path: "/api/auth/login",
      body: { email, password: "teamup123" },
    });
    const set = String(r.headers["set-cookie"]);
    return set.slice(0, set.indexOf(";"));
  };

  const as = (cookie: string): typeof fetch =>
    ((url: string, init: RequestInit = {}) =>
      raw(url, {
        ...init,
        headers: { cookie, ...(init.headers ?? {}) },
      })) as typeof fetch;

  const chat = async (cookie: string): Promise<WsTestClient> => {
    const ws = await connectWs(base, "/ws", { headers: { cookie } });
    const welcome = JSON.parse(String((await ws.next()).data));
    if (welcome.type !== "welcome") throw new Error("no welcome frame");
    return ws;
  };

  const reseed = reseedDatabase;

  return {
    requests,
    fetch: raw as typeof fetch,
    login,
    as,
    chat,
    drainNotifications: () => started.drainNotifications(),
    reseed,
    close: () => started.close(),
  };
}
