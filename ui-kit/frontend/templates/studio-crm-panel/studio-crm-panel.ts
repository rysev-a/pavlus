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
import type { ColumnView } from "../../blocks/kanban-board/board.ts";
import type {
  TimelineRow,
  Week,
} from "../../blocks/gantt-timeline/timeline.ts";
import type { Card } from "../../blocks/stat-cards/cards.ts";
import type { StatusRow } from "../../blocks/status-list/rows.ts";
import {
  advanceInvoice,
  advanceProject,
  BOARD,
  board,
  CLIENT_COLUMNS,
  CLIENT_FILTERS,
  CLIENTS,
  type Client,
  clientCards,
  clientRows,
  type CrmTask,
  INVOICE_COLUMNS,
  INVOICE_FILTERS,
  INVOICES,
  type Invoice,
  invoiceCards,
  invoiceFooter,
  invoicePasses,
  invoiceRows,
  milestoneRows,
  moveTask,
  PROJECT_COLUMNS,
  PROJECTS,
  type Project,
  projectCards,
  projectRows,
  TASKS,
  timeline,
  toggleClient,
  toggleMilestone,
  viewOf,
} from "./crm.ts";
import {
  closedSheet,
  draftOfTask,
  invoiceSheet,
  newTaskDraft,
  nextTaskId,
  saveTask,
  type SheetState,
  taskSheet,
  type TaskDraft,
  validateTask,
} from "./sheets.ts";
import view from "./studio-crm-panel.pavlus";

export interface CrmData {
  clients: Client[];
  projects: Project[];
  tasks: CrmTask[];
  invoices: Invoice[];
  clientFilter: string;
  clientQuery: string;
  clientSort: Sort | null;
  projectSort: Sort | null;
  invFilter: string;
  invSort: Sort | null;
}

export interface CrmViews {
  clientStats: Card[];
  clientFilters: Filter[];
  clientCols: Column[];
  clientList: Row[];
  clientFooter: string;
  projectStats: Card[];
  projectCols: Column[];
  projectList: Row[];
  boardCols: ColumnView[];
  ganttWeeks: Week[];
  ganttRows: TimelineRow[];
  ganttToday: number;
  milestoneList: StatusRow[];
  invStats: Card[];
  invFilters: Filter[];
  invCols: Column[];
  invList: Row[];
  invFooter: string;
}

export interface CrmState extends AppState, CrmData, CrmViews {
  user: ShellUser;
  actions: ShellAction[];
  none: ToolbarAction[];
  sheet: SheetState;
}

const GROUPS: NavGroup[] = [
  {
    title: "Studio",
    items: [
      { id: "clients", label: "Clients", icon: "k-ai-users" },
      { id: "projects", label: "Projects", icon: "k-ai-briefcase" },
      { id: "tasks", label: "Tasks", icon: "k-ai-kanban" },
      { id: "timeline", label: "Timeline", icon: "k-ai-gantt" },
    ],
  },
  {
    title: "Money",
    items: [{ id: "invoices", label: "Invoices", icon: "k-ai-receipt" }],
  },
];

/** Pure: every view worked out from the data (and the badges of the sidebar). */
export function derive(s: CrmData & { groups: NavGroup[] }) {
  const gantt = timeline(s.projects);
  const late = s.invoices.filter((i) => viewOf(i) === "overdue").length;
  const shownClients = s.clients.filter(
    (c) => s.clientFilter === "all" || c.status === s.clientFilter,
  ).length;
  return {
    clientStats: clientCards(s.clients, s.projects, s.invoices),
    clientFilters: filtersOf(
      CLIENT_FILTERS,
      s.clientFilter,
      s.clients,
      (c, id) => c.status === id,
    ),
    clientCols: columnsOf(CLIENT_COLUMNS, s.clientSort),
    clientList: clientRows(
      s.clients,
      s.projects,
      s.invoices,
      s.clientFilter,
      s.clientQuery,
      s.clientSort,
    ),
    clientFooter: `${shownClients} of ${s.clients.length} clients`,
    projectStats: projectCards(s.projects),
    projectCols: columnsOf(PROJECT_COLUMNS, s.projectSort),
    projectList: projectRows(s.projects, s.projectSort),
    boardCols: board(s.tasks, s.projects),
    ganttWeeks: gantt.weeks,
    ganttRows: gantt.rows,
    ganttToday: gantt.today,
    milestoneList: milestoneRows(s.projects),
    invStats: invoiceCards(s.invoices),
    invFilters: filtersOf(
      INVOICE_FILTERS,
      s.invFilter,
      s.invoices,
      invoicePasses,
    ),
    invCols: columnsOf(INVOICE_COLUMNS, s.invSort),
    invList: invoiceRows(s.invoices, s.invFilter, s.invSort),
    invFooter: invoiceFooter(s.invoices, s.invFilter),
    groups: withBadge(s.groups, "invoices", late ? String(late) : ""),
  };
}

const data: CrmData & { groups: NavGroup[] } = {
  clients: CLIENTS,
  projects: PROJECTS,
  tasks: TASKS,
  invoices: INVOICES,
  clientFilter: "all",
  clientQuery: "",
  clientSort: null,
  projectSort: null,
  invFilter: "all",
  invSort: null,
  groups: GROUPS,
};

export const initial: CrmState = {
  screen: "clients",
  title: "Clients",
  navOpen: false,
  notice: "",
  user: { name: "Ava Lindqvist", role: "Studio director", initials: "AL" },
  actions: [
    { id: "task", label: "New task", icon: "k-icon-plus", variant: "default" },
  ],
  none: [],
  ...data,
  ...derive(data),
  sheet: closedSheet(),
};

export class CrmPanel extends AdminApp<CrmState> {
  view = view;

  /** Change some of the data; every view follows. */
  _commit(state: CrmState, changes: Partial<CrmData>): Effect[] {
    return patch({ ...changes, ...derive({ ...state, ...changes }) });
  }

  _close(state: CrmState): Effect[] {
    return patch({ sheet: { ...state.sheet, open: false } });
  }

  // ---- clients
  "clientfilter.pick"(msg: Message, state: CrmState): Effect[] {
    return this._commit(state, { clientFilter: msg.payload as string });
  }

  "clientfilter.search"(msg: Message, state: CrmState): Effect[] {
    return this._commit(state, { clientQuery: msg.event?.value ?? "" });
  }

  "clients.sort"(msg: Message, state: CrmState): Effect[] {
    return this._commit(state, {
      clientSort: toggleSort(state.clientSort, msg.payload as string),
    });
  }

  "clients.act"(msg: Message, state: CrmState): Effect[] {
    const [id] = msg.payload as [string, string];
    const before = state.clients.find((c) => c.id === id);
    const clients = toggleClient(state.clients, id);
    const after = clients.find((c) => c.id === id);
    return [
      ...this._commit(state, { clients }),
      ...notice(`${before?.name} is now ${after?.status}`),
    ];
  }

  // ---- projects
  "projects.sort"(msg: Message, state: CrmState): Effect[] {
    return this._commit(state, {
      projectSort: toggleSort(state.projectSort, msg.payload as string),
    });
  }

  "projects.act"(msg: Message, state: CrmState): Effect[] {
    const [id] = msg.payload as [string, string];
    const projects = advanceProject(state.projects, id);
    const after = projects.find((p) => p.id === id);
    return [
      ...this._commit(state, { projects }),
      ...notice(`${after?.name}: ${after?.status}`),
    ];
  }

  // ---- tasks
  "board.move"(msg: Message, state: CrmState): Effect[] {
    const [id, dir] = msg.payload as [string, "left" | "right"];
    const tasks = moveTask(state.tasks, BOARD, id, dir);
    return this._commit(state, { tasks });
  }

  "board.open"(msg: Message, state: CrmState): Effect[] {
    const found = state.tasks.find((x) => x.id === msg.payload);
    return found
      ? patch({ sheet: taskSheet(found.id, draftOfTask(found)) })
      : [];
  }

  "top.action"(_msg: Message, state: CrmState): Effect[] {
    return patch({
      screen: "tasks",
      title: "Tasks",
      sheet: taskSheet("", newTaskDraft(state.projects[0].id)),
    });
  }

  // ---- timeline
  "milestones.act"(msg: Message, state: CrmState): Effect[] {
    const [id] = msg.payload as [string, string];
    return this._commit(state, {
      projects: toggleMilestone(state.projects, id),
    });
  }

  // ---- invoices
  "invfilter.pick"(msg: Message, state: CrmState): Effect[] {
    return this._commit(state, { invFilter: msg.payload as string });
  }

  "invoices.sort"(msg: Message, state: CrmState): Effect[] {
    return this._commit(state, {
      invSort: toggleSort(state.invSort, msg.payload as string),
    });
  }

  _advanceInvoice(state: CrmState, id: string): Effect[] {
    const invoices = advanceInvoice(state.invoices, id);
    const after = invoices.find((i) => i.id === id);
    return [
      ...this._commit(state, { invoices }),
      ...notice(
        after?.status === "paid"
          ? `${after.number} is paid`
          : `${after?.number} was sent`,
      ),
    ];
  }

  "invoices.act"(msg: Message, state: CrmState): Effect[] {
    const [id] = msg.payload as [string, string];
    return this._advanceInvoice(state, id);
  }

  "invoices.pick"(msg: Message, state: CrmState): Effect[] {
    const found = state.invoices.find((i) => i.id === msg.payload);
    return found ? patch({ sheet: invoiceSheet(found) }) : [];
  }

  // ---- the sheet: a task form or an invoice
  "sheet.close"(_msg: Message, state: CrmState): Effect[] {
    return this._close(state);
  }

  "sheet.field"(msg: Message, state: CrmState): Effect[] {
    const draft: TaskDraft = {
      ...state.sheet.draft,
      [msg.payload as string]: msg.event?.value ?? "",
    };
    return patch({ sheet: taskSheet(state.sheet.id, draft) });
  }

  "sheet.press"(msg: Message, state: CrmState): Effect[] {
    const { id, draft, kind } = state.sheet;
    if (kind === "invoice") {
      return [...this._advanceInvoice(state, id), ...this._close(state)];
    }
    if (msg.payload === "delete") {
      return [
        ...this._commit(state, {
          tasks: state.tasks.filter((x) => x.id !== id),
        }),
        ...this._close(state),
        ...notice("Task deleted"),
      ];
    }
    const errors = validateTask(draft);
    if (Object.keys(errors).length > 0) {
      return patch({ sheet: taskSheet(id, draft, errors) });
    }
    return [
      ...this._commit(state, { tasks: saveTask(state.tasks, draft, id) }),
      ...this._close(state),
      ...notice(id ? "Task saved" : `Task ${nextTaskId(state.tasks)} added`),
    ];
  }
}

export const page = new CrmPanel();
