import { describe, expect, it } from "vitest";
import { collector } from "../../testing/collector.ts";
import {
  createFakeClock,
  createTimePlugin,
  nextCron,
  parseCron,
  timeEffector as time,
} from "./mod.ts";

const ctx = (dispatch: any): any => ({
  dispatch,
  getState: () => undefined,
  dispatchEffect() {},
});

describe("time plugin", () => {
  it("timer.after replies with the effect ctx; cancel(rid) clears only that rid", () => {
    const clock = createFakeClock(0);
    const p = createTimePlugin({ clock });
    const c = collector();
    const pc = ctx(c.dispatch);
    p.handle({ ...time.after(100, "a"), ctx: { rid: "r1" } }, pc);
    p.handle({ ...time.after(100, "b"), ctx: { rid: "r2" } }, pc);
    p.cancel("r1");
    clock.advance(100);
    expect(c.messages).toEqual([{ id: "b", ctx: { rid: "r2" } }]);
  });

  it("every repeats until cancelled; same id restarts", () => {
    const clock = createFakeClock(0);
    const p = createTimePlugin({ clock });
    const c = collector();
    const pc = ctx(c.dispatch);
    p.handle(time.every(10, "t", { id: "x", payload: 1 }), pc);
    clock.advance(35);
    expect(c.messages.map((m) => m.payload)).toEqual([1, 1, 1]);
    p.handle(time.cancel("x"), pc);
    clock.advance(100);
    expect(c.messages.length).toBe(3);
    expect(p.active()).toEqual([]);
  });

  it("cron ticks with a fresh job ctx and survives cancel(rid)", () => {
    const clock = createFakeClock(Date.UTC(2024, 0, 1, 0, 0, 30));
    const p = createTimePlugin({ clock });
    const c = collector();
    p.handle(
      { ...time.cron("*/5 * * * *", "tick", { id: "j" }), ctx: { rid: "req" } },
      ctx(c.dispatch),
    );
    p.cancel("req");
    clock.advance(10 * 60_000);
    expect(c.messages.length).toBe(2);
    expect(c.messages[0]!.ctx).toEqual({
      rid: `job:j:${Date.UTC(2024, 0, 1, 0, 5)}`,
      conn: "job",
    });
    expect(p.jobs()).toEqual(["j"]);
    p.dispose?.();
    expect(p.jobs()).toEqual([]);
  });
});

describe("cron", () => {
  const at = (s: string, from: string, tz?: string) =>
    new Date(nextCron(parseCron(s), Date.parse(from), tz)).toISOString();
  it("lists, ranges, steps", () => {
    expect(at("0,30 9-10 * * *", "2024-03-01T09:30:00Z")).toBe(
      "2024-03-01T10:00:00.000Z",
    );
    expect(at("10-20/5 * * * *", "2024-03-01T09:00:00Z")).toBe(
      "2024-03-01T09:10:00.000Z",
    );
    expect(at("*/20 * * * *", "2024-03-01T09:40:00Z")).toBe(
      "2024-03-01T10:00:00.000Z",
    );
  });
  it("names, sunday 7, dom/dow OR rule", () => {
    expect(at("0 0 * jan mon", "2024-01-02T00:00:00Z")).toBe(
      "2024-01-08T00:00:00.000Z",
    );
    expect(at("0 0 * * 7", "2024-03-01T00:00:00Z")).toBe(
      "2024-03-03T00:00:00.000Z",
    );
    // 13th OR friday
    expect(at("0 0 13 * fri", "2024-09-01T00:00:00Z")).toBe(
      "2024-09-06T00:00:00.000Z",
    );
  });
  it("rolls over month and year; leap day", () => {
    expect(at("0 0 1 1 *", "2024-06-01T00:00:00Z")).toBe(
      "2025-01-01T00:00:00.000Z",
    );
    expect(at("0 0 29 2 *", "2024-03-01T00:00:00Z")).toBe(
      "2028-02-29T00:00:00.000Z",
    );
  });
  it("time zones with DST", () => {
    expect(at("0 9 * * *", "2024-01-15T00:00:00Z", "America/New_York")).toBe(
      "2024-01-15T14:00:00.000Z",
    );
    expect(at("0 9 * * *", "2024-07-15T00:00:00Z", "America/New_York")).toBe(
      "2024-07-15T13:00:00.000Z",
    );
    // 02:30 does not exist on 2024-03-10 in New York: skipped to next day
    expect(at("30 2 * * *", "2024-03-10T00:00:00Z", "America/New_York")).toBe(
      "2024-03-11T06:30:00.000Z",
    );
  });
  it("rejects bad expressions", () => {
    for (const e of [
      "* * * *",
      "61 * * * *",
      "*/0 * * * *",
      "a * * * *",
      "5-1 * * * *",
    ])
      expect(() => parseCron(e), e).toThrow();
    expect(() => nextCron(parseCron("0 0 31 2 *"), 0)).toThrow();
  });
});
