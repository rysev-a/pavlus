import { describe, expect, it } from "vitest";
import {
  RedisError,
  RespParseError,
  RespParser,
  encodeCommand,
} from "./resp.ts";

function parseAll(chunks: Buffer[]): unknown[] {
  const out: unknown[] = [];
  const p = new RespParser((r) => out.push(r));
  for (const c of chunks) p.push(c);
  return out;
}
function splitAt(buf: Buffer, offsets: number[]): Buffer[] {
  const pts = [...new Set(offsets)].sort((a, b) => a - b);
  const out: Buffer[] = [];
  let prev = 0;
  for (const o of pts) {
    out.push(buf.subarray(prev, o));
    prev = o;
  }
  out.push(buf.subarray(prev));
  return out;
}
// tiny deterministic PRNG
function rng(seed: number) {
  return () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
}

describe("encodeCommand", () => {
  it("encodes bulk strings, numbers and binary", () => {
    expect(encodeCommand(["SET", "k", 5]).toString()).toBe(
      "*3\r\n$3\r\nSET\r\n$1\r\nk\r\n$1\r\n5\r\n",
    );
    expect(encodeCommand(["GET", "é"]).toString()).toBe(
      "*2\r\n$3\r\nGET\r\n$2\r\né\r\n",
    );
    const bin = Buffer.from([0, 13, 10, 255]);
    const e = encodeCommand(["X", bin]);
    expect(e.subarray(e.length - 10)).toEqual(
      Buffer.concat([Buffer.from("$4\r\n"), bin, Buffer.from("\r\n")]),
    );
  });
  it("rejects bad arguments", () => {
    expect(() => encodeCommand([])).toThrow();
    expect(() => encodeCommand(["A", NaN])).toThrow();
    expect(() => encodeCommand(["A", null as any])).toThrow();
  });
});

describe("RespParser", () => {
  it("parses every reply type", () => {
    const r = parseAll([
      Buffer.from(
        "+OK\r\n-ERR bad thing\r\n:42\r\n:-7\r\n$5\r\nhello\r\n$0\r\n\r\n$-1\r\n*-1\r\n*0\r\n*2\r\n$1\r\na\r\n:1\r\n",
      ),
    ]);
    expect(r[0]).toBe("OK");
    expect(r[1]).toBeInstanceOf(RedisError);
    expect((r[1] as RedisError).code).toBe("ERR");
    expect((r[1] as RedisError).message).toBe("ERR bad thing");
    expect(r.slice(2)).toEqual([
      42,
      -7,
      Buffer.from("hello"),
      Buffer.alloc(0),
      null,
      null,
      [],
      [Buffer.from("a"), 1],
    ]);
  });
  it("parses nested arrays with nulls and errors", () => {
    const [v] = parseAll([
      Buffer.from("*3\r\n*2\r\n:1\r\n$-1\r\n-WRONGTYPE x\r\n*1\r\n+q\r\n"),
    ]) as any[];
    expect(v[0]).toEqual([1, null]);
    expect(v[1]).toBeInstanceOf(RedisError);
    expect(v[2]).toEqual(["q"]);
  });
  it("parses RESP3 types", () => {
    const r = parseAll([
      Buffer.from(
        "_\r\n#t\r\n#f\r\n,3.5\r\n,inf\r\n(123456789012345678901234567890\r\n%2\r\n+a\r\n:1\r\n$1\r\nb\r\n,2\r\n~2\r\n:1\r\n:2\r\n>2\r\n$7\r\nmessage\r\n$1\r\nx\r\n=8\r\ntxt:abcd\r\n!4\r\nERR!\r\n|1\r\n+k\r\n+v\r\n:9\r\n",
      ),
    ]);
    expect(r[0]).toBeNull();
    expect(r.slice(1, 6)).toEqual([
      true,
      false,
      3.5,
      Infinity,
      "123456789012345678901234567890",
    ]);
    expect(r[6]).toEqual({ a: 1, b: 2 });
    expect(r[7]).toEqual([1, 2]);
    expect(r[8]).toEqual([Buffer.from("message"), Buffer.from("x")]);
    expect(r[9]).toEqual(Buffer.from("abcd"));
    expect(r[10]).toBeInstanceOf(RedisError);
    expect(r[11]).toBe(9);
  });
  it("binary safe: payload with CRLF, NUL and invalid utf8", () => {
    const payload = Buffer.from([0, 13, 10, 36, 42, 255, 254, 13, 10]);
    const [v] = parseAll([
      Buffer.concat([
        Buffer.from(`$${payload.length}\r\n`),
        payload,
        Buffer.from("\r\n"),
      ]),
    ]);
    expect(v).toEqual(payload);
  });
  it("large values", () => {
    const big = Buffer.alloc(5_000_000, 7);
    const wire = Buffer.concat([
      Buffer.from(`$${big.length}\r\n`),
      big,
      Buffer.from("\r\n:1\r\n"),
    ]);
    const chunks: Buffer[] = [];
    for (let i = 0; i < wire.length; i += 65536)
      chunks.push(wire.subarray(i, i + 65536));
    const t0 = Date.now();
    const r = parseAll(chunks);
    expect(Date.now() - t0).toBeLessThan(2000);
    expect((r[0] as Buffer).length).toBe(5_000_000);
    expect(r[1]).toBe(1);
  });
  it("protocol errors throw", () => {
    expect(() => parseAll([Buffer.from("?x\r\n")])).toThrow(RespParseError);
    expect(() => parseAll([Buffer.from("$3\r\nabcXY")])).toThrow(
      RespParseError,
    );
    expect(() => parseAll([Buffer.from(":abc\r\n")])).toThrow(RespParseError);
  });

  it("fuzz: random chunk boundaries give the same replies as one chunk", () => {
    const rand = rng(12345);
    const rnd = (n: number) => Math.floor(rand() * n);
    const gen = (depth = 0): Buffer => {
      const k = rnd(depth > 2 ? 5 : 7);
      switch (k) {
        case 0:
          return Buffer.from("+" + "s".repeat(rnd(10)) + "\r\n");
        case 1:
          return Buffer.from("-ERR " + "e".repeat(rnd(10)) + "\r\n");
        case 2:
          return Buffer.from(":" + (rnd(2e6) - 1e6) + "\r\n");
        case 3: {
          const b = Buffer.alloc(rnd(300));
          for (let i = 0; i < b.length; i++) b[i] = rnd(256);
          return Buffer.concat([
            Buffer.from(`$${b.length}\r\n`),
            b,
            Buffer.from("\r\n"),
          ]);
        }
        case 4:
          return Buffer.from(rnd(2) ? "$-1\r\n" : "*-1\r\n");
        default: {
          const n = rnd(6);
          return Buffer.concat([
            Buffer.from(`*${n}\r\n`),
            ...Array.from({ length: n }, () => gen(depth + 1)),
          ]);
        }
      }
    };
    for (let round = 0; round < 300; round++) {
      const wire = Buffer.concat(
        Array.from({ length: 1 + rnd(8) }, () => gen()),
      );
      const expected = parseAll([wire]);
      const cuts = Array.from({ length: rnd(20) }, () => rnd(wire.length + 1));
      expect(parseAll(splitAt(wire, cuts)), `round ${round}`).toEqual(expected);
      // worst case: one byte at a time
      if (wire.length < 3000)
        expect(
          parseAll(
            splitAt(
              wire,
              Array.from({ length: wire.length }, (_, i) => i),
            ),
          ),
          `bytes ${round}`,
        ).toEqual(expected);
    }
  });
});
