import { Component, type Effect, type Message } from "@pavlus/frontend";
import { storeEffector as store } from "@pavlus/frontend/plugins";
import { pickerProps } from "../../blocks/day-picker/day-picker.ts";
import {
  money,
  SERVICES,
  type Service,
  serviceRows,
} from "../../blocks/service-list/service-list.ts";
import {
  type Busy,
  clock12,
  durationLabel,
  fromMinutes,
  type Schedule,
  slotStates,
  slotTimes,
  takenBy,
  toMinutes,
  weekdayOf,
} from "../../blocks/time-slots/time-slots.ts";
import {
  type Worker,
  withSelected,
} from "../../blocks/worker-picker/worker-picker.ts";
import { MONTHS, type Month, shiftMonth } from "../../lib/calendar.ts";
import view from "./service-booking-site.pavlus";

/** The shop's "today": a fixed date, the page never reads a clock. */
export const TODAY = "2026-11-03";

export const PEOPLE: Omit<Worker, "selected">[] = [
  {
    id: "marco",
    name: "Marco Bellini",
    role: "Master barber",
    initials: "MB",
    specialties: ["Classic cuts", "Fades", "Scissor work"],
    rating: 4.9,
    reviews: 212,
    tone: 1,
  },
  {
    id: "elena",
    name: "Elena Rossi",
    role: "Senior stylist",
    initials: "ER",
    specialties: ["Long hair", "Kids", "Textured cuts"],
    rating: 4.8,
    reviews: 164,
    tone: 2,
  },
  {
    id: "dmitri",
    name: "Dmitri Volkov",
    role: "Barber",
    initials: "DV",
    specialties: ["Beard design", "Hot towel shave"],
    rating: 4.6,
    reviews: 98,
    tone: 3,
  },
];

/** Who works when: weekdays are 0 = Sunday. */
export const SCHEDULES: Record<string, Schedule> = {
  marco: {
    days: [2, 3, 4, 5, 6],
    open: "09:00",
    close: "18:00",
    breakFrom: "13:00",
    breakTo: "14:00",
    step: 30,
  },
  elena: {
    days: [1, 2, 3, 4, 5],
    open: "10:00",
    close: "19:00",
    breakFrom: "14:00",
    breakTo: "15:00",
    step: 30,
  },
  dmitri: {
    days: [3, 4, 5, 6, 0],
    open: "11:00",
    close: "20:00",
    step: 30,
  },
};

export interface Booking {
  id: number;
  serviceId: string;
  workerId: string;
  date: string;
  time: string;
  name: string;
  phone: string;
  email: string;
  notes: string;
  cancelled: boolean;
}

export interface Contact {
  name: string;
  phone: string;
  email: string;
  notes: string;
}

export type Errors = Record<string, string>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Pure: what is wrong with the contact form, by field. */
export function validateContact(c: Contact): Errors {
  const errors: Errors = {};
  if (c.name.trim().length < 2) errors.name = "Tell us your name.";
  if (c.phone.replace(/\D/g, "").length < 7)
    errors.phone = "Enter a phone number we can reach (at least 7 digits).";
  if (!EMAIL.test(c.email.trim()))
    errors.email = "Enter a valid email address.";
  if (c.notes.length > 200)
    errors.notes = "Keep the note under 200 characters.";
  return errors;
}

/** Pure: `OB-1004`. */
export const bookingCode = (id: number): string => `OB-${1000 + id}`;

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** Pure: `Wednesday, November 4 at 10:30 AM` (or just the day without a time). */
export function whenLabel(iso: string, time: string): string {
  if (!iso) return "";
  const [, m, d] = iso.split("-").map(Number);
  const day = `${DAYS[weekdayOf(iso)]}, ${MONTHS[m - 1]} ${d}`;
  return time ? `${day} at ${clock12(time)}` : day;
}

/** Pure: when the service ends, `11:15 AM`. */
export const endLabel = (time: string, duration: number): string =>
  clock12(fromMinutes(toMinutes(time) + duration));

/**
 * Pure: what is taken for a person on a date: what other clients took, and
 * the bookings of this visitor that are not cancelled.
 */
export function busyFor(
  workerId: string,
  iso: string,
  bookings: Booking[],
  services: Service[],
): Busy[] {
  const schedule = SCHEDULES[workerId];
  if (!schedule) return [];
  const mine = bookings
    .filter((b) => !b.cancelled && b.workerId === workerId && b.date === iso)
    .map((b) => ({
      start: b.time,
      duration: services.find((s) => s.id === b.serviceId)?.duration ?? 30,
    }));
  return [...takenBy(schedule, workerId, iso), ...mine];
}

/** Pure: can the visitor leave this step? */
export function canContinue(
  step: number,
  s: Pick<Core, "serviceId" | "workerId" | "time">,
): boolean {
  if (step === 1) return s.serviceId !== "";
  if (step === 2) return s.workerId !== "";
  if (step === 3) return s.time !== "";
  return true;
}

export interface Core {
  step: number;
  done: boolean;
  tab: "book" | "mine";
  serviceId: string;
  workerId: string;
  month: Month;
  date: string;
  time: string;
  form: Contact;
  errors: Errors;
  bookings: Booking[];
  nextId: number;
  lastId: number;
}

export interface SummaryView {
  service: string;
  worker: string;
  when: string;
  price: string;
  duration: string;
  ends: string;
}

export interface BookingRow {
  id: number;
  code: string;
  service: string;
  worker: string;
  when: string;
  price: string;
  cancelled: boolean;
}

/** Pure: the summary of what is chosen so far. */
export function summaryOf(
  s: Pick<Core, "serviceId" | "workerId" | "date" | "time">,
): SummaryView {
  const service = SERVICES.find((x) => x.id === s.serviceId);
  const worker = PEOPLE.find((x) => x.id === s.workerId);
  return {
    service: service?.name ?? "Not chosen yet",
    worker: worker?.name ?? "Not chosen yet",
    when: s.time ? whenLabel(s.date, s.time) : "Not chosen yet",
    price: service ? money(service.price) : "–",
    duration: service ? durationLabel(service.duration) : "–",
    ends: service && s.time ? endLabel(s.time, service.duration) : "–",
  };
}

/** Pure: the rows of "my bookings", the newest first. */
export function bookingRows(bookings: Booking[]): BookingRow[] {
  return [...bookings]
    .sort((a, b) => b.id - a.id)
    .map((b) => {
      const service = SERVICES.find((x) => x.id === b.serviceId);
      return {
        id: b.id,
        code: bookingCode(b.id),
        service: service?.name ?? b.serviceId,
        worker: PEOPLE.find((x) => x.id === b.workerId)?.name ?? b.workerId,
        when: whenLabel(b.date, b.time),
        price: service ? money(service.price) : "",
        cancelled: b.cancelled,
      };
    });
}

export const STEPS = ["Service", "Barber", "Date and time", "Your details"];

export function derive(s: Core) {
  const service = SERVICES.find((x) => x.id === s.serviceId);
  const schedule = SCHEDULES[s.workerId];
  const duration = service?.duration ?? 30;
  const times = schedule ? slotTimes(schedule, s.date, duration) : [];
  const slots = slotStates(
    times,
    duration,
    busyFor(s.workerId, s.date, s.bookings, SERVICES),
    s.time,
  );
  const closed = schedule
    ? [0, 1, 2, 3, 4, 5, 6].filter((d) => !schedule.days.includes(d))
    : [0];
  return {
    rows: serviceRows(SERVICES, s.serviceId),
    workers: withSelected(PEOPLE, s.workerId),
    days: pickerProps(s.month, { selected: s.date, min: TODAY, closed }),
    slots,
    free: slots.filter((x) => !x.taken).length,
    summary: summaryOf(s),
    mine: bookingRows(s.bookings),
    activeCount: s.bookings.filter((b) => !b.cancelled).length,
    steps: STEPS.map((title, i) => ({
      n: i + 1,
      title,
      current: s.step === i + 1,
      done: s.step > i + 1 || s.done,
    })),
    canNext: canContinue(s.step, s),
    last: s.step === 4,
    dayLabel: whenLabel(s.date, ""),
    confirmed:
      bookingRows(s.bookings.filter((b) => b.id === s.lastId))[0] ?? null,
  };
}

const seeded: Booking = {
  id: 1,
  serviceId: "beard",
  workerId: "dmitri",
  date: "2026-11-06",
  time: "16:00",
  name: "Ann Lee",
  phone: "+1 555 0142",
  email: "ann@example.com",
  notes: "",
  cancelled: false,
};

const core: Core = {
  step: 1,
  done: false,
  tab: "book",
  serviceId: "",
  workerId: "",
  month: { year: 2026, month: 10 },
  date: "2026-11-04",
  time: "",
  form: { name: "", phone: "", email: "", notes: "" },
  errors: {},
  bookings: [seeded],
  nextId: 2,
  lastId: 0,
};

export interface BookingState extends Core, ReturnType<typeof derive> {
  links: { label: string; href: string }[];
}

export const initial: BookingState = {
  ...core,
  ...derive(core),
  links: [
    { label: "Book", href: "#book" },
    { label: "Bookings", href: "#mine" },
  ],
};

const CORE_KEYS = Object.keys(core) as (keyof Core)[];

const coreOf = (state: BookingState): Core => {
  const c = {} as Record<string, unknown>;
  for (const k of CORE_KEYS) c[k] = state[k];
  return c as unknown as Core;
};

export class ServiceBookingSite extends Component<BookingState> {
  view = view;

  "services.pick"(msg: Message, state: BookingState): Effect[] {
    return this._show(state, { serviceId: msg.payload as string, time: "" });
  }

  "workers.pick"(msg: Message, state: BookingState): Effect[] {
    return this._show(state, { workerId: msg.payload as string, time: "" });
  }

  "days.prev"(_msg: Message, state: BookingState): Effect[] {
    return this._show(state, { month: shiftMonth(state.month, -1) });
  }

  "days.next"(_msg: Message, state: BookingState): Effect[] {
    return this._show(state, { month: shiftMonth(state.month, 1) });
  }

  "days.pick"(msg: Message, state: BookingState): Effect[] {
    return this._show(state, { date: msg.payload as string, time: "" });
  }

  "slots.pick"(msg: Message, state: BookingState): Effect[] {
    return this._show(state, { time: msg.payload as string });
  }

  next(_msg: Message, state: BookingState): Effect[] {
    if (!canContinue(state.step, state)) return [];
    return this._show(state, { step: Math.min(4, state.step + 1) });
  }

  back(_msg: Message, state: BookingState): Effect[] {
    return this._show(state, { step: Math.max(1, state.step - 1) });
  }

  goStep(msg: Message, state: BookingState): Effect[] {
    const n = msg.payload as number;
    // you can go back to any step, forward only as far as the choices allow
    for (let i = 1; i < n; i++) if (!canContinue(i, state)) return [];
    return this._show(state, { step: n });
  }

  setField(msg: Message, state: BookingState): Effect[] {
    const name = msg.payload as keyof Contact;
    return this._show(state, {
      form: { ...state.form, [name]: msg.event?.value ?? "" },
    });
  }

  confirm(_msg: Message, state: BookingState): Effect[] {
    const errors = validateContact(state.form);
    if (Object.keys(errors).length > 0) return this._show(state, { errors });
    const booking: Booking = {
      id: state.nextId,
      serviceId: state.serviceId,
      workerId: state.workerId,
      date: state.date,
      time: state.time,
      ...state.form,
      cancelled: false,
    };
    return this._show(state, {
      errors: {},
      done: true,
      bookings: [...state.bookings, booking],
      nextId: state.nextId + 1,
      lastId: booking.id,
    });
  }

  cancel(msg: Message, state: BookingState): Effect[] {
    return this._show(state, {
      bookings: state.bookings.map((b) =>
        b.id === msg.payload ? { ...b, cancelled: true } : b,
      ),
    });
  }

  /** Start over, keeping the contact details and the bookings. */
  another(_msg: Message, state: BookingState): Effect[] {
    return this._show(state, {
      done: false,
      step: 1,
      tab: "book",
      serviceId: "",
      workerId: "",
      time: "",
    });
  }

  setTab(msg: Message, state: BookingState): Effect[] {
    return this._show(state, { tab: msg.payload as Core["tab"] });
  }

  _show(state: BookingState, patch: Partial<Core>): Effect[] {
    const next: Core = { ...coreOf(state), ...patch };
    const derived = derive(next);
    return [
      ...(Object.keys(patch) as (keyof Core)[]).map((k) =>
        store.set(k, patch[k]),
      ),
      ...(Object.keys(derived) as (keyof typeof derived)[]).map((k) =>
        store.set(k, derived[k]),
      ),
    ];
  }
}

export const page = new ServiceBookingSite();
