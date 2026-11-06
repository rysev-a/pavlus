import { expect, test } from "vitest";
import {
  bookingCells,
  bookingState,
  fullDate,
  formatTime,
  generateStarts,
  isBusy,
  minutesOf,
  referenceOf,
  slotsFor,
  summaryOf,
  validateBooking,
  weekdayOf,
} from "../blocks/booking-calendar/booking-calendar.ts";
import {
  ALL,
  categoriesOf,
  filterPhotos,
  galleryState,
  lightboxOf,
  positionLabel,
  stepIndex,
  type Photo,
} from "../blocks/gallery/gallery.ts";
import {
  categoriesOf as projectCategories,
  filterProjects,
  findProject,
  initial as projectDemo,
  projectGridState,
} from "../blocks/project-grid/project-grid.ts";
import { initialsOf, levelLabel, skill } from "../blocks/resume/resume.ts";
import { withLists } from "../blocks/timeline/timeline.ts";

const photo = (key: string, category: string): Photo => ({
  key,
  title: key,
  caption: "",
  category,
  tone: 0,
  shape: "square",
  emoji: "",
});
const photos = [photo("a", "x"), photo("b", "y"), photo("c", "x")];

test("resume helpers: level words, clamped skills, initials, timeline lists", () => {
  expect(levelLabel(95)).toBe("Expert");
  expect(levelLabel(80)).toBe("Advanced");
  expect(levelLabel(50)).toBe("Intermediate");
  expect(levelLabel(10)).toBe("Familiar");
  expect(skill("Go", 140)).toEqual({ name: "Go", level: 100, label: "Expert" });
  expect(skill("Go", -5).level).toBe(0);
  expect(initialsOf("Mira  okafor")).toBe("MO");
  expect(initialsOf("")).toBe("");
  const [item] = withLists([{ key: "k", period: "2020", title: "T" }]);
  expect(item).toMatchObject({ org: "", text: "", points: [], tags: [] });
});

test("project grid: categories with counts, filter, find, state", () => {
  const { projects } = projectDemo.grid;
  const cats = projectCategories(projects);
  expect(cats[0]).toEqual({ id: ALL, label: "All", count: 3 });
  expect(cats.map((c) => c.id)).toEqual([ALL, "Product", "Brand"]);
  expect(cats[1].count).toBe(2);
  expect(filterProjects(projects, ALL)).toBe(projects);
  expect(filterProjects(projects, "Product").map((p) => p.key)).toEqual([
    "atlas",
    "pulse",
  ]);
  expect(filterProjects(projects, "none")).toEqual([]);
  expect(findProject(projects, "fern")?.title).toBe("Fern Botanicals");
  expect(findProject(projects, "zzz")).toBeNull();
  const state = projectGridState(projects, { filters: false });
  expect(state).toMatchObject({
    filter: ALL,
    current: null,
    showFilters: false,
    details: true,
  });
});

test("gallery: filter, counts, wrap-around steps, lightbox fields", () => {
  expect(filterPhotos(photos, ALL)).toBe(photos);
  expect(filterPhotos(photos, "x").map((p) => p.key)).toEqual(["a", "c"]);
  const cats = categoriesOf(photos, { x: "Ex", y: "Why", z: "Zed" });
  expect(cats.map((c) => c.count)).toEqual([3, 2, 1, 0]);
  expect(stepIndex(0, -1, 3)).toBe(2);
  expect(stepIndex(2, 1, 3)).toBe(0);
  expect(stepIndex(1, 1, 3)).toBe(2);
  expect(stepIndex(0, 1, 0)).toBe(-1);
  expect(positionLabel(2, 12)).toBe("3 / 12");
  expect(positionLabel(-1, 12)).toBe("");
  expect(lightboxOf(photos, 1)).toMatchObject({
    index: 1,
    position: "2 / 3",
  });
  expect(lightboxOf(photos, 1).current?.key).toBe("b");
  expect(lightboxOf(photos, 9)).toEqual({
    index: -1,
    current: null,
    position: "",
  });
  expect(galleryState(photos, { x: "Ex" })).toMatchObject({
    category: ALL,
    index: -1,
    current: null,
  });
});

test("booking: weekdays, times, slot generation, taken slots", () => {
  expect(weekdayOf("2026-11-14")).toBe(6);
  expect(fullDate("2026-11-14")).toBe("Saturday, November 14, 2026");
  expect(formatTime(570)).toBe("09:30");
  expect(minutesOf("09:30")).toBe(570);
  // 9:00 to 18:00, two-hour sessions and a half hour between them
  expect(generateStarts(540, 1080, 120, 30).map(formatTime)).toEqual([
    "09:00",
    "11:30",
    "14:00",
  ]);
  expect(generateStarts(540, 1080, 0, 30)).toEqual([]);
  expect(generateStarts(540, 600, 120, 30)).toEqual([]);
  expect(isBusy("2026-11-14", "09:00")).toBe(isBusy("2026-11-14", "09:00"));

  const state = bookingState("2026-11-03");
  const session = state.sessions.find((s) => s.id === "event");
  const slots = slotsFor("2026-11-14", session, state.hours, []);
  expect(slots.map((s) => s.label)).toEqual(["09:00 - 12:00", "12:30 - 15:30"]);
  const free = slots.find((s) => !s.taken);
  expect(free).toBeDefined();
  const booked = [`2026-11-14 ${free?.time}`];
  expect(
    slotsFor("2026-11-14", session, state.hours, booked).every((s) => s.taken),
  ).toBe(true);
  expect(slotsFor("", session, state.hours, [])).toEqual([]);
  expect(slotsFor("2026-11-14", undefined, state.hours, [])).toEqual([]);
});

test("booking: calendar cells, validation, summary, reference", () => {
  const cells = bookingCells({ year: 2026, month: 10 }, "2026-11-03", [1]);
  const byIso = (iso: string) => cells.find((c) => c.iso === iso);
  expect(byIso("2026-11-02")?.available).toBe(false); // past
  expect(byIso("2026-11-03")?.available).toBe(true); // today, Tuesday
  expect(byIso("2026-11-09")?.available).toBe(false); // Monday: closed
  expect(byIso("2026-11-10")?.available).toBe(true);
  expect(cells.filter((c) => c.day === 0).every((c) => !c.available)).toBe(
    true,
  );

  expect(validateBooking({ name: "", email: "x" })).toEqual({
    name: "Tell us your name.",
    email: "Enter a valid email address.",
  });
  expect(validateBooking({ name: "Ana", email: "ana@example.com" })).toEqual(
    {},
  );

  const slots = [{ time: "11:30", label: "11:30 - 13:30", taken: false }];
  expect(summaryOf("2026-11-14", slots, "11:30")).toBe(
    "Saturday, November 14, 2026 at 11:30 - 13:30",
  );
  expect(summaryOf("2026-11-14", slots, "")).toBe("");
  expect(summaryOf("", slots, "11:30")).toBe("");
  expect(referenceOf("2026-11-14", "11:30")).toBe("BK-1114-1130");
});
