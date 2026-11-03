import { expect, test } from "vitest";
import {
  dayCells,
  isPickable,
  pickerProps,
} from "../blocks/day-picker/day-picker.ts";
import {
  money,
  serviceRows,
  SERVICES,
} from "../blocks/service-list/service-list.ts";
import {
  clock12,
  durationLabel,
  fromMinutes,
  hashOf,
  isBusy,
  overlaps,
  type Schedule,
  slotStates,
  slotTimes,
  takenBy,
  toMinutes,
  weekdayOf,
  worksOn,
} from "../blocks/time-slots/time-slots.ts";
import {
  averageRating,
  stars,
  withSelected,
} from "../blocks/worker-picker/worker-picker.ts";
import {
  bookingCode,
  busyFor,
  canContinue,
  endLabel,
  type Booking,
  summaryOf,
  validateContact,
  whenLabel,
} from "../templates/service-booking-site/service-booking-site.ts";

const schedule: Schedule = {
  days: [1, 2, 3, 4, 5],
  open: "09:00",
  close: "12:00",
  breakFrom: "10:30",
  breakTo: "11:00",
  step: 30,
};

test("time and weekday helpers", () => {
  expect(toMinutes("09:30")).toBe(570);
  expect(fromMinutes(570)).toBe("09:30");
  expect(fromMinutes(65)).toBe("01:05");
  expect(clock12("00:15")).toBe("12:15 AM");
  expect(clock12("12:00")).toBe("12:00 PM");
  expect(clock12("14:30")).toBe("2:30 PM");
  expect(weekdayOf("2026-11-03")).toBe(2); // a Tuesday
  expect(weekdayOf("2026-11-08")).toBe(0);
  expect(worksOn(schedule, "2026-11-07")).toBe(false); // a Saturday
  expect(overlaps(0, 30, 30, 30)).toBe(false);
  expect(overlaps(0, 31, 30, 30)).toBe(true);
  expect(durationLabel(30)).toBe("30 min");
  expect(durationLabel(60)).toBe("1 h");
  expect(durationLabel(75)).toBe("1 h 15 min");
});

test("slots fit the hours and skip the break", () => {
  // a 30 minute service: 9:00, 9:30, 10:00, (10:30 is the break), 11:00, 11:30
  expect(slotTimes(schedule, "2026-11-04", 30)).toEqual([
    "09:00",
    "09:30",
    "10:00",
    "11:00",
    "11:30",
  ]);
  // an hour: nothing may cross the break or the closing time
  expect(slotTimes(schedule, "2026-11-04", 60)).toEqual([
    "09:00",
    "09:30",
    "11:00",
  ]);
  // a day off has no slots
  expect(slotTimes(schedule, "2026-11-07", 30)).toEqual([]);
  // longer than the day
  expect(slotTimes(schedule, "2026-11-04", 240)).toEqual([]);
});

test("taken slots are deterministic and block overlapping services", () => {
  expect(hashOf("a")).toBe(hashOf("a"));
  expect(hashOf("a")).not.toBe(hashOf("b"));
  const busy = takenBy(schedule, "marco", "2026-11-04");
  expect(busy).toEqual(takenBy(schedule, "marco", "2026-11-04"));
  expect(takenBy(schedule, "elena", "2026-11-04")).not.toEqual(
    takenBy(schedule, "marco", "2026-11-05"),
  );
  const fixed = [{ start: "09:30", duration: 30 }];
  expect(isBusy("09:00", 30, fixed)).toBe(false);
  expect(isBusy("09:00", 45, fixed)).toBe(true);
  expect(isBusy("09:30", 30, fixed)).toBe(true);
  expect(isBusy("10:00", 30, fixed)).toBe(false);
  const slots = slotStates(["09:00", "09:30", "10:00"], 30, fixed, "10:00");
  expect(slots.map((s) => [s.label, s.taken, s.selected])).toEqual([
    ["9:00 AM", false, false],
    ["9:30 AM", true, false],
    ["10:00 AM", false, true],
  ]);
});

test("the day picker disables the past, closed weekdays and the limit", () => {
  const rules = { selected: "2026-11-05", min: "2026-11-03", closed: [0] };
  expect(isPickable("2026-11-02", rules)).toBe(false);
  expect(isPickable("2026-11-03", rules)).toBe(true);
  expect(isPickable("2026-11-08", rules)).toBe(false); // Sunday
  expect(isPickable("2026-12-31", { ...rules, max: "2026-12-01" })).toBe(false);
  const cells = dayCells({ year: 2026, month: 10 }, rules);
  const nov5 = cells.find((c) => c.iso === "2026-11-05");
  expect(nov5?.selected).toBe(true);
  expect(cells.find((c) => c.iso === "2026-11-01")?.disabled).toBe(true);
  expect(cells.filter((c) => c.day === 0).every((c) => c.disabled)).toBe(true);
  expect(pickerProps({ year: 2026, month: 10 }, rules).canGoBack).toBe(false);
  expect(pickerProps({ year: 2026, month: 11 }, rules).canGoBack).toBe(true);
  expect(pickerProps({ year: 2026, month: 10 }, rules).title).toBe(
    "November 2026",
  );
});

test("workers and services", () => {
  expect(stars(4.9)).toBe("★★★★★");
  expect(stars(4.4)).toBe("★★★★☆");
  expect(stars(0)).toBe("☆☆☆☆☆");
  const people = withSelected(
    [
      {
        id: "a",
        name: "A",
        role: "",
        initials: "A",
        specialties: [],
        rating: 5,
        reviews: 10,
        tone: 1,
      },
      {
        id: "b",
        name: "B",
        role: "",
        initials: "B",
        specialties: [],
        rating: 4,
        reviews: 30,
        tone: 2,
      },
    ],
    "b",
  );
  expect(people.map((p) => p.selected)).toEqual([false, true]);
  expect(averageRating(people)).toBe(4.3);
  expect(averageRating([])).toBe(0);
  expect(money(35)).toBe("$35");
  expect(money(12.5)).toBe("$12.50");
  const rows = serviceRows(SERVICES, "beard");
  expect(rows.find((r) => r.selected)?.id).toBe("beard");
  expect(rows[0].durationLabel).toBe("45 min");
});

test("the contact form is validated", () => {
  expect(
    validateContact({ name: "", phone: "", email: "", notes: "" }),
  ).toMatchObject({
    name: expect.any(String),
    phone: expect.any(String),
    email: expect.any(String),
  });
  expect(
    validateContact({
      name: "Ann Lee",
      phone: "+1 555 0142",
      email: "ann@example.com",
      notes: "",
    }),
  ).toEqual({});
  expect(
    validateContact({
      name: "Ann",
      phone: "123",
      email: "ann@example.com",
      notes: "x".repeat(201),
    }),
  ).toHaveProperty("notes");
});

test("booking text, summary and busy times", () => {
  expect(bookingCode(7)).toBe("OB-1007");
  expect(whenLabel("2026-11-04", "10:30")).toBe(
    "Wednesday, November 4 at 10:30 AM",
  );
  expect(whenLabel("2026-11-04", "")).toBe("Wednesday, November 4");
  expect(endLabel("10:30", 45)).toBe("11:15 AM");
  expect(
    summaryOf({
      serviceId: "combo",
      workerId: "marco",
      date: "2026-11-04",
      time: "10:30",
    }),
  ).toMatchObject({ price: "$52", duration: "1 h 15 min", ends: "11:45 AM" });
  expect(
    summaryOf({ serviceId: "", workerId: "", date: "2026-11-04", time: "" })
      .price,
  ).toBe("–");
  expect(canContinue(1, { serviceId: "", workerId: "", time: "" })).toBe(false);
  expect(canContinue(3, { serviceId: "x", workerId: "y", time: "09:00" })).toBe(
    true,
  );

  const mine: Booking = {
    id: 1,
    serviceId: "haircut",
    workerId: "marco",
    date: "2026-11-04",
    time: "09:00",
    name: "",
    phone: "",
    email: "",
    notes: "",
    cancelled: false,
  };
  const withMine = busyFor("marco", "2026-11-04", [mine], SERVICES);
  expect(withMine).toContainEqual({ start: "09:00", duration: 45 });
  // a cancelled booking frees the slot
  const cancelled = busyFor(
    "marco",
    "2026-11-04",
    [{ ...mine, cancelled: true }],
    SERVICES,
  );
  expect(cancelled).not.toContainEqual({ start: "09:00", duration: 45 });
});
