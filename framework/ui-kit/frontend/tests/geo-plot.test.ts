import { expect, test } from "vitest";
import { boxOf, degrees, geoPlot, niceStep } from "../blocks/geo-plot/geo.ts";

const place = (id: string, lat: number, lng: number) => ({
  id,
  label: id,
  sub: "",
  lat,
  lng,
  tone: "default" as const,
});

test("niceStep gives round steps", () => {
  expect(niceStep(100)).toBe(20);
  expect(niceStep(360)).toBe(100);
  expect(niceStep(2)).toBe(0.5);
  expect(niceStep(0)).toBe(1);
});

test("degrees writes hemispheres", () => {
  expect(degrees(-33.9, "lat")).toBe("33.9°S");
  expect(degrees(151.2, "lng")).toBe("151.2°E");
  expect(degrees(-0.5, "lng")).toBe("0.5°W");
  expect(degrees(0, "lat")).toBe("0°");
});

test("the box has a margin and a minimal span", () => {
  const box = boxOf([place("a", 10, 20), place("b", 30, 60)], 0.1);
  expect(box.minLat).toBeCloseTo(8);
  expect(box.maxLat).toBeCloseTo(32);
  expect(box.minLng).toBeCloseTo(16);
  expect(box.maxLng).toBeCloseTo(64);
  const one = boxOf([place("a", 5, 5)]);
  expect(one.maxLat - one.minLat).toBeGreaterThanOrEqual(2);
  expect(boxOf([]).maxLng).toBe(180);
});

test("points land inside the frame, north is up", () => {
  const plot = geoPlot(
    [place("sw", -10, -20), place("ne", 10, 20), place("mid", 0, 0)],
    "ne",
  );
  const by = Object.fromEntries(plot.points.map((p) => [p.id, p]));
  expect(by.mid.x).toBe(50);
  expect(by.mid.y).toBe(50);
  expect(by.sw.x).toBeGreaterThan(0);
  expect(by.sw.y).toBeGreaterThan(0);
  expect(by.ne.x).toBeLessThan(100);
  expect(by.ne.y).toBeGreaterThan(by.sw.y);
  expect(by.ne.x).toBeGreaterThan(by.sw.x);
  expect(by.ne.active).toBe(true);
  expect(by.sw.active).toBe(false);
  expect(by.ne.flipX).toBe(true);
  expect(by.ne.flipY).toBe(true);
  expect(by.sw.flipX).toBe(false);
});

test("ticks stay inside the frame and are labelled", () => {
  const plot = geoPlot([place("a", 40, -10), place("b", 55, 30)]);
  for (const t of [...plot.ticks.lng, ...plot.ticks.lat]) {
    expect(t.pos).toBeGreaterThanOrEqual(0);
    expect(t.pos).toBeLessThanOrEqual(100);
  }
  expect(plot.ticks.lat.length).toBeGreaterThan(2);
  expect(plot.ticks.lat[0].label).toMatch(/°N$/);
  expect(plot.ticks.lng.some((t) => /°[EW]$/.test(t.label))).toBe(true);
});

test("the legend lists only the tones in use", () => {
  const plot = geoPlot([place("a", 1, 1)], null, [
    { tone: "default", label: "Flagship" },
    { tone: "success", label: "Kiosk" },
  ]);
  expect(plot.legend.map((l) => l.label)).toEqual(["Flagship"]);
});

test("a single point is centred", () => {
  const plot = geoPlot([place("a", 48, 9)]);
  expect(plot.points[0].x).toBe(50);
  expect(plot.points[0].y).toBe(50);
});
