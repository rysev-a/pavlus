import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import { patch } from "../admin-shell/shell.ts";
import {
  type Booking,
  type Day,
  dayLabel,
  daysFrom,
  freeNights,
  type GridRow,
  gridRows,
  marksOf,
  nextBookingId,
  type Room,
} from "./bookings.ts";
import view from "./booking-grid.pavlus";

export interface BookingGridState {
  days: Day[];
  rooms: Room[];
  bookings: Booking[];
  rows: GridRow[];
  message: string;
}

const N = 10;
const DAYS = daysFrom(2026, 11, 1, N, 2);
const MARKS = marksOf(DAYS);
const ROOMS: Room[] = [
  { id: "101", name: "101", kind: "Single", floor: 1 },
  { id: "102", name: "102", kind: "Double", floor: 1 },
  { id: "201", name: "201", kind: "Double", floor: 2 },
  { id: "202", name: "202", kind: "Suite", floor: 2 },
];
const BOOKINGS: Booking[] = [
  {
    id: "b1",
    room: "101",
    guest: "Ann Lee",
    from: -1,
    nights: 4,
    status: "in",
    note: "",
  },
  {
    id: "b2",
    room: "101",
    guest: "Jon Park",
    from: 5,
    nights: 3,
    status: "expected",
    note: "",
  },
  {
    id: "b3",
    room: "102",
    guest: "Eva Stone",
    from: 1,
    nights: 2,
    status: "out",
    note: "",
  },
  {
    id: "b4",
    room: "102",
    guest: "Max Roy",
    from: 3,
    nights: 6,
    status: "expected",
    note: "",
  },
  {
    id: "b5",
    room: "201",
    guest: "Lia Chen",
    from: 0,
    nights: 10,
    status: "in",
    note: "",
  },
  {
    id: "b6",
    room: "202",
    guest: "Tom Reed",
    from: 2,
    nights: 2,
    status: "in",
    note: "",
  },
  {
    id: "b7",
    room: "202",
    guest: "Ivy Nash",
    from: 7,
    nights: 2,
    status: "expected",
    note: "",
  },
];

export const initial: BookingGridState = {
  days: DAYS,
  rooms: ROOMS,
  bookings: BOOKINGS,
  rows: gridRows(ROOMS, BOOKINGS, N, MARKS),
  message: "Click a free day to book two nights, click a booking to remove it.",
};

export class BookingGridPage extends Component<BookingGridState> {
  view = view;

  "grid.book"(msg: Message, state: BookingGridState): Effect[] {
    const [room, day] = msg.payload as [string, number];
    const nights = freeNights(state.bookings, room, day, 2, N);
    if (nights === 0) return [];
    const bookings = [
      ...state.bookings,
      {
        id: nextBookingId(state.bookings),
        room,
        guest: "New guest",
        from: day,
        nights,
        status: "expected" as const,
        note: "",
      },
    ];
    return patch({
      bookings,
      rows: gridRows(ROOMS, bookings, N, MARKS),
      message: `Room ${room} booked from ${dayLabel(DAYS, day)}.`,
    });
  }

  "grid.open"(msg: Message, state: BookingGridState): Effect[] {
    const bookings = state.bookings.filter((b) => b.id !== msg.payload);
    return patch({
      bookings,
      rows: gridRows(ROOMS, bookings, N, MARKS),
      message: "The booking was removed.",
    });
  }
}

export const page = new BookingGridPage();
