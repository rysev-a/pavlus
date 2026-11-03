// A cloud console where a user manages their own virtual machines: the list
// (cards or a table), a detail view per machine (metrics, console, snapshots,
// firewall, volumes), a creation wizard, the month's bill and SSH keys. Every
// transition goes through the time plugin; every list is derived by `derive`.
import type { Effect, Message } from "@service-laboratory/pavlus";
import {
  domEffector as dom,
  timeEffector as time,
} from "@service-laboratory/pavlus/plugins";
import { AdminApp, type AppState } from "../../blocks/admin-shell/app.ts";
import {
  type NavGroup,
  type ShellAction,
  type ShellUser,
  type Tone,
  notice,
  patch,
  titleOf,
} from "../../blocks/admin-shell/shell.ts";
import {
  type Column as BarColumn,
  columns as barColumns,
} from "../../blocks/bar-chart/chart.ts";
import {
  type CodeLine,
  codeLines,
} from "../../blocks/code-block/code-block.ts";
import {
  type ConfirmProps,
  askConfirm,
  closedConfirm,
  typeConfirm,
} from "../../blocks/danger-confirm/confirm.ts";
import {
  type Column,
  type ColumnDef,
  type Row,
  type Sort,
  action,
  columnsOf,
  mono,
  number,
  pill,
  rowOf,
  sortBy,
  strong,
  text,
  toggleSort,
} from "../../blocks/data-grid/grid.ts";
import {
  type Filter,
  type ToolbarAction,
  filtersOf,
  toolbarAction,
} from "../../blocks/list-filter/filters.ts";
import {
  type Chart,
  RANGES,
  type RangeId,
  chartsFor,
} from "../../blocks/metric-charts/metrics.ts";
import {
  type Detail,
  type Field,
  type SheetButton,
  button,
  field,
  withErrors,
} from "../../blocks/record-sheet/sheet.ts";
import {
  type Proto,
  type Rule,
  type RuleAction,
  type RuleDraft,
  type RulesProps,
  addRule,
  emptyDraft as emptyRule,
  removeRule,
  rulesProps,
  validateRule,
} from "../../blocks/rules-table/rules.ts";
import type { Card } from "../../blocks/stat-cards/cards.ts";
import { card } from "../../blocks/stat-cards/cards.ts";
import {
  type StatusRow,
  listAction,
  statusRow,
} from "../../blocks/status-list/rows.ts";
import { HOME } from "../../blocks/terminal-sim/fs.ts";
import {
  type Term,
  newTerm,
  promptOf,
  stepTerm,
} from "../../blocks/terminal-sim/session.ts";
import {
  TRANSITION_MS,
  type Vm,
  type VmAction,
  type VmCardProps,
  begin,
  cardOf,
  dollars,
  hourlyText,
  isBusy,
  monthlyOf,
  pendingAction,
  pillOf,
  settle,
  statusLabel,
  STATUS_TONE,
  actionsFor,
  buttonOf,
} from "../../blocks/vm-card/vm.ts";
import {
  type KeyChoice,
  type WizardProps,
  type WizardState,
  buildVm,
  imageOf,
  lookupOf,
  readyToCreate,
  reduce,
  regionOf,
  startWizard,
  wizardProps,
} from "../../blocks/vm-wizard/wizard.ts";
import {
  KEY_USE,
  MONTH,
  SEED_KEYS,
  SEED_RULES,
  SEED_SNAPSHOTS,
  SEED_VMS,
  SEED_VOLUMES,
  type Snapshot,
  type SshKey,
  type Volume,
  billCards,
  billLines,
  billOf,
  consoleIntro,
  fingerprintOf,
  fleetCards,
  keyChoices,
  parsePublicKey,
  validateKeyForm,
  vmFs,
  vmRunner,
} from "./vm-data.ts";
import view from "./vm-admin-panel.pavlus";

export const TERM_ID = "vm-console-input";

/** What the user can change; every list on the screen is derived from it. */
export interface VmData {
  vms: Vm[];
  snapshots: Snapshot[];
  volumes: Volume[];
  rules: Record<string, Rule[]>;
  keys: SshKey[];
  filter: string;
  query: string;
  layout: "cards" | "table";
  sort: Sort | null;
  selectedId: string;
  tab: string;
  range: RangeId;
  screen: string;
  groups: NavGroup[];
}

export interface DetailView {
  card: VmCardProps;
  ssh: string;
  consoleReady: boolean;
}

export interface VmViews {
  title: string;
  subtitle: string;
  navActive: string;
  fleetStats: Card[];
  mFilters: Filter[];
  mActions: ToolbarAction[];
  mCards: VmCardProps[];
  mColumns: Column[];
  mRows: Row[];
  mFooter: string;
  mEmpty: string;
  dvm: DetailView | null;
  dTabs: { id: string; label: string; active: boolean }[];
  dStats: Card[];
  sshLines: CodeLine[];
  ranges: { id: RangeId; label: string }[];
  charts: Chart[];
  snapList: StatusRow[];
  volColumns: Column[];
  volRows: Row[];
  freeList: StatusRow[];
  rulesView: RulesProps;
  billStats: Card[];
  billBars: BarColumn[];
  billColumns: Column[];
  billRows: Row[];
  billFooter: string;
  keyColumns: Column[];
  keyRows: Row[];
  keyFooter: string;
}

export interface KeyDraft {
  name: string;
  public: string;
}

export interface KeySheet {
  open: boolean;
  title: string;
  description: string;
  details: Detail[];
  fields: Field[];
  buttons: SheetButton[];
}

export interface VmState extends AppState, VmData, VmViews {
  user: ShellUser;
  actions: ShellAction[];
  vmSeq: number;
  snapSeq: number;
  keySeq: number;
  ruleSeq: number;
  w: WizardState;
  wiz: WizardProps;
  confirm: ConfirmProps;
  ruleDraft: RuleDraft;
  keyDraft: KeyDraft;
  sheet: KeySheet;
  term: Term;
  prompt: string;
  terms: Record<string, Term>;
}

const GROUPS: NavGroup[] = [
  {
    title: "Compute",
    items: [
      { id: "machines", label: "Virtual machines", icon: "k-ai-server" },
      { id: "create", label: "Create a machine", icon: "k-icon-plus" },
    ],
  },
  {
    title: "Account",
    items: [
      { id: "billing", label: "Billing", icon: "k-ai-receipt" },
      { id: "keys", label: "SSH keys", icon: "k-ai-key" },
    ],
  },
];

const FILTERS: [string, string][] = [
  ["all", "All"],
  ["running", "Running"],
  ["stopped", "Stopped"],
  ["busy", "Changing"],
  ["error", "Errors"],
];

/** Pure: does a machine pass a status filter? */
export function passes(v: Vm, id: string): boolean {
  switch (id) {
    case "running":
      return v.status === "running";
    case "stopped":
      return v.status === "stopped";
    case "busy":
      return isBusy(v);
    case "error":
      return v.status === "error";
    default:
      return true;
  }
}

/** Pure: the text a search looks in. */
export const searchText = (v: Vm): string =>
  [
    v.name,
    v.ip,
    v.tags.join(" "),
    regionOf(v.region).label,
    imageOf(v.image).label,
  ].join(" ");

const MACHINE_COLS: ColumnDef[] = [
  { key: "name", label: "Name", sortable: true },
  { key: "status", label: "Status", sortable: true },
  { key: "size", label: "Size" },
  { key: "region", label: "Region", sortable: true },
  { key: "ip", label: "IP address" },
  { key: "price", label: "Price", align: "right", sortable: true },
];

const sortValue = (v: Vm, key: string): string | number => {
  switch (key) {
    case "status":
      return v.status;
    case "region":
      return regionOf(v.region).label;
    case "price":
      return v.hourly;
    default:
      return v.name.toLowerCase();
  }
};

const cardTone = (tone: Tone): Card["tone"] =>
  tone === "muted" ? "default" : tone;

/** Pure: the machines that pass the filter and the search. */
export function visible(s: Pick<VmData, "vms" | "filter" | "query">): Vm[] {
  const q = s.query.trim().toLowerCase();
  return s.vms.filter(
    (v) =>
      passes(v, s.filter) && (!q || searchText(v).toLowerCase().includes(q)),
  );
}

const shortFingerprint = (fp: string): string =>
  fp.length > 22 ? `${fp.slice(0, 14)}…${fp.slice(-6)}` : fp;

const DETAIL_TABS: [string, string][] = [
  ["overview", "Overview"],
  ["console", "Console"],
  ["snapshots", "Snapshots"],
  ["network", "Firewall"],
  ["storage", "Storage"],
];

/** Pure: every list and number on the screen, from the data. */
export function derive(s: VmData, draft: RuleDraft = emptyRule()): VmViews {
  const vm = s.vms.find((v) => v.id === s.selectedId) ?? null;
  const shown = visible(s);
  const running = s.vms.filter((v) => v.status === "running").length;

  // the list of machines
  const sorted = sortBy(shown, s.sort, sortValue);
  const mRows = sorted.map((v) =>
    rowOf(
      MACHINE_COLS,
      v.id,
      {
        name: strong(v.name, imageOf(v.image).label),
        status: pill(statusLabel(v), pillOf(STATUS_TONE[v.status]) as Tone),
        size: text(`${v.vcpu} vCPU · ${v.ram} GB · ${v.disk} GB`),
        region: text(regionOf(v.region).label),
        ip: mono(v.status === "stopped" ? "no public IP" : v.ip),
        price: number(hourlyText(v.hourly)),
      },
      actionsFor(v).map((a) =>
        action(a, buttonOf(a).label, {
          icon: buttonOf(a).icon,
          variant:
            a === "delete" ? "ghost" : a === "start" ? "default" : "outline",
        }),
      ),
    ),
  );

  // the detail view
  let dvm: DetailView | null = null;
  let dStats: Card[] = [];
  let snapList: StatusRow[] = [];
  let volRows: Row[] = [];
  let freeList: StatusRow[] = [];
  let charts: Chart[] = [];
  let sshLines: CodeLine[] = [];
  let rulesView = rulesProps([], draft, {});
  const volCols: ColumnDef[] = [
    { key: "name", label: "Volume" },
    { key: "size", label: "Size", align: "right" },
    { key: "mount", label: "Mounted at" },
    { key: "kind", label: "Kind" },
  ];
  if (vm) {
    const look = lookupOf(vm);
    const c = cardOf(vm, look);
    dvm = {
      card: c,
      ssh: `ssh deploy@${vm.ip}`,
      consoleReady: vm.status === "running",
    };
    sshLines = codeLines(`ssh deploy@${vm.ip}`, "sh");
    dStats = [
      card("st", "Status", c.statusLabel, {
        icon:
          vm.status === "running"
            ? "k-ai-play"
            : vm.status === "error"
              ? "k-ai-alert"
              : "k-ai-stop",
        tone: cardTone(c.tone),
        hint: isBusy(vm) ? "this takes a few seconds" : look.regionLabel,
      }),
      card("sz", "Size", `${vm.vcpu} vCPU`, {
        icon: "k-ai-server",
        hint: `${vm.ram} GB memory, ${vm.disk} GB disk`,
      }),
      card("ip", "IP address", vm.status === "stopped" ? "none" : vm.ip, {
        icon: "k-ai-terminal",
        hint: vm.status === "stopped" ? "released while stopped" : "public",
      }),
      card("pr", "Price", dollars(monthlyOf(vm.hourly)), {
        icon: "k-ai-dollar",
        tone: "warning",
        hint: `${hourlyText(vm.hourly)} while running`,
      }),
    ];
    charts = chartsFor(vm.id, s.range, vm.status === "running");
    snapList = s.snapshots
      .filter((x) => x.vmId === vm.id)
      .map((x) =>
        statusRow(
          x.id,
          x.name,
          x.status === "ready" ? "Ready" : "Creating",
          x.status === "ready" ? "success" : "warning",
          {
            sub: `Taken ${x.created}`,
            facts: [{ label: "Size", value: `${x.size} GB` }],
            actions:
              x.status === "ready"
                ? [
                    listAction("restore", "Restore", { disabled: isBusy(vm) }),
                    listAction("delete", "Delete", {
                      variant: "ghost",
                      icon: "k-ai-trash",
                    }),
                  ]
                : [],
          },
        ),
      );
    const attached = s.volumes.filter((x) => x.vmId === vm.id);
    volRows = [
      rowOf(volCols, "boot", {
        name: strong(`${vm.name}-boot`, "created with the machine"),
        size: number(`${vm.disk} GB`),
        mount: mono("/"),
        kind: pill("Boot disk", "info"),
      }),
      ...attached.map((x, i) =>
        rowOf(
          volCols,
          x.id,
          {
            name: strong(x.name, regionOf(x.region).label),
            size: number(`${x.size} GB`),
            mount: mono(`/mnt/${x.name}`),
            kind: pill("Volume", "default"),
          },
          [
            action("detach", "Detach", {
              icon: "k-ai-arrow-down",
              disabled: isBusy(vm) && i >= 0,
            }),
          ],
        ),
      ),
    ];
    freeList = s.volumes
      .filter((x) => x.vmId === "" && x.region === vm.region)
      .map((x) =>
        statusRow(x.id, x.name, "Free", "muted", {
          sub: `${x.size} GB in ${regionOf(x.region).label}`,
          actions: [
            listAction("attach", "Attach", {
              variant: "default",
              disabled: isBusy(vm),
            }),
          ],
        }),
      );
    rulesView = rulesProps(s.rules[vm.id] ?? [], draft, {});
  }

  // billing
  const bill = billOf(s.vms, s.volumes, s.snapshots);
  const lines = billLines(s.vms, s.volumes, s.snapshots);
  const billCols: ColumnDef[] = [
    { key: "name", label: "Machine" },
    { key: "hours", label: "Hours", align: "right" },
    { key: "rate", label: "Rate", align: "right" },
    { key: "compute", label: "Compute", align: "right" },
    { key: "storage", label: "Storage", align: "right" },
    { key: "total", label: "Total", align: "right" },
  ];
  const keyCols: ColumnDef[] = [
    { key: "name", label: "Name" },
    { key: "fp", label: "Fingerprint" },
    { key: "added", label: "Added" },
    { key: "used", label: "Used by", align: "right" },
  ];

  const tab = (id: string) => DETAIL_TABS.find(([t]) => t === id)?.[1] ?? id;
  return {
    title: s.screen === "detail" && vm ? vm.name : titleOf(s.groups, s.screen),
    subtitle:
      s.screen === "machines"
        ? `${s.vms.length} machines, ${running} running`
        : s.screen === "detail" && vm
          ? `${imageOf(vm.image).label} in ${regionOf(vm.region).label}, ${tab(s.tab)}`
          : s.screen === "create"
            ? "Five short steps, with the price on every one"
            : s.screen === "billing"
              ? `${MONTH.label}, day ${MONTH.day} of ${MONTH.days}`
              : `${s.keys.length} keys on this account`,
    navActive: s.screen === "detail" ? "machines" : s.screen,
    fleetStats: fleetCards(s.vms),
    mFilters: filtersOf(FILTERS, s.filter, s.vms, passes),
    mActions: [
      toolbarAction(
        "layout",
        s.layout === "cards" ? "Table" : "Cards",
        s.layout === "cards" ? "k-ai-grid" : "k-ai-kanban",
        "outline",
      ),
      toolbarAction("new", "New machine"),
    ],
    mCards: shown.map((v) => cardOf(v, lookupOf(v), v.id === s.selectedId)),
    mColumns: columnsOf(MACHINE_COLS, s.sort),
    mRows,
    mFooter: `${shown.length} of ${s.vms.length} machines`,
    mEmpty:
      s.vms.length === 0
        ? "No machines yet. Create the first one."
        : "No machine matches the filter.",
    dvm,
    dTabs: DETAIL_TABS.map(([id, label]) => ({
      id,
      label,
      active: id === s.tab,
    })),
    dStats,
    sshLines,
    ranges: RANGES.map(({ id, label }) => ({ id, label })),
    charts,
    snapList,
    volColumns: columnsOf(volCols, null),
    volRows,
    freeList,
    rulesView,
    billStats: billCards(bill),
    billBars: barColumns(
      bill.daily.map((value, i) => ({
        id: `d${i + 1}`,
        label: String(i + 1),
        value,
        tone: i === bill.daily.length - 1 ? "info" : "default",
      })),
    ).map((col, i) => ({
      ...col,
      tip: `Nov ${i + 1}: ${dollars(bill.daily[i])}`,
    })),
    billColumns: columnsOf(billCols, null),
    billRows: lines.map((l) =>
      rowOf(billCols, l.id, {
        name: strong(l.name, l.plan),
        hours: number(String(l.hours)),
        rate: number(hourlyText(l.rate)),
        compute: number(dollars(l.compute)),
        storage: number(dollars(l.storage)),
        total: number(dollars(l.total)),
      }),
    ),
    billFooter: `Month to date ${dollars(bill.monthToDate)}, projected ${dollars(bill.projected)} by the end of ${MONTH.label.split(" ")[0]}`,
    keyColumns: columnsOf(keyCols, null),
    keyRows: s.keys.map((k) => {
      const used = (KEY_USE[k.id] ?? []).filter((id) =>
        s.vms.some((v) => v.id === id),
      ).length;
      return rowOf(
        keyCols,
        k.id,
        {
          name: strong(k.name, k.type),
          fp: mono(shortFingerprint(k.fingerprint)),
          added: text(k.added),
          used: number(`${used} ${used === 1 ? "machine" : "machines"}`),
        },
        [action("delete", "Delete", { variant: "ghost", icon: "k-ai-trash" })],
      );
    }),
    keyFooter: `${s.keys.length} keys`,
  };
}

/** Pure: the "add a key" sheet. */
export function keySheet(
  draft: KeyDraft,
  errors: Record<string, string> = {},
  open = true,
): KeySheet {
  return {
    open,
    title: "Add an SSH key",
    description:
      "Paste the public key. Machines you create can then be reached with its private half.",
    details: [],
    fields: withErrors(
      [
        field("name", "Name", draft.name, { placeholder: "alex-laptop" }),
        field("public", "Public key", draft.public, {
          kind: "textarea",
          placeholder: "ssh-ed25519 AAAAC3Nza... alex@laptop",
          hint: "The line from ~/.ssh/id_ed25519.pub",
        }),
      ],
      errors,
    ),
    buttons: [
      button("example", "Fill an example", "outline"),
      button("save", "Add key"),
    ],
  };
}

const EXAMPLE_KEY =
  "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIPt7Rk2vQx9LmWc4ZnE1aYh8sUjB0dFgTo3iNeKq5XyV alex@work-desktop";

const data: VmData = {
  vms: SEED_VMS,
  snapshots: SEED_SNAPSHOTS,
  volumes: SEED_VOLUMES,
  rules: SEED_RULES,
  keys: SEED_KEYS,
  filter: "all",
  query: "",
  layout: "cards",
  sort: null,
  selectedId: "",
  tab: "overview",
  range: "1h",
  screen: "machines",
  groups: GROUPS,
};

const firstWizard = startWizard();
const emptyTerm = newTerm(vmFs(SEED_VMS[0]), HOME, []);

export const initial: VmState = {
  navOpen: false,
  notice: "",
  user: { name: "Alex Rivera", role: "Owner, Brightside Labs", initials: "AR" },
  actions: [
    {
      id: "new",
      label: "New machine",
      icon: "k-icon-plus",
      variant: "default",
    },
  ],
  ...data,
  ...derive(data),
  vmSeq: 7,
  snapSeq: 5,
  keySeq: 4,
  ruleSeq: 100,
  w: firstWizard,
  wiz: wizardProps(firstWizard, keyChoices(SEED_KEYS)),
  confirm: closedConfirm(),
  ruleDraft: emptyRule(),
  keyDraft: { name: "", public: "" },
  sheet: keySheet({ name: "", public: "" }, {}, false),
  term: emptyTerm,
  prompt: promptOf(emptyTerm),
  terms: {},
};

const ACTION_TEXT: Record<VmAction, [string, string]> = {
  start: ["is starting", "Start"],
  stop: ["is stopping", "Stop"],
  reboot: ["is rebooting", "Reboot"],
  delete: ["is being deleted", "Delete"],
};

export class VmAdminPanel extends AdminApp<VmState> {
  view = view;

  /** The page was left: every timer stops (transitions, the notice). */
  override leave(): Effect[] {
    return [time.cancelAll()];
  }

  _leaving(screen: string, state: VmState): Effect[] {
    // keep the console of the open machine when the view closes
    return screen === "detail" && state.selectedId
      ? patch({ terms: { ...state.terms, [state.selectedId]: state.term } })
      : [];
  }

  _commit(
    state: VmState,
    changes: Partial<VmData>,
    more: Record<string, unknown> = {},
  ): Effect[] {
    const next = { ...state, ...changes } as VmState;
    const draft = (more.ruleDraft as RuleDraft | undefined) ?? state.ruleDraft;
    return patch({ ...changes, ...derive(next, draft), ...more });
  }

  /** Go to a view (from a button or the sidebar). */
  _goto(
    state: VmState,
    screen: string,
    changes: Partial<VmData> = {},
    more: Record<string, unknown> = {},
  ): Effect[] {
    const next = { ...state, ...changes, screen } as VmState;
    return [
      ...(screen === state.screen ? [] : this._leaving(state.screen, state)),
      ...patch({
        ...changes,
        screen,
        navOpen: false,
        ...derive(next),
        ...more,
      }),
    ];
  }

  "nav.go"(msg: Message, state: VmState): Effect[] {
    return this._goto(state, msg.payload as string);
  }

  "top.action"(_msg: Message, state: VmState): Effect[] {
    return this._goto(state, "create");
  }

  // ---- machines and their transitions

  /** Start an action on a machine, with the timer that ends it. */
  _do(state: VmState, id: string, what: VmAction): Effect[] {
    const before = state.vms.find((v) => v.id === id);
    if (!before) return [];
    const after = begin(before, what);
    if (after === before) return [];
    const ms = TRANSITION_MS[pendingAction(after) ?? what];
    return [
      ...this._commit(state, {
        vms: state.vms.map((v) => (v.id === id ? after : v)),
      }),
      time.setTimeout(`vm:${id}`, ms, "settled", id),
      ...notice(`${before.name} ${ACTION_TEXT[what][0]}`),
    ];
  }

  /** The timer of a transition ran out. */
  settled(msg: Message, state: VmState): Effect[] {
    const id = msg.payload as string;
    const before = state.vms.find((v) => v.id === id);
    if (!before) return [];
    const after = settle(before);
    const vms = after
      ? state.vms.map((v) => (v.id === id ? after : v))
      : state.vms.filter((v) => v.id !== id);
    if (!after) {
      const left = state.selectedId === id;
      const snapshots = state.snapshots.filter((x) => x.vmId !== id);
      const volumes = state.volumes.map((x) =>
        x.vmId === id ? { ...x, vmId: "" } : x,
      );
      return [
        ...(left
          ? this._goto(state, "machines", {
              vms,
              snapshots,
              volumes,
              selectedId: "",
            })
          : this._commit(state, { vms, snapshots, volumes })),
        ...notice(`${before.name} was deleted`),
      ];
    }
    return [
      ...this._commit(state, { vms }),
      ...notice(`${before.name} is ${statusLabel(after).toLowerCase()}`),
    ];
  }

  _ask(state: VmState, id: string, what: VmAction): Effect[] {
    const v = state.vms.find((x) => x.id === id);
    if (!v) return [];
    if (what === "delete") {
      return patch({
        confirm: askConfirm(
          "delete-vm",
          id,
          `Delete ${v.name}?`,
          `The machine, its disk and its ${state.snapshots.filter((x) => x.vmId === id).length} snapshots are removed. Attached volumes are kept and detached. This cannot be undone.`,
          { confirmLabel: "Delete machine", expect: v.name },
        ),
      });
    }
    return this._do(state, id, what);
  }

  "card.act"(msg: Message, state: VmState): Effect[] {
    const [id, what] = msg.payload as [string, VmAction];
    return this._ask(state, id, what);
  }

  "mtable.act"(msg: Message, state: VmState): Effect[] {
    const [id, what] = msg.payload as [string, VmAction];
    return this._ask(state, id, what);
  }

  detailAct(msg: Message, state: VmState): Effect[] {
    return this._ask(state, state.selectedId, msg.payload as VmAction);
  }

  _open(state: VmState, id: string): Effect[] {
    const v = state.vms.find((x) => x.id === id);
    if (!v) return [];
    const term =
      state.terms[id] ??
      newTerm(vmFs(v), HOME, consoleIntro(v), { user: "deploy", host: v.name });
    return this._goto(
      state,
      "detail",
      { selectedId: id, tab: "overview" },
      { term, prompt: promptOf(term), ruleDraft: emptyRule() },
    );
  }

  "card.open"(msg: Message, state: VmState): Effect[] {
    return this._open(state, msg.payload as string);
  }

  "mtable.pick"(msg: Message, state: VmState): Effect[] {
    return this._open(state, msg.payload as string);
  }

  back(_msg: Message, state: VmState): Effect[] {
    return this._goto(state, "machines", { selectedId: "" });
  }

  "mtable.sort"(msg: Message, state: VmState): Effect[] {
    return this._commit(state, {
      sort: toggleSort(state.sort, msg.payload as string),
    });
  }

  "mfilter.pick"(msg: Message, state: VmState): Effect[] {
    return this._commit(state, { filter: msg.payload as string });
  }

  "mfilter.search"(msg: Message, state: VmState): Effect[] {
    return this._commit(state, { query: msg.event?.value ?? "" });
  }

  "mfilter.action"(msg: Message, state: VmState): Effect[] {
    if (msg.payload === "new") return this._goto(state, "create");
    return this._commit(state, {
      layout: state.layout === "cards" ? "table" : "cards",
    });
  }

  // ---- the confirmation dialog

  "confirm.cancel"(): Effect[] {
    return patch({ confirm: closedConfirm() });
  }

  "confirm.type"(msg: Message, state: VmState): Effect[] {
    return patch({
      confirm: typeConfirm(state.confirm, msg.event?.value ?? ""),
    });
  }

  "confirm.confirm"(_msg: Message, state: VmState): Effect[] {
    const c = state.confirm;
    if (!c.open || !c.canConfirm) return [];
    const close = patch({ confirm: closedConfirm() });
    switch (c.kind) {
      case "delete-vm":
        return [...close, ...this._do(state, c.subject, "delete")];
      case "delete-snap": {
        const snapshots = state.snapshots.filter((x) => x.id !== c.subject);
        return [
          ...close,
          ...this._commit(state, { snapshots }),
          ...notice("Snapshot deleted"),
        ];
      }
      case "restore-snap": {
        const snap = state.snapshots.find((x) => x.id === c.subject);
        const v = state.vms.find((x) => x.id === snap?.vmId);
        if (!snap || !v) return close;
        return [
          ...close,
          ...(v.status === "running"
            ? this._do(state, v.id, "reboot")
            : notice(`${v.name} will use ${snap.name} when it starts`)),
        ];
      }
      case "delete-key": {
        const keys = state.keys.filter((k) => k.id !== c.subject);
        return [
          ...close,
          ...this._commit(state, { keys }),
          ...notice("Key deleted"),
        ];
      }
      default:
        return close;
    }
  }

  // ---- the detail view

  tab(msg: Message, state: VmState): Effect[] {
    return this._commit(state, { tab: msg.payload as string });
  }

  "charts.pick"(msg: Message, state: VmState): Effect[] {
    return this._commit(state, { range: msg.payload as RangeId });
  }

  // console
  _console(
    state: VmState,
    kind: "type" | "submit" | "key",
    msg: Message,
  ): Effect[] {
    const v = state.vms.find((x) => x.id === state.selectedId);
    if (!v) return [];
    const term = stepTerm(state.term, kind, msg.event, vmRunner(v));
    return patch({ term, prompt: promptOf(term) });
  }

  "term.type"(msg: Message, state: VmState): Effect[] {
    return this._console(state, "type", msg);
  }
  "term.submit"(msg: Message, state: VmState): Effect[] {
    return this._console(state, "submit", msg);
  }
  "term.key"(msg: Message, state: VmState): Effect[] {
    return this._console(state, "key", msg);
  }
  "term.focus"(): Effect[] {
    return [dom.focus(`#${TERM_ID}`)];
  }

  // snapshots
  snapCreate(_msg: Message, state: VmState): Effect[] {
    const v = state.vms.find((x) => x.id === state.selectedId);
    if (!v) return [];
    const id = `sn-${state.snapSeq}`;
    const snap: Snapshot = {
      id,
      vmId: v.id,
      name: `manual-${state.snapSeq}`,
      size: Math.max(2, Math.round(v.disk * 0.18)),
      created: "18 Nov 2026, now",
      status: "creating",
    };
    return [
      ...this._commit(
        state,
        { snapshots: [snap, ...state.snapshots] },
        { snapSeq: state.snapSeq + 1 },
      ),
      time.setTimeout(`snap:${id}`, 2600, "snapReady", id),
      ...notice(`Taking a snapshot of ${v.name}`),
    ];
  }

  snapReady(msg: Message, state: VmState): Effect[] {
    const id = msg.payload as string;
    return this._commit(state, {
      snapshots: state.snapshots.map((x) =>
        x.id === id ? { ...x, status: "ready" as const } : x,
      ),
    });
  }

  "snaps.act"(msg: Message, state: VmState): Effect[] {
    const [id, what] = msg.payload as [string, string];
    const snap = state.snapshots.find((x) => x.id === id);
    if (!snap) return [];
    if (what === "delete") {
      return patch({
        confirm: askConfirm(
          "delete-snap",
          id,
          `Delete ${snap.name}?`,
          "The snapshot is removed and its space is no longer billed.",
          {
            confirmLabel: "Delete snapshot",
          },
        ),
      });
    }
    return patch({
      confirm: askConfirm(
        "restore-snap",
        id,
        `Restore ${snap.name}?`,
        "The machine goes back to how it was when the snapshot was taken, and reboots. Changes made since then are lost.",
        { confirmLabel: "Restore", danger: false },
      ),
    });
  }

  // firewall
  "rules.remove"(msg: Message, state: VmState): Effect[] {
    const id = state.selectedId;
    const rules = {
      ...state.rules,
      [id]: removeRule(state.rules[id] ?? [], msg.payload as string),
    };
    return this._commit(state, { rules });
  }

  "rules.field"(msg: Message, state: VmState): Effect[] {
    const name = msg.payload as keyof RuleDraft;
    const value = msg.event?.value ?? "";
    const ruleDraft: RuleDraft = {
      ...state.ruleDraft,
      [name]:
        name === "proto"
          ? (value as Proto)
          : name === "action"
            ? (value as RuleAction)
            : value,
    };
    return this._commit(state, {}, { ruleDraft });
  }

  "rules.add"(_msg: Message, state: VmState): Effect[] {
    const id = state.selectedId;
    const list = state.rules[id] ?? [];
    const errors = validateRule(state.ruleDraft, list);
    if (Object.keys(errors).length > 0) {
      return patch({ rulesView: rulesProps(list, state.ruleDraft, errors) });
    }
    const rules = {
      ...state.rules,
      [id]: addRule(list, state.ruleDraft, state.ruleSeq),
    };
    return [
      ...this._commit(
        state,
        { rules },
        { ruleDraft: emptyRule(), ruleSeq: state.ruleSeq + 1 },
      ),
      ...notice("Rule added"),
    ];
  }

  // storage
  "vols.act"(msg: Message, state: VmState): Effect[] {
    const [id] = msg.payload as [string, string];
    return [
      ...this._commit(state, {
        volumes: state.volumes.map((x) =>
          x.id === id ? { ...x, vmId: "" } : x,
        ),
      }),
      ...notice("Volume detached"),
    ];
  }

  "free.act"(msg: Message, state: VmState): Effect[] {
    const [id] = msg.payload as [string, string];
    return [
      ...this._commit(state, {
        volumes: state.volumes.map((x) =>
          x.id === id ? { ...x, vmId: state.selectedId } : x,
        ),
      }),
      ...notice("Volume attached"),
    ];
  }

  // ---- the wizard

  _taken(state: VmState): string[] {
    return state.vms.map((v) => v.name);
  }

  _wizard(state: VmState, w: WizardState, keys = state.keys): Effect[] {
    return patch({ w, wiz: wizardProps(w, keyChoices(keys)) });
  }

  "wiz.act"(msg: Message, state: VmState): Effect[] {
    const [kind, id] = msg.payload as [string, string];
    return this._wizard(state, reduce(state.w, kind, id, this._taken(state)));
  }

  "wiz.field"(msg: Message, state: VmState): Effect[] {
    return this._wizard(
      state,
      reduce(
        state.w,
        msg.payload as string,
        msg.event?.value ?? "",
        this._taken(state),
      ),
    );
  }

  "wiz.back"(_msg: Message, state: VmState): Effect[] {
    return this._wizard(state, reduce(state.w, "back", "", this._taken(state)));
  }

  "wiz.cancel"(_msg: Message, state: VmState): Effect[] {
    return this._goto(
      state,
      "machines",
      {},
      {
        w: startWizard(),
        wiz: wizardProps(startWizard(), keyChoices(state.keys)),
      },
    );
  }

  "wiz.next"(_msg: Message, state: VmState): Effect[] {
    const taken = this._taken(state);
    if (state.w.step === 4) {
      if (!readyToCreate(state.w.draft, taken)) {
        return this._wizard(state, { ...state.w, step: 0, errors: {} });
      }
      const created = buildVm(state.w.draft, state.vmSeq);
      const fresh = startWizard();
      return [
        ...this._goto(
          state,
          "machines",
          { vms: [created, ...state.vms], filter: "all", query: "" },
          {
            vmSeq: state.vmSeq + 1,
            w: fresh,
            wiz: wizardProps(fresh, keyChoices(state.keys)),
          },
        ),
        time.setTimeout(
          `vm:${created.id}`,
          TRANSITION_MS.start,
          "settled",
          created.id,
        ),
        ...notice(`${created.name} is being created`),
      ];
    }
    return this._wizard(state, reduce(state.w, "next", "", taken));
  }

  // ---- SSH keys

  "keys.act"(msg: Message, state: VmState): Effect[] {
    const [id] = msg.payload as [string, string];
    const key = state.keys.find((k) => k.id === id);
    if (!key) return [];
    const used = (KEY_USE[id] ?? []).filter((m) =>
      state.vms.some((v) => v.id === m),
    ).length;
    return patch({
      confirm: askConfirm(
        "delete-key",
        id,
        `Delete ${key.name}?`,
        used > 0
          ? `${used} machine${used === 1 ? "" : "s"} still accept this key. They keep working, but you can no longer add it to new ones.`
          : "No machine uses this key.",
        { confirmLabel: "Delete key" },
      ),
    });
  }

  keyAdd(): Effect[] {
    const keyDraft = { name: "", public: "" };
    return patch({ keyDraft, sheet: keySheet(keyDraft) });
  }

  "sheet.close"(state: VmState): Effect[] {
    return patch({ sheet: { ...state.sheet, open: false } });
  }

  "sheet.field"(msg: Message, state: VmState): Effect[] {
    const id = msg.payload as keyof KeyDraft;
    const keyDraft = { ...state.keyDraft, [id]: msg.event?.value ?? "" };
    return patch({ keyDraft, sheet: keySheet(keyDraft) });
  }

  "sheet.press"(msg: Message, state: VmState): Effect[] {
    if (msg.payload === "example") {
      const keyDraft = {
        name: state.keyDraft.name || "work-desktop",
        public: EXAMPLE_KEY,
      };
      return patch({ keyDraft, sheet: keySheet(keyDraft) });
    }
    const errors = validateKeyForm(
      state.keyDraft.name,
      state.keyDraft.public,
      state.keys,
    );
    if (Object.keys(errors).length > 0) {
      return patch({ sheet: keySheet(state.keyDraft, errors) });
    }
    const parsed = parsePublicKey(state.keyDraft.public);
    if (!parsed.ok) return [];
    const key: SshKey = {
      id: `k${state.keySeq}`,
      name: state.keyDraft.name.trim(),
      type: parsed.type,
      blob: parsed.blob,
      fingerprint: fingerprintOf(parsed.blob),
      added: "18 Nov 2026",
    };
    return [
      ...this._commit(
        state,
        { keys: [...state.keys, key] },
        {
          keySeq: state.keySeq + 1,
          wiz: wizardProps(state.w, keyChoices([...state.keys, key])),
        },
      ),
      ...patch({ sheet: keySheet({ name: "", public: "" }, {}, false) }),
      ...notice(`${key.name} added`),
    ];
  }
}

export const page = new VmAdminPanel();
