import type { Effect, Message } from "@pavlus/frontend";
import { AdminApp, type AppState } from "../../blocks/admin-shell/app.ts";
import {
  money,
  type NavGroup,
  notice,
  pad2,
  patch,
  type ShellAction,
  type ShellUser,
  withBadge,
} from "../../blocks/admin-shell/shell.ts";
import {
  entry,
  groupByDay,
  type LogGroup,
} from "../../blocks/audit-log/log.ts";
import {
  type Column,
  columnsOf,
  type Row,
  type Sort,
  toggleSort,
} from "../../blocks/data-grid/grid.ts";
import {
  type Filter,
  filtersOf,
  type ToolbarAction,
} from "../../blocks/list-filter/filters.ts";
import type { Item } from "../../blocks/progress-list/items.ts";
import {
  advance,
  type Lane,
  lanesOf,
  type Ticket,
} from "../../blocks/queue-board/queue.ts";
import {
  button,
  type Detail,
  type Field,
  type SheetButton,
} from "../../blocks/record-sheet/sheet.ts";
import type { Card } from "../../blocks/stat-cards/cards.ts";
import type { StatusRow } from "../../blocks/status-list/rows.ts";
import {
  buildGrid,
  type TtCol,
  type TtRow,
} from "../../blocks/timetable-grid/timetable.ts";
import type { Vital } from "../../blocks/vitals-card/vitals.ts";
import {
  APPOINTMENTS,
  type Appt,
  type ApptDraft,
  addNote,
  apptCollides,
  apptDetails,
  apptDraft,
  apptFields,
  arrive,
  attentionRows,
  balanceOf,
  DAY_FILTERS,
  type DayId,
  DOCTOR_COLS,
  doctorLoad,
  doctorOf,
  INVOICE_DEFS,
  INVOICES,
  type Invoice,
  initialsOf,
  inQueue,
  invoiceCards,
  invoiceRows,
  LAB_DEFS,
  LAB_FILTERS,
  LABS,
  type Lab,
  labPasses,
  labRows,
  needsReview,
  overviewCards,
  PATIENT_DEFS,
  PATIENT_FILTERS,
  PATIENTS,
  PAY_FILTERS,
  type Patient,
  PLAB_DEFS,
  patientLabRows,
  patientOf,
  patientReadings,
  patientRows,
  payInvoice,
  queueCards,
  RX_DEFS,
  refillRx,
  removeAppt,
  reviewLab,
  rxRows,
  SLOTS,
  saveAppt,
  scheduleEntries,
  stopRx,
  TICKETS,
  validateWalkin,
  type WalkinDraft,
  walkinDraft,
  walkinFields,
} from "./clinic.ts";
import view from "./clinic-admin.pavlus";

export type SheetKind = "appt" | "walkin";

export interface SheetState {
  open: boolean;
  kind: SheetKind;
  /** The appointment being edited; empty for a new one. */
  id: string;
  where: { day: string; doctor: string; slot: string };
  draft: Record<string, string>;
  title: string;
  description: string;
  fields: Field[];
  details: Detail[];
  buttons: SheetButton[];
}

export interface ClinicCore {
  patients: Patient[];
  appts: Appt[];
  tickets: Ticket[];
  invoices: Invoice[];
  labs: Lab[];
  /** The time on the front-desk clock, in minutes after midnight. */
  now: number;
  day: string;
  patientFilter: string;
  query: string;
  pSort: Sort | null;
  payFilter: string;
  labFilter: string;
  recordId: string;
  noteDraft: string;
}

export interface PatientHeader {
  name: string;
  initials: string;
  line: string;
  doctor: string;
  phone: string;
  allergies: string;
  conditions: string;
  balance: string;
  allergyTone: "destructive" | "muted";
}

export interface ClinicViews {
  stats: Card[];
  docLoad: Item[];
  attention: StatusRow[];
  dayFilters: Filter[];
  schedCols: TtCol[];
  schedRows: TtRow[];
  schedNote: string;
  lanes: Lane[];
  queueStats: Card[];
  clockLabel: string;
  pFilters: Filter[];
  pCols: Column[];
  pRows: Row[];
  pFooter: string;
  rec: PatientHeader;
  vitalItems: Vital[];
  noteGroups: LogGroup[];
  rxCols: Column[];
  rxList: Row[];
  recLabCols: Column[];
  recLabList: Row[];
  payFilters: Filter[];
  invCols: Column[];
  invRows: Row[];
  invStats: Card[];
  labFilters: Filter[];
  labCols: Column[];
  labList: Row[];
}

export interface ClinicState extends AppState, ClinicCore, ClinicViews {
  user: ShellUser;
  actions: ShellAction[];
  none: ToolbarAction[];
  sheet: SheetState;
}

const GROUPS: NavGroup[] = [
  {
    title: "Front desk",
    items: [
      { id: "overview", label: "Overview", icon: "k-ai-home" },
      { id: "schedule", label: "Schedule", icon: "k-icon-calendar" },
      { id: "queue", label: "Waiting room", icon: "k-ai-users" },
    ],
  },
  {
    title: "Records",
    items: [
      { id: "patients", label: "Patients", icon: "k-ai-clipboard" },
      { id: "labs", label: "Lab results", icon: "k-ai-pulse" },
      { id: "billing", label: "Billing", icon: "k-ai-receipt" },
    ],
  },
];

/** Pure: an id for the next note (one more than the notes of all patients). */
export const nextNoteId = (patients: Patient[]): string =>
  `n${patients.reduce((n, p) => n + p.notes.length, 0) + 1}`;

/** Pure: `10:24` from minutes after midnight. */
export const timeLabel = (min: number): string =>
  `${pad2(Math.floor(min / 60))}:${pad2(min % 60)}`;

const EMPTY_REC: PatientHeader = {
  name: "",
  initials: "",
  line: "",
  doctor: "",
  phone: "",
  allergies: "",
  conditions: "",
  balance: "",
  allergyTone: "muted",
};

/** Pure: the header of a patient's record. */
export function recordOf(
  p: Patient | undefined,
  invoices: Invoice[],
): PatientHeader {
  if (!p) return EMPTY_REC;
  const owed = balanceOf(invoices, p.id);
  return {
    name: p.name,
    initials: initialsOf(p.name),
    line: `${p.age} years, ${p.sex === "F" ? "female" : "male"}`,
    doctor: doctorOf(p.doctor).name,
    phone: p.phone,
    allergies: p.allergies || "None known",
    conditions: p.conditions || "None",
    balance: owed ? `${money(owed, "$", 0)} owed` : "Nothing owed",
    allergyTone:
      p.allergies !== "" && p.allergies !== "None known"
        ? "destructive"
        : "muted",
  };
}

/** Pure: the sheet for an appointment or a walk-in. */
export function sheetFor(
  kind: SheetKind,
  id: string,
  draft: Record<string, string>,
  data: Pick<ClinicCore, "patients" | "appts" | "tickets">,
  where: { day: string; doctor: string; slot: string },
  errors: Record<string, string> = {},
): SheetState {
  const base = { open: true, kind, id, where, draft };
  if (kind === "walkin") {
    return {
      ...base,
      title: "New walk-in",
      description:
        "The patient gets the next ticket and joins the waiting room.",
      fields: walkinFields(
        data.patients,
        draft as unknown as WalkinDraft,
        errors,
      ),
      details: [],
      buttons: [button("save", "Add to the queue")],
    };
  }
  const appt = data.appts.find((x) => x.id === id);
  const patient = patientOf(data.patients, draft.patient);
  const canCheckIn =
    !!appt &&
    appt.day === "today" &&
    !!patient &&
    !inQueue(data.tickets, patient.name);
  return {
    ...base,
    title: appt
      ? `${patient?.name ?? "Appointment"}`
      : `New appointment, ${doctorOf(where.doctor).name}`,
    description: appt
      ? `Visit at ${appt.slot}. Change the type or the length, or check the patient in.`
      : `Book ${where.slot} with ${doctorOf(where.doctor).name}.`,
    fields: apptFields(data.patients, draft as unknown as ApptDraft, errors),
    details: appt ? apptDetails(appt, data.patients) : [],
    buttons: appt
      ? [
          button("delete", "Cancel visit", "destructive"),
          ...(canCheckIn ? [button("checkin", "Check in", "secondary")] : []),
          button("save", "Save"),
        ]
      : [button("save", "Book visit")],
  };
}

/** Pure: everything worked out from the core. */
export function derive(
  s: ClinicCore & { groups: NavGroup[] },
): ClinicViews & { groups: NavGroup[] } {
  const entries = scheduleEntries(s.appts, s.patients, s.day);
  const rows = patientRows(s.patients, s.patientFilter, s.query, s.pSort);
  const p = patientOf(s.patients, s.recordId);
  const invRows = invoiceRows(s.invoices, s.patients, s.payFilter);
  const labList = labRows(s.labs, s.patients, s.labFilter);
  const dayCount = (x: Appt, id: string) => x.day === id;
  const waiting = s.tickets.filter(
    (t) => t.status === "waiting" || t.status === "called",
  ).length;
  const review = needsReview(s.labs).length;
  return {
    stats: overviewCards(s.tickets, s.now, s.invoices, s.appts, s.labs),
    docLoad: doctorLoad(s.appts, "today"),
    attention: attentionRows(s.labs, s.patients),
    dayFilters: filtersOf(DAY_FILTERS, s.day, s.appts, dayCount),
    schedCols: DOCTOR_COLS,
    schedRows: buildGrid(DOCTOR_COLS, SLOTS, entries),
    schedNote: `${entries.length} visits booked. A visit can last 30 minutes or an hour; click an empty slot to book one.`,
    lanes: lanesOf(s.tickets, s.now),
    queueStats: queueCards(s.tickets, s.now),
    clockLabel: timeLabel(s.now),
    pFilters: filtersOf(
      PATIENT_FILTERS,
      s.patientFilter,
      s.patients,
      (x, id) => x.doctor === id,
    ),
    pCols: columnsOf(PATIENT_DEFS, s.pSort),
    pRows: rows,
    pFooter: `${rows.length} of ${s.patients.length} patients`,
    rec: recordOf(p, s.invoices),
    vitalItems: p ? patientReadings(p) : [],
    noteGroups: groupByDay(p ? p.notes : []),
    rxCols: columnsOf(RX_DEFS, null),
    rxList: p ? rxRows(p) : [],
    recLabCols: columnsOf(PLAB_DEFS, null),
    recLabList: p ? patientLabRows(s.labs, p.id) : [],
    payFilters: filtersOf(
      PAY_FILTERS,
      s.payFilter,
      s.invoices,
      (i, id) => i.status === id,
    ),
    invCols: columnsOf(INVOICE_DEFS, null),
    invRows,
    invStats: invoiceCards(s.invoices),
    labFilters: filtersOf(LAB_FILTERS, s.labFilter, s.labs, labPasses),
    labCols: columnsOf(LAB_DEFS, null),
    labList,
    groups: withBadge(
      withBadge(s.groups, "queue", waiting ? String(waiting) : ""),
      "labs",
      review ? String(review) : "",
    ),
  };
}

const core: ClinicCore & { groups: NavGroup[] } = {
  patients: PATIENTS,
  appts: APPOINTMENTS,
  tickets: TICKETS,
  invoices: INVOICES,
  labs: LABS,
  now: 10 * 60 + 20,
  day: "today",
  patientFilter: "all",
  query: "",
  pSort: { key: "name", dir: "asc" },
  payFilter: "all",
  labFilter: "all",
  recordId: "",
  noteDraft: "",
  groups: GROUPS,
};

const WHERE = { day: "today", doctor: "lee", slot: "09:00" };

const closedSheet = (): SheetState => ({
  ...sheetFor(
    "walkin",
    "",
    walkinDraft() as unknown as Record<string, string>,
    core,
    WHERE,
  ),
  open: false,
});

export const initial: ClinicState = {
  screen: "overview",
  title: "Overview",
  navOpen: false,
  notice: "",
  user: { name: "Amara Lee", role: "Doctor on duty", initials: "AL" },
  actions: [
    {
      id: "new",
      label: "New walk-in",
      icon: "k-icon-plus",
      variant: "default",
    },
  ],
  none: [],
  ...core,
  ...derive(core),
  sheet: closedSheet(),
};

export class ClinicAdmin extends AdminApp<ClinicState> {
  view = view;

  /** Change some of the core; the views and the badges follow. */
  _commit(state: ClinicState, changes: Partial<ClinicCore>): Effect[] {
    const next = { ...state, ...changes };
    const { groups, ...rest } = derive(next);
    return patch({ ...changes, ...rest, groups });
  }

  _close(state: ClinicState): Effect[] {
    return patch({ sheet: { ...state.sheet, open: false } });
  }

  _walkin(state: ClinicState): Effect[] {
    return patch({
      screen: "queue",
      title: "Waiting room",
      sheet: sheetFor(
        "walkin",
        "",
        walkinDraft() as unknown as Record<string, string>,
        state,
        WHERE,
      ),
    });
  }

  "top.action"(_msg: Message, state: ClinicState): Effect[] {
    return this._walkin(state);
  }

  // ---- schedule
  "dayfilter.pick"(msg: Message, state: ClinicState): Effect[] {
    return this._commit(state, { day: msg.payload as DayId });
  }

  "sched.pick"(msg: Message, state: ClinicState): Effect[] {
    const x = state.appts.find((y) => y.id === msg.payload);
    if (!x) return [];
    return patch({
      sheet: sheetFor(
        "appt",
        x.id,
        { patient: x.patient, type: x.type, length: String(x.span * 30) },
        state,
        { day: x.day, doctor: x.doctor, slot: x.slot },
      ),
    });
  }

  "sched.add"(msg: Message, state: ClinicState): Effect[] {
    const [doctor, slot] = msg.payload as [string, string];
    return patch({
      sheet: sheetFor(
        "appt",
        "",
        apptDraft() as unknown as Record<string, string>,
        state,
        { day: state.day, doctor, slot },
      ),
    });
  }

  // ---- waiting room
  "queue.act"(msg: Message, state: ClinicState): Effect[] {
    const [id, dir] = msg.payload as [string, "next" | "back"];
    const t = state.tickets.find((x) => x.id === id);
    if (!t) return [];
    const tickets = advance(state.tickets, id, dir);
    const after = tickets.find((x) => x.id === id);
    const text =
      dir === "back"
        ? `${t.name} is back in the waiting room`
        : after?.status === "called"
          ? `${t.name} was called to ${t.doctor}`
          : after?.status === "in"
            ? `${t.name} is with ${t.doctor}`
            : `${t.name} is finished`;
    return [
      ...this._commit(state, { tickets, now: state.now + 2 }),
      ...notice(text),
    ];
  }

  // ---- patients and the record
  "pfilter.pick"(msg: Message, state: ClinicState): Effect[] {
    return this._commit(state, { patientFilter: msg.payload as string });
  }
  "pfilter.search"(msg: Message, state: ClinicState): Effect[] {
    return this._commit(state, { query: msg.event?.value ?? "" });
  }
  "patients.sort"(msg: Message, state: ClinicState): Effect[] {
    return this._commit(state, {
      pSort: toggleSort(state.pSort, msg.payload as string),
    });
  }
  "patients.pick"(msg: Message, state: ClinicState): Effect[] {
    return this._commit(state, {
      recordId: msg.payload as string,
      noteDraft: "",
    });
  }
  "patients.act"(msg: Message, state: ClinicState): Effect[] {
    return this._commit(state, {
      recordId: (msg.payload as [string, string])[0],
      noteDraft: "",
    });
  }
  closeRecord(_msg: Message, state: ClinicState): Effect[] {
    return this._commit(state, { recordId: "", noteDraft: "" });
  }
  noteInput(msg: Message, state: ClinicState): Effect[] {
    return this._commit(state, { noteDraft: msg.event?.value ?? "" });
  }
  saveNote(_msg: Message, state: ClinicState): Effect[] {
    const text = state.noteDraft.trim();
    if (!text) return notice("Write the note first");
    const one = entry(
      nextNoteId(state.patients),
      state.user.name,
      "wrote a note",
      "",
      "Today",
      timeLabel(state.now),
      { text, tag: "Note", tone: "info" },
    );
    return [
      ...this._commit(state, {
        patients: addNote(state.patients, state.recordId, one),
        noteDraft: "",
      }),
      ...notice("Note added to the record"),
    ];
  }
  "rx.act"(msg: Message, state: ClinicState): Effect[] {
    const [id, what] = msg.payload as [string, string];
    const p = patientOf(state.patients, state.recordId);
    const r = p?.rx.find((x) => x.id === id);
    if (!p || !r) return [];
    const patients =
      what === "refill"
        ? refillRx(state.patients, p.id, id)
        : stopRx(state.patients, p.id, id);
    const one = entry(
      nextNoteId(state.patients),
      state.user.name,
      what === "refill" ? "refilled" : "stopped",
      r.drug,
      "Today",
      timeLabel(state.now),
      { tag: "Prescription", tone: what === "refill" ? "success" : "warning" },
    );
    return [
      ...this._commit(state, { patients: addNote(patients, p.id, one) }),
      ...notice(what === "refill" ? `${r.drug} refilled` : `${r.drug} stopped`),
    ];
  }
  "reclabs.act"(msg: Message, state: ClinicState): Effect[] {
    return this._review(msg, state);
  }
  "rec.pick"(): Effect[] {
    return [];
  }

  // ---- labs and billing
  "labfilter.pick"(msg: Message, state: ClinicState): Effect[] {
    return this._commit(state, { labFilter: msg.payload as string });
  }
  _review(msg: Message, state: ClinicState): Effect[] {
    const id = (msg.payload as [string, string])[0];
    const l = state.labs.find((x) => x.id === id);
    if (!l) return [];
    return [
      ...this._commit(state, { labs: reviewLab(state.labs, id) }),
      ...notice(`${l.test} reviewed`),
    ];
  }
  "labs.act"(msg: Message, state: ClinicState): Effect[] {
    return this._review(msg, state);
  }
  "attention.act"(msg: Message, state: ClinicState): Effect[] {
    return this._review(msg, state);
  }
  "attention.pick"(): Effect[] {
    return [];
  }
  "payfilter.pick"(msg: Message, state: ClinicState): Effect[] {
    return this._commit(state, { payFilter: msg.payload as string });
  }
  "invoices.act"(msg: Message, state: ClinicState): Effect[] {
    const [id, what] = msg.payload as [string, string];
    const i = state.invoices.find((x) => x.id === id);
    if (!i) return [];
    if (what === "remind") {
      return notice(
        `Reminder sent to ${patientOf(state.patients, i.patient)?.name ?? "the patient"}`,
      );
    }
    return [
      ...this._commit(state, { invoices: payInvoice(state.invoices, id) }),
      ...notice(`${id} marked paid`),
    ];
  }

  // ---- the sheet
  "sheet.close"(_msg: Message, state: ClinicState): Effect[] {
    return this._close(state);
  }

  "sheet.field"(msg: Message, state: ClinicState): Effect[] {
    const { sheet } = state;
    const draft = {
      ...sheet.draft,
      [msg.payload as string]: msg.event?.value ?? "",
    };
    return patch({
      sheet: sheetFor(sheet.kind, sheet.id, draft, state, sheet.where),
    });
  }

  "sheet.press"(msg: Message, state: ClinicState): Effect[] {
    const { sheet } = state;
    const { kind, id, draft, where } = sheet;
    const press = msg.payload as string;
    const fail = (errors: Record<string, string>): Effect[] =>
      patch({ sheet: sheetFor(kind, id, draft, state, where, errors) });

    if (kind === "walkin") {
      const d = draft as unknown as WalkinDraft;
      const errors = validateWalkin(d, state.tickets, state.patients);
      if (Object.keys(errors).length > 0) return fail(errors);
      const p = patientOf(state.patients, d.patient);
      return [
        ...this._commit(state, {
          tickets: arrive(
            state.tickets,
            p?.name ?? "Patient",
            `Dr. ${doctorOf(d.doctor).name.split(" ")[2]}`,
            d.reason.trim(),
            state.now,
            d.urgent === "yes",
          ),
        }),
        ...this._close(state),
        ...notice(`${p?.name ?? "The patient"} joined the waiting room`),
      ];
    }

    const d = draft as unknown as ApptDraft;
    const appt = state.appts.find((x) => x.id === id);
    if (press === "delete") {
      return [
        ...this._commit(state, { appts: removeAppt(state.appts, id) }),
        ...this._close(state),
        ...notice("Visit canceled"),
      ];
    }
    if (press === "checkin" && appt) {
      const p = patientOf(state.patients, appt.patient);
      if (!p) return [];
      return [
        ...this._commit(state, {
          tickets: arrive(
            state.tickets,
            p.name,
            `Dr. ${doctorOf(appt.doctor).name.split(" ")[2]}`,
            appt.type,
            state.now,
          ),
        }),
        ...this._close(state),
        ...notice(`${p.name} checked in`),
      ];
    }
    const span = Number(d.length) / 30;
    if (
      apptCollides(state.appts, where.doctor, where.slot, span, where.day, id)
    ) {
      return fail({
        length: "That does not fit: the next slot is taken or the day ends.",
      });
    }
    return [
      ...this._commit(state, {
        appts: saveAppt(state.appts, d, id, {
          day: where.day as DayId,
          doctor: where.doctor,
          slot: where.slot,
        }),
      }),
      ...this._close(state),
      ...notice(id ? "Visit saved" : "Visit booked"),
    ];
  }
}

export const page = new ClinicAdmin();
