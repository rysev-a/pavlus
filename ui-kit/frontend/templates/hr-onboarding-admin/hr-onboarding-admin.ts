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
import { choose } from "../../blocks/buddy-picker/buddies.ts";
import { overdueCount, toggleTask } from "../../blocks/checklist/list.ts";
import type { ToolbarAction } from "../../blocks/list-filter/filters.ts";
import {
  insertField,
  isClean,
  validateMessage,
} from "../../blocks/message-composer/compose.ts";
import { withValue } from "../../blocks/record-sheet/sheet.ts";
import {
  addEquipment,
  advanceDoc,
  advanceEquipment,
  DOCS,
  docCounts,
  EQUIPMENT,
  firstName,
  HIRES,
  hireById,
  PLAN,
  TASKS,
  TODAY,
  validateEquipment,
} from "./hr.ts";
import {
  closedSheet,
  draftOf,
  equipmentSheet,
  newDraft,
  type SheetState,
} from "./sheet.ts";
import {
  derive,
  freshMessage,
  type HrCore,
  type HrViews,
  MESSAGES,
  valuesOf,
} from "./views.ts";
import view from "./hr-onboarding-admin.pavlus";

export interface HrState extends AppState, HrCore, HrViews {
  user: ShellUser;
  actions: ShellAction[];
  eqActions: ToolbarAction[];
  none: ToolbarAction[];
  sheet: SheetState;
}

const NAV: NavGroup[] = [
  {
    title: "Onboarding",
    items: [
      { id: "hires", label: "New hires", icon: "k-ai-users" },
      { id: "checklist", label: "Checklist", icon: "k-ai-clipboard" },
      { id: "plan", label: "30-60-90 plan", icon: "k-ai-flag" },
    ],
  },
  {
    title: "Logistics",
    items: [
      { id: "documents", label: "Documents", icon: "k-ai-file" },
      { id: "equipment", label: "Equipment", icon: "k-ai-box" },
      { id: "buddies", label: "Buddies", icon: "k-icon-user" },
    ],
  },
  {
    title: "Communicate",
    items: [
      { id: "message", label: "Welcome message", icon: "k-icon-mail" },
      { id: "newhire", label: "New hire view", icon: "k-ai-home" },
    ],
  },
];

/** Pure: the sidebar with the counts of what needs attention. */
export function navFor(s: HrCore): NavGroup[] {
  const late = overdueCount(s.tasks, TODAY);
  const docs = docCounts(s.docs);
  const open = s.equipment.filter((e) => e.status !== "delivered").length;
  const badge = (n: number): string => (n > 0 ? String(n) : "");
  return withBadge(
    withBadge(
      withBadge(NAV, "hires", badge(late)),
      "documents",
      badge(docs.requested + docs.received),
    ),
    "equipment",
    badge(open),
  );
}

const core: HrCore = {
  hires: HIRES,
  tasks: TASKS,
  goals: PLAN,
  docs: DOCS,
  equipment: EQUIPMENT,
  selected: "h1",
  filter: "all",
  query: "",
  docFilter: "all",
  eqFilter: "all",
  msg: freshMessage(),
};

export const initial: HrState = {
  screen: "hires",
  title: "New hires",
  navOpen: false,
  notice: "",
  user: { name: "Ines Duarte", role: "People operations", initials: "ID" },
  actions: [
    {
      id: "remind",
      label: "Send reminders",
      icon: "k-ai-alert",
      variant: "outline",
    },
  ],
  eqActions: [
    {
      id: "new",
      label: "New request",
      icon: "k-icon-plus",
      variant: "default",
    },
  ],
  none: [],
  ...core,
  ...derive(core),
  groups: navFor(core),
  sheet: closedSheet(HIRES),
};

const coreOf = (s: HrState): HrCore => ({
  hires: s.hires,
  tasks: s.tasks,
  goals: s.goals,
  docs: s.docs,
  equipment: s.equipment,
  selected: s.selected,
  filter: s.filter,
  query: s.query,
  docFilter: s.docFilter,
  eqFilter: s.eqFilter,
  msg: s.msg,
});

export class HrOnboardingAdmin extends AdminApp<HrState> {
  view = view;

  /** Change some of the data; every view and the sidebar badges follow. */
  _commit(state: HrState, changes: Partial<HrCore>): Effect[] {
    const next = { ...coreOf(state), ...changes };
    return patch({ ...changes, ...derive(next), groups: navFor(next) });
  }

  // ---- the shell
  "top.action"(_msg: Message, state: HrState): Effect[] {
    const late = overdueCount(state.tasks, TODAY);
    return notice(
      late === 0
        ? "Nothing is overdue, no reminders needed"
        : `Reminders sent for ${late} overdue ${late === 1 ? "task" : "tasks"}`,
    );
  }

  // ---- the list of newcomers
  "hirefilter.pick"(msg: Message, state: HrState): Effect[] {
    return this._commit(state, { filter: msg.payload as string });
  }

  "hirefilter.search"(msg: Message, state: HrState): Effect[] {
    return this._commit(state, { query: msg.event?.value ?? "" });
  }

  _open(state: HrState, id: string): Effect[] {
    return [
      ...this._commit(state, { selected: id, msg: freshMessage() }),
      ...patch({ screen: "checklist", title: "Checklist", navOpen: false }),
    ];
  }

  "hires.pick"(msg: Message, state: HrState): Effect[] {
    return this._open(state, msg.payload as string);
  }

  "hires.act"(msg: Message, state: HrState): Effect[] {
    const [id] = msg.payload as [string, string];
    return this._open(state, id);
  }

  // ---- the picker shared by the per-person views
  pickHire(msg: Message, state: HrState): Effect[] {
    return this._commit(state, {
      selected: msg.event?.value ?? state.selected,
      msg: freshMessage(),
    });
  }

  // ---- checklists
  "checklist.toggle"(msg: Message, state: HrState): Effect[] {
    return this._commit(state, {
      tasks: toggleTask(state.tasks, msg.payload as string),
    });
  }

  "mine.toggle"(msg: Message, state: HrState): Effect[] {
    return this._commit(state, {
      tasks: toggleTask(state.tasks, msg.payload as string),
    });
  }

  "plan.toggle"(msg: Message, state: HrState): Effect[] {
    return this._commit(state, {
      goals: toggleTask(state.goals, msg.payload as string),
    });
  }

  // ---- documents
  "docfilter.pick"(msg: Message, state: HrState): Effect[] {
    return this._commit(state, { docFilter: msg.payload as string });
  }

  "docs.act"(msg: Message, state: HrState): Effect[] {
    const [id] = msg.payload as [string, string];
    const docs = advanceDoc(state.docs, id, TODAY);
    const after = docs.find((d) => d.id === id);
    return [
      ...this._commit(state, { docs }),
      ...notice(`Document ${after?.status}`),
    ];
  }

  // ---- equipment
  "eqfilter.pick"(msg: Message, state: HrState): Effect[] {
    return this._commit(state, { eqFilter: msg.payload as string });
  }

  "eqfilter.action"(_msg: Message, state: HrState): Effect[] {
    return patch({
      sheet: equipmentSheet(state.hires, newDraft(state.selected)),
    });
  }

  "equipment.act"(msg: Message, state: HrState): Effect[] {
    const [id] = msg.payload as [string, string];
    const equipment = advanceEquipment(state.equipment, id);
    const after = equipment.find((e) => e.id === id);
    return [
      ...this._commit(state, { equipment }),
      ...notice(`${after?.item}: ${after?.status}`),
    ];
  }

  "sheet.close"(_msg: Message, state: HrState): Effect[] {
    return patch({ sheet: { ...state.sheet, open: false } });
  }

  "sheet.field"(msg: Message, state: HrState): Effect[] {
    const fields = withValue(
      state.sheet.fields,
      msg.payload as string,
      msg.event?.value ?? "",
    );
    return patch({ sheet: { ...state.sheet, fields } });
  }

  "sheet.press"(_msg: Message, state: HrState): Effect[] {
    const draft = draftOf(state.sheet.fields);
    const errors = validateEquipment(draft, state.equipment);
    if (Object.keys(errors).length > 0) {
      return patch({ sheet: equipmentSheet(state.hires, draft, errors) });
    }
    const who = hireById(state.hires, draft.hire);
    return [
      ...this._commit(state, {
        equipment: addEquipment(state.equipment, draft),
      }),
      ...patch({ sheet: { ...state.sheet, open: false } }),
      ...notice(`Request sent for ${firstName(who)}`),
    ];
  }

  // ---- buddies
  "buddies.choose"(msg: Message, state: HrState): Effect[] {
    const who = hireById(state.hires, state.selected);
    const buddy = choose(who.buddy, msg.payload as string);
    const hires = state.hires.map((h) =>
      h.id === who.id ? { ...h, buddy } : h,
    );
    return [
      ...this._commit(state, { hires }),
      ...notice(
        buddy ? `Buddy assigned to ${firstName(who)}` : "Buddy removed",
      ),
    ];
  }

  // ---- the welcome message
  _message(state: HrState, change: Partial<HrCore["msg"]>): Effect[] {
    return this._commit(state, { msg: { ...state.msg, sent: "", ...change } });
  }

  "composer.template"(msg: Message, state: HrState): Effect[] {
    const t = MESSAGES.find((m) => m.id === msg.payload);
    return t ? this._commit(state, { msg: freshMessage(t.id) }) : [];
  }

  "composer.setsubject"(msg: Message, state: HrState): Effect[] {
    return this._message(state, { subject: msg.event?.value ?? "" });
  }

  "composer.setbody"(msg: Message, state: HrState): Effect[] {
    return this._message(state, { body: msg.event?.value ?? "" });
  }

  "composer.insert"(msg: Message, state: HrState): Effect[] {
    const field = String(msg.payload).replace(/[{}]/g, "");
    return this._message(state, { body: insertField(state.msg.body, field) });
  }

  "composer.send"(_msg: Message, state: HrState): Effect[] {
    const who = hireById(state.hires, state.selected);
    const errors = validateMessage(
      state.msg.subject,
      state.msg.body,
      valuesOf(who),
    );
    return [
      ...this._commit(state, {
        msg: {
          ...state.msg,
          errors,
          sent: isClean(errors) ? `Sent to ${firstName(who)}` : "",
        },
      }),
      ...(isClean(errors) ? notice(`Welcome message sent to ${who.name}`) : []),
    ];
  }
}

export const page = new HrOnboardingAdmin();
