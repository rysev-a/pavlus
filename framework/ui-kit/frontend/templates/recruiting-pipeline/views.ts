import { type AgendaDay, agendaOf } from "../../blocks/day-agenda/agenda.ts";
import {
  type Column as ChartColumn,
  columns,
} from "../../blocks/bar-chart/chart.ts";
import {
  type CandidateView,
  candidateView,
} from "../../blocks/candidate-card/candidate.ts";
import {
  action,
  type Column,
  columnsOf,
  number,
  pill,
  type Row,
  rowOf,
  strong,
  text,
} from "../../blocks/data-grid/grid.ts";
import {
  funnel,
  type FunnelView,
  reached,
} from "../../blocks/funnel-chart/funnel.ts";
import {
  boardOf,
  type ColumnView,
  type Task as BoardTask,
} from "../../blocks/kanban-board/board.ts";
import { type Filter, filtersOf } from "../../blocks/list-filter/filters.ts";
import { type Card, card } from "../../blocks/stat-cards/cards.ts";
import {
  average,
  type ScoreView,
  scoreView,
  verdictOf,
} from "../../blocks/scorecard/score.ts";
import { shortDate, weekOf } from "../../blocks/week-calendar/dates.ts";
import {
  acceptRate,
  agendaItems,
  type Candidate,
  candById,
  type Interview,
  type Job,
  jobById,
  ORDER,
  type Offer,
  overallTimeToHire,
  reachedStage,
  SKILLS,
  STAGES,
  timeToHire,
  TODAY,
} from "./rec.ts";

export interface RecCore {
  jobs: Job[];
  cands: Candidate[];
  offers: Offer[];
  interviews: Interview[];
  selected: string;
  jobFilter: string;
}

export interface SelectOption {
  value: string;
  label: string;
  selected: boolean;
}

export interface RecViews {
  jobStats: Card[];
  jobCols: Column[];
  jobRows: Row[];
  boardFilters: Filter[];
  boardCols: ColumnView[];
  options: SelectOption[];
  profile: CandidateView;
  score: ScoreView;
  offerLine: string;
  offerTone: string;
  agenda: AgendaDay[];
  interviewStats: Card[];
  funnel: FunnelView;
  statCards: Card[];
  hireBars: ChartColumn[];
}

const JOB_COLS = [
  { key: "role", label: "Role" },
  { key: "dept", label: "Department" },
  { key: "where", label: "Location" },
  { key: "open", label: "Openings", align: "right" as const },
  { key: "cands", label: "In pipeline", align: "right" as const },
  { key: "pay", label: "Salary" },
  { key: "status", label: "Status" },
];

const money = (k: number): string => `$${k}k`;

/** Pure: a candidate as a card on the board. */
export function boardTask(c: Candidate, jobs: Job[]): BoardTask {
  const avg = average(SKILLS, c.ratings);
  const v = verdictOf(avg);
  return {
    id: c.id,
    title: c.name,
    column: c.stage,
    project: jobById(jobs, c.job).title,
    who: c.name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .slice(0, 2),
    due: `Applied ${shortDate(c.applied)}`,
    tag: avg === null ? "Not rated" : `${avg.toFixed(1)} ${v.label}`,
    tone: v.tone,
  };
}

export const offerText = (o: Offer | undefined): string =>
  o
    ? `Offer sent ${shortDate(o.sent)}: ${money(o.salary)}${o.bonus > 0 ? ` and a ${money(o.bonus)} bonus` : ""}, starting ${shortDate(o.start)}.`
    : "No offer yet.";

/** Pure: every view of the app, worked out from the data. */
export function derive(s: RecCore): RecViews {
  const sel = candById(s.cands, s.selected);
  const live = s.cands.filter(
    (c) => c.stage !== "rejected" && c.stage !== "hired",
  );
  const onBoard = s.cands.filter(
    (c) => s.jobFilter === "all" || c.job === s.jobFilter,
  );
  const week = weekOf(TODAY);
  const thisWeek = s.interviews.filter((i) => week.includes(i.day)).length;
  const items = agendaItems(s.interviews, s.cands);
  const ofJob = (id: string): number =>
    s.cands.filter((c) => c.job === id && c.stage !== "rejected").length;
  const byStage = (id: string): number =>
    s.cands.filter((c) => c.stage === id).length;

  const funnelStages = ORDER.map((id) => ({
    id,
    label: STAGES.find((x) => x.id === id)?.title ?? id,
  }));
  const counts = reached(ORDER, s.cands.map(reachedStage));
  const hire = timeToHire(s.cands, s.jobs);

  return {
    jobStats: [
      card(
        "open",
        "Open roles",
        String(s.jobs.filter((j) => j.status === "open").length),
        {
          hint: `${s.jobs.reduce((n, j) => n + j.openings, 0)} openings in total`,
          icon: "k-ai-briefcase",
        },
      ),
      card("live", "Active candidates", String(live.length), {
        hint: `${byStage("applied")} new this week`,
        icon: "k-ai-users",
        tone: "info",
      }),
      card("offers", "Offers out", String(byStage("offer")), {
        hint: `${byStage("hired")} hired so far`,
        icon: "k-ai-receipt",
        tone: "success",
      }),
    ],
    jobCols: columnsOf(JOB_COLS, null),
    jobRows: s.jobs.map((j) =>
      rowOf(
        JOB_COLS,
        j.id,
        {
          role: strong(j.title, `Posted ${shortDate(j.posted)}`),
          dept: text(j.dept),
          where: text(j.location),
          open: number(j.openings),
          cands: number(ofJob(j.id)),
          pay: text(`${money(j.min)} to ${money(j.max)}`),
          status: pill(
            j.status,
            j.status === "open"
              ? "success"
              : j.status === "paused"
                ? "warning"
                : "muted",
          ),
        },
        j.status === "closed"
          ? []
          : [action("toggle", j.status === "open" ? "Pause" : "Reopen")],
      ),
    ),
    boardFilters: filtersOf(
      [
        ["all", "All roles"],
        ...s.jobs.map((j): [string, string] => [j.id, j.dept]),
      ],
      s.jobFilter,
      s.cands,
      (c, id) => c.job === id,
    ),
    boardCols: boardOf(
      STAGES.map((x) => ({ id: x.id, title: x.title })),
      onBoard.map((c) => boardTask(c, s.jobs)),
    ),
    options: s.cands.map((c) => ({
      value: c.id,
      label: `${c.name}, ${c.role}`,
      selected: c.id === s.selected,
    })),
    profile: candidateView(sel, STAGES, ORDER),
    score: scoreView(SKILLS, sel.ratings),
    offerLine: offerText(s.offers.find((o) => o.cand === sel.id)),
    offerTone: s.offers.some((o) => o.cand === sel.id) ? "success" : "muted",
    agenda: agendaOf(items, TODAY, 10 * 60),
    interviewStats: [
      card("week", "This week", String(thisWeek), {
        hint: "Interviews booked",
        icon: "k-ai-gantt",
      }),
      card("next", "Next 7 days", String(items.length), {
        hint: "For people still in the race",
        icon: "k-icon-calendar",
        tone: "info",
      }),
    ],
    funnel: funnel(funnelStages.map((st, i) => ({ ...st, count: counts[i] }))),
    statCards: [
      card(
        "tth",
        "Time to hire",
        `${overallTimeToHire(s.cands, s.jobs)} days`,
        {
          hint: "From applying to hired",
          icon: "k-ai-gantt",
          tone: "info",
        },
      ),
      card("acc", "Offer acceptance", `${acceptRate(s.cands)}%`, {
        hint: "Offers that became hires",
        icon: "k-ai-receipt",
        tone: "success",
      }),
      card("tot", "Candidates", String(s.cands.length), {
        hint: `${s.cands.filter((c) => c.stage === "rejected").length} rejected`,
        icon: "k-ai-users",
      }),
    ],
    hireBars: columns(
      hire.map((r) => ({
        id: r.dept,
        label: r.dept,
        value: r.days,
        show: true,
        tone: r.days > 45 ? ("warning" as const) : ("default" as const),
      })),
      undefined,
      "d",
    ),
  };
}
