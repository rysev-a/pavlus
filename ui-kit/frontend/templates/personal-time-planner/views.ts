import { type AgendaDay, agendaOf } from "../../blocks/day-agenda/agenda.ts";
import {
  type Category,
  categoryView,
  type CategoryView,
  type Draft,
} from "../../blocks/category-manager/cats.ts";
import {
  checklistOf,
  type GroupDef,
  type GroupView,
  isOverdue,
  progress,
  type Task as ListTask,
} from "../../blocks/checklist/list.ts";
import { item, type Item } from "../../blocks/progress-list/items.ts";
import { type Card, card } from "../../blocks/stat-cards/cards.ts";
import {
  summaryView,
  type SummaryView,
} from "../../blocks/time-summary/summary.ts";
import {
  durationText,
  weekOf,
  weekTitle,
} from "../../blocks/week-calendar/dates.ts";
import {
  type CalendarView,
  expand,
  weekView,
} from "../../blocks/week-calendar/week.ts";
import {
  type TrackerView,
  type Tracker,
  trackerView,
  type Entry,
} from "../../blocks/time-tracker/tracker.ts";
import {
  type Block,
  dayAgenda,
  type Goal,
  goalProgress,
  minutesPerCat,
  nameOf,
  repeating,
  TODAY,
  type TaskDraft,
  usedMinutes,
} from "./plan.ts";

export const FROM = 6;
export const TO = 24;

export interface PlanCore {
  blocks: Block[];
  cats: Category[];
  goals: Goal[];
  tasks: ListTask[];
  tracker: Tracker;
  /** Ids of today's blocks that are ticked off. */
  done: string[];
  /** The week on the calendar: any day of it. */
  anchor: string;
  catDraft: Draft;
  catErrors: Record<string, string>;
  taskDraft: TaskDraft & { error: string };
}

export const PRIORITY_GROUPS: GroupDef[] = [
  { id: "high", title: "High", hint: "Do these first" },
  { id: "medium", title: "Medium", hint: "This week" },
  { id: "low", title: "Low", hint: "When there is time" },
];

/** Targets in minutes for a day and for a week, by category. */
export const DAY_TARGETS: Record<string, number> = {
  work: 420,
  study: 60,
  sport: 60,
  family: 120,
  sleep: 480,
};
export const WEEK_TARGETS: Record<string, number> = {
  work: 2100,
  study: 300,
  sport: 240,
  family: 600,
  hobby: 180,
  sleep: 3360,
};

export interface Option {
  value: string;
  label: string;
  selected: boolean;
}

export interface LegendItem {
  id: string;
  name: string;
  tone: string;
}

export interface PlanViews {
  week: CalendarView;
  weekLabel: string;
  isThisWeek: boolean;
  legend: LegendItem[];
  todayStats: Card[];
  agenda: AgendaDay[];
  track: TrackerView;
  daySummary: SummaryView;
  weekSummary: SummaryView;
  goalItems: Item[];
  taskGroups: GroupView[];
  taskLine: string;
  hasDone: boolean;
  manager: CategoryView;
  catOptions: Option[];
  prioOptions: Option[];
}

/** Pure: today's tracked entries (the blocks the timer wrote). */
export function trackedToday(blocks: Block[]): Entry[] {
  return blocks
    .filter((x) => x.id.startsWith("t") && x.day === TODAY)
    .map((x) => ({
      id: x.id,
      title: x.title,
      cat: x.cat,
      start: x.start,
      dur: x.dur,
    }));
}

export function derive(s: PlanCore): PlanViews {
  const weekDays = weekOf(s.anchor);
  const realWeek = weekOf(TODAY);
  const items = expand(repeating(s.blocks, s.cats), weekDays);
  const todayItems = dayAgenda(s.blocks, s.cats, TODAY, s.done);
  const planned = todayItems.reduce((n, i) => n + i.dur, 0);
  const tracked = trackedToday(s.blocks);
  const trackedMin = tracked.reduce((n, e) => n + e.dur, 0);
  const doneCount = todayItems.filter((i) => i.done).length;
  const open = s.tasks.filter((t) => !t.done);
  const late = open.filter((t) => isOverdue(t, TODAY)).length;
  const p = progress(s.tasks);
  const dayMin = minutesPerCat(s.blocks, s.cats, [TODAY]);
  const weekMin = minutesPerCat(s.blocks, s.cats, realWeek);

  return {
    week: weekView(items, s.anchor, TODAY, s.tracker.nowMin, FROM, TO),
    weekLabel: weekTitle(s.anchor),
    isThisWeek: weekDays.includes(TODAY),
    legend: s.cats.map((c) => ({ id: c.id, name: c.name, tone: c.tone })),
    todayStats: [
      card("planned", "Planned today", durationText(planned), {
        hint: `${todayItems.length} blocks without sleep`,
        icon: "k-icon-calendar",
      }),
      card("done", "Done", `${doneCount} of ${todayItems.length}`, {
        hint:
          doneCount === todayItems.length
            ? "All done"
            : "Tick them in the list",
        icon: "k-ai-clipboard",
        tone: "success",
      }),
      card("tracked", "Tracked", durationText(trackedMin), {
        hint: s.tracker.running ? "The timer is running" : "Use the timer",
        icon: "k-ai-play",
        tone: "info",
      }),
    ],
    agenda: agendaOf(todayItems, TODAY, s.tracker.nowMin),
    track: trackerView(
      s.tracker,
      s.cats.filter((c) => c.id !== "sleep"),
      tracked,
    ),
    daySummary: summaryView("Today", dayMin, s.cats, DAY_TARGETS),
    weekSummary: summaryView("This week", weekMin, s.cats, WEEK_TARGETS),
    goalItems: s.goals.map((g) => {
      const pr = goalProgress(g, s.blocks, realWeek);
      const label =
        g.kind === "sessions"
          ? `${pr.value} of ${g.target} sessions`
          : `${durationText(pr.value)} of ${durationText(g.target)}`;
      return item(g.id, g.title, pr.pct, 100, {
        text: label,
        sub: nameOf(s.cats, g.cat),
        invert: true,
      });
    }),
    taskGroups: checklistOf(s.tasks, PRIORITY_GROUPS, TODAY),
    taskLine: `${p.done} of ${p.total} done${late ? `, ${late} overdue` : ""}`,
    hasDone: p.done > 0,
    manager: categoryView(
      s.cats,
      usedMinutes(s.blocks, s.cats),
      s.catDraft,
      s.catErrors,
    ),
    catOptions: s.cats
      .filter((c) => c.id !== "sleep")
      .map((c) => ({
        value: c.id,
        label: c.name,
        selected: c.id === s.taskDraft.cat,
      })),
    prioOptions: [
      ["high", "High"],
      ["medium", "Medium"],
      ["low", "Low"],
    ].map(([value, label]) => ({
      value,
      label,
      selected: value === s.taskDraft.priority,
    })),
  };
}
