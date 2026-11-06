// Real-socket tests for the raw transport: the claims that matter are the
// ones node:http used to make for us — framing, keep-alive, pipelining in
// order, limits and honest refusals.
import { connect, type Socket } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import type { Effect, Message, Plugin } from "@service-laboratory/pavlus";
import { createServerApp, type ServerPlugin } from "../../runtime.ts";
import { request } from "../../testing/net.ts";
import { createRawHttpServerPlugin, type RawHttpServerPlugin } from "./raw.ts";

type Handler = (m: Message, state: any) => Effect[];
const respond = (ctx: unknown, e: Record<string, unknown>): Effect => ({
  plugin: "http",
  type: "respond",
  ctx: ctx as never,
  ...e,
});

/** Echoes method/path/query/body back, so framing bugs show up in the data. */
const echo: Handler = (m) => {
  if (m.id !== "http.request") return [];
  const p = m.payload as Record<string, unknown>;
  return [
    respond(m.ctx, {
      json: {
        method: p.method,
        path: p.path,
        query: p.query,
        body: p.body,
      },
    }),
  ];
};
const silent: Handler = () => []; // never answers: for abort/cancel tests

const open: { shutdown(): Promise<unknown> }[] = [];
afterEach(async () => {
  await Promise.all(open.splice(0).map((a) => a.shutdown()));
});

async function boot(
  app: Handler,
  opts: Parameters<typeof createRawHttpServerPlugin>[0] = {},
  onMsg?: (m: Message) => void,
): Promise<{ http: RawHttpServerPlugin; port: number }> {
  const http = createRawHttpServerPlugin({
    port: 0,
    host: "127.0.0.1",
    ...opts,
  });
  const server = createServerApp({
    plugins: [http],
    onError: () => {},
    app: (m: Message, s: any) => {
      onMsg?.(m);
      return app(m, s);
    },
  });
  open.push(server);
  const a = await http.listening();
  return { http, port: a.port };
}

// ---------------------------------------------------------- raw client ----

interface Parsed {
  status: number;
  headers: Record<string, string | string[]>;
  body: Buffer;
}

/** Collects `n` complete responses (100-continue frames skipped). */
function readResponses(
  sock: Socket,
  n: number,
  o: { method?: string } = {},
): Promise<Parsed[]> {
  return new Promise((res, rej) => {
    let buf = Buffer.alloc(0);
    const out: Parsed[] = [];
    const t = setTimeout(
      () => rej(new Error(`raw client: got ${out.length}/${n} responses`)),
      5000,
    );
    const parse = (): void => {
      for (;;) {
        const i = buf.indexOf("\r\n\r\n");
        if (i < 0) return;
        const lines = buf.subarray(0, i).toString("latin1").split("\r\n");
        const status = Number(lines[0]!.split(" ")[1]);
        const headers: Record<string, string | string[]> = {};
        for (const line of lines.slice(1)) {
          const c = line.indexOf(":");
          const k = line.slice(0, c).trim().toLowerCase();
          const v = line.slice(c + 1).trim();
          const prev = headers[k];
          headers[k] =
            prev === undefined
              ? v
              : Array.isArray(prev)
                ? [...prev, v]
                : [prev, v];
        }
        if (status === 100) {
          // interim answer, keep reading
          buf = buf.subarray(i + 4);
          continue;
        }
        // HEAD answers carry the length but never the bytes
        const len =
          o.method === "HEAD" ? 0 : Number(headers["content-length"] ?? 0);
        if (buf.length < i + 4 + len) return;
        const body = Buffer.from(buf.subarray(i + 4, i + 4 + len));
        buf = buf.subarray(i + 4 + len);
        out.push({ status, headers, body });
        if (out.length === n) {
          clearTimeout(t);
          sock.removeListener("data", onData);
          return res(out);
        }
      }
    };
    const onData = (c: Buffer): void => {
      buf = buf.length ? Buffer.concat([buf, c]) : Buffer.from(c);
      parse();
    };
    sock.on("data", onData);
    sock.on("error", (e) => {
      clearTimeout(t);
      rej(e);
    });
    sock.on("close", () => {
      clearTimeout(t);
      out.length === n ? res(out) : rej(new Error("socket closed early"));
    });
  });
}

const get = (path: string, extra: Record<string, string> = {}): string =>
  [
    `GET ${path} HTTP/1.1`,
    "Host: x",
    ...Object.entries(extra).map(([k, v]) => `${k}: ${v}`),
    "",
    "",
  ].join("\r\n");

function connectTo(port: number): Promise<Socket> {
  return new Promise((res, rej) => {
    const s = connect(port, "127.0.0.1", () => res(s));
    s.on("error", rej);
  });
}

// ------------------------------------------------------------- tests ------

describe("raw transport", () => {
  it("answers a GET with json, request id and keep-alive", async () => {
    const { port } = await boot(echo);
    const r = await request({ port, host: "127.0.0.1" }, { path: "/a?x=1" });
    expect(r.status).toBe(200);
    expect(r.json).toEqual({
      method: "GET",
      path: "/a",
      query: { x: "1" },
    });
    expect(r.headers["x-request-id"]).toMatch(/./);
    expect(Number(r.headers["content-length"])).toBe(r.body.length);
    expect(r.headers["connection"]).not.toBe("close");
  });

  it("reads a body by content-length framing", async () => {
    const { port } = await boot(echo);
    const r = await request(
      { port, host: "127.0.0.1" },
      {
        method: "POST",
        path: "/echo",
        body: { hello: [1, 2] },
      },
    );
    expect(r.json).toMatchObject({ method: "POST", body: { hello: [1, 2] } });
  });

  it("serves many requests on one keep-alive socket", async () => {
    const { http, port } = await boot(echo);
    const sock = await connectTo(port);
    const done = readResponses(sock, 3);
    sock.write(get("/one"));
    await new Promise((r) => setTimeout(r, 30));
    sock.write(get("/two"));
    await new Promise((r) => setTimeout(r, 30));
    sock.write(get("/three"));
    const out = await done;
    expect(out.map((x) => JSON.parse(x.body.toString()).path)).toEqual([
      "/one",
      "/two",
      "/three",
    ]);
    expect(http.stats().sockets).toBe(1); // one connection, three requests
    sock.end();
  });

  it("answers pipelined requests in order", async () => {
    const { port } = await boot(echo);
    const sock = await connectTo(port);
    const done = readResponses(sock, 2);
    sock.write(get("/first") + get("/second")); // one write, two requests
    const out = await done;
    expect(out.map((x) => JSON.parse(x.body.toString()).path)).toEqual([
      "/first",
      "/second",
    ]);
    sock.end();
  });

  it("reassembles headers split across packets", async () => {
    const { port } = await boot(echo);
    const sock = await connectTo(port);
    const done = readResponses(sock, 1);
    const bytes = Buffer.from(get("/split"));
    for (let i = 0; i < bytes.length; i += 7) {
      sock.write(bytes.subarray(i, i + 7));
      await new Promise((r) => setTimeout(r, 3));
    }
    const [out] = await done;
    expect(JSON.parse(out.body.toString()).path).toBe("/split");
    sock.end();
  });

  it("HEAD answers headers with content-length but no body", async () => {
    const { port } = await boot(echo);
    const sock = await connectTo(port);
    const done = readResponses(sock, 1, { method: "HEAD" });
    sock.write("HEAD /head HTTP/1.1\r\nHost: x\r\n\r\n");
    const [out] = await done;
    expect(out.status).toBe(200);
    expect(Number(out.headers["content-length"])).toBeGreaterThan(0);
    expect(out.body.length).toBe(0); // parser got the next 0 bytes as body
    sock.end();
  });

  it("handles expect: 100-continue before the body", async () => {
    const { port } = await boot(echo);
    const sock = await connectTo(port);
    const done = readResponses(sock, 1); // skips the 100 frame itself
    const body = '{"a":1}';
    sock.write(
      "POST /big HTTP/1.1\r\nHost: x\r\nExpect: 100-continue\r\n" +
        `Content-Type: application/json\r\nContent-Length: ${body.length}` +
        "\r\n\r\n",
    );
    await new Promise((r) => setTimeout(r, 30)); // wait for the 100
    sock.write(body);
    const [out] = await done;
    expect(JSON.parse(out.body.toString())).toMatchObject({
      path: "/big",
      body: { a: 1 },
    });
    sock.end();
  });

  it("ignores empty lines before the request-line (RFC 9112)", async () => {
    const { port } = await boot(echo);
    const sock = await connectTo(port);
    const done = readResponses(sock, 1);
    sock.write("\r\n" + get("/leading")); // a relay added a stray CRLF
    const [out] = await done;
    expect(out.status).toBe(200);
    expect(JSON.parse(out.body.toString()).path).toBe("/leading");
    sock.end();
  });

  it("refuses a malformed request line with 400 + close", async () => {
    const { port } = await boot(echo);
    const sock = await connectTo(port);
    const done = readResponses(sock, 1);
    sock.write("GARBAGE\r\n\r\n");
    const [out] = await done;
    expect(out.status).toBe(400);
    expect(out.headers["connection"]).toBe("close");
    await new Promise<void>((res) => sock.once("close", () => res()));
  });

  it("refuses an oversized header block with 431", async () => {
    const { port } = await boot(echo, { limits: { maxHeaderBytes: 512 } });
    const sock = await connectTo(port);
    const done = readResponses(sock, 1);
    sock.write(`GET / HTTP/1.1\r\nHost: x\r\nBig: ${"a".repeat(1024)}\r\n\r\n`);
    const [out] = await done;
    expect(out.status).toBe(431);
    await new Promise<void>((res) => sock.once("close", () => res()));
  });

  it("refuses a body over the limit with 413", async () => {
    const { port } = await boot(echo, { limits: { bodyBytes: 16 } });
    const sock = await connectTo(port);
    const done = readResponses(sock, 1);
    sock.write(
      "POST / HTTP/1.1\r\nHost: x\r\nContent-Length: 32\r\n\r\n" +
        "x".repeat(32),
    );
    const [out] = await done;
    expect(out.status).toBe(413);
    await new Promise<void>((res) => sock.once("close", () => res()));
  });

  it("refuses chunked bodies with 501 (honest scope)", async () => {
    const { port } = await boot(echo);
    const sock = await connectTo(port);
    const done = readResponses(sock, 1);
    sock.write(
      "POST / HTTP/1.1\r\nHost: x\r\nTransfer-Encoding: chunked\r\n\r\n" +
        "4\r\nabcd\r\n0\r\n\r\n",
    );
    const [out] = await done;
    expect(out.status).toBe(501);
    expect(JSON.parse(out.body.toString()).error).toBe("chunked_not_supported");
    await new Promise<void>((res) => sock.once("close", () => res()));
  });

  it("cuts a slowloris client on the headers timeout", async () => {
    const { port } = await boot(echo, { limits: { headersTimeoutMs: 120 } });
    const sock = await connectTo(port);
    const done = readResponses(sock, 1);
    sock.write("GET / HTTP/1.1\r\nHost: x\r\n"); // never finished
    const [out] = await done;
    expect(out.status).toBe(408);
    await new Promise<void>((res) => sock.once("close", () => res()));
  });

  it("reports request.done after each answer", async () => {
    const seen: string[] = [];
    const { port } = await boot(echo, {}, (m) => seen.push(m.id));
    await request({ port, host: "127.0.0.1" }, { path: "/done" });
    await new Promise((r) => setTimeout(r, 30));
    expect(seen).toContain("http.request");
    expect(seen).toContain("request.done");
  });

  it("reports http.aborted when the client vanishes unanswered", async () => {
    const seen: string[] = [];
    const { port } = await boot(silent, {}, (m) => seen.push(m.id));
    const sock = await connectTo(port);
    sock.write(get("/vanish"));
    await new Promise((r) => setTimeout(r, 50));
    sock.destroy();
    await new Promise((r) => setTimeout(r, 50));
    expect(seen).toContain("http.aborted");
  });

  it("answers 504 when the runtime cancels the request", async () => {
    let rid = "";
    const { http, port } = await boot(silent, {}, (m) => {
      if (m.id === "http.request") rid = m.ctx!.rid as string;
    });
    const sock = await connectTo(port);
    const done = readResponses(sock, 1);
    sock.write(get("/slow"));
    await new Promise((r) => setTimeout(r, 50));
    (http as unknown as ServerPlugin).cancel?.(rid);
    const [out] = await done;
    expect(out.status).toBe(504);
    expect(JSON.parse(out.body.toString()).error).toBe("cancelled");
    sock.end();
  });

  it("stop() closes idle sockets and refuses new ones", async () => {
    const { http, port } = await boot(echo, {
      limits: {
        keepAliveTimeoutMs: 60_000,
      },
    });
    const sock = await connectTo(port);
    const done = readResponses(sock, 1);
    sock.write(get("/last"));
    await done;
    http.stop();
    await new Promise<void>((res) => sock.once("close", () => res())); // idle → closed
    await expect(connectTo(port)).rejects.toMatchObject({
      code: "ECONNREFUSED",
    });
  });
});
