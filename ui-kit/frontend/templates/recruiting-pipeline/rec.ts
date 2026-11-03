import type { Tone } from "../../blocks/admin-shell/shell.ts";
import type { AgendaIn } from "../../blocks/agenda-list/agenda.ts";
import type { Person, Stage } from "../../blocks/candidate-card/candidate.ts";
import type { Ratings, Skill } from "../../blocks/scorecard/score.ts";
import {
  addDays,
  dayOf,
  daysBetween,
  minutesOf,
  TODAY,
} from "../../blocks/week-calendar/dates.ts";

export { TODAY };

// ------------------------------------------------------------------ stages

export const STAGES: Stage[] = [
  { id: "applied", title: "Applied", tone: "muted" },
  { id: "screening", title: "Screening", tone: "info" },
  { id: "interview", title: "Interview", tone: "warning" },
  { id: "offer", title: "Offer", tone: "default" },
  { id: "hired", title: "Hired", tone: "success" },
  { id: "rejected", title: "Rejected", tone: "destructive" },
];

/** The line a candidate follows (rejected is a way out of it). */
export const ORDER = ["applied", "screening", "interview", "offer", "hired"];

export const SKILLS: Skill[] = [
  {
    id: "solve",
    label: "Problem solving",
    hint: "Breaks a task down, tests ideas",
  },
  { id: "craft", label: "Craft", hint: "Quality of the work they show" },
  {
    id: "comm",
    label: "Communication",
    hint: "Clear, listens, asks questions",
  },
  { id: "team", label: "Team fit", hint: "Feedback, ownership, kindness" },
  { id: "domain", label: "Domain knowledge", hint: "Knows the product area" },
];

// -------------------------------------------------------------------- jobs

export interface Job {
  id: string;
  title: string;
  dept: string;
  location: string;
  openings: number;
  status: "open" | "paused" | "closed";
  posted: string;
  /** Yearly salary range in thousands. */
  min: number;
  max: number;
}

export const JOBS: Job[] = [
  {
    id: "j1",
    title: "Senior product designer",
    dept: "Design",
    location: "Lisbon",
    openings: 1,
    status: "open",
    posted: "2026-09-21",
    min: 90,
    max: 120,
  },
  {
    id: "j2",
    title: "Backend engineer",
    dept: "Platform",
    location: "Berlin",
    openings: 2,
    status: "open",
    posted: "2026-09-14",
    min: 85,
    max: 125,
  },
  {
    id: "j3",
    title: "Customer success manager",
    dept: "Customer care",
    location: "Warsaw",
    openings: 1,
    status: "open",
    posted: "2026-10-05",
    min: 52,
    max: 70,
  },
  {
    id: "j4",
    title: "Data analyst",
    dept: "Analytics",
    location: "Remote",
    openings: 1,
    status: "paused",
    posted: "2026-10-12",
    min: 68,
    max: 90,
  },
];

export const JOB_NEXT: Record<Job["status"], Job["status"]> = {
  open: "paused",
  paused: "open",
  closed: "closed",
};

export const jobById = (jobs: Job[], id: string): Job =>
  jobs.find((j) => j.id === id) ?? jobs[0];

// -------------------------------------------------------------- candidates

export interface Candidate extends Person {
  job: string;
  /** `2026-10-28` */
  applied: string;
  ratings: Ratings;
  /** The stage a rejected candidate was in, or empty. */
  rejectedFrom: string;
  /** The day they were hired, or empty. */
  hiredOn: string;
}

const SOURCES = [
  "Referral",
  "LinkedIn",
  "Careers page",
  "Agency",
  "Conference",
];
const PLACES = [
  "Lisbon",
  "Berlin",
  "Warsaw",
  "Madrid",
  "Remote",
  "Prague",
  "Porto",
];

interface Seed {
  name: string;
  job: string;
  stage: string;
  applied: string;
  skills: string[];
  ratings?: Ratings;
  rejectedFrom?: string;
  hiredOn?: string;
  note?: string;
}

const SEEDS: Seed[] = [
  {
    name: "Mira Okonkwo",
    job: "j1",
    stage: "screening",
    applied: "2026-10-26",
    skills: ["Figma", "Design systems", "Research"],
    ratings: { solve: 4, craft: 5 },
    note: "Led the redesign of a payments app used by 2M people.",
  },
  {
    name: "Leo Brandt",
    job: "j1",
    stage: "interview",
    applied: "2026-10-14",
    skills: ["Prototyping", "Motion", "Accessibility"],
    ratings: { solve: 4, craft: 4, comm: 3, team: 5, domain: 4 },
  },
  {
    name: "Sara Mendes",
    job: "j1",
    stage: "applied",
    applied: "2026-11-02",
    skills: ["Branding", "Illustration"],
  },
  {
    name: "Pavel Novak",
    job: "j1",
    stage: "rejected",
    applied: "2026-10-02",
    skills: ["UI design", "Webflow"],
    ratings: { solve: 2, craft: 3, comm: 3 },
    rejectedFrom: "interview",
    note: "Portfolio is strong but no product experience.",
  },
  {
    name: "Hye-jin Park",
    job: "j1",
    stage: "offer",
    applied: "2026-09-28",
    skills: ["Design systems", "Figma", "Workshops"],
    ratings: { solve: 5, craft: 5, comm: 4, team: 4, domain: 4 },
    note: "Unanimous yes after the panel.",
  },
  {
    name: "Arjun Mehta",
    job: "j2",
    stage: "interview",
    applied: "2026-10-09",
    skills: ["Go", "PostgreSQL", "Kafka"],
    ratings: { solve: 5, craft: 4, comm: 3, team: 4 },
  },
  {
    name: "Chloe Dubois",
    job: "j2",
    stage: "screening",
    applied: "2026-10-27",
    skills: ["Python", "AWS", "Terraform"],
    ratings: { comm: 4 },
  },
  {
    name: "Ben Carter",
    job: "j2",
    stage: "applied",
    applied: "2026-11-01",
    skills: ["Java", "Spring"],
  },
  {
    name: "Fatima Zahra",
    job: "j2",
    stage: "offer",
    applied: "2026-09-30",
    skills: ["Rust", "Distributed systems"],
    ratings: { solve: 5, craft: 5, comm: 4, team: 3, domain: 5 },
  },
  {
    name: "Lukas Meyer",
    job: "j2",
    stage: "hired",
    applied: "2026-09-10",
    skills: ["Go", "Kubernetes"],
    ratings: { solve: 4, craft: 4, comm: 4, team: 5, domain: 4 },
    hiredOn: "2026-10-12",
  },
  {
    name: "Ivan Petrov",
    job: "j2",
    stage: "rejected",
    applied: "2026-10-15",
    skills: ["PHP", "MySQL"],
    ratings: { solve: 2, comm: 2 },
    rejectedFrom: "screening",
  },
  {
    name: "Tess Walker",
    job: "j2",
    stage: "applied",
    applied: "2026-11-03",
    skills: ["Node.js", "GraphQL"],
  },
  {
    name: "Omar Said",
    job: "j2",
    stage: "interview",
    applied: "2026-10-18",
    skills: ["Elixir", "Observability"],
    ratings: { solve: 4, craft: 4, comm: 5 },
  },
  {
    name: "Grace Liu",
    job: "j3",
    stage: "hired",
    applied: "2026-09-25",
    skills: ["Onboarding", "SaaS", "Zendesk"],
    ratings: { solve: 4, comm: 5, team: 5, domain: 4 },
    hiredOn: "2026-10-19",
  },
  {
    name: "Nina Kowalski",
    job: "j3",
    stage: "interview",
    applied: "2026-10-17",
    skills: ["Account management", "Churn analysis"],
    ratings: { solve: 3, comm: 5, team: 4 },
  },
  {
    name: "Marco Silva",
    job: "j3",
    stage: "applied",
    applied: "2026-10-31",
    skills: ["Support", "Spanish"],
  },
  {
    name: "Elif Demir",
    job: "j4",
    stage: "screening",
    applied: "2026-10-22",
    skills: ["SQL", "dbt", "Looker"],
    ratings: { solve: 4, craft: 3 },
  },
  {
    name: "Daniel Reyes",
    job: "j4",
    stage: "applied",
    applied: "2026-10-29",
    skills: ["Python", "Statistics"],
  },
  {
    name: "Joy Adeyemi",
    job: "j4",
    stage: "hired",
    applied: "2026-09-18",
    skills: ["SQL", "Tableau"],
    ratings: { solve: 4, craft: 4, comm: 4, team: 4, domain: 3 },
    hiredOn: "2026-10-26",
  },
];

export const CANDIDATES: Candidate[] = SEEDS.map((s, i): Candidate => {
  const job = JOBS.find((j) => j.id === s.job) ?? JOBS[0];
  const slug = s.name.toLowerCase().replace(/[^a-z]+/g, ".");
  return {
    id: `c${i + 1}`,
    name: s.name,
    role: job.title,
    email: `${slug}@example.com`,
    location: PLACES[(i * 3) % PLACES.length],
    source: SOURCES[i % SOURCES.length],
    expected: Math.round((job.min + job.max) / 2 + ((i * 7) % 11) - 5),
    skills: s.skills,
    note: s.note ?? "",
    stage: s.stage,
    job: s.job,
    applied: s.applied,
    ratings: s.ratings ?? {},
    rejectedFrom: s.rejectedFrom ?? "",
    hiredOn: s.hiredOn ?? "",
  };
});

export const candById = (list: Candidate[], id: string): Candidate =>
  list.find((c) => c.id === id) ?? list[0];

/** Pure: the stage after this one on the line; `hired` needs an offer first. */
export function advance(
  c: Candidate,
  offers: Offer[],
  today: string,
): { candidate: Candidate; problem: string } {
  const i = ORDER.indexOf(c.stage);
  if (i < 0 || i >= ORDER.length - 1) return { candidate: c, problem: "" };
  const next = ORDER[i + 1];
  if (next === "hired" && !offers.some((o) => o.cand === c.id)) {
    return { candidate: c, problem: "Make an offer before hiring." };
  }
  return {
    candidate: {
      ...c,
      stage: next,
      hiredOn: next === "hired" ? today : c.hiredOn,
    },
    problem: "",
  };
}

/** Pure: a rejection remembers the stage the person was in. */
export function reject(c: Candidate): Candidate {
  if (c.stage === "rejected" || c.stage === "hired") return c;
  return { ...c, stage: "rejected", rejectedFrom: c.stage };
}

/** Pure: move one column with the board buttons (the board allows every column). */
export function moveTo(c: Candidate, stage: string, today: string): Candidate {
  return {
    ...c,
    stage,
    rejectedFrom:
      stage === "rejected" && c.stage !== "rejected"
        ? c.stage
        : stage === "rejected"
          ? c.rejectedFrom
          : "",
    hiredOn: stage === "hired" ? c.hiredOn || today : "",
  };
}

/** Pure: the stage a candidate counts as having reached (a rejected one stays where they fell). */
export const reachedStage = (c: Candidate): string =>
  c.stage === "rejected" ? c.rejectedFrom || "applied" : c.stage;

// ------------------------------------------------------------------ offers

export interface Offer {
  cand: string;
  /** Yearly salary in thousands. */
  salary: number;
  bonus: number;
  start: string;
  sent: string;
}

export const OFFERS: Offer[] = [
  {
    cand: "c5",
    salary: 112,
    bonus: 8,
    start: "2026-12-07",
    sent: "2026-11-02",
  },
  {
    cand: "c9",
    salary: 121,
    bonus: 10,
    start: "2026-12-01",
    sent: "2026-11-01",
  },
  {
    cand: "c10",
    salary: 104,
    bonus: 6,
    start: "2026-11-09",
    sent: "2026-10-05",
  },
  {
    cand: "c14",
    salary: 61,
    bonus: 4,
    start: "2026-11-02",
    sent: "2026-10-12",
  },
  {
    cand: "c19",
    salary: 78,
    bonus: 5,
    start: "2026-11-09",
    sent: "2026-10-20",
  },
];

export interface OfferDraft {
  salary: string;
  bonus: string;
  start: string;
}

/** Pure: what is wrong with an offer form, by field. */
export function validateOffer(
  d: OfferDraft,
  job: Job,
  today: string,
): Record<string, string> {
  const errors: Record<string, string> = {};
  const salary = Number(d.salary);
  if (d.salary.trim() === "" || !Number.isFinite(salary) || salary <= 0) {
    errors.salary = "Enter the yearly salary in thousands.";
  } else if (salary < job.min * 0.9 || salary > job.max * 1.1) {
    errors.salary = `Out of range: this role pays ${job.min}k to ${job.max}k (10% either way).`;
  }
  const bonus = Number(d.bonus === "" ? "0" : d.bonus);
  if (!Number.isFinite(bonus) || bonus < 0) {
    errors.bonus = "The bonus cannot be negative.";
  } else if (!errors.salary && bonus > salary * 0.3) {
    errors.bonus = "A bonus is at most 30% of the salary.";
  }
  if (Number.isNaN(dayOf(d.start))) {
    errors.start = "Pick a start date.";
  } else if (daysBetween(today, d.start) < 14) {
    errors.start = "Leave at least two weeks before the start.";
  }
  return errors;
}

export function saveOffer(
  list: Offer[],
  cand: string,
  d: OfferDraft,
  today: string,
): Offer[] {
  const next: Offer = {
    cand,
    salary: Number(d.salary),
    bonus: Number(d.bonus === "" ? "0" : d.bonus),
    start: d.start,
    sent: today,
  };
  return [...list.filter((o) => o.cand !== cand), next];
}

export const suggestedStart = (today: string): string => addDays(today, 28);

// -------------------------------------------------------------- interviews

export interface Interview {
  id: string;
  cand: string;
  kind: string;
  day: string;
  start: number;
  dur: number;
  panel: string;
}

export const KINDS: [string, string, string][] = [
  ["phone", "Phone screen", "c2"],
  ["technical", "Technical interview", "c1"],
  ["panel", "Panel interview", "c4"],
  ["culture", "Culture chat", "c3"],
];

const h = (hour: number, min = 0): number => hour * 60 + min;

export const INTERVIEWS: Interview[] = [
  {
    id: "i1",
    cand: "c1",
    kind: "phone",
    day: "2026-11-03",
    start: h(15),
    dur: 30,
    panel: "Tomas Berg",
  },
  {
    id: "i2",
    cand: "c2",
    kind: "panel",
    day: "2026-11-04",
    start: h(10),
    dur: 90,
    panel: "Elena Rossi, Tomas Berg",
  },
  {
    id: "i3",
    cand: "c6",
    kind: "technical",
    day: "2026-11-04",
    start: h(14),
    dur: 60,
    panel: "Priya Raman",
  },
  {
    id: "i4",
    cand: "c13",
    kind: "technical",
    day: "2026-11-05",
    start: h(11),
    dur: 60,
    panel: "Marcus Webb",
  },
  {
    id: "i5",
    cand: "c15",
    kind: "culture",
    day: "2026-11-05",
    start: h(16),
    dur: 45,
    panel: "Ines Duarte",
  },
  {
    id: "i6",
    cand: "c7",
    kind: "phone",
    day: "2026-11-06",
    start: h(9, 30),
    dur: 30,
    panel: "Ines Duarte",
  },
  {
    id: "i7",
    cand: "c17",
    kind: "phone",
    day: "2026-11-06",
    start: h(13),
    dur: 30,
    panel: "Rafael Ortiz",
  },
  {
    id: "i8",
    cand: "c2",
    kind: "culture",
    day: "2026-11-09",
    start: h(11),
    dur: 45,
    panel: "Ines Duarte",
  },
];

export const kindOf = (id: string): { label: string; tone: string } => {
  const k = KINDS.find(([x]) => x === id) ?? KINDS[0];
  return { label: k[1], tone: k[2] };
};

export interface InterviewDraft {
  cand: string;
  kind: string;
  day: string;
  time: string;
  dur: string;
}

/** Pure: do two bookings on the same day overlap in time? */
export function overlaps(
  a: { day: string; start: number; dur: number },
  b: { day: string; start: number; dur: number },
): boolean {
  return (
    a.day === b.day && a.start < b.start + b.dur && b.start < a.start + a.dur
  );
}

/** Pure: what is wrong with an interview form, by field. */
export function validateInterview(
  d: InterviewDraft,
  list: Interview[],
  today: string,
): Record<string, string> {
  const errors: Record<string, string> = {};
  const start = minutesOf(d.time);
  const dur = Number(d.dur);
  if (Number.isNaN(dayOf(d.day))) {
    errors.day = "Pick a date.";
  } else if (d.day < today) {
    errors.day = "The date has passed.";
  } else if (new Date(dayOf(d.day) * 86_400_000).getUTCDay() % 6 === 0) {
    errors.day = "Interviews are on weekdays.";
  }
  if (Number.isNaN(start)) errors.time = "Choose a time.";
  if (!errors.day && !errors.time) {
    const clash = list.find((i) => overlaps({ day: d.day, start, dur }, i));
    if (clash) errors.time = "Another interview is booked at this time.";
  }
  return errors;
}

export function addInterview(
  list: Interview[],
  d: InterviewDraft,
): Interview[] {
  const max = list.reduce((m, i) => Math.max(m, Number(i.id.slice(1)) || 0), 0);
  return [
    ...list,
    {
      id: `i${max + 1}`,
      cand: d.cand,
      kind: d.kind,
      day: d.day,
      start: minutesOf(d.time),
      dur: Number(d.dur),
      panel: "To be confirmed",
    },
  ];
}

/** Pure: the interviews as agenda items (only for people still in the race). */
export function agendaItems(list: Interview[], cands: Candidate[]): AgendaIn[] {
  return list.flatMap((i): AgendaIn[] => {
    const c = cands.find((x) => x.id === i.cand);
    if (!c || c.stage === "rejected") return [];
    const k = kindOf(i.kind);
    return [
      {
        id: i.id,
        title: `${k.label}: ${c.name}`,
        sub: `${c.role}, ${i.panel}`,
        tone: k.tone,
        day: i.day,
        start: i.start,
        dur: i.dur,
        done: false,
      },
    ];
  });
}

// ------------------------------------------------------------------- stats

/** Seeded time to hire (days) of people hired earlier, by department. */
export const HISTORY: { dept: string; days: number }[] = [
  { dept: "Design", days: 41 },
  { dept: "Design", days: 36 },
  { dept: "Platform", days: 52 },
  { dept: "Platform", days: 47 },
  { dept: "Customer care", days: 29 },
  { dept: "Analytics", days: 38 },
];

/** Pure: average days from applying to being hired, by department. */
export function timeToHire(
  cands: Candidate[],
  jobs: Job[],
): { dept: string; days: number }[] {
  const rows = [...HISTORY];
  for (const c of cands) {
    if (c.stage === "hired" && c.hiredOn) {
      rows.push({
        dept: jobById(jobs, c.job).dept,
        days: daysBetween(c.applied, c.hiredOn),
      });
    }
  }
  const depts = [...new Set(rows.map((r) => r.dept))];
  return depts.map((dept) => {
    const mine = rows.filter((r) => r.dept === dept);
    return {
      dept,
      days: Math.round(mine.reduce((n, r) => n + r.days, 0) / mine.length),
    };
  });
}

export function overallTimeToHire(cands: Candidate[], jobs: Job[]): number {
  const t = timeToHire(cands, jobs);
  return Math.round(t.reduce((n, r) => n + r.days, 0) / t.length);
}

/** Pure: of the offers made, the share that were accepted (hired). */
export function acceptRate(cands: Candidate[]): number {
  const reached = cands.filter((c) =>
    ["offer", "hired"].includes(reachedStage(c)),
  );
  if (reached.length === 0) return 0;
  const hired = cands.filter((c) => c.stage === "hired").length;
  return Math.round((hired / reached.length) * 100);
}

export const tone = (avg: number | null): Tone =>
  avg === null
    ? "muted"
    : avg >= 3.4
      ? "success"
      : avg >= 2.6
        ? "warning"
        : "destructive";
