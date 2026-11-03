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
import type {
  AttRow,
  Mark,
  Summary,
} from "../../blocks/attendance-sheet/attendance.ts";
import {
  entry,
  groupByDay,
  type LogEntry,
  type LogGroup,
  matching,
  prepend,
} from "../../blocks/audit-log/log.ts";
import type { Column as BarColumn } from "../../blocks/bar-chart/chart.ts";
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
  button,
  type Detail,
  type Field,
  type SheetButton,
} from "../../blocks/record-sheet/sheet.ts";
import type { Card } from "../../blocks/stat-cards/cards.ts";
import type { StatusRow } from "../../blocks/status-list/rows.ts";
import {
  buildGrid,
  fill,
  type TtCol,
  type TtRow,
} from "../../blocks/timetable-grid/timetable.ts";
import {
  attendanceView,
  CLASS_DEFS,
  classAttendanceItems,
  clearClass,
  DAY_COLS,
  distributionBars,
  GRADE_DEFS,
  gradeCards,
  gradeDraft,
  gradeFields,
  gradeRows,
  lessonEntries,
  lessonSheetFields,
  type Lesson,
  markClassRest,
  markStudent,
  overviewCards,
  PERIODS,
  removeLesson,
  roomFor,
  saveGrades,
  saveLesson,
  saveStudent,
  seedLessons,
  setTeacherStatus,
  STUDENT_DEFS,
  type Student,
  studentAverage,
  studentDetails,
  studentDraft,
  studentFields,
  studentRows,
  STUDENTS,
  subjectItems,
  subjectOf,
  teacherOf,
  teacherRows,
  TEACHER_FILTERS,
  TEACHERS,
  type Teacher,
  type TeacherStatus,
  validateGrades,
  validateLesson,
  validateStudent,
  CLASSES,
} from "./school.ts";
import view from "./school-admin.pavlus";

export type SheetKind = "student" | "grades" | "lesson";

export interface SheetState {
  open: boolean;
  kind: SheetKind;
  /** The student or lesson being edited; empty for a new one. */
  id: string;
  /** Where a new lesson goes. */
  day: string;
  period: string;
  draft: Record<string, string>;
  title: string;
  description: string;
  fields: Field[];
  details: Detail[];
  buttons: SheetButton[];
}

export interface SchoolCore {
  students: Student[];
  teachers: Teacher[];
  lessons: Lesson[];
  news: LogEntry[];
  clock: number;
  classId: string;
  studentFilter: string;
  query: string;
  sSort: Sort | null;
  gSort: Sort | null;
  teacherFilter: string;
  newsAudience: string;
  annTitle: string;
  annText: string;
  annAudience: string;
  annError: string;
}

export interface SchoolViews {
  stats: Card[];
  attItems: Item[];
  schoolBars: BarColumn[];
  latest: LogGroup[];
  classFilters: Filter[];
  studentFilters: Filter[];
  sCols: Column[];
  sRows: Row[];
  sFooter: string;
  ttCols: TtCol[];
  ttRows: TtRow[];
  ttNote: string;
  attRows: AttRow[];
  attSummary: Summary;
  gStats: Card[];
  gCols: Column[];
  gRows: Row[];
  subItems: Item[];
  classBars: BarColumn[];
  teacherFilters: Filter[];
  teacherList: StatusRow[];
  newsFilters: Filter[];
  newsGroups: LogGroup[];
  audienceOptions: { value: string; selected: boolean }[];
}

export interface SchoolState extends AppState, SchoolCore, SchoolViews {
  user: ShellUser;
  actions: ShellAction[];
  none: ToolbarAction[];
  selected: string;
  sheet: SheetState;
}

const GROUPS: NavGroup[] = [
  {
    title: "School",
    items: [
      { id: "overview", label: "Overview", icon: "k-ai-home" },
      { id: "students", label: "Students", icon: "k-ai-users" },
      { id: "classes", label: "Classes", icon: "k-icon-calendar" },
      { id: "attendance", label: "Attendance", icon: "k-ai-clipboard" },
      { id: "grades", label: "Gradebook", icon: "k-ai-chart" },
    ],
  },
  {
    title: "Staff",
    items: [
      { id: "teachers", label: "Teachers", icon: "k-ai-briefcase" },
      { id: "news", label: "Announcements", icon: "k-icon-bell" },
    ],
  },
];

const AUDIENCES = ["Parents", "Students", "Staff"];
const NEWS_FILTERS: [string, string][] = [
  ["all", "All"],
  ...AUDIENCES.map((a): [string, string] => [a, a]),
];
const TERM_FILTERS: [string, string][] = [["all", "All"], ...CLASS_DEFS];

const NEWS: LogEntry[] = [
  entry(
    "n1",
    "Eleanor Grant",
    "posted",
    "Parents' evening on Thursday",
    "Today",
    "08:05",
    {
      text: "Appointments run from 16:00 to 19:30 in the main hall. Book a slot with each teacher at the front office.",
      tag: "Parents",
      tone: "info",
    },
  ),
  entry(
    "n2",
    "Daniel Bennett",
    "posted",
    "Poetry slam sign-up",
    "Today",
    "07:50",
    {
      text: "Classes 7B and 8A: put your name on the sheet outside the English room by Friday.",
      tag: "Students",
      tone: "success",
    },
  ),
  entry(
    "n3",
    "Eleanor Grant",
    "posted",
    "Staff meeting moved to 15:45",
    "Yesterday",
    "16:30",
    {
      text: "The curriculum meeting is in the library, not the staff room. Bring your term plans.",
      tag: "Staff",
      tone: "warning",
    },
  ),
  entry(
    "n4",
    "Chidi Okafor",
    "posted",
    "Cross-country run, Friday",
    "Mon 2 Nov",
    "13:10",
    {
      text: "Wear trainers. If it rains, the run is replaced by a double indoor session.",
      tag: "Students",
      tone: "success",
    },
  ),
];

/** Pure: the `HH:MM` after `clock` minutes. */
export const clockText = (min: number): string =>
  `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** Pure: the sheet for a student, a gradebook line or a lesson. */
export function sheetFor(
  kind: SheetKind,
  id: string,
  draft: Record<string, string>,
  data: Pick<SchoolCore, "students" | "teachers" | "lessons" | "classId">,
  where: { day: string; period: string } = { day: "", period: "" },
  errors: Record<string, string> = {},
): SheetState {
  const base = {
    open: true,
    kind,
    id,
    day: where.day,
    period: where.period,
    draft,
  };
  const student = data.students.find((s) => s.id === id);
  if (kind === "student") {
    return {
      ...base,
      title: id ? draft.name || "Student" : "New student",
      description: id
        ? "Change the class or the contact. Grades are edited in the gradebook."
        : "Add a student to a class. Grades start at zero.",
      fields: studentFields(draft, errors),
      details: student ? studentDetails(student) : [],
      buttons: id
        ? [
            button("delete", "Remove student", "destructive"),
            button("save", "Save changes"),
          ]
        : [button("save", "Add student")],
    };
  }
  if (kind === "grades") {
    return {
      ...base,
      title: `Grades of ${student?.name ?? "the student"}`,
      description: "Enter a mark from 0 to 100 for each subject.",
      fields: gradeFields(draft, errors),
      details: student ? studentDetails(student) : [],
      buttons: [button("save", "Save grades")],
    };
  }
  const teacher = teacherOf(draft.subject, data.teachers);
  return {
    ...base,
    title: `${where.day}, ${PERIODS.find((p) => p.id === where.period)?.label ?? ""}, class ${data.classId}`,
    description: id
      ? "Change the subject or the room of this lesson."
      : "Plan a lesson in this free period.",
    fields: lessonSheetFields(draft, errors),
    details: [
      {
        label: "Teacher",
        value: teacher.name,
        tone: teacher.status === "leave" ? "warning" : "",
      },
    ],
    buttons: id
      ? [
          button("delete", "Remove lesson", "destructive"),
          button("save", "Save lesson"),
        ]
      : [button("save", "Add lesson")],
  };
}

/** Pure: every view worked out from the core. */
export function derive(
  s: SchoolCore & { groups: NavGroup[] },
): SchoolViews & { groups: NavGroup[] } {
  const rows = studentRows(s.students, s.studentFilter, s.query, s.sSort, "");
  const mine = s.students.filter((t) => t.classId === s.classId);
  const att = attendanceView(s.students, s.classId);
  const entries = lessonEntries(s.lessons, s.classId, s.teachers);
  const homeroom = s.teachers.find((t) => t.homeroom === s.classId);
  const used = fill(entries, DAY_COLS, PERIODS);
  const unmarked = s.students.filter((t) => t.mark === "").length;
  return {
    stats: overviewCards(s.students, s.teachers),
    attItems: classAttendanceItems(s.students),
    schoolBars: distributionBars(s.students),
    latest: groupByDay(s.news.slice(0, 3)),
    classFilters: filtersOf(
      CLASS_DEFS,
      s.classId,
      s.students,
      (t, id) => t.classId === id,
    ),
    studentFilters: filtersOf(
      TERM_FILTERS,
      s.studentFilter,
      s.students,
      (t, id) => t.classId === id,
    ),
    sCols: columnsOf(STUDENT_DEFS, s.sSort),
    sRows: rows,
    sFooter: `${rows.length} of ${s.students.length} students`,
    ttCols: DAY_COLS,
    ttRows: buildGrid(DAY_COLS, PERIODS, entries),
    ttNote: `Class ${s.classId}${homeroom ? `, homeroom ${homeroom.name}` : ""}: ${mine.length} students, ${used.used} of ${used.total} periods planned (${used.pct}%).`,
    attRows: att.rows,
    attSummary: att.summary,
    gStats: gradeCards(s.students, s.classId),
    gCols: columnsOf(GRADE_DEFS, s.gSort),
    gRows: gradeRows(s.students, s.classId, s.gSort),
    subItems: subjectItems(s.students, s.classId),
    classBars: distributionBars(mine),
    teacherFilters: filtersOf(
      TEACHER_FILTERS,
      s.teacherFilter,
      s.teachers,
      (t, id) => t.status === id,
    ),
    teacherList: teacherRows(s.teachers, s.lessons, s.teacherFilter),
    newsFilters: filtersOf(
      NEWS_FILTERS,
      s.newsAudience,
      s.news,
      (e, id) => e.tag === id,
    ),
    newsGroups: groupByDay(matching(s.news, s.newsAudience, "")),
    audienceOptions: AUDIENCES.map((value) => ({
      value,
      selected: value === s.annAudience,
    })),
    groups: withBadge(s.groups, "attendance", unmarked ? String(unmarked) : ""),
  };
}

const core: SchoolCore & { groups: NavGroup[] } = {
  students: STUDENTS,
  teachers: TEACHERS,
  lessons: seedLessons(),
  news: NEWS,
  clock: 8 * 60 + 10,
  classId: "7B",
  studentFilter: "all",
  query: "",
  sSort: { key: "name", dir: "asc" },
  gSort: null,
  teacherFilter: "all",
  newsAudience: "all",
  annTitle: "",
  annText: "",
  annAudience: "Parents",
  annError: "",
  groups: GROUPS,
};

const closedSheet = (): SheetState => ({
  ...sheetFor("student", "", studentDraft(), core),
  open: false,
});

export const initial: SchoolState = {
  screen: "overview",
  title: "Overview",
  navOpen: false,
  notice: "",
  user: { name: "Eleanor Grant", role: "Deputy head", initials: "EG" },
  actions: [
    {
      id: "new",
      label: "Add student",
      icon: "k-icon-plus",
      variant: "default",
    },
  ],
  none: [],
  selected: "",
  ...core,
  ...derive(core),
  sheet: closedSheet(),
};

export class SchoolAdmin extends AdminApp<SchoolState> {
  view = view;

  /** Change some of the core; the views and the badge follow. */
  _commit(state: SchoolState, changes: Partial<SchoolCore>): Effect[] {
    const next = { ...state, ...changes };
    const { groups, ...rest } = derive(next);
    return patch({ ...changes, ...rest, groups });
  }

  _open(state: SchoolState, sheet: SheetState): Effect[] {
    return patch({ sheet, selected: sheet.id });
  }

  _closed(state: SchoolState): Effect[] {
    return patch({ sheet: { ...state.sheet, open: false }, selected: "" });
  }

  // ---- classes: one chosen class for the timetable, the register and the gradebook
  _class(msg: Message, state: SchoolState): Effect[] {
    return this._commit(state, { classId: msg.payload as string });
  }
  "cls.pick"(msg: Message, state: SchoolState): Effect[] {
    return this._class(msg, state);
  }
  "attfilter.pick"(msg: Message, state: SchoolState): Effect[] {
    return this._class(msg, state);
  }
  "gfilter.pick"(msg: Message, state: SchoolState): Effect[] {
    return this._class(msg, state);
  }

  // ---- students
  "sfilter.pick"(msg: Message, state: SchoolState): Effect[] {
    return this._commit(state, { studentFilter: msg.payload as string });
  }
  "sfilter.search"(msg: Message, state: SchoolState): Effect[] {
    return this._commit(state, { query: msg.event?.value ?? "" });
  }
  "students.sort"(msg: Message, state: SchoolState): Effect[] {
    return this._commit(state, {
      sSort: toggleSort(state.sSort, msg.payload as string),
    });
  }
  _student(state: SchoolState, id: string): Effect[] {
    const s = state.students.find((x) => x.id === id);
    return s
      ? this._open(state, sheetFor("student", id, studentDraft(s), state))
      : [];
  }
  "students.pick"(msg: Message, state: SchoolState): Effect[] {
    return this._student(state, msg.payload as string);
  }
  "students.act"(msg: Message, state: SchoolState): Effect[] {
    return this._student(state, (msg.payload as [string, string])[0]);
  }

  "top.action"(_msg: Message, state: SchoolState): Effect[] {
    return patch({
      screen: "students",
      title: "Students",
      sheet: sheetFor("student", "", studentDraft(), state),
      selected: "",
    });
  }

  // ---- classes: the timetable
  "tt.pick"(msg: Message, state: SchoolState): Effect[] {
    const l = state.lessons.find((x) => x.id === msg.payload);
    if (!l) return [];
    return this._open(
      state,
      sheetFor("lesson", l.id, { subject: l.subject, room: l.room }, state, {
        day: l.day,
        period: l.slot,
      }),
    );
  }

  "tt.add"(msg: Message, state: SchoolState): Effect[] {
    const [day, period] = msg.payload as [string, string];
    const ci = CLASSES.indexOf(state.classId);
    return this._open(
      state,
      sheetFor(
        "lesson",
        "",
        { subject: "maths", room: roomFor("maths", ci) },
        state,
        { day, period },
      ),
    );
  }

  // ---- attendance
  "reg.mark"(msg: Message, state: SchoolState): Effect[] {
    const [id, mark] = msg.payload as [string, Mark];
    return this._commit(state, {
      students: markStudent(state.students, id, mark),
    });
  }
  "reg.rest"(_msg: Message, state: SchoolState): Effect[] {
    return [
      ...this._commit(state, {
        students: markClassRest(state.students, state.classId),
      }),
      ...notice(`Everyone left in ${state.classId} is marked present`),
    ];
  }
  "reg.clear"(_msg: Message, state: SchoolState): Effect[] {
    return this._commit(state, {
      students: clearClass(state.students, state.classId),
    });
  }

  // ---- gradebook
  "grades.sort"(msg: Message, state: SchoolState): Effect[] {
    return this._commit(state, {
      gSort: toggleSort(state.gSort, msg.payload as string),
    });
  }
  _grades(state: SchoolState, id: string): Effect[] {
    const s = state.students.find((x) => x.id === id);
    return s
      ? this._open(state, sheetFor("grades", id, gradeDraft(s), state))
      : [];
  }
  "grades.act"(msg: Message, state: SchoolState): Effect[] {
    return this._grades(state, (msg.payload as [string, string])[0]);
  }
  "grades.pick"(msg: Message, state: SchoolState): Effect[] {
    return this._grades(state, msg.payload as string);
  }

  // ---- teachers
  "tfilter.pick"(msg: Message, state: SchoolState): Effect[] {
    return this._commit(state, { teacherFilter: msg.payload as string });
  }
  "teachers.act"(msg: Message, state: SchoolState): Effect[] {
    const [id, what] = msg.payload as [string, string];
    const t = state.teachers.find((x) => x.id === id);
    if (!t) return [];
    const status: TeacherStatus = what === "leave" ? "leave" : "free";
    return [
      ...this._commit(state, {
        teachers: setTeacherStatus(state.teachers, id, status),
      }),
      ...notice(
        status === "leave"
          ? `${t.name} is on leave: their lessons need cover`
          : `${t.name} is back`,
      ),
    ];
  }
  "teachers.pick"(): Effect[] {
    return [];
  }

  // ---- announcements
  "nfilter.pick"(msg: Message, state: SchoolState): Effect[] {
    return this._commit(state, { newsAudience: msg.payload as string });
  }
  "news.pick"(): Effect[] {
    return [];
  }
  annTitleInput(msg: Message, state: SchoolState): Effect[] {
    return this._commit(state, {
      annTitle: msg.event?.value ?? "",
      annError: "",
    });
  }
  annTextInput(msg: Message, state: SchoolState): Effect[] {
    return this._commit(state, {
      annText: msg.event?.value ?? "",
      annError: "",
    });
  }
  annAudienceChange(msg: Message, state: SchoolState): Effect[] {
    return this._commit(state, { annAudience: msg.event?.value ?? "Parents" });
  }
  post(_msg: Message, state: SchoolState): Effect[] {
    const title = state.annTitle.trim();
    const body = state.annText.trim();
    if (!title || !body) {
      return this._commit(state, {
        annError: "Write a title and a message before posting.",
      });
    }
    const clock = state.clock + 1;
    const one = entry(
      `n${state.news.length + 1}`,
      state.user.name,
      "posted",
      title,
      "Today",
      clockText(clock),
      { text: body, tag: state.annAudience, tone: "info" },
    );
    return [
      ...this._commit(state, {
        news: prepend(state.news, one),
        clock,
        annTitle: "",
        annText: "",
        annError: "",
        newsAudience: "all",
      }),
      ...notice(`Posted for ${state.annAudience.toLowerCase()}`),
    ];
  }

  // ---- the sheet
  "sheet.close"(_msg: Message, state: SchoolState): Effect[] {
    return this._closed(state);
  }

  "sheet.field"(msg: Message, state: SchoolState): Effect[] {
    const { sheet } = state;
    const draft = {
      ...sheet.draft,
      [msg.payload as string]: msg.event?.value ?? "",
    };
    return patch({
      sheet: sheetFor(sheet.kind, sheet.id, draft, state, {
        day: sheet.day,
        period: sheet.period,
      }),
    });
  }

  "sheet.press"(msg: Message, state: SchoolState): Effect[] {
    const { sheet } = state;
    const { kind, id, draft } = sheet;
    const where = { day: sheet.day, period: sheet.period };
    const fail = (errors: Record<string, string>): Effect[] =>
      patch({ sheet: sheetFor(kind, id, draft, state, where, errors) });

    if (kind === "student") {
      if (msg.payload === "delete") {
        const gone = state.students.find((s) => s.id === id);
        return [
          ...this._commit(state, {
            students: state.students.filter((s) => s.id !== id),
          }),
          ...this._closed(state),
          ...notice(`${gone?.name ?? "The student"} was removed`),
        ];
      }
      const errors = validateStudent(draft);
      if (Object.keys(errors).length > 0) return fail(errors);
      return [
        ...this._commit(state, {
          students: saveStudent(state.students, draft, id),
          classId: id ? state.classId : draft.classId,
        }),
        ...this._closed(state),
        ...notice(
          id ? "Student saved" : `${draft.name.trim()} joined ${draft.classId}`,
        ),
      ];
    }

    if (kind === "grades") {
      const errors = validateGrades(draft);
      if (Object.keys(errors).length > 0) return fail(errors);
      const students = saveGrades(state.students, id, draft);
      const after = students.find((s) => s.id === id);
      return [
        ...this._commit(state, { students }),
        ...this._closed(state),
        ...notice(
          `${after?.name ?? "Student"}: average ${after ? studentAverage(after) : 0}`,
        ),
      ];
    }

    // a lesson
    const lessonId = `${state.classId}-${where.day}-${where.period}`;
    if (msg.payload === "delete") {
      return [
        ...this._commit(state, {
          lessons: removeLesson(state.lessons, lessonId),
        }),
        ...this._closed(state),
        ...notice("Lesson removed"),
      ];
    }
    const errors = validateLesson(
      draft,
      state.lessons,
      state.classId,
      where.day,
      where.period,
      state.teachers,
    );
    if (Object.keys(errors).length > 0) return fail(errors);
    return [
      ...this._commit(state, {
        lessons: saveLesson(
          state.lessons,
          state.classId,
          where.day,
          where.period,
          draft.subject,
          draft.room.trim(),
        ),
      }),
      ...this._closed(state),
      ...notice(`${subjectOf(draft.subject).label} planned on ${where.day}`),
    ];
  }
}

export const page = new SchoolAdmin();
