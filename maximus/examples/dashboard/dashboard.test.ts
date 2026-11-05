import { afterEach, describe, expect, it, vi } from "vitest";
import { root } from "../../src/mod.ts";
import { cleanup, fire, flush, mount } from "../../src/testing/mod.ts";
import { Dashboard } from "./dashboard.ts";
import { createFeed } from "./stream.ts";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("dashboard", () => {
  it("draws the charts from the feed and keeps table rows when sorting", async () => {
    let feed!: ReturnType<typeof createFeed>;
    const t = mount(() => {
      feed = createFeed({ start: false });
      return Dashboard({ feed });
    });
    for (let i = 0; i < 5; i++) feed.tick();
    await flush();
    expect(t.query("path.line").getAttribute("d")).toMatch(/^M/);
    expect(t.queryAll("g.bar rect")).toHaveLength(4);
    expect(t.queryAll("svg circle[stroke-dasharray]")).toHaveLength(3);
    const rows = t.queryAll("tbody tr");
    expect(rows.length).toBe(feed.sales().length);
    const first = rows[0]!;
    fire(t.query("th:nth-child(4) button"), "click"); // amount, descending
    await flush();
    const amounts = t
      .queryAll("tbody tr td:nth-child(4)")
      .map((c) => Number(c.textContent!.replace("$", "")));
    expect(amounts).toEqual([...amounts].sort((a, b) => b - a));
    expect(t.queryAll("tbody tr")).toContain(first); // same element, moved
    expect(t.query("th:nth-child(4)").getAttribute("aria-sort")).toBe(
      "descending",
    );
  });

  it("the stream stops when the dashboard unmounts, pauses and resumes", async () => {
    vi.useFakeTimers();
    let feed!: ReturnType<typeof createFeed>;
    const t = mount(() => {
      feed = createFeed();
      return Dashboard({ feed });
    });
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(3000);
    expect(feed.sales().length).toBeGreaterThan(0);
    feed.setRunning(false);
    await flush();
    expect(vi.getTimerCount()).toBe(0);
    feed.setRunning(true);
    await flush();
    expect(vi.getTimerCount()).toBe(1);
    t.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("a feed created under a root is cleaned up with it", () => {
    vi.useFakeTimers();
    root((dispose) => {
      createFeed();
      expect(vi.getTimerCount()).toBe(1);
      dispose();
    });
    expect(vi.getTimerCount()).toBe(0);
  });
});
