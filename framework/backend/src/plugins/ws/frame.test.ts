import { describe, expect, it } from "vitest";
import {
  closePayload,
  createFrameParser,
  encodeFrame,
  OP,
  validCloseCode,
} from "./frame.ts";

function collect(maxPayload = 1024 * 1024, requireMask = true) {
  const ev: any[] = [];
  const parser = createFrameParser({
    maxPayload,
    requireMask,
    onMessage: (d, binary) =>
      ev.push(["msg", binary ? d : d.toString(), binary]),
    onPing: (d) => ev.push(["ping", d.toString()]),
    onPong: (d) => ev.push(["pong", d.toString()]),
    onClose: (c, r) => ev.push(["close", c, r]),
    onError: (c, r) => ev.push(["error", c, r]),
  });
  return { ev, parser };
}
const mk = (opcode: number, s: string | Buffer, extra: object = {}) =>
  encodeFrame({ opcode, payload: Buffer.from(s), mask: true, ...extra });

describe("encode", () => {
  it("uses 7, 16 and 64 bit lengths", () => {
    expect(
      encodeFrame({ opcode: OP.text, payload: Buffer.alloc(125) })[1],
    ).toBe(125);
    const m = encodeFrame({ opcode: OP.binary, payload: Buffer.alloc(126) });
    expect(m[1]).toBe(126);
    expect(m.readUInt16BE(2)).toBe(126);
    const l = encodeFrame({ opcode: OP.binary, payload: Buffer.alloc(65536) });
    expect(l[1]).toBe(127);
    expect(l.readUInt32BE(6)).toBe(65536);
    expect(l.length).toBe(10 + 65536);
  });
  it("server frames are unmasked, client frames masked", () => {
    const s = encodeFrame({ opcode: OP.text, payload: Buffer.from("hi") });
    expect(s[1]! & 0x80).toBe(0);
    expect(s.subarray(2).toString()).toBe("hi");
    const c = encodeFrame({
      opcode: OP.text,
      payload: Buffer.from("hi"),
      mask: true,
    });
    expect(c[1]! & 0x80).toBe(0x80);
    expect(c.subarray(6).toString()).not.toBe("hi");
  });
  it("close payload carries code and reason", () => {
    const p = closePayload(1001, "bye");
    expect(p.readUInt16BE(0)).toBe(1001);
    expect(p.subarray(2).toString()).toBe("bye");
    expect(closePayload().length).toBe(0);
  });
});

describe("parse", () => {
  it.each([0, 1, 125, 126, 65535, 65536, 200000])(
    "roundtrips %i bytes",
    (n) => {
      const { ev, parser } = collect();
      const data = Buffer.alloc(n, 97);
      parser.push(mk(OP.binary, data));
      expect(ev).toHaveLength(1);
      expect(ev[0][2]).toBe(true);
      expect(Buffer.compare(ev[0][1], data)).toBe(0);
    },
  );
  it("copes with any chunking, byte by byte included", () => {
    const { ev, parser } = collect();
    const bytes = Buffer.concat([
      mk(OP.text, "héllo"),
      mk(OP.ping, "p"),
      mk(OP.text, "x".repeat(300)),
    ]);
    for (const b of bytes) parser.push(Buffer.from([b]));
    expect(ev.map((e) => e[0])).toEqual(["msg", "ping", "msg"]);
    expect(ev[0][1]).toBe("héllo");
    expect(parser.buffered()).toBe(0);
  });
  it("two frames in one chunk", () => {
    const { ev, parser } = collect();
    parser.push(Buffer.concat([mk(OP.text, "a"), mk(OP.text, "b")]));
    expect(ev.map((e) => e[1])).toEqual(["a", "b"]);
  });
  it("reassembles fragments with a ping in between", () => {
    const { ev, parser } = collect();
    parser.push(mk(OP.text, "hel", { fin: false }));
    parser.push(mk(OP.ping, "mid"));
    parser.push(mk(OP.cont, "lo ", { fin: false }));
    parser.push(mk(OP.cont, "wörld"));
    expect(ev).toEqual([
      ["ping", "mid"],
      ["msg", "hello wörld", false],
    ]);
  });
  it("splitting inside a multi-byte character is fine across fragments", () => {
    const { ev, parser } = collect();
    const euro = Buffer.from("€");
    parser.push(
      encodeFrame({
        opcode: OP.text,
        fin: false,
        payload: euro.subarray(0, 1),
        mask: true,
      }),
    );
    parser.push(
      encodeFrame({ opcode: OP.cont, payload: euro.subarray(1), mask: true }),
    );
    expect(ev).toEqual([["msg", "€", false]]);
  });
  it("pong and close with and without status", () => {
    const { ev, parser } = collect();
    parser.push(mk(OP.pong, "x"));
    expect(ev[0]).toEqual(["pong", "x"]);
    const a = collect();
    a.parser.push(encodeFrame({ opcode: OP.close, mask: true }));
    expect(a.ev).toEqual([["close", undefined, ""]]);
    const b = collect();
    b.parser.push(
      encodeFrame({
        opcode: OP.close,
        payload: closePayload(1000, "done"),
        mask: true,
      }),
    );
    expect(b.ev).toEqual([["close", 1000, "done"]]);
  });
  it("accepts unmasked frames when mask is not required (client side)", () => {
    const { ev, parser } = collect(1000, false);
    parser.push(encodeFrame({ opcode: OP.text, payload: Buffer.from("s") }));
    expect(ev).toEqual([["msg", "s", false]]);
  });
});

describe("protocol errors", () => {
  const err = (frame: Buffer, max?: number) => {
    const { ev, parser } = collect(max);
    parser.push(frame);
    return ev;
  };
  it("unmasked client frame -> 1002", () => {
    expect(
      err(encodeFrame({ opcode: OP.text, payload: Buffer.from("x") }))[0].slice(
        0,
        2,
      ),
    ).toEqual(["error", 1002]);
  });
  it("reserved bits -> 1002", () => {
    const f = mk(OP.text, "x");
    f[0] |= 0x40;
    expect(err(f)[0][1]).toBe(1002);
  });
  it("unknown opcodes -> 1002", () => {
    expect(err(mk(3, "x"))[0][1]).toBe(1002);
    expect(err(mk(0xb, "x"))[0][1]).toBe(1002);
  });
  it("fragmented or oversize control frames -> 1002", () => {
    expect(err(mk(OP.ping, "x", { fin: false }))[0][1]).toBe(1002);
    expect(err(mk(OP.ping, "x".repeat(126)))[0][1]).toBe(1002);
  });
  it("continuation without a start, data frame inside a fragmented message -> 1002", () => {
    expect(err(mk(OP.cont, "x"))[0][1]).toBe(1002);
    const { ev, parser } = collect();
    parser.push(mk(OP.text, "a", { fin: false }));
    parser.push(mk(OP.text, "b"));
    expect(ev[0][1]).toBe(1002);
  });
  it("too big -> 1009, decided from the header before the payload arrives", () => {
    const f = mk(OP.binary, Buffer.alloc(2000));
    expect(err(f.subarray(0, 8), 1000)[0].slice(0, 2)).toEqual(["error", 1009]);
    const huge = Buffer.alloc(14);
    huge[0] = 0x82;
    huge[1] = 0xff;
    huge.writeUInt32BE(1, 2); // length 2^32 + ...
    expect(err(huge, 1 << 20)[0][1]).toBe(1009);
  });
  it("the sum of fragments counts against the limit", () => {
    const { ev, parser } = collect(10);
    parser.push(mk(OP.binary, "123456", { fin: false }));
    parser.push(mk(OP.cont, "78901"));
    expect(ev[0].slice(0, 2)).toEqual(["error", 1009]);
  });
  it("invalid utf-8 in text -> 1007", () => {
    expect(err(mk(OP.text, Buffer.from([0xff, 0xfe])))[0][1]).toBe(1007);
  });
  it("bad close frames -> 1002 / 1007", () => {
    expect(err(mk(OP.close, Buffer.from([1])))[0][1]).toBe(1002);
    expect(
      err(
        encodeFrame({
          opcode: OP.close,
          payload: closePayload(1005),
          mask: true,
        }),
      )[0][1],
    ).toBe(1002);
    expect(
      err(
        encodeFrame({
          opcode: OP.close,
          payload: Buffer.concat([closePayload(1000), Buffer.from([0xff])]),
          mask: true,
        }),
      )[0][1],
    ).toBe(1007);
  });
  it("stops parsing after an error", () => {
    const { ev, parser } = collect();
    parser.push(Buffer.concat([mk(3, "x"), mk(OP.text, "ok")]));
    expect(ev).toHaveLength(1);
    parser.push(mk(OP.text, "more"));
    expect(ev).toHaveLength(1);
  });
  it("valid close codes", () => {
    for (const c of [1000, 1001, 1003, 1007, 1011, 1014, 3000, 4999])
      expect(validCloseCode(c)).toBe(true);
    for (const c of [999, 1004, 1005, 1006, 1015, 2999, 5000])
      expect(validCloseCode(c)).toBe(false);
  });
});
