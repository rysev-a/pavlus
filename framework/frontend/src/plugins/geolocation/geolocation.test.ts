import { describe, expect, test } from "vitest";
import type { Message } from "../../core/types.ts";
import {
  createGeolocationPlugin,
  geolocationEffector as g,
  type GeoNavigatorLike,
} from "./mod.ts";
import * as geo from "./geo.ts";

const flush = () => new Promise((r) => setTimeout(r, 0));

const pos = (lat: number, lng: number, extra: object = {}) => ({
  coords: {
    latitude: lat,
    longitude: lng,
    accuracy: 5,
    altitude: null,
    altitudeAccuracy: null,
    heading: null,
    speed: null,
    ...extra,
  },
  timestamp: 1000,
});

function fakeNav() {
  let next = 1;
  const watchers = new Map<number, { ok: any; err: any }>();
  const cleared: number[] = [];
  const current: { ok: any; err: any }[] = [];
  const perm = {
    state: "prompt",
    listeners: new Set<() => void>(),
    addEventListener(_: string, f: () => void) {
      this.listeners.add(f);
    },
    removeEventListener(_: string, f: () => void) {
      this.listeners.delete(f);
    },
  };
  const navigator: GeoNavigatorLike = {
    geolocation: {
      getCurrentPosition: (ok, err) => void current.push({ ok, err }),
      watchPosition: (ok, err) => {
        const h = next++;
        watchers.set(h, { ok, err });
        return h;
      },
      clearWatch: (h) => {
        cleared.push(h);
        watchers.delete(h);
      },
    },
    permissions: { query: async () => perm },
  };
  return { navigator, watchers, cleared, current, perm };
}

function setup(nav: GeoNavigatorLike | undefined) {
  const plugin = createGeolocationPlugin({ navigator: nav });
  const out: Message[] = [];
  const ctx = {
    dispatch: (m: Message) => void out.push(m),
    getState: () => ({}),
    dispatchEffect: () => {},
  };
  return { plugin, out, run: (e: any) => plugin.handle(e, ctx) };
}

describe("geo helpers", () => {
  const berlin = { lat: 52.52, lng: 13.405 };
  const paris = { lat: 48.8566, lng: 2.3522 };
  test("distance", () => {
    expect(geo.distance(berlin, berlin)).toBe(0);
    expect(geo.distance(berlin, paris) / 1000).toBeCloseTo(878, -1);
  });
  test("bearing", () => {
    expect(geo.bearing({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(0);
    expect(geo.bearing({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeCloseTo(90);
    expect(geo.bearing({ lat: 0, lng: 0 }, { lat: -1, lng: 0 })).toBeCloseTo(
      180,
    );
    expect(geo.bearing({ lat: 0, lng: 0 }, { lat: 0, lng: -1 })).toBeCloseTo(
      270,
    );
  });
  test("destination round-trips distance and bearing", () => {
    const d = geo.destination(berlin, 5000, 45);
    expect(geo.distance(berlin, d)).toBeCloseTo(5000, 3);
    expect(geo.bearing(berlin, d)).toBeCloseTo(45, 2);
    expect(geo.destination({ lat: 0, lng: 179.9 }, 50000, 90).lng).toBeLessThan(
      0,
    );
  });
  test("boundingBox", () => {
    const b = geo.boundingBox(berlin, 1000);
    expect(b.north).toBeGreaterThan(berlin.lat);
    expect(b.south).toBeLessThan(berlin.lat);
    expect(geo.inBox(berlin, b)).toBe(true);
    expect(geo.inBox(geo.destination(berlin, 900, 90), b)).toBe(true);
    expect(geo.inBox(paris, b)).toBe(false);
    const wrap = geo.boundingBox({ lat: 0, lng: 179.99 }, 5000);
    expect(wrap.west).toBeGreaterThan(wrap.east);
    expect(geo.inBox({ lat: 0, lng: -179.99 }, wrap)).toBe(true);
    const pole = geo.boundingBox({ lat: 89.99, lng: 0 }, 5000);
    expect([pole.west, pole.east]).toEqual([-180, 180]);
    expect(pole.north).toBe(90);
  });
  test("isInside", () => {
    expect(geo.isInside(berlin, berlin, 0)).toBe(true);
    expect(geo.isInside(geo.destination(berlin, 101, 0), berlin, 100)).toBe(
      false,
    );
  });
  test("format", () => {
    expect(geo.formatLatLng(berlin)).toBe("52.52000, 13.40500");
    expect(geo.formatLat(1.23456789, { digits: 2 })).toBe("1.23");
    expect(geo.formatLatLng(berlin, { style: "dms" })).toBe(
      `52°31'12.0"N 13°24'18.0"E`,
    );
    expect(
      geo.formatLatLng({ lat: -0.0001, lng: -179.99999999 }, { style: "dms" }),
    ).toBe(`0°0'0.4"S 180°0'0.0"W`);
  });
});

describe("geolocation plugin", () => {
  test("effector builds plain effects", () => {
    expect(g.current({ onSuccess: "ok" })).toEqual({
      plugin: "geolocation",
      type: "current",
      onSuccess: "ok",
    });
    expect(g.clearWatch("w")).toEqual({
      plugin: "geolocation",
      type: "clearWatch",
      id: "w",
    });
    expect(
      g.watch({ id: "w", onChange: "c", onError: undefined }),
    ).not.toHaveProperty("onError");
  });

  test("current replies serializable position", () => {
    const f = fakeNav();
    const { run, out } = setup(f.navigator);
    run(g.current({ onSuccess: "ok", onError: "bad" }));
    f.current[0]!.ok(pos(1, 2, { altitude: 7, heading: 90 }));
    expect(out).toEqual([
      {
        id: "ok",
        payload: {
          lat: 1,
          lng: 2,
          accuracy: 5,
          altitude: 7,
          altitudeAccuracy: null,
          heading: 90,
          speed: null,
          timestamp: 1000,
        },
      },
    ]);
    expect(JSON.parse(JSON.stringify(out[0]!.payload))).toEqual(
      out[0]!.payload,
    );
  });

  test("errors are normalized", () => {
    const f = fakeNav();
    const { run, out } = setup(f.navigator);
    run(g.current({ onSuccess: "ok", onError: "bad" }));
    f.current[0]!.err({ code: 1, message: "nope" });
    run(g.current({ onSuccess: "ok", onError: "bad" }));
    f.current[1]!.err({ code: 2, message: "x" });
    run(g.current({ onSuccess: "ok", onError: "bad" }));
    f.current[2]!.err({ code: 3, message: "slow" });
    expect(out.map((m) => (m.payload as any).code)).toEqual([
      "PERMISSION_DENIED",
      "POSITION_UNAVAILABLE",
      "TIMEOUT",
    ]);
    expect(out[0]).toEqual({
      id: "bad",
      payload: { code: "PERMISSION_DENIED", message: "nope" },
    });
  });

  test("throwing geolocation becomes an error reply", () => {
    const f = fakeNav();
    f.navigator.geolocation!.getCurrentPosition = () => {
      throw new Error("boom");
    };
    const { run, out } = setup(f.navigator);
    run(g.current({ onSuccess: "ok", onError: "bad" }));
    expect(out[0]!.payload).toEqual({
      code: "POSITION_UNAVAILABLE",
      message: "boom",
    });
  });

  test("unsupported environment replies onError and never throws", async () => {
    for (const nav of [undefined, {}]) {
      const { run, out, plugin } = setup(nav);
      run(g.current({ onSuccess: "ok", onError: "bad" }));
      run(g.watch({ id: "w", onChange: "c", onError: "bad" }));
      run(
        g.geofence({
          id: "f",
          center: { lat: 0, lng: 0 },
          radius: 1,
          onChange: "c",
          onError: "bad",
        }),
      );
      run(g.current({ onSuccess: "ok" })); // no onError: silent
      run(g.permission({ onSuccess: "perm" }));
      run(g.observePermission({ id: "o", onChange: "pc" }));
      run(g.clearAll());
      expect(out.map((m) => m.id)).toEqual(["bad", "bad", "bad", "perm", "pc"]);
      expect((out[0]!.payload as any).code).toBe("UNSUPPORTED");
      expect(out[3]!.payload).toBe("unsupported");
      expect(plugin.watches()).toEqual([]);
    }
  });

  test("watch streams, replaces by id, clears", () => {
    const f = fakeNav();
    const { run, out, plugin } = setup(f.navigator);
    run(g.watch({ id: "w", onChange: "c", onError: "e" }));
    run(g.watch({ id: "w", onChange: "c2" }));
    expect(f.cleared).toEqual([1]);
    expect(plugin.watches()).toEqual(["w"]);
    f.watchers.get(2)!.ok(pos(3, 4));
    f.watchers.get(2)!.err({ code: 3, message: "t" });
    expect(out.map((m) => m.id)).toEqual(["c2"]); // no onError on 2nd
    run(g.clearWatch("w"));
    expect(f.cleared).toEqual([1, 2]);
    expect(plugin.watches()).toEqual([]);
    run(g.clearWatch("nothing"));
  });

  test("clearAll and dispose release everything", () => {
    const f = fakeNav();
    const { run, plugin } = setup(f.navigator);
    run(g.watch({ id: "a", onChange: "c" }));
    run(
      g.geofence({
        id: "f",
        center: { lat: 0, lng: 0 },
        radius: 10,
        onChange: "x",
      }),
    );
    expect(plugin.geofences()).toEqual(["f"]);
    run(g.clearAll());
    expect(f.watchers.size).toBe(0);
    run(g.watch({ id: "a", onChange: "c" }));
    plugin.dispose!();
    expect(f.watchers.size).toBe(0);
    expect(plugin.watches()).toEqual([]);
  });

  test("permission query and unsupported states", async () => {
    const f = fakeNav();
    const { run, out } = setup(f.navigator);
    f.perm.state = "granted";
    run(g.permission({ onSuccess: "p", onError: "pe" }));
    await flush();
    f.navigator.permissions!.query = async () => {
      throw new Error("nope");
    };
    run(g.permission({ onSuccess: "p", onError: "pe" }));
    await flush();
    expect(out[0]).toEqual({ id: "p", payload: "granted" });
    expect(out[1]!.id).toBe("pe");
    expect((out[1]!.payload as any).code).toBe("UNSUPPORTED");
  });

  test("observePermission emits initial and changes, until unobserved", async () => {
    const f = fakeNav();
    const { run, out, plugin } = setup(f.navigator);
    run(g.observePermission({ id: "o", onChange: "pc" }));
    await flush();
    f.perm.state = "denied";
    f.perm.listeners.forEach((l) => l());
    expect(out.map((m) => m.payload)).toEqual(["prompt", "denied"]);
    expect(plugin.permissionObservers()).toEqual(["o"]);
    run(g.unobservePermission("o"));
    expect(f.perm.listeners.size).toBe(0);
    f.perm.listeners.forEach((l) => l());
    expect(out).toHaveLength(2);
  });

  test("observePermission cancelled before query resolves attaches nothing", async () => {
    const f = fakeNav();
    const { run, out } = setup(f.navigator);
    run(g.observePermission({ id: "o", onChange: "pc" }));
    run(g.unobservePermission("o"));
    await flush();
    expect(f.perm.listeners.size).toBe(0);
    expect(out).toEqual([]);
  });

  test("geofence: enter, leave with hysteresis, no leave when starting outside", () => {
    const f = fakeNav();
    const { run, out } = setup(f.navigator);
    const c = { lat: 10, lng: 10 };
    const at = (m: number) => {
      const p = geo.destination(c, m, 0);
      return pos(p.lat, p.lng);
    };
    run(
      g.geofence({
        id: "f",
        center: c,
        radius: 100,
        hysteresis: 20,
        onChange: "fence",
      }),
    );
    const w = f.watchers.get(1)!;
    w.ok(at(300)); // starts outside: silent
    w.ok(at(110)); // still outside
    w.ok(at(90)); // enter
    w.ok(at(115)); // in hysteresis band: stays inside
    w.ok(at(95));
    w.ok(at(125)); // leave
    w.ok(at(110)); // outside until <= radius
    w.ok(at(99)); // enter again
    const evs = out.map((m) => (m.payload as any).event);
    expect(evs).toEqual(["enter", "leave", "enter"]);
    expect((out[0]!.payload as any).distance).toBeCloseTo(90, 3);
    expect((out[0]!.payload as any).position.lat).toBeDefined();
  });

  test("geofence starting inside enters at once; restart resets; clearGeofence stops", () => {
    const f = fakeNav();
    const { run, out, plugin } = setup(f.navigator);
    const spec = {
      id: "f",
      center: { lat: 0, lng: 0 },
      radius: 50,
      onChange: "fence",
    };
    run(g.geofence(spec));
    f.watchers.get(1)!.ok(pos(0, 0));
    expect(out).toHaveLength(1);
    run(g.geofence(spec)); // restart: state forgotten
    expect(f.cleared).toEqual([1]);
    f.watchers.get(2)!.ok(pos(0, 0));
    expect(out).toHaveLength(2);
    run(g.clearGeofence("f"));
    expect(plugin.geofences()).toEqual([]);
    expect(f.watchers.size).toBe(0);
  });

  test("geofence default hysteresis is 10% of radius", () => {
    const f = fakeNav();
    const { run, out } = setup(f.navigator);
    const c = { lat: 0, lng: 0 };
    run(g.geofence({ id: "f", center: c, radius: 100, onChange: "x" }));
    const w = f.watchers.get(1)!;
    const at = (m: number) => {
      const p = geo.destination(c, m, 90);
      return pos(p.lat, p.lng);
    };
    w.ok(at(50));
    w.ok(at(109));
    expect(out).toHaveLength(1);
    w.ok(at(111));
    expect(out).toHaveLength(2);
  });
});
