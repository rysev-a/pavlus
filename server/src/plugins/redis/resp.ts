// RESP2 (+ the RESP3 types a server may send) encoder and incremental parser.
// Bulk strings come out as Buffers (binary safe); the client decodes them.

export type RedisArg = string | number | bigint | Uint8Array;

export class RedisError extends Error {
  /** The first word of the error line: ERR, WRONGTYPE, NOAUTH, ... */
  code: string;
  constructor(line: string) {
    super(line);
    this.name = "RedisError";
    const sp = line.indexOf(" ");
    this.code = sp < 0 ? line : line.slice(0, sp);
  }
}

const CRLF = Buffer.from("\r\n");

/** Encodes a command as an array of bulk strings. */
export function encodeCommand(args: readonly RedisArg[]): Buffer {
  if (args.length === 0) throw new Error("redis: empty command");
  const parts: Buffer[] = [];
  let head = "*" + args.length + "\r\n";
  let size = 0;
  const flush = () => {
    if (head) {
      const b = Buffer.from(head, "latin1");
      parts.push(b);
      size += b.length;
      head = "";
    }
  };
  for (const a of args) {
    let b: Uint8Array;
    if (typeof a === "string") b = Buffer.from(a, "utf8");
    else if (typeof a === "number" || typeof a === "bigint") {
      if (typeof a === "number" && !Number.isFinite(a))
        throw new Error(`redis: bad number argument ${a}`);
      b = Buffer.from(String(a), "latin1");
    } else if (a instanceof Uint8Array) b = a;
    else
      throw new Error(
        `redis: unsupported argument type ${a === null ? "null" : typeof a}`,
      );
    head += "$" + b.length + "\r\n";
    flush();
    parts.push(Buffer.from(b.buffer, b.byteOffset, b.byteLength), CRLF);
    size += b.length + 2;
  }
  return Buffer.concat(parts, size);
}

const INCOMPLETE = Symbol("incomplete");

export class RespParseError extends Error {}

/**
 * Feed it chunks at any boundaries; it calls `onReply` once per complete
 * top-level reply. Types: simple string -> string, error -> RedisError,
 * integer -> number, bulk -> Buffer, null -> null, array/set/push -> array,
 * map -> object, boolean, double, bignumber -> string.
 */
export class RespParser {
  #chunks: Buffer[] = [];
  #total = 0;
  #buf: Buffer = Buffer.alloc(0);
  #p = 0;
  /** No point in parsing before this many bytes are buffered. */
  #need = 0;
  readonly #onReply: (reply: unknown) => void;

  constructor(onReply: (reply: unknown) => void) {
    this.#onReply = onReply;
  }

  push(chunk: Buffer): void {
    this.#chunks.push(chunk);
    this.#total += chunk.length;
    if (this.#buf.length + this.#total < this.#need) return;
    this.#buf =
      this.#buf.length === 0 && this.#chunks.length === 1
        ? this.#chunks[0]!
        : Buffer.concat([this.#buf, ...this.#chunks]);
    this.#chunks = [];
    this.#total = 0;
    let start = 0;
    for (;;) {
      this.#p = start;
      const v = this.#parse();
      if (v === INCOMPLETE) break;
      start = this.#p;
      this.#onReply(v);
      if (start >= this.#buf.length) break;
    }
    this.#buf =
      start >= this.#buf.length ? Buffer.alloc(0) : this.#buf.subarray(start);
    this.#need = this.#buf.length === 0 ? 0 : Math.max(0, this.#need - start);
  }

  /** Bytes buffered but not yet part of a complete reply. */
  get buffered(): number {
    return this.#buf.length + this.#total;
  }

  #parse(): unknown {
    const buf = this.#buf;
    const p = this.#p;
    if (p >= buf.length) return this.#wait(p + 1);
    const type = buf[p]!;
    const eol = buf.indexOf("\r\n", p + 1, "latin1");
    if (eol < 0) return this.#wait(buf.length + 1);
    const line = buf.toString("latin1", p + 1, eol);
    const after = eol + 2;
    switch (type) {
      case 0x2b: // +
        this.#p = after;
        return buf.toString("utf8", p + 1, eol);
      case 0x2d: // -
        this.#p = after;
        return new RedisError(buf.toString("utf8", p + 1, eol));
      case 0x3a: // :
        this.#p = after;
        return int(line);
      case 0x5f: // _
        this.#p = after;
        return null;
      case 0x23: // #
        this.#p = after;
        return line === "t";
      case 0x2c: // ,
        this.#p = after;
        return line === "inf"
          ? Infinity
          : line === "-inf"
            ? -Infinity
            : Number(line);
      case 0x28: // (
        this.#p = after;
        return line;
      case 0x24: // $
      case 0x21: // !
      case 0x3d: {
        // =
        const len = int(line);
        if (len === -1) {
          this.#p = after;
          return null;
        }
        if (len < 0) throw new RespParseError(`bad bulk length ${len}`);
        const end = after + len;
        if (buf.length < end + 2) return this.#wait(end + 2);
        if (buf[end] !== 13 || buf[end + 1] !== 10)
          throw new RespParseError("bulk string not terminated by CRLF");
        this.#p = end + 2;
        const data = Buffer.from(buf.subarray(after, end));
        if (type === 0x21) return new RedisError(data.toString("utf8"));
        if (type === 0x3d) return data.subarray(4); // "txt:" / "mkd:"
        return data;
      }
      case 0x2a: // *
      case 0x7e: // ~
      case 0x3e: {
        // >
        const n = int(line);
        if (n === -1) {
          this.#p = after;
          return null;
        }
        if (n < 0) throw new RespParseError(`bad array length ${n}`);
        this.#p = after;
        const out: unknown[] = new Array(n);
        for (let i = 0; i < n; i++) {
          const v = this.#parse();
          if (v === INCOMPLETE) return INCOMPLETE;
          out[i] = v;
        }
        return out;
      }
      case 0x25: // %
      case 0x7c: {
        // | attributes: parsed and dropped
        const n = int(line);
        if (n < 0) throw new RespParseError(`bad map length ${n}`);
        this.#p = after;
        const out: Record<string, unknown> = {};
        for (let i = 0; i < n; i++) {
          const k = this.#parse();
          if (k === INCOMPLETE) return INCOMPLETE;
          const v = this.#parse();
          if (v === INCOMPLETE) return INCOMPLETE;
          out[Buffer.isBuffer(k) ? k.toString("utf8") : String(k)] = v;
        }
        return type === 0x7c ? this.#parse() : out;
      }
      default:
        throw new RespParseError(
          `unknown reply type byte 0x${type.toString(16)}`,
        );
    }
  }

  #wait(n: number): typeof INCOMPLETE {
    this.#need = n;
    return INCOMPLETE;
  }
}

function int(s: string): number {
  const n = Number(s);
  if (!Number.isInteger(n)) throw new RespParseError(`bad integer "${s}"`);
  return n;
}

/** Decodes Buffers to utf8 strings (deeply) unless `binary`. */
export function decode(v: unknown, binary: boolean): unknown {
  if (Buffer.isBuffer(v)) return binary ? v : v.toString("utf8");
  if (Array.isArray(v)) return v.map((x) => decode(x, binary));
  if (v !== null && typeof v === "object" && !(v instanceof Error)) {
    const o: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) o[k] = decode(x, binary);
    return o;
  }
  return v;
}
