import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createOwner,
  disposeOwner,
  effect,
  flushSync,
  root,
  signal,
  installDevtools as installHook,
} from "../core/mod.ts";
import { html, render } from "../dom/mod.ts";
import { fire } from "../testing/mod.ts";
import { devtoolsPanel, installDevtools, snapshot, timeTravel } from "./mod.ts";
import type { Devtools } from "./mod.ts";

let dt: Devtools;
beforeEach(() => {
  dt = installDevtools({ limit: 50 });
});
afterEach(() => {
  dt.dispose();
  document.body.innerHTML = "";
});

describe("timeline", () => {
  it("records named signal writes with previous values", () => {
    const count = signal(0, { name: "count" });
    count.set(1);
    count.update((n) => n + 1);
    count.set(2); // equal: nothing
    const writes = dt.timeline().filter((e) => e.type === "signal:write");
    expect(writes.map((w) => [w.name, w.prev, w.value])).toEqual([
      ["count", 0, 1],
      ["count", 1, 2],
    ]);
    expect(writes[0]!.seq).toBeLessThan(writes[1]!.seq);
    expect(writes[0]!.time).toBeGreaterThan(0);
  });

  it("records effect runs, owner lifecycle and errors", () => {
    const n = signal(0, { name: "n" });
    const stop = root((dispose) => {
      effect(() => void n());
      return dispose;
    });
    n.set(1);
    flushSync();
    stop();
    const types = dt.timeline().map((e) => e.type);
    expect(types).toContain("owner:create");
    expect(types.filter((t) => t === "effect:run")).toHaveLength(2);
    expect(types).toContain("owner:dispose");
  });

  it("records mounts and unmounts", () => {
    const host = document.body.appendChild(document.createElement("div"));
    const dispose = render(() => html`<p>x</p>`, host);
    dispose();
    const types = dt.timeline().map((e) => e.type);
    expect(types).toContain("mount");
    expect(types).toContain("unmount");
    expect(dt.timeline().find((e) => e.type === "mount")!.detail).toEqual({
      container: "DIV",
    });
  });

  it("records any event from the hook, e.g. router events", () => {
    installHook().emit({ type: "router:navigate", to: "/users/1", from: "/" });
    const e = dt.timeline().find((x) => x.type === "router:navigate")!;
    expect(e.detail).toEqual({ to: "/users/1", from: "/" });
  });

  it("is bounded", () => {
    const s = signal(0);
    for (let i = 1; i <= 500; i++) s.set(i);
    const t = dt.timeline();
    expect(t.length).toBeLessThanOrEqual(50);
    expect(t[t.length - 1]!.value).toBe(500);
    expect(dt.snapshot().seen).toBeGreaterThanOrEqual(500);
  });

  it("pause, resume, clear, filter and onEntry", () => {
    const seen: string[] = [];
    const off = dt.onEntry((e) => seen.push(e.type));
    const s = signal(0);
    dt.pause();
    s.set(1);
    dt.resume();
    s.set(2);
    off();
    s.set(3);
    expect(seen).toEqual(["signal:write"]);
    dt.clear();
    expect(dt.timeline()).toEqual([]);
    dt.dispose();
    dt = installDevtools({ filter: (e) => e.type !== "signal:write" });
    s.set(4);
    expect(dt.timeline()).toEqual([]);
  });

  it("publishes a reactive entries() while someone reads it", async () => {
    const runs: number[] = [];
    const stop = root((dispose) => {
      effect(() => void runs.push(dt.entries().length));
      return dispose;
    });
    signal(0).set(1);
    dt.flush();
    flushSync();
    expect(runs[runs.length - 1]).toBeGreaterThan(0);
    stop();
  });

  it("stops recording when disposed", () => {
    dt.dispose();
    const s = signal(0);
    s.set(1);
    expect(dt.timeline()).toEqual([]);
    dt = installDevtools();
  });
});

describe("snapshot", () => {
  it("returns the live owner tree and named signal values", () => {
    const dispose = root((d) => {
      const o = createOwner(null, "app");
      void o;
      effect(() => {});
      return d;
    });
    const app = createOwner(null, "feature");
    const child = createOwner(app, "child");
    void child;
    signal(1, { name: "answer" }).set(42);
    const snap = snapshot();
    const feature = snap.owners.find((o) => o.name === "feature")!;
    expect(feature.children.map((c) => c.name)).toEqual(["child"]);
    expect(snap.signals.answer).toBe(42);
    expect(snap.ownerCount).toBeGreaterThanOrEqual(3);
    disposeOwner(child);
    expect(
      snapshot().owners.find((o) => o.name === "feature")!.children,
    ).toEqual([]);
    disposeOwner(app);
    expect(snapshot().owners.find((o) => o.name === "feature")).toBeUndefined();
    dispose();
  });

  it("labels effects and computeds", () => {
    const stop = root((d) => {
      const o = createOwner(null, "holder");
      void o;
      return d;
    });
    const s = signal(0);
    const dispose = root((d) => {
      effect(() => void s());
      return d;
    });
    const kinds = JSON.stringify(snapshot().owners);
    expect(kinds).toContain('"kind":"effect"');
    dispose();
    stop();
  });
});

describe("time travel", () => {
  it("steps back and forward over debug signals", () => {
    const a = signal("x", { name: "a", debug: true });
    const b = signal(1, { name: "b", debug: true });
    const plain = signal(0, { name: "plain" });
    const tt = timeTravel();
    a.set("y");
    b.set(2);
    plain.set(9);
    a.set("z");
    expect(tt.entries().map((w) => w.name)).toEqual(["a", "b", "a"]);
    expect(tt.position()).toBe(3);
    tt.back();
    expect(a()).toBe("y");
    expect(tt.position()).toBe(2);
    tt.back(2);
    expect([a(), b()]).toEqual(["x", 1]);
    expect(tt.canBack()).toBe(false);
    tt.forward();
    expect(a()).toBe("y");
    tt.goto(3);
    expect([a(), b()]).toEqual(["z", 2]);
    expect(plain()).toBe(9);
    tt.goto(1);
    expect([a(), b()]).toEqual(["y", 1]);
    tt.present();
    expect(a()).toBe("z");
    expect(tt.canForward()).toBe(false);
  });

  it("travel does not add history; a new write ends the redo branch", () => {
    const s = signal(0, { debug: true });
    const tt = timeTravel();
    s.set(1);
    s.set(2);
    tt.back();
    expect(tt.entries()).toHaveLength(2);
    s.set(10);
    expect(tt.entries().map((w) => w.value)).toEqual([1, 10]);
    expect(tt.canForward()).toBe(false);
    tt.back(2);
    expect(s()).toBe(0);
  });

  it("drives reactive readers", () => {
    const s = signal(1, { debug: true });
    const seen: number[] = [];
    const stop = root((d) => {
      effect(() => void seen.push(s()));
      return d;
    });
    s.set(2);
    flushSync();
    timeTravel().back();
    flushSync();
    expect(seen).toEqual([1, 2, 1]);
    stop();
  });
});

describe("panel", () => {
  it("renders the timeline and drives time travel without recording itself", () => {
    const s = signal(0, { name: "clicks", debug: true });
    const host = document.body.appendChild(document.createElement("div"));
    const dispose = render(() => devtoolsPanel(dt), host);
    s.set(1);
    s.set(2);
    dt.flush();
    flushSync();
    const text = host.textContent!;
    expect(text).toContain("signal:write");
    expect(text).toContain("clicks");
    expect(host.querySelector("style")!.textContent).toContain(".mxdt");
    const before = dt.timeline().length;
    // interact: time travel back via the button
    const buttons = host.querySelectorAll("button");
    const back = [...buttons].find((b) => b.textContent!.trim() === "\u25c0")!;
    fire(back as HTMLElement, "click");
    flushSync();
    expect(s()).toBe(1);
    dt.flush();
    flushSync();
    // the travel itself is one signal write; panel effects add nothing
    expect(dt.timeline().length).toBe(before + 1);
    dispose();
  });

  it("works outside an owner", () => {
    const el = devtoolsPanel(dt) as HTMLElement;
    expect(el.className).toBe("mxdt");
  });
});
