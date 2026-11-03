import type { Effect, Message } from "@service-laboratory/pavlus";
import {
  storeEffector as store,
  timeEffector as time,
} from "@service-laboratory/pavlus/plugins";
import { AdminApp, type AppState } from "../../blocks/admin-shell/app.ts";
import {
  type NavGroup,
  notice,
  patch,
  type ShellAction,
  type ShellUser,
} from "../../blocks/admin-shell/shell.ts";
import {
  addCategory,
  freshTone,
  recolor,
  removeCategory,
  rename,
  validateName,
} from "../../blocks/category-manager/cats.ts";
import { toggleTask } from "../../blocks/checklist/list.ts";
import { withValue } from "../../blocks/record-sheet/sheet.ts";
import {
  newTracker,
  startTracker,
  stopTracker,
  tickTracker,
} from "../../blocks/time-tracker/tracker.ts";
import {
  addDays,
  clockOf,
  shortDate,
} from "../../blocks/week-calendar/dates.ts";
import {
  addTask,
  BLOCKS,
  CATEGORIES,
  clearDone,
  GOALS,
  nextBlockId,
  saveBlock,
  TASKS,
  TODAY,
  usedMinutes,
  validateBlock,
  validateTask,
} from "./plan.ts";
import {
  blockSheet,
  closedSheet,
  draftFrom,
  newDraft,
  type SheetState,
} from "./sheet.ts";
import { derive, type PlanCore, type PlanViews } from "./views.ts";
import view from "./personal-time-planner.pavlus";

export const TIMER_ID = "planner:tracker";

export interface PlanState extends AppState, PlanCore, PlanViews {
  user: ShellUser;
  actions: ShellAction[];
  sheet: SheetState;
}

const NAV: NavGroup[] = [
  {
    title: "My planner",
    items: [
      { id: "week", label: "Week", icon: "k-icon-calendar" },
      { id: "today", label: "Today", icon: "k-ai-clipboard" },
      { id: "insights", label: "Time and goals", icon: "k-ai-chart" },
    ],
  },
  {
    title: "Lists",
    items: [
      { id: "tasks", label: "Quick tasks", icon: "k-ai-flag" },
      { id: "categories", label: "Categories", icon: "k-ai-tag" },
    ],
  },
];

const core: PlanCore = {
  blocks: BLOCKS,
  cats: CATEGORIES,
  goals: GOALS,
  tasks: TASKS,
  tracker: newTracker(14 * 60 + 20, "work"),
  done: ["b3", "b4"],
  anchor: TODAY,
  catDraft: { name: "", tone: freshTone(CATEGORIES), error: "" },
  catErrors: {},
  taskDraft: { title: "", priority: "medium", cat: "errands", error: "" },
};

export const initial: PlanState = {
  screen: "week",
  title: "Week",
  navOpen: false,
  notice: "",
  groups: NAV,
  user: { name: "Maya Alves", role: "My week", initials: "MA" },
  actions: [
    { id: "add", label: "Add block", icon: "k-icon-plus", variant: "default" },
  ],
  ...core,
  ...derive(core),
  sheet: closedSheet(CATEGORIES),
};

const coreOf = (s: PlanState): PlanCore => ({
  blocks: s.blocks,
  cats: s.cats,
  goals: s.goals,
  tasks: s.tasks,
  tracker: s.tracker,
  done: s.done,
  anchor: s.anchor,
  catDraft: s.catDraft,
  catErrors: s.catErrors,
  taskDraft: s.taskDraft,
});

export class PersonalTimePlanner extends AdminApp<PlanState> {
  view = view;

  _commit(state: PlanState, changes: Partial<PlanCore>): Effect[] {
    return patch({ ...changes, ...derive({ ...coreOf(state), ...changes }) });
  }

  // ---- the timer lives in the time plugin: stop it when the page goes away
  leave(msg: Message, state: PlanState): Effect[] {
    return [...super.leave(msg, state), time.cancel(TIMER_ID)];
  }

  enter(msg: Message, state: PlanState): Effect[] {
    return [
      ...super.enter(msg, state),
      ...(state.tracker.running
        ? [time.setInterval(TIMER_ID, 1000, "tick")]
        : []),
    ];
  }

  // ---- the week
  "top.action"(_msg: Message, state: PlanState): Effect[] {
    return patch({
      sheet: blockSheet(state.cats, newDraft(state.cats[0].id), ""),
    });
  }

  prevWeek(_msg: Message, state: PlanState): Effect[] {
    return this._commit(state, { anchor: addDays(state.anchor, -7) });
  }

  nextWeek(_msg: Message, state: PlanState): Effect[] {
    return this._commit(state, { anchor: addDays(state.anchor, 7) });
  }

  thisWeek(_msg: Message, state: PlanState): Effect[] {
    return this._commit(state, { anchor: TODAY });
  }

  _edit(state: PlanState, id: string): Effect[] {
    const found = state.blocks.find((x) => x.id === id);
    return found
      ? patch({
          sheet: blockSheet(
            state.cats,
            {
              title: found.title,
              cat: found.cat,
              day: found.day,
              start: clockOf(found.start),
              dur: String(found.dur),
              repeat: found.repeat,
              note: found.note,
            },
            id,
          ),
        })
      : [];
  }

  "cal.pick"(msg: Message, state: PlanState): Effect[] {
    return this._edit(state, msg.payload as string);
  }

  "cal.slot"(msg: Message, state: PlanState): Effect[] {
    const [day, hour] = msg.payload as [string, number];
    return patch({
      sheet: blockSheet(state.cats, newDraft(state.cats[0].id, day, hour), ""),
    });
  }

  "cal.pickday"(msg: Message, state: PlanState): Effect[] {
    return patch({
      sheet: blockSheet(
        state.cats,
        newDraft(state.cats[0].id, msg.payload as string),
        "",
      ),
    });
  }

  // ---- today
  "agenda.toggle"(msg: Message, state: PlanState): Effect[] {
    const id = msg.payload as string;
    const done = state.done.includes(id)
      ? state.done.filter((x) => x !== id)
      : [...state.done, id];
    return this._commit(state, { done });
  }

  "agenda.pick"(msg: Message, state: PlanState): Effect[] {
    return this._edit(state, msg.payload as string);
  }

  // ---- the timer
  "tt.start"(_msg: Message, state: PlanState): Effect[] {
    if (state.tracker.running) return [];
    return [
      ...this._commit(state, { tracker: startTracker(state.tracker) }),
      time.setInterval(TIMER_ID, 1000, "tick"),
    ];
  }

  tick(_msg: Message, state: PlanState): Effect[] {
    return this._commit(state, { tracker: tickTracker(state.tracker) });
  }

  "tt.stop"(_msg: Message, state: PlanState): Effect[] {
    const cat = state.cats.find((c) => c.id === state.tracker.cat);
    const { tracker, entry } = stopTracker(
      state.tracker,
      `t${nextBlockId(state.blocks).slice(1)}`,
      cat?.name ?? "Time",
    );
    const blocks = entry
      ? [
          ...state.blocks,
          {
            id: entry.id,
            title: entry.title,
            cat: entry.cat,
            day: TODAY,
            start: entry.start,
            dur: entry.dur,
            note: "Tracked",
            repeat: "none" as const,
          },
        ]
      : state.blocks;
    return [
      time.cancel(TIMER_ID),
      ...this._commit(state, { tracker, blocks }),
      ...(entry
        ? notice(`Logged ${entry.dur} min of ${cat?.name ?? "time"}`)
        : []),
    ];
  }

  "tt.pickcat"(msg: Message, state: PlanState): Effect[] {
    return this._commit(state, {
      tracker: { ...state.tracker, cat: msg.payload as string },
    });
  }

  "tt.setnote"(msg: Message, state: PlanState): Effect[] {
    return [
      store.set("tracker", {
        ...state.tracker,
        note: msg.event?.value ?? "",
      }),
    ];
  }

  "tt.setfast"(msg: Message, state: PlanState): Effect[] {
    return this._commit(state, {
      tracker: { ...state.tracker, fast: Boolean(msg.event?.checked) },
    });
  }

  // ---- quick tasks
  "tasklist.toggle"(msg: Message, state: PlanState): Effect[] {
    return this._commit(state, {
      tasks: toggleTask(state.tasks, msg.payload as string),
    });
  }

  setTaskTitle(msg: Message, state: PlanState): Effect[] {
    return this._commit(state, {
      taskDraft: {
        ...state.taskDraft,
        title: msg.event?.value ?? "",
        error: "",
      },
    });
  }

  setTaskPriority(msg: Message, state: PlanState): Effect[] {
    return this._commit(state, {
      taskDraft: { ...state.taskDraft, priority: msg.event?.value ?? "medium" },
    });
  }

  setTaskCat(msg: Message, state: PlanState): Effect[] {
    return this._commit(state, {
      taskDraft: { ...state.taskDraft, cat: msg.event?.value ?? "errands" },
    });
  }

  addTask(_msg: Message, state: PlanState): Effect[] {
    const errors = validateTask(state.taskDraft, state.tasks);
    if (errors.title) {
      return this._commit(state, {
        taskDraft: { ...state.taskDraft, error: errors.title },
      });
    }
    return [
      ...this._commit(state, {
        tasks: addTask(state.tasks, state.taskDraft, state.cats),
        taskDraft: { ...state.taskDraft, title: "", error: "" },
      }),
      ...notice("Task added"),
    ];
  }

  clearDone(_msg: Message, state: PlanState): Effect[] {
    return [
      ...this._commit(state, { tasks: clearDone(state.tasks) }),
      ...notice("Finished tasks cleared"),
    ];
  }

  // ---- categories
  "cats.setname"(msg: Message, state: PlanState): Effect[] {
    return this._commit(state, {
      catDraft: { ...state.catDraft, name: msg.event?.value ?? "", error: "" },
    });
  }

  "cats.settone"(msg: Message, state: PlanState): Effect[] {
    return this._commit(state, {
      catDraft: { ...state.catDraft, tone: msg.payload as string },
    });
  }

  "cats.add"(_msg: Message, state: PlanState): Effect[] {
    const error = validateName(state.catDraft.name, state.cats);
    if (error) {
      return this._commit(state, { catDraft: { ...state.catDraft, error } });
    }
    const cats = addCategory(
      state.cats,
      state.catDraft.name,
      state.catDraft.tone,
    );
    return [
      ...this._commit(state, {
        cats,
        catDraft: { name: "", tone: freshTone(cats), error: "" },
      }),
      ...notice("Category added"),
    ];
  }

  "cats.rename"(msg: Message, state: PlanState): Effect[] {
    const id = msg.payload as string;
    const name = msg.event?.value ?? "";
    const error = validateName(name, state.cats, id);
    return this._commit(state, {
      catErrors: { ...state.catErrors, [id]: error },
      cats: error ? state.cats : rename(state.cats, id, name.trim()),
    });
  }

  "cats.recolor"(msg: Message, state: PlanState): Effect[] {
    return this._commit(state, {
      cats: recolor(state.cats, msg.payload as string),
    });
  }

  "cats.remove"(msg: Message, state: PlanState): Effect[] {
    const cats = removeCategory(
      state.cats,
      msg.payload as string,
      usedMinutes(state.blocks, state.cats),
    );
    const tracker = cats.some((c) => c.id === state.tracker.cat)
      ? state.tracker
      : { ...state.tracker, cat: cats[0].id };
    return this._commit(state, { cats, tracker });
  }

  // ---- the block form
  "sheet.close"(_msg: Message, state: PlanState): Effect[] {
    return patch({ sheet: { ...state.sheet, open: false } });
  }

  "sheet.field"(msg: Message, state: PlanState): Effect[] {
    const fields = withValue(
      state.sheet.fields,
      msg.payload as string,
      msg.event?.value ?? "",
    );
    return patch({ sheet: { ...state.sheet, fields } });
  }

  "sheet.press"(msg: Message, state: PlanState): Effect[] {
    const { id, fields } = state.sheet;
    if (msg.payload === "delete") {
      return [
        ...this._commit(state, {
          blocks: state.blocks.filter((x) => x.id !== id),
        }),
        ...patch({ sheet: { ...state.sheet, open: false } }),
        ...notice("Block deleted"),
      ];
    }
    const draft = draftFrom(fields);
    const errors = validateBlock(draft, state.cats);
    if (Object.keys(errors).length > 0) {
      return patch({ sheet: blockSheet(state.cats, draft, id, errors) });
    }
    return [
      ...this._commit(state, { blocks: saveBlock(state.blocks, draft, id) }),
      ...patch({ sheet: { ...state.sheet, open: false } }),
      ...notice(id ? "Block saved" : `Added on ${shortDate(draft.day)}`),
    ];
  }
}

export const page = new PersonalTimePlanner();
