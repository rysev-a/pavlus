// Helpers for real-socket tests: an http client against an ephemeral port and
// a websocket client that writes its own (masked) frames.
import {
  Agent,
  request as httpRequest,
  type IncomingHttpHeaders,
} from "node:http";
import { createHash, randomBytes } from "node:crypto";
import type { Duplex } from "node:stream";
import type { AddressInfo } from "node:net";
import {
  createFrameParser,
  encodeFrame,
  OP,
  closePayload,
} from "../plugins/ws/frame.ts";

export type Target =
  | string
  | { port: number; host?: string }
  | { address(): AddressInfo | null }
  | { server: { address(): AddressInfo | string | null } };

function resolve(t: Target): { host: string; port: number } {
  if (typeof t === "string") {
    const u = new URL(t);
    return { host: u.hostname, port: Number(u.port) };
  }
  if ("port" in t) return { host: t.host ?? "127.0.0.1", port: t.port };
  const a = "address" in t ? t.address() : t.server.address();
  if (!a || typeof a === "string") throw new Error("target is not listening");
  return { host: a.address === "::" ? "127.0.0.1" : a.address, port: a.port };
}

export interface TestResponse {
  status: number;
  headers: IncomingHttpHeaders;
  body: Buffer;
  text: string;
  json: unknown;
}

export interface TestRequest {
  method?: string;
  path?: string;
  headers?: Record<string, string>;
  /** Objects are sent as JSON; strings/Buffers as they are. */
  body?: unknown;
  agent?: Agent;
  timeoutMs?: number;
}

/** One request over a real socket (a keep-alive `agent` can be passed). */
export function request(
  target: Target,
  req: TestRequest = {},
): Promise<TestResponse> {
  const { host, port } = resolve(target);
  return new Promise((res, rej) => {
    const headers: Record<string, string> = { ...req.headers };
    let payload: Buffer | undefined;
    if (req.body !== undefined) {
      if (typeof req.body === "string") payload = Buffer.from(req.body);
      else if (req.body instanceof Uint8Array) payload = Buffer.from(req.body);
      else {
        payload = Buffer.from(JSON.stringify(req.body));
        headers["content-type"] ??= "application/json";
      }
      headers["content-length"] = String(payload.length);
    }
    const r = httpRequest(
      {
        host,
        port,
        method: req.method ?? "GET",
        path: req.path ?? "/",
        headers,
        agent: req.agent,
      },
      (m) => {
        const chunks: Buffer[] = [];
        m.on("data", (c) => chunks.push(c));
        m.on("error", rej);
        m.on("end", () => {
          const body = Buffer.concat(chunks);
          const text = body.toString("utf8");
          let json: unknown;
          if (String(m.headers["content-type"]).includes("json") && text) {
            try {
              json = JSON.parse(text);
            } catch {
              /* leave undefined */
            }
          }
          res({
            status: m.statusCode ?? 0,
            headers: m.headers,
            body,
            text,
            json,
          });
        });
      },
    );
    r.setTimeout(req.timeoutMs ?? 5000, () =>
      r.destroy(new Error("request timeout")),
    );
    r.on("error", rej);
    r.end(payload);
  });
}

export interface WsTestClient {
  readonly socket: Duplex;
  readonly headers: IncomingHttpHeaders;
  readonly messages: { data: string | Buffer; binary: boolean }[];
  /** Close frame the server sent, if any. */
  readonly closeFrame: { code?: number; reason: string } | undefined;
  readonly pongs: Buffer[];
  readonly pings: Buffer[];
  readonly closed: Promise<void>;
  sendText(s: string): void;
  sendBinary(b: Uint8Array): void;
  /** A text message split into several frames. */
  sendFragmented(parts: string[]): void;
  ping(data?: string): void;
  close(code?: number, reason?: string): void;
  /** Writes arbitrary bytes (to test protocol violations). */
  raw(b: Uint8Array): void;
  next(timeoutMs?: number): Promise<{ data: string | Buffer; binary: boolean }>;
}

export interface WsConnectOptions {
  headers?: Record<string, string>;
  protocols?: string[];
  /** Answer pings automatically (default true). */
  autoPong?: boolean;
}

/** Connects with a real upgrade; rejects with `{ status }` when refused. */
export function connectWs(
  target: Target,
  path = "/",
  o: WsConnectOptions = {},
): Promise<WsTestClient> {
  const { host, port } = resolve(target);
  const key = randomBytes(16).toString("base64");
  return new Promise((res, rej) => {
    const r = httpRequest({
      host,
      port,
      path,
      headers: {
        Connection: "Upgrade",
        Upgrade: "websocket",
        "Sec-WebSocket-Version": "13",
        "Sec-WebSocket-Key": key,
        ...(o.protocols && {
          "Sec-WebSocket-Protocol": o.protocols.join(", "),
        }),
        ...o.headers,
      },
    });
    r.on("error", rej);
    r.on("response", (m) => {
      m.resume();
      rej(
        Object.assign(new Error(`handshake refused: ${m.statusCode}`), {
          status: m.statusCode,
        }),
      );
    });
    r.on("upgrade", (m, socket, head) => {
      const expect = createHash("sha1")
        .update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")
        .digest("base64");
      if (m.headers["sec-websocket-accept"] !== expect)
        return rej(new Error("bad Sec-WebSocket-Accept"));
      const messages: WsTestClient["messages"] = [];
      const waiters: ((m: WsTestClient["messages"][number]) => void)[] = [];
      const pongs: Buffer[] = [];
      const pings: Buffer[] = [];
      let closeFrame: WsTestClient["closeFrame"];
      let markClosed!: () => void;
      const closed = new Promise<void>((r2) => (markClosed = r2));
      socket.on("close", markClosed);
      socket.on("error", () => {});
      const parser = createFrameParser({
        maxPayload: 64 * 1024 * 1024,
        requireMask: false,
        onMessage(data, binary) {
          const msg = { data: binary ? data : data.toString("utf8"), binary };
          const w = waiters.shift();
          if (w) w(msg);
          else messages.push(msg);
        },
        onPing(d) {
          pings.push(Buffer.from(d));
          if (o.autoPong ?? true)
            socket.write(
              encodeFrame({ opcode: OP.pong, payload: d, mask: true }),
            );
        },
        onPong: (d) => void pongs.push(Buffer.from(d)),
        onClose(code, reason) {
          closeFrame = { code, reason };
        },
        onError() {},
      });
      socket.on("data", (c: Buffer) => parser.push(c));
      if (head.length) parser.push(head);
      const w = (b: Buffer): void => void socket.write(b);
      res({
        socket,
        headers: m.headers,
        messages,
        pongs,
        pings,
        closed,
        get closeFrame() {
          return closeFrame;
        },
        sendText: (s) =>
          w(
            encodeFrame({
              opcode: OP.text,
              payload: Buffer.from(s),
              mask: true,
            }),
          ),
        sendBinary: (b) =>
          w(encodeFrame({ opcode: OP.binary, payload: b, mask: true })),
        sendFragmented(parts) {
          parts.forEach((p, i) =>
            w(
              encodeFrame({
                opcode: i === 0 ? OP.text : OP.cont,
                fin: i === parts.length - 1,
                payload: Buffer.from(p),
                mask: true,
              }),
            ),
          );
        },
        ping: (d = "") =>
          w(
            encodeFrame({
              opcode: OP.ping,
              payload: Buffer.from(d),
              mask: true,
            }),
          ),
        close: (code = 1000, reason = "") =>
          w(
            encodeFrame({
              opcode: OP.close,
              payload: closePayload(code, reason),
              mask: true,
            }),
          ),
        raw: (b) => void socket.write(b),
        next(ms = 2000) {
          const have = messages.shift();
          if (have) return Promise.resolve(have);
          return new Promise((resolve2, reject2) => {
            const t = setTimeout(
              () => reject2(new Error("ws client: no message")),
              ms,
            );
            waiters.push((x) => {
              clearTimeout(t);
              resolve2(x);
            });
          });
        },
      });
    });
    r.end();
  });
}
