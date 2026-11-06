import type { Tone } from "../../blocks/admin-shell/shell.ts";
import {
  type AttRow,
  type Mark,
  type Pupil,
  rowsOf as attendanceRows,
  summarize,
  type Summary,
} from "../../blocks/attendance-sheet/attendance.ts";
import {
  type Column as BarColumn,
  columns,
} from "../../blocks/bar-chart/chart.ts";
import {
  action,
  type Cell,
  type ColumnDef,
  mono,
  number,
  pill,
  type Row,
  rowOf,
  type Sort,
  sortBy,
  strong,
} from "../../blocks/data-grid/grid.ts";
import { applyFilter } from "../../blocks/list-filter/filters.ts";
import { item, type Item } from "../../blocks/progress-list/items.ts";
import {
  type Detail,
  detail,
  type Field,
  field,
  positive,
  selectField,
} from "../../blocks/record-sheet/sheet.ts";
import { type Card, card } from "../../blocks/stat-cards/cards.ts";
import {
  listAction,
  loadMeter,
  type StatusRow,
  statusRow,
} from "../../blocks/status-list/rows.ts";
import {
  col,
  entry,
  slot,
  type TtCol,
  type TtEntry,
  type TtSlot,
} from "../../blocks/timetable-grid/timetable.ts";

// ---- subjects and teachers

export interface Subject {
  id: string;
  label: string;
  tone: Tone;
  /** The teacher who teaches it. */
  teacher: string;
}

export const SUBJECTS: Subject[] = [
  { id: "maths", label: "Maths", tone: "info", teacher: "t1" },
  { id: "science", label: "Science", tone: "success", teacher: "t2" },
  { id: "english", label: "English", tone: "default", teacher: "t3" },
  { id: "history", label: "History", tone: "warning", teacher: "t4" },
  { id: "art", label: "Art", tone: "destructive", teacher: "t5" },
  { id: "pe", label: "PE", tone: "muted", teacher: "t6" },
  { id: "music", label: "Music", tone: "info", teacher: "t7" },
];
/** The five subjects that are graded, in the order of the grades. */
export const GRADED = SUBJECTS.slice(0, 5);

export type TeacherStatus = "teaching" | "free" | "leave";

export interface Teacher {
  id: string;
  name: string;
  role: string;
  homeroom: string;
  status: TeacherStatus;
}

export const TEACHERS: Teacher[] = [
  {
    id: "t1",
    name: "Priya Patel",
    role: "Maths",
    homeroom: "7A",
    status: "teaching",
  },
  {
    id: "t2",
    name: "Helen Hughes",
    role: "Science",
    homeroom: "8A",
    status: "teaching",
  },
  {
    id: "t3",
    name: "Daniel Bennett",
    role: "English",
    homeroom: "7B",
    status: "free",
  },
  {
    id: "t4",
    name: "Claire Laurent",
    role: "History",
    homeroom: "9A",
    status: "leave",
  },
  {
    id: "t5",
    name: "Sofia Alvarez",
    role: "Art",
    homeroom: "",
    status: "teaching",
  },
  { id: "t6", name: "Chidi Okafor", role: "PE", homeroom: "", status: "free" },
  {
    id: "t7",
    name: "Mei Chen",
    role: "Music",
    homeroom: "",
    status: "teaching",
  },
];

export const MAX_LESSONS = 20;

const surname = (name: string): string => name.split(" ").slice(-1)[0];

// ---- classes and students

export const CLASSES = ["7A", "7B", "8A", "9A"];
export const CLASS_DEFS: [string, string][] = CLASSES.map((c) => [c, c]);

export interface Student {
  id: string;
  name: string;
  classId: string;
  guardian: string;
  email: string;
  /** Attendance this term, in percent. */
  term: number;
  /** Today's register mark and note. */
  mark: Mark;
  note: string;
  /** One grade per graded subject (0 to 100). */
  grades: number[];
}

const NAMES: [string, string, string][] = [
  ["7A", "Aisha Rahman", "Samir Rahman"],
  ["7A", "Ben Carter", "Laura Carter"],
  ["7A", "Chloe Nguyen", "Minh Nguyen"],
  ["7A", "Daniel Okafor", "Grace Okafor"],
  ["7A", "Emma Lindqvist", "Johan Lindqvist"],
  ["7A", "Felix Moreau", "Camille Moreau"],
  ["7A", "Grace Whitfield", "Anne Whitfield"],
  ["7B", "Hugo Santos", "Marta Santos"],
  ["7B", "Ines Duarte", "Paulo Duarte"],
  ["7B", "Jamal Brooks", "Tanya Brooks"],
  ["7B", "Kira Volkova", "Dmitri Volkov"],
  ["7B", "Leo Fontaine", "Julie Fontaine"],
  ["7B", "Maya Singh", "Ravi Singh"],
  ["8A", "Nikolai Petrov", "Olga Petrova"],
  ["8A", "Olivia Reyes", "Carlos Reyes"],
  ["8A", "Pablo Mendes", "Rita Mendes"],
  ["8A", "Quinn Murphy", "Sean Murphy"],
  ["8A", "Rosa Martinez", "Elena Martinez"],
  ["8A", "Sana Qureshi", "Imran Qureshi"],
  ["8A", "Theo Andersen", "Freya Andersen"],
  ["9A", "Uma Krishnan", "Anita Krishnan"],
  ["9A", "Victor Lang", "Heidi Lang"],
  ["9A", "Wen Zhao", "Li Zhao"],
  ["9A", "Xavier Dubois", "Marc Dubois"],
  ["9A", "Yuki Tanaka", "Hana Tanaka"],
  ["9A", "Zoe Parker", "Emily Parker"],
];
const BASE = [
  78, 64, 88, 55, 71, 92, 60, 83, 69, 74, 58, 90, 66, 80, 73, 52, 86, 62, 77,
  95, 68, 81, 57, 72, 89, 63,
];
const WAVE = [-9, 4, -3, 7, -6, 2, 9];
/** Today's register by student: 7A and 9A are done, 7B is half done, 8A has not started. */
const TODAY_MARKS: Mark[] = [
  "present",
  "present",
  "late",
  "present",
  "absent",
  "present",
  "present",
  "present",
  "present",
  "late",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "present",
  "present",
  "present",
  "absent",
  "present",
  "present",
];

const clamp100 = (n: number): number =>
  Math.max(0, Math.min(100, Math.round(n)));

/** Pure: grades for the student at `index`: a base level and a small deterministic wave per subject. */
export function seedGrades(base: number, index: number): number[] {
  return GRADED.map((_, s) =>
    clamp100(base + WAVE[(index * 3 + s) % WAVE.length]),
  );
}

export const STUDENTS: Student[] = NAMES.map(
  ([classId, name, guardian], i) => ({
    id: `s${i + 1}`,
    name,
    classId,
    guardian,
    email: `${guardian.toLowerCase().replace(/[^a-z]+/g, ".")}@mail.com`,
    term: 99 - ((i * 7) % 12),
    mark: TODAY_MARKS[i],
    note: i === 4 ? "Dentist appointment" : i === 9 ? "Bus delayed" : "",
    grades: seedGrades(BASE[i], i),
  }),
);

// ---- grades

export const round1 = (n: number): number => Math.round(n * 10) / 10;

export const average = (grades: number[]): number =>
  grades.length === 0
    ? 0
    : round1(grades.reduce((a, b) => a + b, 0) / grades.length);

export const studentAverage = (s: Student): number => average(s.grades);

/** Pure: the average of each graded subject over some students. */
export function subjectAverages(list: Student[]): number[] {
  return GRADED.map((_, i) => average(list.map((s) => s.grades[i])));
}

export const BANDS: [string, number, number][] = [
  ["<50", 0, 49.9],
  ["50s", 50, 59.9],
  ["60s", 60, 69.9],
  ["70s", 70, 79.9],
  ["80s", 80, 89.9],
  ["90+", 90, 100],
];

/** Pure: how many students' averages fall in each band. */
export function distribution(list: Student[]): number[] {
  return BANDS.map(
    ([, lo, hi]) =>
      list.filter((s) => {
        const a = studentAverage(s);
        return a >= lo && a <= hi;
      }).length,
  );
}

export function distributionBars(list: Student[]): BarColumn[] {
  const counts = distribution(list);
  const tones: Tone[] = [
    "destructive",
    "warning",
    "warning",
    "info",
    "success",
    "success",
  ];
  return columns(
    BANDS.map(([label], i) => ({
      id: label,
      label,
      value: counts[i],
      tone: tones[i],
      show: true,
    })),
    Math.max(3, ...counts),
    "",
  );
}

export function gradeTone(grade: number): Tone {
  if (grade >= 85) return "success";
  if (grade >= 70) return "default";
  if (grade >= 50) return "warning";
  return "destructive";
}

export const letter = (grade: number): string =>
  grade >= 90
    ? "A"
    : grade >= 80
      ? "B"
      : grade >= 70
        ? "C"
        : grade >= 50
          ? "D"
          : "F";

// ---- attendance

export const pupilsOf = (list: Student[], classId: string): Pupil[] =>
  list
    .filter((s) => s.classId === classId)
    .map((s) => ({ id: s.id, name: s.name, mark: s.mark, note: s.note }));

export function attendanceView(
  list: Student[],
  classId: string,
): { rows: AttRow[]; summary: Summary } {
  const pupils = pupilsOf(list, classId);
  return { rows: attendanceRows(pupils), summary: summarize(pupils) };
}

/** Pure: store a mark on a student (pressing the same mark again clears it). */
export function markStudent(
  list: Student[],
  id: string,
  mark: Mark,
): Student[] {
  return list.map((s) =>
    s.id === id ? { ...s, mark: s.mark === mark ? "" : mark } : s,
  );
}

export function markClassRest(list: Student[], classId: string): Student[] {
  return list.map((s) =>
    s.classId === classId && s.mark === "" ? { ...s, mark: "present" } : s,
  );
}

export function clearClass(list: Student[], classId: string): Student[] {
  return list.map((s) => (s.classId === classId ? { ...s, mark: "" } : s));
}

/** Pure: today's attendance for the school: those present or late out of those marked. */
export function schoolRate(list: Student[]): { marked: number; rate: number } {
  const marked = list.filter((s) => s.mark !== "");
  const here = marked.filter((s) => s.mark !== "absent").length;
  return {
    marked: marked.length,
    rate: marked.length === 0 ? 0 : Math.round((here / marked.length) * 100),
  };
}

export function classAttendanceItems(list: Student[]): Item[] {
  return CLASSES.map((c) => {
    const mine = list.filter((s) => s.classId === c);
    const marked = mine.filter((s) => s.mark !== "");
    const here = marked.filter((s) => s.mark !== "absent").length;
    const pct = marked.length === 0 ? 0 : (here / marked.length) * 100;
    return item(c, `Class ${c}`, here, Math.max(1, marked.length), {
      tone:
        marked.length === 0
          ? "muted"
          : pct >= 90
            ? "success"
            : pct >= 75
              ? "warning"
              : "destructive",
      text:
        marked.length === 0 ? "Not marked" : `${here} of ${mine.length} here`,
      sub:
        marked.length === 0
          ? ""
          : marked.length < mine.length
            ? `${mine.length - marked.length} not marked yet`
            : "",
    });
  });
}

// ---- timetable

export interface Lesson {
  id: string;
  classId: string;
  day: string;
  slot: string;
  subject: string;
  room: string;
}

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
export const DAY_COLS: TtCol[] = DAYS.map((d, i) =>
  col(d, d, `${2 + i} Nov`, d === "Tue"),
);
export const PERIODS: TtSlot[] = [
  slot("p1", "P1", "08:30"),
  slot("p2", "P2", "09:25"),
  slot("break", "", "", "Break"),
  slot("p3", "P3", "10:40"),
  slot("p4", "P4", "11:35"),
  slot("lunch", "", "", "Lunch"),
  slot("p5", "P5", "13:15"),
];
const TEACHING = PERIODS.filter((p) => !p.note);

export const subjectOf = (id: string): Subject =>
  SUBJECTS.find((s) => s.id === id) ?? SUBJECTS[0];

/** Pure: the usual room for a subject in a class. */
export function roomFor(subject: string, classIndex: number): string {
  if (subject === "science") return `Lab ${1 + (classIndex % 2)}`;
  if (subject === "art") return "Studio";
  if (subject === "pe") return "Gym";
  if (subject === "music") return "Music";
  return `R${11 + classIndex}`;
}

/**
 * Pure: a week for every class. The five main subjects rotate like a Latin
 * square, so two classes never have the same subject (the same teacher) at the
 * same time; some periods are left free.
 */
export function seedLessons(): Lesson[] {
  const out: Lesson[] = [];
  CLASSES.forEach((classId, ci) => {
    DAYS.forEach((day, d) => {
      TEACHING.forEach((period, p) => {
        const si = d * TEACHING.length + p;
        if ((si * 7 + ci * 3) % 6 === 0) return;
        const subject = SUBJECTS[(p * 2 + d + ci) % 5].id;
        out.push({
          id: `${classId}-${day}-${period.id}`,
          classId,
          day,
          slot: period.id,
          subject,
          room: roomFor(subject, ci),
        });
      });
    });
  });
  return out;
}

export function teacherOf(subject: string, teachers: Teacher[]): Teacher {
  const id = subjectOf(subject).teacher;
  return teachers.find((t) => t.id === id) ?? teachers[0];
}

export function lessonEntries(
  lessons: Lesson[],
  classId: string,
  teachers: Teacher[],
): TtEntry[] {
  return lessons
    .filter((l) => l.classId === classId)
    .map((l) =>
      entry(l.id, l.day, l.slot, subjectOf(l.subject).label, {
        sub: `${surname(teacherOf(l.subject, teachers).name)}, ${l.room}`,
        tone: subjectOf(l.subject).tone,
      }),
    );
}

/** Pure: another class where the teacher of `subject` is busy at that time. */
export function teacherBusy(
  lessons: Lesson[],
  subject: string,
  day: string,
  slotId: string,
  classId: string,
): Lesson | undefined {
  const teacher = subjectOf(subject).teacher;
  return lessons.find(
    (l) =>
      l.classId !== classId &&
      l.day === day &&
      l.slot === slotId &&
      subjectOf(l.subject).teacher === teacher,
  );
}

export function saveLesson(
  lessons: Lesson[],
  classId: string,
  day: string,
  slotId: string,
  subject: string,
  room: string,
): Lesson[] {
  const id = `${classId}-${day}-${slotId}`;
  const next: Lesson = { id, classId, day, slot: slotId, subject, room };
  return lessons.some((l) => l.id === id)
    ? lessons.map((l) => (l.id === id ? next : l))
    : [...lessons, next];
}

export const removeLesson = (lessons: Lesson[], id: string): Lesson[] =>
  lessons.filter((l) => l.id !== id);

export const lessonsOfTeacher = (
  lessons: Lesson[],
  teacherId: string,
): number =>
  lessons.filter((l) => subjectOf(l.subject).teacher === teacherId).length;

export function lessonSheetFields(
  d: Record<string, string>,
  errors: Record<string, string> = {},
): Field[] {
  return [
    selectField(
      "subject",
      "Subject",
      d.subject,
      SUBJECTS.map((s) => [s.id, s.label]),
    ),
    field("room", "Room", d.room, { placeholder: "R12" }),
  ].map((f) => ({ ...f, error: errors[f.id] ?? "" }));
}

export function validateLesson(
  d: Record<string, string>,
  lessons: Lesson[],
  classId: string,
  day: string,
  slotId: string,
  teachers: Teacher[],
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!d.room.trim()) errors.room = "Say where the lesson is.";
  const busy = teacherBusy(lessons, d.subject, day, slotId, classId);
  if (busy) {
    errors.subject = `${teacherOf(d.subject, teachers).name} already teaches ${busy.classId} at this time.`;
  }
  const t = teacherOf(d.subject, teachers);
  if (t.status === "leave") errors.subject = `${t.name} is on leave.`;
  return errors;
}

// ---- students table

export const STUDENT_DEFS: ColumnDef[] = [
  { key: "name", label: "Student", sortable: true },
  { key: "class", label: "Class", sortable: true },
  { key: "avg", label: "Average", align: "right", sortable: true },
  { key: "term", label: "Term attendance", sortable: true },
  { key: "today", label: "Today" },
];

export const GRADE_DEFS: ColumnDef[] = [
  { key: "name", label: "Student", sortable: true },
  ...GRADED.map((s) => ({
    key: s.id,
    label: s.label,
    align: "right" as const,
    sortable: true,
  })),
  { key: "avg", label: "Average", align: "right", sortable: true },
];

export function studentValue(s: Student, key: string): string | number {
  if (key === "class") return s.classId;
  if (key === "avg") return studentAverage(s);
  if (key === "term") return s.term;
  const i = GRADED.findIndex((g) => g.id === key);
  if (i >= 0) return s.grades[i];
  return s.name;
}

const MARK_PILL: Record<string, [string, Tone]> = {
  present: ["Present", "success"],
  late: ["Late", "warning"],
  absent: ["Absent", "destructive"],
  "": ["Not marked", "muted"],
};

export function studentRows(
  list: Student[],
  classFilter: string,
  query: string,
  sort: Sort | null,
  selected: string,
): Row[] {
  const shown = sortBy(
    applyFilter(
      list,
      classFilter,
      query,
      (s, id) => s.classId === id,
      (s) => `${s.name} ${s.guardian}`,
    ),
    sort,
    studentValue,
  );
  return shown.map((s) => {
    const [label, tone] = MARK_PILL[s.mark];
    return rowOf(
      STUDENT_DEFS,
      s.id,
      {
        name: strong(s.name, `Guardian: ${s.guardian}`),
        class: mono(s.classId),
        avg: number(studentAverage(s)),
        term: number(`${s.term}%`),
        today: pill(label, tone),
      },
      [action("open", "Open")],
      s.id === selected,
    );
  });
}

export function gradeRows(
  list: Student[],
  classId: string,
  sort: Sort | null,
): Row[] {
  const mine = sortBy(
    list.filter((s) => s.classId === classId),
    sort,
    studentValue,
  );
  return mine.map((s) => {
    const cells: Record<string, Cell> = {
      name: strong(s.name, `Class ${s.classId}`),
      avg: pill(
        `${studentAverage(s)} ${letter(studentAverage(s))}`,
        gradeTone(studentAverage(s)),
      ),
    };
    GRADED.forEach((g, i) => {
      cells[g.id] = pill(String(s.grades[i]), gradeTone(s.grades[i]));
    });
    return rowOf(GRADE_DEFS, s.id, cells, [action("open", "Edit")]);
  });
}

export function gradeCards(list: Student[], classId: string): Card[] {
  const mine = list.filter((s) => s.classId === classId);
  const avgs = mine.map(studentAverage);
  const best = mine.reduce<Student | null>(
    (a, b) => (!a || studentAverage(b) > studentAverage(a) ? b : a),
    null,
  );
  const weak = mine.filter((s) => studentAverage(s) < 60).length;
  return [
    card("avg", "Class average", String(average(avgs)), {
      hint: `Class ${classId}`,
      icon: "k-ai-chart",
    }),
    card("top", "Top student", best ? best.name.split(" ")[0] : "-", {
      hint: best ? `${studentAverage(best)} average` : "",
      icon: "k-ai-sparkles",
      tone: "success",
    }),
    card("weak", "Below 60", String(weak), {
      hint: weak ? "may need support" : "everyone is above 60",
      icon: "k-ai-alert",
      tone: weak ? "warning" : "success",
    }),
    card("n", "Students", String(mine.length), {
      hint: "in the gradebook",
      icon: "k-ai-users",
      tone: "info",
    }),
  ];
}

export function subjectItems(list: Student[], classId: string): Item[] {
  const avgs = subjectAverages(list.filter((s) => s.classId === classId));
  return GRADED.map((g, i) =>
    item(g.id, g.label, avgs[i], 100, {
      tone: gradeTone(avgs[i]),
      text: String(avgs[i]),
    }),
  );
}

export function overviewCards(list: Student[], teachers: Teacher[]): Card[] {
  const { marked, rate } = schoolRate(list);
  const avg = average(list.map(studentAverage));
  const away = teachers.filter((t) => t.status === "leave").length;
  return [
    card("students", "Students", String(list.length), {
      hint: `${CLASSES.length} classes`,
      icon: "k-ai-users",
    }),
    card("att", "Here today", `${rate}%`, {
      hint: `${marked} of ${list.length} marked`,
      icon: "k-icon-check",
      tone: "success",
    }),
    card("avg", "Average grade", String(avg), {
      hint: "all classes",
      icon: "k-ai-chart",
      tone: "info",
    }),
    card(
      "staff",
      "Teachers on duty",
      `${teachers.length - away} of ${teachers.length}`,
      {
        hint: away ? `${away} on leave` : "everyone is in",
        icon: "k-ai-briefcase",
        tone: away ? "warning" : "success",
      },
    ),
  ];
}

// ---- teachers

export const TEACHER_FILTERS: [string, string][] = [
  ["all", "All"],
  ["teaching", "Teaching"],
  ["free", "Free"],
  ["leave", "On leave"],
];

const T_LABEL: Record<TeacherStatus, [string, Tone]> = {
  teaching: ["Teaching", "success"],
  free: ["Free period", "info"],
  leave: ["On leave", "muted"],
};

export function teacherRows(
  teachers: Teacher[],
  lessons: Lesson[],
  filter: string,
): StatusRow[] {
  return teachers
    .filter((t) => filter === "all" || t.status === filter)
    .map((t) => {
      const n = lessonsOfTeacher(lessons, t.id);
      const [label, tone] = T_LABEL[t.status];
      return statusRow(t.id, t.name, label, tone, {
        sub: `${t.role}${t.homeroom ? `, homeroom ${t.homeroom}` : ""}`,
        done: t.status === "leave",
        facts: [
          { label: "Lessons", value: `${n} a week` },
          {
            label: "Classes",
            value:
              CLASSES.filter((c) =>
                lessons.some(
                  (l) =>
                    l.classId === c && subjectOf(l.subject).teacher === t.id,
                ),
              ).join(", ") || "-",
          },
        ],
        meters: [
          loadMeter(
            "Weekly load",
            Math.round((n / MAX_LESSONS) * 100),
            `${n} / ${MAX_LESSONS}`,
          ),
        ],
        actions: [
          t.status === "leave"
            ? listAction("back", "Back at work", { variant: "default" })
            : listAction("leave", "Mark on leave"),
        ],
        choose: null,
      });
    });
}

export function setTeacherStatus(
  teachers: Teacher[],
  id: string,
  status: TeacherStatus,
): Teacher[] {
  return teachers.map((t) => (t.id === id ? { ...t, status } : t));
}

// ---- students: forms

export function studentDraft(s?: Student): Record<string, string> {
  return {
    name: s?.name ?? "",
    classId: s?.classId ?? "7A",
    guardian: s?.guardian ?? "",
    email: s?.email ?? "",
  };
}

export function studentFields(
  d: Record<string, string>,
  errors: Record<string, string> = {},
): Field[] {
  return [
    field("name", "Full name", d.name, { placeholder: "Ada Lovelace" }),
    selectField(
      "classId",
      "Class",
      d.classId,
      CLASSES.map((c) => [c, `Class ${c}`]),
    ),
    field("guardian", "Parent or guardian", d.guardian),
    field("email", "Contact email", d.email, { kind: "email" }),
  ].map((f) => ({ ...f, error: errors[f.id] ?? "" }));
}

export function validateStudent(
  d: Record<string, string>,
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!d.name.trim()) errors.name = "Enter the student's name.";
  if (!d.guardian.trim()) errors.guardian = "Enter a parent or guardian.";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email.trim()))
    errors.email = "Use a valid email address.";
  return errors;
}

export function saveStudent(
  list: Student[],
  d: Record<string, string>,
  id: string,
): Student[] {
  if (id) {
    return list.map((s) =>
      s.id === id
        ? {
            ...s,
            name: d.name.trim(),
            classId: d.classId,
            guardian: d.guardian.trim(),
            email: d.email.trim(),
          }
        : s,
    );
  }
  const n = Math.max(0, ...list.map((s) => Number(s.id.slice(1)))) + 1;
  return [
    ...list,
    {
      id: `s${n}`,
      name: d.name.trim(),
      classId: d.classId,
      guardian: d.guardian.trim(),
      email: d.email.trim(),
      term: 100,
      mark: "",
      note: "New student",
      grades: GRADED.map(() => 0),
    },
  ];
}

export function studentDetails(s: Student): Detail[] {
  const avg = studentAverage(s);
  const [label, tone] = MARK_PILL[s.mark];
  return [
    detail("Average", `${avg} (${letter(avg)})`, gradeTone(avg)),
    detail("Term attendance", `${s.term}%`),
    detail("Today", label, tone),
  ];
}

export function gradeFields(
  d: Record<string, string>,
  errors: Record<string, string> = {},
): Field[] {
  return GRADED.map((g) =>
    field(g.id, g.label, d[g.id] ?? "", { kind: "number", hint: "0 to 100" }),
  ).map((f) => ({ ...f, error: errors[f.id] ?? "" }));
}

export function gradeDraft(s: Student): Record<string, string> {
  const out: Record<string, string> = {};
  GRADED.forEach((g, i) => {
    out[g.id] = String(s.grades[i]);
  });
  return out;
}

export function validateGrades(
  d: Record<string, string>,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const g of GRADED) {
    const n = positive(d[g.id] ?? "", true);
    if (n === null || n > 100)
      errors[g.id] = "A grade is a number from 0 to 100.";
  }
  return errors;
}

export function saveGrades(
  list: Student[],
  id: string,
  d: Record<string, string>,
): Student[] {
  return list.map((s) =>
    s.id === id
      ? { ...s, grades: GRADED.map((g) => clamp100(Number(d[g.id]))) }
      : s,
  );
}
