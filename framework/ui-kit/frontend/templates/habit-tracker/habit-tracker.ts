import type { Effect, Message } from "@pavlus/frontend";
import { AdminApp, type AppState } from "../../blocks/admin-shell/app.ts";
import {
  type NavGroup,
  notice,
  patch,
  type ShellAction,
  type ShellUser,
  type Tone,
} from "../../blocks/admin-shell/shell.ts";
import {
  emptyHabit,
  type HabitDraft,
  saveHabit,
  validateHabit,
} from "../../blocks/habit-form/form.ts";
import {
  type Freq,
  isDone,
  toggleCheck,
} from "../../blocks/habit-grid/habits.ts";
import {
  reminderFor,
  setReminderTime,
  toggleReminder,
} from "../../blocks/reminder-list/reminders.ts";
import { shiftMonth } from "../../lib/calendar.ts";
import view from "./habit-tracker.pavlus";
import {
  type Core,
  type Derived,
  derive,
  draftOfHabit,
  startCore,
  TODAY,
} from "./tracker.ts";

export interface TrackerState extends AppState, Derived {
  user: ShellUser;
  actions: ShellAction[];
  core: Core;
}

const GROUPS: NavGroup[] = [
  {
    title: "Track",
    items: [
      { id: "today", label: "Today", icon: "k-ai-home" },
      { id: "heatmap", label: "Heatmap", icon: "k-ai-grid" },
      { id: "habits", label: "Habits", icon: "k-ai-clipboard" },
    ],
  },
  {
    title: "Motivation",
    items: [
      { id: "reminders", label: "Reminders", icon: "k-ai-alert" },
      { id: "badges", label: "Achievements", icon: "k-ai-sparkles" },
    ],
  },
];

const core = startCore();

export const initial: TrackerState = {
  screen: "today",
  title: "Today",
  navOpen: false,
  notice: "",
  groups: GROUPS,
  user: { name: "Sam Rivera", role: "Since March", initials: "SR" },
  actions: [
    { id: "new", label: "New habit", icon: "k-icon-plus", variant: "default" },
  ],
  core,
  ...derive(core),
};

export class HabitTracker extends AdminApp<TrackerState> {
  view = view;

  /** Change some of the core; every view worked out from it follows. */
  _commit(state: TrackerState, changes: Partial<Core>): Effect[] {
    const next: Core = { ...state.core, ...changes };
    return patch({ core: next, ...derive(next) });
  }

  _form(state: TrackerState, id: string): Effect[] {
    const habit = state.core.habits.find((h) => h.id === id);
    return [
      ...this._commit(state, {
        formOpen: true,
        editingId: habit ? habit.id : "",
        draft: habit ? draftOfHabit(habit) : emptyHabit(),
        errors: {},
      }),
      ...patch({ screen: "habits", title: "Habits" }),
    ];
  }

  "top.action"(_msg: Message, state: TrackerState): Effect[] {
    return this._form(state, "");
  }

  // ---- the week grid
  "grid.toggle"(msg: Message, state: TrackerState): Effect[] {
    const [id, iso] = msg.payload as [string, string];
    const habit = state.core.habits.find((h) => h.id === id);
    const was = isDone(state.core.checks, id, iso);
    const checks = toggleCheck(state.core.checks, id, iso);
    return [
      ...this._commit(state, { checks }),
      ...(!was && habit && iso === TODAY
        ? notice(`${habit.name}: done for today`)
        : []),
    ];
  }
  "grid.edit"(msg: Message, state: TrackerState): Effect[] {
    return this._form(state, msg.payload as string);
  }

  // ---- the heatmap
  "heat.prev"(_msg: Message, state: TrackerState): Effect[] {
    return this._commit(state, { month: shiftMonth(state.core.month, -1) });
  }
  "heat.next"(_msg: Message, state: TrackerState): Effect[] {
    return this._commit(state, { month: shiftMonth(state.core.month, 1) });
  }

  // ---- the list of habits
  "hl.act"(msg: Message, state: TrackerState): Effect[] {
    const [id, what] = msg.payload as [string, string];
    return what === "edit" ? this._form(state, id) : this._delete(state, id);
  }

  _delete(state: TrackerState, id: string): Effect[] {
    const habit = state.core.habits.find((h) => h.id === id);
    const checks = { ...state.core.checks };
    delete checks[id];
    return [
      ...this._commit(state, {
        habits: state.core.habits.filter((h) => h.id !== id),
        checks,
        reminders: state.core.reminders.filter((r) => r.habitId !== id),
        formOpen: false,
        editingId: "",
      }),
      ...notice(`${habit?.name ?? "The habit"} was deleted`),
    ];
  }

  // ---- the form
  _draft(state: TrackerState, changes: Partial<HabitDraft>): Effect[] {
    return this._commit(state, {
      draft: { ...state.core.draft, ...changes },
      errors: {},
    });
  }
  "form.name"(msg: Message, state: TrackerState): Effect[] {
    return this._draft(state, { name: msg.event?.value ?? "" });
  }
  "form.tone"(msg: Message, state: TrackerState): Effect[] {
    return this._draft(state, { tone: msg.payload as Tone });
  }
  "form.icon"(msg: Message, state: TrackerState): Effect[] {
    return this._draft(state, { icon: msg.payload as string });
  }
  "form.freq"(msg: Message, state: TrackerState): Effect[] {
    return this._draft(state, { freq: msg.payload as Freq });
  }
  "form.cancel"(_msg: Message, state: TrackerState): Effect[] {
    return this._commit(state, { formOpen: false, editingId: "", errors: {} });
  }
  "form.remove"(_msg: Message, state: TrackerState): Effect[] {
    return this._delete(state, state.core.editingId);
  }
  "form.save"(_msg: Message, state: TrackerState): Effect[] {
    const { draft, editingId, habits, reminders } = state.core;
    const errors = validateHabit(draft, habits, editingId);
    if (Object.keys(errors).length > 0) return this._commit(state, { errors });
    const saved = saveHabit(habits, draft, editingId);
    const added = saved.find((h) => !habits.some((x) => x.id === h.id));
    return [
      ...this._commit(state, {
        habits: saved,
        reminders: added ? reminderFor(reminders, added.id) : reminders,
        formOpen: false,
        editingId: "",
        errors: {},
      }),
      ...notice(
        editingId ? "Habit saved" : `Now tracking "${draft.name.trim()}"`,
      ),
    ];
  }

  // ---- reminders
  "remind.toggle"(msg: Message, state: TrackerState): Effect[] {
    return this._commit(state, {
      reminders: toggleReminder(state.core.reminders, msg.payload as string),
    });
  }
  "remind.time"(msg: Message, state: TrackerState): Effect[] {
    return this._commit(state, {
      reminders: setReminderTime(
        state.core.reminders,
        msg.payload as string,
        msg.event?.value ?? "08:00",
      ),
    });
  }
}

export const page = new HabitTracker();
