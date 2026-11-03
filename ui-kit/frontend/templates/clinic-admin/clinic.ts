import { money, type Tone } from "../../blocks/admin-shell/shell.ts";
import { type LogEntry, entry as note } from "../../blocks/audit-log/log.ts";
import {
  action,
  type ColumnDef,
  mono,
  number,
  pill,
  type Row,
  rowOf,
  type Sort,
  sortBy,
  strong,
  text,
} from "../../blocks/data-grid/grid.ts";
import { applyFilter } from "../../blocks/list-filter/filters.ts";
import { item, type Item } from "../../blocks/progress-list/items.ts";
import {
  type Ticket,
  averageWait,
  nextNumber,
} from "../../blocks/queue-board/queue.ts";
import {
  type Detail,
  detail,
  type Field,
  field,
  selectField,
} from "../../blocks/record-sheet/sheet.ts";
import { type Card, card } from "../../blocks/stat-cards/cards.ts";
import {
  listAction,
  type StatusRow,
  statusRow,
} from "../../blocks/status-list/rows.ts";
import {
  clock,
  col,
  collides,
  entry,
  fill,
  timeSlots,
  type TtCol,
  type TtEntry,
  type TtSlot,
} from "../../blocks/timetable-grid/timetable.ts";
import {
  classify,
  readings,
  type Vital,
} from "../../blocks/vitals-card/vitals.ts";

// ---- doctors

export interface Doctor {
  id: string;
  name: string;
  field: string;
}

export const DOCTORS: Doctor[] = [
  { id: "lee", name: "Dr. Amara Lee", field: "General practice" },
  { id: "ruiz", name: "Dr. Carlos Ruiz", field: "Paediatrics" },
  { id: "khan", name: "Dr. Farah Khan", field: "Cardiology" },
];
export const doctorOf = (id: string): Doctor =>
  DOCTORS.find((d) => d.id === id) ?? DOCTORS[0];
const shortName = (id: string): string =>
  `Dr. ${doctorOf(id).name.split(" ")[2]}`;

// ---- patients

export interface Rx {
  id: string;
  drug: string;
  dose: string;
  schedule: string;
  refills: number;
  active: boolean;
}

export interface Patient {
  id: string;
  name: string;
  age: number;
  sex: "F" | "M";
  doctor: string;
  phone: string;
  allergies: string;
  conditions: string;
  lastVisit: string;
  vitals: {
    sys: number;
    dia: number;
    hr: number;
    temp: number;
    spo2: number;
    rr: number;
  };
  notes: LogEntry[];
  rx: Rx[];
}

const v = (
  sys: number,
  dia: number,
  hr: number,
  temp: number,
  spo2: number,
  rr: number,
) => ({ sys, dia, hr, temp, spo2, rr });
const rx = (
  id: string,
  drug: string,
  dose: string,
  schedule: string,
  refills: number,
  active = true,
): Rx => ({ id, drug, dose, schedule, refills, active });

export const PATIENTS: Patient[] = [
  {
    id: "p1",
    name: "Amelia Stone",
    age: 34,
    sex: "F",
    doctor: "lee",
    phone: "555 0142",
    allergies: "Penicillin",
    conditions: "Asthma",
    lastVisit: "12 Oct",
    vitals: v(118, 76, 72, 36.7, 98, 16),
    notes: [
      note(
        "n1",
        "Dr. Lee",
        "recorded",
        "a yearly check-up",
        "12 Oct",
        "09:40",
        {
          text: "Peak flow stable. Inhaler technique reviewed. Flu vaccine offered.",
          tag: "Visit",
          tone: "success",
        },
      ),
    ],
    rx: [
      rx("r1", "Salbutamol inhaler", "100 mcg", "As needed", 3),
      rx("r2", "Budesonide inhaler", "200 mcg", "Twice a day", 2),
    ],
  },
  {
    id: "p2",
    name: "Noah Reed",
    age: 61,
    sex: "M",
    doctor: "lee",
    phone: "555 0177",
    allergies: "None known",
    conditions: "Type 2 diabetes, hypertension",
    lastVisit: "28 Sep",
    vitals: v(146, 92, 78, 36.8, 97, 17),
    notes: [
      note(
        "n2",
        "Dr. Lee",
        "recorded",
        "a diabetes follow-up",
        "28 Sep",
        "11:15",
        {
          text: "HbA1c 6.9%, down from 7.4%. Blood pressure still above target; metformin continued, ramipril increased.",
          tag: "Visit",
          tone: "info",
        },
      ),
      note(
        "n3",
        "Nurse Okoye",
        "measured",
        "weight and feet",
        "28 Sep",
        "11:00",
        { text: "Foot check normal. Weight 94 kg.", tag: "Nursing" },
      ),
    ],
    rx: [
      rx("r3", "Metformin", "1000 mg", "Twice a day", 5),
      rx("r4", "Ramipril", "10 mg", "Once a day", 4),
    ],
  },
  {
    id: "p3",
    name: "Ivy Marsh",
    age: 4,
    sex: "F",
    doctor: "ruiz",
    phone: "555 0119",
    allergies: "Peanuts",
    conditions: "Routine vaccinations",
    lastVisit: "3 Jun",
    vitals: v(92, 58, 98, 36.8, 99, 22),
    notes: [
      note("n4", "Dr. Ruiz", "recorded", "a growth check", "3 Jun", "10:20", {
        text: "Height and weight on the 60th percentile. Hepatitis A vaccine due in autumn.",
        tag: "Visit",
        tone: "success",
      }),
    ],
    rx: [],
  },
  {
    id: "p4",
    name: "Omar Haddad",
    age: 58,
    sex: "M",
    doctor: "khan",
    phone: "555 0165",
    allergies: "Aspirin",
    conditions: "Atrial fibrillation",
    lastVisit: "19 Oct",
    vitals: v(132, 84, 104, 36.9, 96, 18),
    notes: [
      note("n5", "Dr. Khan", "recorded", "an ECG review", "19 Oct", "14:05", {
        text: "Rate control adequate on bisoprolol. Anticoagulation continued. Next ECG in three months.",
        tag: "Visit",
        tone: "info",
      }),
    ],
    rx: [
      rx("r5", "Bisoprolol", "5 mg", "Once a day", 3),
      rx("r6", "Apixaban", "5 mg", "Twice a day", 6),
    ],
  },
  {
    id: "p5",
    name: "Grace Whitfield",
    age: 72,
    sex: "F",
    doctor: "lee",
    phone: "555 0188",
    allergies: "None known",
    conditions: "Hypertension",
    lastVisit: "14 Sep",
    vitals: v(152, 94, 70, 36.5, 97, 16),
    notes: [
      note(
        "n6",
        "Dr. Lee",
        "recorded",
        "a blood pressure review",
        "14 Sep",
        "09:50",
        {
          text: "Home readings average 148/90. Amlodipine started.",
          tag: "Visit",
          tone: "warning",
        },
      ),
    ],
    rx: [rx("r7", "Amlodipine", "5 mg", "Once a day", 2)],
  },
  {
    id: "p6",
    name: "Tomas Varga",
    age: 49,
    sex: "M",
    doctor: "khan",
    phone: "555 0131",
    allergies: "None known",
    conditions: "Chest pain, under review",
    lastVisit: "Today",
    vitals: v(158, 96, 112, 38.4, 93, 22),
    notes: [],
    rx: [],
  },
  {
    id: "p7",
    name: "Lena Fischer",
    age: 6,
    sex: "F",
    doctor: "ruiz",
    phone: "555 0154",
    allergies: "None known",
    conditions: "Recurrent ear infections",
    lastVisit: "22 Oct",
    vitals: v(98, 62, 96, 38.1, 98, 24),
    notes: [
      note(
        "n7",
        "Dr. Ruiz",
        "recorded",
        "an ear infection",
        "22 Oct",
        "16:10",
        {
          text: "Left ear red and bulging. Amoxicillin for seven days; recheck in two weeks.",
          tag: "Visit",
          tone: "warning",
        },
      ),
    ],
    rx: [rx("r8", "Amoxicillin", "250 mg", "Three times a day", 0, false)],
  },
  {
    id: "p8",
    name: "Marcus Bell",
    age: 45,
    sex: "M",
    doctor: "lee",
    phone: "555 0102",
    allergies: "Sulfa drugs",
    conditions: "Migraine",
    lastVisit: "5 Oct",
    vitals: v(124, 80, 66, 36.6, 99, 14),
    notes: [
      note("n8", "Dr. Lee", "recorded", "a migraine review", "5 Oct", "10:30", {
        text: "Three attacks a month. Sumatriptan helps within an hour. Trial of a daily preventive.",
        tag: "Visit",
        tone: "info",
      }),
    ],
    rx: [
      rx("r9", "Sumatriptan", "50 mg", "At the onset", 4),
      rx("r10", "Propranolol", "40 mg", "Once a day", 5),
    ],
  },
  {
    id: "p9",
    name: "Yuki Tanaka",
    age: 29,
    sex: "F",
    doctor: "lee",
    phone: "555 0176",
    allergies: "None known",
    conditions: "None",
    lastVisit: "17 Mar",
    vitals: v(112, 70, 64, 36.6, 99, 14),
    notes: [],
    rx: [],
  },
  {
    id: "p10",
    name: "Rosa Martinez",
    age: 66,
    sex: "F",
    doctor: "khan",
    phone: "555 0123",
    allergies: "Latex",
    conditions: "Heart failure (stable)",
    lastVisit: "Today",
    vitals: v(124, 78, 82, 36.6, 94, 20),
    notes: [
      note(
        "n9",
        "Dr. Khan",
        "recorded",
        "a heart failure review",
        "Today",
        "09:25",
        {
          text: "Weight stable, no swelling. Furosemide dose unchanged.",
          tag: "Visit",
          tone: "success",
        },
      ),
    ],
    rx: [
      rx("r11", "Furosemide", "40 mg", "Once a day", 2),
      rx("r12", "Enalapril", "10 mg", "Twice a day", 3),
    ],
  },
  {
    id: "p11",
    name: "Ethan Brooks",
    age: 9,
    sex: "M",
    doctor: "ruiz",
    phone: "555 0190",
    allergies: "None known",
    conditions: "Eczema",
    lastVisit: "30 Sep",
    vitals: v(104, 64, 88, 36.7, 99, 20),
    notes: [],
    rx: [rx("r13", "Hydrocortisone 1%", "Thin layer", "Twice a day", 1)],
  },
  {
    id: "p12",
    name: "Hannah Weber",
    age: 38,
    sex: "F",
    doctor: "lee",
    phone: "555 0139",
    allergies: "None known",
    conditions: "Pregnancy, week 24",
    lastVisit: "27 Oct",
    vitals: v(110, 68, 84, 36.8, 98, 18),
    notes: [
      note(
        "n10",
        "Dr. Lee",
        "recorded",
        "an antenatal visit",
        "27 Oct",
        "15:40",
        {
          text: "Growth scan normal. Glucose test booked for next week.",
          tag: "Visit",
          tone: "success",
        },
      ),
    ],
    rx: [rx("r14", "Folic acid", "5 mg", "Once a day", 2)],
  },
  {
    id: "p13",
    name: "Samuel Adeyemi",
    age: 52,
    sex: "M",
    doctor: "khan",
    phone: "555 0161",
    allergies: "None known",
    conditions: "High cholesterol",
    lastVisit: "8 Oct",
    vitals: v(128, 82, 74, 36.7, 98, 16),
    notes: [],
    rx: [rx("r15", "Atorvastatin", "20 mg", "At night", 5)],
  },
  {
    id: "p14",
    name: "Priya Nair",
    age: 31,
    sex: "F",
    doctor: "lee",
    phone: "555 0148",
    allergies: "Ibuprofen",
    conditions: "Iron deficiency",
    lastVisit: "21 Oct",
    vitals: v(106, 66, 90, 36.6, 99, 15),
    notes: [],
    rx: [rx("r16", "Ferrous sulfate", "200 mg", "Once a day", 2)],
  },
];

export const patientOf = (list: Patient[], id: string): Patient | undefined =>
  list.find((p) => p.id === id);

export const initialsOf = (name: string): string =>
  name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("");

export function patientReadings(p: Patient): Vital[] {
  return readings(p.vitals);
}

// ---- schedule

export type DayId = "today" | "wed" | "thu";
export const DAY_FILTERS: [DayId, string][] = [
  ["today", "Today, Tue 3"],
  ["wed", "Wed 4"],
  ["thu", "Thu 5"],
];

export interface Appt {
  id: string;
  day: DayId;
  doctor: string;
  slot: string;
  span: number;
  patient: string;
  type: string;
}

export const TYPES: [string, Tone][] = [
  ["Check-up", "success"],
  ["Follow-up", "info"],
  ["Consultation", "default"],
  ["Vaccination", "warning"],
  ["ECG", "destructive"],
];
const typeTone = (type: string): Tone =>
  TYPES.find(([t]) => t === type)?.[1] ?? "default";

export const SLOT_FROM = 9 * 60;
export const SLOT_TO = 13 * 60;
export const SLOTS: TtSlot[] = timeSlots(SLOT_FROM, SLOT_TO, 30);
export const DOCTOR_COLS: TtCol[] = DOCTORS.map((d) =>
  col(d.id, shortName(d.id), d.field),
);

const a = (
  id: string,
  day: DayId,
  doctor: string,
  slot: string,
  patient: string,
  type: string,
  span = 1,
): Appt => ({ id, day, doctor, slot, span, patient, type });

export const APPOINTMENTS: Appt[] = [
  a("a1", "today", "lee", "09:00", "p1", "Check-up"),
  a("a2", "today", "lee", "09:30", "p5", "Follow-up"),
  a("a3", "today", "lee", "10:00", "p8", "Follow-up"),
  a("a4", "today", "lee", "10:30", "p9", "Consultation"),
  a("a5", "today", "lee", "11:30", "p2", "Follow-up", 2),
  a("a6", "today", "ruiz", "09:00", "p3", "Vaccination"),
  a("a7", "today", "ruiz", "10:00", "p7", "Consultation"),
  a("a8", "today", "ruiz", "11:00", "p11", "Follow-up"),
  a("a9", "today", "khan", "09:00", "p10", "Follow-up"),
  a("a10", "today", "khan", "10:00", "p6", "ECG", 2),
  a("a11", "today", "khan", "12:00", "p4", "ECG"),
  a("a12", "wed", "lee", "09:30", "p12", "Check-up"),
  a("a13", "wed", "lee", "11:00", "p14", "Consultation"),
  a("a14", "wed", "ruiz", "10:00", "p3", "Check-up"),
  a("a15", "wed", "khan", "09:00", "p13", "Follow-up"),
  a("a16", "thu", "lee", "10:00", "p1", "Follow-up"),
  a("a17", "thu", "khan", "11:00", "p4", "Follow-up"),
];

export function scheduleEntries(
  list: Appt[],
  patients: Patient[],
  day: string,
): TtEntry[] {
  return list
    .filter((x) => x.day === day)
    .map((x) =>
      entry(
        x.id,
        x.doctor,
        x.slot,
        patientOf(patients, x.patient)?.name ?? "?",
        {
          sub: x.type,
          tone: typeTone(x.type),
          span: x.span,
        },
      ),
    );
}

/** Pure: appointments per doctor for the day, against the slots a doctor has. */
export function doctorLoad(list: Appt[], day: string): Item[] {
  return DOCTORS.map((d) => {
    const mine = list.filter((x) => x.day === day && x.doctor === d.id);
    const f = fill(
      mine.map((x) => entry(x.id, x.doctor, x.slot, "", { span: x.span })),
      [col(d.id, d.name)],
      SLOTS,
    );
    return item(d.id, d.name, f.used, f.total, {
      text: `${f.used} of ${f.total} slots`,
      sub: `${mine.length} patients, ${d.field}`,
    });
  });
}

export function apptCollides(
  list: Appt[],
  doctor: string,
  slot: string,
  span: number,
  day: string,
  ignore = "",
): boolean {
  const entries = list
    .filter((x) => x.day === day)
    .map((x) => entry(x.id, x.doctor, x.slot, "", { span: x.span }));
  return collides(entries, SLOTS, doctor, slot, span, ignore);
}

export interface ApptDraft {
  patient: string;
  type: string;
  length: string;
}

export const apptDraft = (x?: Appt): ApptDraft => ({
  patient: x?.patient ?? "p1",
  type: x?.type ?? "Consultation",
  length: String(x ? x.span * 30 : 30),
});

export function apptFields(
  patients: Patient[],
  d: ApptDraft,
  errors: Record<string, string> = {},
): Field[] {
  return [
    selectField(
      "patient",
      "Patient",
      d.patient,
      patients.map((p) => [p.id, `${p.name}, ${p.age}`]),
    ),
    selectField(
      "type",
      "Visit type",
      d.type,
      TYPES.map(([t]) => [t, t]),
    ),
    selectField("length", "Length", d.length, [
      ["30", "30 minutes"],
      ["60", "1 hour"],
    ]),
  ].map((f) => ({ ...f, error: errors[f.id] ?? "" }));
}

export function saveAppt(
  list: Appt[],
  d: ApptDraft,
  id: string,
  where: { day: DayId; doctor: string; slot: string },
): Appt[] {
  const span = Number(d.length) / 30;
  if (id) {
    return list.map((x) =>
      x.id === id ? { ...x, patient: d.patient, type: d.type, span } : x,
    );
  }
  const n = Math.max(0, ...list.map((x) => Number(x.id.slice(1)))) + 1;
  return [
    ...list,
    { id: `a${n}`, ...where, span, patient: d.patient, type: d.type },
  ];
}

export const removeAppt = (list: Appt[], id: string): Appt[] =>
  list.filter((x) => x.id !== id);

export function apptDetails(x: Appt, patients: Patient[]): Detail[] {
  const p = patientOf(patients, x.patient);
  const end = timeEnd(x.slot, x.span);
  return [
    detail("Doctor", doctorOf(x.doctor).name),
    detail("Time", `${x.slot} to ${end}`),
    detail(
      "Allergies",
      p?.allergies || "None",
      p && p.allergies !== "None known" && p.allergies ? "warning" : "",
    ),
  ];
}

/** Pure: the end of an appointment, `10:30`. */
export function timeEnd(slot: string, span: number): string {
  const [h, m] = slot.split(":").map(Number);
  return clock(h * 60 + m + span * 30);
}

// ---- queue

export const TICKETS: Ticket[] = [
  {
    id: "q1",
    number: 41,
    name: "Grace Whitfield",
    reason: "Blood pressure review",
    doctor: "Dr. Lee",
    arrived: 9 * 60 + 25,
    status: "in",
    urgent: false,
  },
  {
    id: "q2",
    number: 42,
    name: "Tomas Varga",
    reason: "Chest pain",
    doctor: "Dr. Khan",
    arrived: 10 * 60 + 2,
    status: "called",
    urgent: true,
  },
  {
    id: "q3",
    number: 43,
    name: "Lena Fischer",
    reason: "Ear infection, recheck",
    doctor: "Dr. Ruiz",
    arrived: 10 * 60 + 5,
    status: "waiting",
    urgent: false,
  },
  {
    id: "q4",
    number: 44,
    name: "Marcus Bell",
    reason: "Migraine review",
    doctor: "Dr. Lee",
    arrived: 10 * 60 + 11,
    status: "waiting",
    urgent: false,
  },
  {
    id: "q5",
    number: 45,
    name: "Yuki Tanaka",
    reason: "Consultation",
    doctor: "Dr. Lee",
    arrived: 10 * 60 + 16,
    status: "waiting",
    urgent: false,
  },
  {
    id: "q6",
    number: 40,
    name: "Rosa Martinez",
    reason: "Heart failure review",
    doctor: "Dr. Khan",
    arrived: 9 * 60 + 5,
    status: "done",
    urgent: false,
  },
];

/** Pure: is this patient already in the waiting room (not finished)? */
export const inQueue = (list: Ticket[], name: string): boolean =>
  list.some((t) => t.name === name && t.status !== "done");

/** Pure: add a ticket for a patient who arrived. */
export function arrive(
  list: Ticket[],
  name: string,
  doctor: string,
  reason: string,
  now: number,
  urgent = false,
): Ticket[] {
  const number = nextNumber(list);
  return [
    ...list,
    {
      id: `q${list.length + 1}`,
      number,
      name,
      reason,
      doctor,
      arrived: now,
      status: "waiting",
      urgent,
    },
  ];
}

export function queueCards(list: Ticket[], now: number): Card[] {
  const waiting = list.filter(
    (t) => t.status === "waiting" || t.status === "called",
  ).length;
  const inRoom = list.filter((t) => t.status === "in").length;
  const done = list.filter((t) => t.status === "done").length;
  return [
    card("w", "Waiting", String(waiting), {
      hint: "in the waiting room",
      icon: "k-ai-users",
      tone: "info",
    }),
    card("avg", "Average wait", `${averageWait(list, now)} min`, {
      hint: "of those still waiting",
      icon: "k-ai-pulse",
      tone: "warning",
    }),
    card("in", "With a doctor", String(inRoom), {
      hint: "in consultation",
      icon: "k-ai-clipboard",
      tone: "success",
    }),
    card("done", "Seen today", String(done), {
      hint: "finished",
      icon: "k-icon-check",
    }),
  ];
}

export interface WalkinDraft {
  patient: string;
  doctor: string;
  reason: string;
  urgent: string;
}

export const walkinDraft = (): WalkinDraft => ({
  patient: "p9",
  doctor: "lee",
  reason: "",
  urgent: "no",
});

export function walkinFields(
  patients: Patient[],
  d: WalkinDraft,
  errors: Record<string, string> = {},
): Field[] {
  return [
    selectField(
      "patient",
      "Patient",
      d.patient,
      patients.map((p) => [p.id, p.name]),
    ),
    selectField(
      "doctor",
      "Doctor",
      d.doctor,
      DOCTORS.map((x) => [x.id, x.name]),
    ),
    field("reason", "Reason for the visit", d.reason, {
      placeholder: "Sore throat since Sunday",
    }),
    selectField("urgent", "Urgent?", d.urgent, [
      ["no", "No, in turn"],
      ["yes", "Yes, see first"],
    ]),
  ].map((f) => ({ ...f, error: errors[f.id] ?? "" }));
}

export function validateWalkin(
  d: WalkinDraft,
  list: Ticket[],
  patients: Patient[],
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!d.reason.trim()) errors.reason = "Say why the patient is here.";
  const p = patientOf(patients, d.patient);
  if (p && inQueue(list, p.name))
    errors.patient = `${p.name} is already in the waiting room.`;
  return errors;
}

// ---- patient table

export const PATIENT_DEFS: ColumnDef[] = [
  { key: "name", label: "Patient", sortable: true },
  { key: "age", label: "Age", align: "right", sortable: true },
  { key: "doctor", label: "Doctor" },
  { key: "conditions", label: "Conditions" },
  { key: "last", label: "Last visit" },
];

export const PATIENT_FILTERS: [string, string][] = [
  ["all", "All"],
  ...DOCTORS.map((d): [string, string] => [d.id, shortName(d.id)]),
];

export function patientValue(p: Patient, key: string): string | number {
  return key === "age" ? p.age : p.name;
}

export function patientRows(
  list: Patient[],
  filter: string,
  query: string,
  sort: Sort | null,
): Row[] {
  const shown = sortBy(
    applyFilter(
      list,
      filter,
      query,
      (p, id) => p.doctor === id,
      (p) => `${p.name} ${p.conditions} ${p.phone}`,
    ),
    sort,
    patientValue,
  );
  return shown.map((p) =>
    rowOf(
      PATIENT_DEFS,
      p.id,
      {
        name: strong(
          p.name,
          `${p.sex === "F" ? "Female" : "Male"}, ${p.phone}`,
        ),
        age: number(p.age),
        doctor: text(shortName(p.doctor)),
        conditions: text(p.conditions || "None"),
        last: text(p.lastVisit),
      },
      [action("open", "Open record")],
    ),
  );
}

// ---- prescriptions

export const RX_DEFS: ColumnDef[] = [
  { key: "drug", label: "Medicine" },
  { key: "schedule", label: "How to take" },
  { key: "refills", label: "Refills", align: "right" },
  { key: "status", label: "Status" },
];

export function rxRows(p: Patient): Row[] {
  return p.rx.map((r) =>
    rowOf(
      RX_DEFS,
      r.id,
      {
        drug: strong(r.drug, r.dose),
        schedule: text(r.schedule),
        refills: number(r.refills),
        status: pill(
          r.active ? "Active" : "Stopped",
          r.active ? "success" : "muted",
        ),
      },
      r.active
        ? [
            action("refill", "Refill", { disabled: r.refills <= 0 }),
            action("stop", "Stop"),
          ]
        : [],
    ),
  );
}

export function refillRx(
  list: Patient[],
  patientId: string,
  rxId: string,
): Patient[] {
  return list.map((p) =>
    p.id === patientId
      ? {
          ...p,
          rx: p.rx.map((r) =>
            r.id === rxId && r.refills > 0
              ? { ...r, refills: r.refills - 1 }
              : r,
          ),
        }
      : p,
  );
}

export function stopRx(
  list: Patient[],
  patientId: string,
  rxId: string,
): Patient[] {
  return list.map((p) =>
    p.id === patientId
      ? {
          ...p,
          rx: p.rx.map((r) => (r.id === rxId ? { ...r, active: false } : r)),
        }
      : p,
  );
}

export function addNote(
  list: Patient[],
  patientId: string,
  one: LogEntry,
): Patient[] {
  return list.map((p) =>
    p.id === patientId ? { ...p, notes: [one, ...p.notes] } : p,
  );
}

// ---- billing

export type Pay = "paid" | "unpaid" | "overdue";

export interface Invoice {
  id: string;
  patient: string;
  service: string;
  date: string;
  amount: number;
  status: Pay;
}

const inv = (
  n: number,
  patient: string,
  service: string,
  date: string,
  amount: number,
  status: Pay,
): Invoice => ({
  id: `INV-${1040 + n}`,
  patient,
  service,
  date,
  amount,
  status,
});

export const INVOICES: Invoice[] = [
  inv(1, "p1", "Yearly check-up", "12 Oct", 90, "paid"),
  inv(2, "p2", "Diabetes follow-up and HbA1c", "28 Sep", 145, "overdue"),
  inv(3, "p4", "ECG and cardiology review", "19 Oct", 220, "unpaid"),
  inv(4, "p7", "Ear infection visit", "22 Oct", 75, "paid"),
  inv(5, "p8", "Migraine review", "5 Oct", 85, "overdue"),
  inv(6, "p10", "Heart failure review", "3 Nov", 180, "unpaid"),
  inv(7, "p12", "Antenatal visit and scan", "27 Oct", 260, "paid"),
  inv(8, "p5", "Blood pressure review", "14 Sep", 70, "paid"),
  inv(9, "p13", "Lipid panel and review", "8 Oct", 130, "unpaid"),
  inv(10, "p14", "Iron studies", "21 Oct", 95, "paid"),
];

export const PAY_FILTERS: [string, string][] = [
  ["all", "All"],
  ["unpaid", "Unpaid"],
  ["overdue", "Overdue"],
  ["paid", "Paid"],
];
const PAY_TONE: Record<Pay, Tone> = {
  paid: "success",
  unpaid: "warning",
  overdue: "destructive",
};
const PAY_LABEL: Record<Pay, string> = {
  paid: "Paid",
  unpaid: "Unpaid",
  overdue: "Overdue",
};

export const INVOICE_DEFS: ColumnDef[] = [
  { key: "id", label: "Invoice" },
  { key: "patient", label: "Patient" },
  { key: "service", label: "Service" },
  { key: "date", label: "Date" },
  { key: "amount", label: "Amount", align: "right" },
  { key: "status", label: "Status" },
];

export function invoiceRows(
  list: Invoice[],
  patients: Patient[],
  filter: string,
): Row[] {
  return list
    .filter((i) => filter === "all" || i.status === filter)
    .map((i) =>
      rowOf(
        INVOICE_DEFS,
        i.id,
        {
          id: mono(i.id),
          patient: strong(patientOf(patients, i.patient)?.name ?? "?"),
          service: text(i.service),
          date: text(i.date),
          amount: number(money(i.amount, "$", 0)),
          status: pill(PAY_LABEL[i.status], PAY_TONE[i.status]),
        },
        i.status === "paid"
          ? []
          : [
              ...(i.status === "overdue" ? [action("remind", "Remind")] : []),
              action("pay", "Mark paid", { variant: "default" }),
            ],
      ),
    );
}

export function invoiceCards(list: Invoice[]): Card[] {
  const sum = (s: Pay) =>
    list.filter((i) => i.status === s).reduce((n, i) => n + i.amount, 0);
  const count = (s: Pay) => list.filter((i) => i.status === s).length;
  return [
    card("out", "Outstanding", money(sum("unpaid") + sum("overdue"), "$", 0), {
      hint: `${count("unpaid") + count("overdue")} invoices`,
      icon: "k-ai-receipt",
      tone: "warning",
    }),
    card("over", "Overdue", money(sum("overdue"), "$", 0), {
      hint: `${count("overdue")} invoices`,
      icon: "k-ai-alert",
      tone: "destructive",
    }),
    card("paid", "Collected", money(sum("paid"), "$", 0), {
      hint: "paid this month",
      icon: "k-ai-dollar",
      tone: "success",
    }),
    card("n", "Invoices", String(list.length), {
      hint: "this month",
      icon: "k-ai-file",
      tone: "info",
    }),
  ];
}

export function payInvoice(list: Invoice[], id: string): Invoice[] {
  return list.map((i) => (i.id === id ? { ...i, status: "paid" } : i));
}

/** Pure: the balance a patient owes. */
export const balanceOf = (list: Invoice[], patient: string): number =>
  list
    .filter((i) => i.patient === patient && i.status !== "paid")
    .reduce((n, i) => n + i.amount, 0);

// ---- lab results

export interface Lab {
  id: string;
  patient: string;
  test: string;
  value: number;
  unit: string;
  low: number;
  high: number;
  ordered: string;
  reviewed: boolean;
}

const lab = (
  n: number,
  patient: string,
  test: string,
  value: number,
  unit: string,
  low: number,
  high: number,
  ordered: string,
  reviewed = false,
): Lab => ({
  id: `L${n}`,
  patient,
  test,
  value,
  unit,
  low,
  high,
  ordered,
  reviewed,
});

export const LABS: Lab[] = [
  lab(1, "p2", "HbA1c", 6.9, "%", 4, 5.6, "27 Oct"),
  lab(2, "p2", "Creatinine", 82, "umol/L", 59, 104, "27 Oct", true),
  lab(3, "p6", "Troponin", 48, "ng/L", 0, 14, "3 Nov"),
  lab(4, "p4", "INR", 2.4, "", 2, 3, "19 Oct", true),
  lab(5, "p13", "LDL cholesterol", 4.6, "mmol/L", 0, 3, "8 Oct"),
  lab(6, "p14", "Ferritin", 9, "ug/L", 15, 150, "21 Oct"),
  lab(7, "p12", "Glucose tolerance", 5.2, "mmol/L", 3.9, 7.8, "2 Nov", true),
  lab(8, "p10", "NT-proBNP", 640, "ng/L", 0, 450, "3 Nov"),
  lab(9, "p1", "Peak flow", 410, "L/min", 380, 550, "12 Oct", true),
  lab(10, "p7", "White cell count", 13.8, "x10^9/L", 4, 11, "22 Oct", true),
];

export const LAB_FILTERS: [string, string][] = [
  ["all", "All"],
  ["review", "To review"],
  ["abnormal", "Abnormal"],
  ["done", "Reviewed"],
];

export const labFlag = (l: Lab): "low" | "normal" | "high" =>
  classify(l.value, l.low, l.high);

export function labPasses(l: Lab, id: string): boolean {
  if (id === "review") return !l.reviewed;
  if (id === "done") return l.reviewed;
  if (id === "abnormal") return labFlag(l) !== "normal";
  return true;
}

export const LAB_DEFS: ColumnDef[] = [
  { key: "patient", label: "Patient" },
  { key: "test", label: "Test" },
  { key: "result", label: "Result", align: "right" },
  { key: "range", label: "Reference" },
  { key: "flag", label: "Flag" },
  { key: "ordered", label: "Ordered" },
];

const FLAG_UI: Record<string, [string, Tone]> = {
  low: ["Low", "info"],
  normal: ["Normal", "success"],
  high: ["High", "destructive"],
};

export const PLAB_DEFS: ColumnDef[] = LAB_DEFS.slice(1);

export function labRows(
  list: Lab[],
  patients: Patient[],
  filter: string,
  defs: ColumnDef[] = LAB_DEFS,
): Row[] {
  return list
    .filter((l) => labPasses(l, filter))
    .map((l) => {
      const [label, tone] = FLAG_UI[labFlag(l)];
      return rowOf(
        defs,
        l.id,
        {
          patient: strong(patientOf(patients, l.patient)?.name ?? "?"),
          test: text(l.test),
          result: number(`${l.value} ${l.unit}`.trim()),
          range: mono(`${l.low}-${l.high}`),
          flag: pill(label, tone),
          ordered: text(l.ordered),
        },
        l.reviewed
          ? []
          : [action("review", "Mark reviewed", { variant: "outline" })],
      );
    });
}

export const reviewLab = (list: Lab[], id: string): Lab[] =>
  list.map((l) => (l.id === id ? { ...l, reviewed: true } : l));

/** Pure: abnormal results nobody has reviewed yet. */
export const needsReview = (list: Lab[]): Lab[] =>
  list.filter((l) => !l.reviewed && labFlag(l) !== "normal");

export function attentionRows(list: Lab[], patients: Patient[]): StatusRow[] {
  return needsReview(list).map((l) => {
    const [label, tone] = FLAG_UI[labFlag(l)];
    return statusRow(
      l.id,
      patientOf(patients, l.patient)?.name ?? "?",
      label,
      tone,
      {
        sub: `${l.test}: ${l.value} ${l.unit}`.trim(),
        facts: [
          { label: "Reference", value: `${l.low}-${l.high}` },
          { label: "Ordered", value: l.ordered },
        ],
        actions: [
          listAction("review", "Mark reviewed", { variant: "outline" }),
        ],
      },
    );
  });
}

export function patientLabRows(list: Lab[], patient: string): Row[] {
  return labRows(
    list.filter((l) => l.patient === patient),
    [],
    "all",
    PLAB_DEFS,
  );
}

export function overviewCards(
  tickets: Ticket[],
  now: number,
  invoices: Invoice[],
  appts: Appt[],
  labs: Lab[],
): Card[] {
  const today = appts.filter((x) => x.day === "today").length;
  const owed = invoices
    .filter((i) => i.status !== "paid")
    .reduce((n, i) => n + i.amount, 0);
  const waiting = tickets.filter(
    (t) => t.status === "waiting" || t.status === "called",
  ).length;
  return [
    card("appts", "Appointments today", String(today), {
      hint: `${tickets.length} in the day's queue`,
      icon: "k-icon-calendar",
    }),
    card("wait", "In the waiting room", String(waiting), {
      hint: `${averageWait(tickets, now)} min average wait`,
      icon: "k-ai-users",
      tone: "info",
    }),
    card("labs", "Results to review", String(needsReview(labs).length), {
      hint: "outside the range",
      icon: "k-ai-alert",
      tone: "warning",
    }),
    card("owed", "Unpaid invoices", money(owed, "$", 0), {
      hint: `${invoices.filter((i) => i.status !== "paid").length} invoices`,
      icon: "k-ai-receipt",
      tone: "success",
    }),
  ];
}
