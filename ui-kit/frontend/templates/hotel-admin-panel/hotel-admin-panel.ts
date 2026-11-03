import type { Effect, Message } from "@service-laboratory/pavlus";
import { AdminApp, type AppState } from "../../blocks/admin-shell/app.ts";
import {
  type NavGroup,
  notice,
  patch,
  type ShellAction,
  type ShellUser,
  withBadge,
} from "../../blocks/admin-shell/shell.ts";
import type { Booking, Day } from "../../blocks/booking-grid/bookings.ts";
import {
  type Filter,
  filtersOf,
  type ToolbarAction,
} from "../../blocks/list-filter/filters.ts";
import {
  button,
  type Detail,
  type Field,
  type SheetButton,
} from "../../blocks/record-sheet/sheet.ts";
import {
  arrivalsOn,
  advanceStay,
  BOOKINGS,
  bookingDetails,
  bookingFields,
  type BookingDraft,
  cleaningAfterCheckout,
  CLEANING,
  CLEAN_FILTERS,
  DAYS,
  defaultNights,
  draftOf,
  firstFreeRoom,
  saveBooking,
  STAY_FILTERS,
  TODAY,
  toClean,
  validateBooking,
  views,
  type CleanTask,
  type HotelData,
  type HotelViews,
} from "./hotel.ts";
import view from "./hotel-admin-panel.pavlus";

export interface SheetState {
  open: boolean;
  /** The booking being edited; empty for a new one. */
  id: string;
  draft: BookingDraft;
  title: string;
  description: string;
  fields: Field[];
  details: Detail[];
  buttons: SheetButton[];
}

export interface HotelState extends AppState, HotelData, HotelViews {
  user: ShellUser;
  actions: ShellAction[];
  days: Day[];
  /** No buttons in a toolbar. */
  none: ToolbarAction[];
  stayFilters: Filter[];
  cleanFilters: Filter[];
  sheet: SheetState;
}

const GROUPS: NavGroup[] = [
  {
    title: "Front desk",
    items: [
      { id: "overview", label: "Overview", icon: "k-ai-home" },
      { id: "grid", label: "Booking grid", icon: "k-ai-grid" },
      { id: "checkin", label: "Check-in", icon: "k-ai-clipboard" },
    ],
  },
  {
    title: "Housekeeping",
    items: [{ id: "cleaning", label: "Cleaning", icon: "k-ai-sparkles" }],
  },
];

const draftBooking = (
  room: string,
  day: number,
  nights: number,
): BookingDraft => ({
  guest: "",
  room,
  from: String(day),
  nights: String(nights),
  status: "expected",
});

/** Pure: the sheet for a draft: new (no id) or an existing booking. */
export function sheetFor(
  id: string,
  draft: BookingDraft,
  errors: Record<string, string> = {},
): SheetState {
  return {
    open: true,
    id,
    draft,
    title: id ? `Booking of ${draft.guest || "a guest"}` : "New booking",
    description: id
      ? "Change the dates, the room or the status."
      : "Choose the room and the days for the guest.",
    fields: bookingFields(draft, errors),
    details: bookingDetails(draft),
    buttons: id
      ? [
          button("delete", "Delete", "destructive"),
          button("save", "Save changes"),
        ]
      : [button("save", "Add booking")],
  };
}

const closedSheet = (): SheetState => sheetFor("", draftBooking("101", 0, 1));

/** Pure: everything worked out from the data: views, filter counts, badges. */
export function derive(s: HotelData & { groups: NavGroup[] }): HotelViews & {
  stayFilters: Filter[];
  cleanFilters: Filter[];
  groups: NavGroup[];
} {
  const arriving = arrivalsOn(s.bookings, TODAY).filter(
    (x) => x.status === "expected",
  ).length;
  const stays = (x: Booking, id: string) => x.status === id;
  const tasks = (t: CleanTask, id: string) =>
    id === "done" ? t.done : !t.done;
  return {
    ...views(s),
    stayFilters: filtersOf(STAY_FILTERS, s.stayFilter, s.bookings, stays),
    cleanFilters: filtersOf(CLEAN_FILTERS, s.cleanFilter, s.cleaning, tasks),
    groups: withBadge(
      withBadge(s.groups, "checkin", arriving ? String(arriving) : ""),
      "cleaning",
      toClean(s.cleaning) ? String(toClean(s.cleaning)) : "",
    ),
  };
}

const data: HotelData & { groups: NavGroup[] } = {
  bookings: BOOKINGS,
  cleaning: CLEANING,
  stayFilter: "all",
  stayQuery: "",
  cleanFilter: "all",
  groups: GROUPS,
};

export const initial: HotelState = {
  screen: "overview",
  title: "Overview",
  navOpen: false,
  notice: "",
  user: { name: "Maria Gomez", role: "Front desk manager", initials: "MG" },
  actions: [
    {
      id: "new",
      label: "New booking",
      icon: "k-icon-plus",
      variant: "default",
    },
  ],
  days: DAYS,
  none: [],
  ...data,
  ...derive(data),
  sheet: { ...closedSheet(), open: false },
};

export class HotelAdmin extends AdminApp<HotelState> {
  view = view;

  /** Change some of the data; the views, the counts and the badges follow. */
  _commit(state: HotelState, changes: Partial<HotelData>): Effect[] {
    const next = { ...state, ...changes };
    const { groups, ...rest } = derive(next);
    return patch({ ...changes, ...rest, groups });
  }

  // ---- stays: the same buttons on three lists
  _stay(msg: Message, state: HotelState): Effect[] {
    const [id, step] = msg.payload as [string, "next" | "back"];
    const before = state.bookings.find((x) => x.id === id);
    if (!before) return [];
    const bookings = advanceStay(state.bookings, id, step);
    const checkedOut = before.status === "in" && step === "next";
    const cleaning = checkedOut
      ? cleaningAfterCheckout(state.cleaning, before.room)
      : state.cleaning;
    const text =
      step === "back"
        ? `${before.guest}: moved back`
        : checkedOut
          ? `${before.guest} checked out, room ${before.room} is to clean`
          : `${before.guest} checked in`;
    return [...this._commit(state, { bookings, cleaning }), ...notice(text)];
  }

  "arr.act"(msg: Message, state: HotelState): Effect[] {
    return this._stay(msg, state);
  }
  "dep.act"(msg: Message, state: HotelState): Effect[] {
    return this._stay(msg, state);
  }
  "stays.act"(msg: Message, state: HotelState): Effect[] {
    return this._stay(msg, state);
  }

  "stayfilter.pick"(msg: Message, state: HotelState): Effect[] {
    return this._commit(state, { stayFilter: msg.payload as string });
  }
  "stayfilter.search"(msg: Message, state: HotelState): Effect[] {
    return this._commit(state, { stayQuery: msg.event?.value ?? "" });
  }
  "cleanfilter.pick"(msg: Message, state: HotelState): Effect[] {
    return this._commit(state, { cleanFilter: msg.payload as string });
  }

  // ---- cleaning
  "clean.choose"(msg: Message, state: HotelState): Effect[] {
    const id = msg.payload as string;
    const staff = msg.event?.value ?? "";
    const cleaning = state.cleaning.map((t) =>
      t.id === id ? { ...t, staff } : t,
    );
    return this._commit(state, { cleaning });
  }

  "clean.act"(msg: Message, state: HotelState): Effect[] {
    const [id] = msg.payload as [string, string];
    const task = state.cleaning.find((t) => t.id === id);
    const cleaning = state.cleaning.map((t) =>
      t.id === id ? { ...t, done: true } : t,
    );
    return [
      ...this._commit(state, { cleaning }),
      ...notice(`Room ${task?.room} is clean`),
    ];
  }

  // ---- the booking grid and its sheet
  "grid.book"(msg: Message, state: HotelState): Effect[] {
    const [room, day] = msg.payload as [string, number];
    const nights = defaultNights(state.bookings, room, day);
    return patch({ sheet: sheetFor("", draftBooking(room, day, nights)) });
  }

  "grid.open"(msg: Message, state: HotelState): Effect[] {
    const found = state.bookings.find((x) => x.id === msg.payload);
    return found ? patch({ sheet: sheetFor(found.id, draftOf(found)) }) : [];
  }

  "top.action"(_msg: Message, state: HotelState): Effect[] {
    const room = firstFreeRoom(state.bookings, TODAY);
    if (!room) return notice("No room is free today");
    return patch({
      screen: "grid",
      title: "Booking grid",
      sheet: sheetFor("", draftBooking(room, TODAY, 1)),
    });
  }

  "sheet.close"(_msg: Message, state: HotelState): Effect[] {
    return patch({ sheet: { ...state.sheet, open: false } });
  }

  "sheet.field"(msg: Message, state: HotelState): Effect[] {
    const draft = {
      ...state.sheet.draft,
      [msg.payload as string]: msg.event?.value ?? "",
    };
    return patch({ sheet: sheetFor(state.sheet.id, draft) });
  }

  "sheet.press"(msg: Message, state: HotelState): Effect[] {
    const { id, draft } = state.sheet;
    if (msg.payload === "delete") {
      return [
        ...this._commit(state, {
          bookings: state.bookings.filter((x) => x.id !== id),
        }),
        ...patch({ sheet: { ...state.sheet, open: false } }),
        ...notice(`Booking of ${draft.guest} deleted`),
      ];
    }
    const errors = validateBooking(draft, state.bookings, id);
    if (Object.keys(errors).length > 0) {
      return patch({ sheet: sheetFor(id, draft, errors) });
    }
    return [
      ...this._commit(state, {
        bookings: saveBooking(state.bookings, draft, id),
      }),
      ...patch({ sheet: { ...state.sheet, open: false } }),
      ...notice(
        id ? "Booking saved" : `Room ${draft.room} booked for ${draft.guest}`,
      ),
    ];
  }
}

export const page = new HotelAdmin();
