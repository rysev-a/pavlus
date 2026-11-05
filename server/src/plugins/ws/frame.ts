// RFC 6455 framing: an incremental parser and a frame encoder. No I/O.

export const OP = {
  cont: 0x0,
  text: 0x1,
  binary: 0x2,
  close: 0x8,
  ping: 0x9,
  pong: 0xa,
} as const;

export interface EncodeOptions {
  opcode: number;
  payload?: Uint8Array;
  fin?: boolean;
  /** Clients must mask; servers must not. */
  mask?: boolean | Uint8Array;
}

export function encodeFrame(o: EncodeOptions): Buffer {
  const payload = o.payload ?? new Uint8Array(0);
  const len = payload.length;
  const lenBytes = len < 126 ? 0 : len < 65536 ? 2 : 8;
  const masked = o.mask !== undefined && o.mask !== false;
  const out = Buffer.allocUnsafe(2 + lenBytes + (masked ? 4 : 0) + len);
  out[0] = (o.fin === false ? 0 : 0x80) | o.opcode;
  out[1] = (masked ? 0x80 : 0) | (len < 126 ? len : len < 65536 ? 126 : 127);
  if (lenBytes === 2) out.writeUInt16BE(len, 2);
  else if (lenBytes === 8) {
    out.writeUInt32BE(Math.floor(len / 2 ** 32), 2);
    out.writeUInt32BE(len >>> 0, 6);
  }
  let at = 2 + lenBytes;
  if (masked) {
    const key =
      o.mask instanceof Uint8Array
        ? o.mask
        : Buffer.from([
            (Math.random() * 256) | 0,
            (Math.random() * 256) | 0,
            (Math.random() * 256) | 0,
            (Math.random() * 256) | 0,
          ]);
    out.set(key.subarray(0, 4), at);
    at += 4;
    for (let i = 0; i < len; i++) out[at + i] = payload[i]! ^ key[i & 3]!;
  } else out.set(payload, at);
  return out;
}

/** The payload of a close frame. */
export function closePayload(code?: number, reason = ""): Buffer {
  if (code === undefined) return Buffer.alloc(0);
  const r = Buffer.from(reason, "utf8").subarray(0, 123);
  const out = Buffer.allocUnsafe(2 + r.length);
  out.writeUInt16BE(code, 0);
  r.copy(out, 2);
  return out;
}

/** Codes an endpoint may put on the wire (RFC 6455 7.4). */
export function validCloseCode(code: number): boolean {
  return (
    (code >= 1000 && code <= 1003) ||
    (code >= 1007 && code <= 1014) ||
    (code >= 3000 && code <= 4999)
  );
}

export interface FrameParserOptions {
  maxPayload: number;
  /** A server must reject unmasked client frames. Default true. */
  requireMask?: boolean;
  onMessage(data: Buffer, binary: boolean): void;
  onPing(data: Buffer): void;
  onPong(data: Buffer): void;
  /** `code` is undefined for a close frame without a status. */
  onClose(code: number | undefined, reason: string): void;
  /** A protocol violation: the caller closes with `code`. The parser stops. */
  onError(code: number, reason: string): void;
}

export interface FrameParser {
  push(chunk: Uint8Array): void;
  /** Bytes buffered and not yet consumed (for tests). */
  buffered(): number;
}

const utf8 = new TextDecoder("utf-8", { fatal: true });

export function createFrameParser(o: FrameParserOptions): FrameParser {
  const requireMask = o.requireMask ?? true;
  let chunks: Buffer[] = [];
  let total = 0;
  let dead = false;
  let hdr:
    { fin: boolean; opcode: number; key?: Buffer; len: number } | undefined;
  let fragOp = 0;
  let frags: Buffer[] = [];
  let fragSize = 0;

  const fail = (code: number, reason: string): void => {
    dead = true;
    chunks = [];
    total = 0;
    frags = [];
    o.onError(code, reason);
  };

  function peek(n: number): Buffer | undefined {
    if (total < n) return undefined;
    if (chunks[0]!.length >= n) return chunks[0];
    const joined = Buffer.concat(chunks, total);
    chunks = [joined];
    return joined;
  }
  function take(n: number): Buffer {
    if (n === 0) return Buffer.alloc(0);
    const first = peek(n)!;
    const out = first.subarray(0, n);
    if (first.length === n) chunks.shift();
    else chunks[0] = first.subarray(n);
    total -= n;
    return out;
  }

  function frame(h: NonNullable<typeof hdr>, data: Buffer): void {
    if (h.key)
      for (let i = 0; i < data.length; i++) data[i] = data[i]! ^ h.key[i & 3]!;
    switch (h.opcode) {
      case OP.ping:
        return o.onPing(data);
      case OP.pong:
        return o.onPong(data);
      case OP.close: {
        if (data.length === 0) {
          dead = true;
          return o.onClose(undefined, "");
        }
        if (data.length === 1) return fail(1002, "bad close frame");
        const code = data.readUInt16BE(0);
        if (!validCloseCode(code)) return fail(1002, "invalid close code");
        let reason = "";
        try {
          reason = utf8.decode(data.subarray(2));
        } catch {
          return fail(1007, "invalid utf-8 in close reason");
        }
        dead = true;
        return o.onClose(code, reason);
      }
    }
    // data frame (text, binary or continuation)
    if (h.opcode !== OP.cont) fragOp = h.opcode;
    frags.push(Buffer.from(data));
    fragSize += data.length;
    if (!h.fin) return;
    const msg = frags.length === 1 ? frags[0]! : Buffer.concat(frags, fragSize);
    const op = fragOp;
    frags = [];
    fragSize = 0;
    fragOp = 0;
    if (op === OP.text) {
      try {
        utf8.decode(msg);
      } catch {
        return fail(1007, "invalid utf-8");
      }
      return o.onMessage(msg, false);
    }
    o.onMessage(msg, true);
  }

  function run(): void {
    while (!dead) {
      if (!hdr) {
        const b = peek(2);
        if (!b) return;
        const b0 = b[0]!;
        const b1 = b[1]!;
        if (b0 & 0x70) return fail(1002, "reserved bits set");
        const opcode = b0 & 0x0f;
        const fin = (b0 & 0x80) !== 0;
        const masked = (b1 & 0x80) !== 0;
        const l7 = b1 & 0x7f;
        const size =
          2 + (l7 === 126 ? 2 : l7 === 127 ? 8 : 0) + (masked ? 4 : 0);
        const full = peek(size);
        if (!full) {
          // reject early what is already wrong, before waiting for more
          if (opcode >= 8 && (!fin || l7 > 125))
            return fail(1002, "bad control frame");
          return;
        }
        let len = l7;
        let at = 2;
        if (l7 === 126) {
          len = full.readUInt16BE(2);
          at = 4;
        } else if (l7 === 127) {
          len = full.readUInt32BE(2) * 2 ** 32 + full.readUInt32BE(6);
          at = 10;
        }
        const control = opcode >= 8;
        if ((opcode > 2 && opcode < 8) || opcode > 10)
          return fail(1002, "unknown opcode");
        if (control && (!fin || len > 125))
          return fail(1002, "bad control frame");
        if (requireMask && !masked) return fail(1002, "unmasked client frame");
        if (!control) {
          if (opcode === OP.cont && fragOp === 0)
            return fail(1002, "unexpected continuation");
          if (opcode !== OP.cont && fragOp !== 0)
            return fail(1002, "expected continuation");
          if (fragSize + len > o.maxPayload)
            return fail(1009, "message too big");
        }
        const key = masked ? Buffer.from(full.subarray(at, at + 4)) : undefined;
        take(size);
        hdr = { fin, opcode, key, len };
      }
      if (total < hdr.len) return;
      const h = hdr;
      hdr = undefined;
      frame(h, take(h.len));
    }
  }

  return {
    push(chunk) {
      if (dead || chunk.length === 0) return;
      const b = Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
      chunks.push(b);
      total += b.length;
      run();
    },
    buffered: () => total,
  };
}
