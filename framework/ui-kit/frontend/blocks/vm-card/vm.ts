/**
 * Virtual machines: the record, what each status allows, and the pure
 * transitions between statuses. A start, stop or reboot passes through a
 * transitional status (`starting`, `stopping`) and ends when a timer of the
 * host calls `settle`; the host never reads a clock.
 */
import type { Tone } from "../admin-shell/shell.ts";

export type VmStatus =
  | "running"
  | "stopped"
  | "starting"
  | "stopping"
  | "error";
export type VmAction = "start" | "stop" | "reboot" | "delete";

export interface Vm {
  id: string;
  name: string;
  /** An image id (see vm-wizard): `ubuntu-24`. */
  image: string;
  region: string;
  ip: string;
  vcpu: number;
  /** GB. */
  ram: number;
  /** GB. */
  disk: number;
  /** Compute price per hour while running, in dollars. */
  hourly: number;
  status: VmStatus;
  /** What the transitional status is for: a reboot or a delete. */
  intent: "" | "reboot" | "delete";
  /** Hours the machine has run this month, for the bill. */
  hours: number;
  tags: string[];
}

/** How long each transition lasts, in milliseconds. */
export const TRANSITION_MS: Record<VmAction, number> = {
  start: 2200,
  stop: 1600,
  reboot: 2600,
  delete: 1400,
};

export const isBusy = (vm: Pick<Vm, "status">): boolean =>
  vm.status === "starting" || vm.status === "stopping";

/** Pure: the actions a machine accepts in its status. Nothing while it is changing. */
export function actionsFor(vm: Pick<Vm, "status">): VmAction[] {
  switch (vm.status) {
    case "running":
      return ["stop", "reboot", "delete"];
    case "stopped":
    case "error":
      return ["start", "delete"];
    default:
      return [];
  }
}

export const canDo = (vm: Pick<Vm, "status">, action: VmAction): boolean =>
  actionsFor(vm).includes(action);

/**
 * Pure: start an action. A start leads to `starting`, a stop to `stopping`, a
 * reboot to `starting` with the intent `reboot`, a delete to `stopping` with the
 * intent `delete`. An action the status does not allow changes nothing.
 */
export function begin(vm: Vm, action: VmAction): Vm {
  if (!canDo(vm, action)) return vm;
  switch (action) {
    case "start":
      return { ...vm, status: "starting", intent: "" };
    case "stop":
      return { ...vm, status: "stopping", intent: "" };
    case "reboot":
      return { ...vm, status: "starting", intent: "reboot" };
    case "delete":
      return { ...vm, status: "stopping", intent: "delete" };
  }
}

/** The action a transitional machine is going through (to pick the timer). */
export function pendingAction(vm: Vm): VmAction | null {
  if (vm.status === "starting")
    return vm.intent === "reboot" ? "reboot" : "start";
  if (vm.status === "stopping")
    return vm.intent === "delete" ? "delete" : "stop";
  return null;
}

/** Pure: the machine when its timer runs out; `null` when it was deleted. */
export function settle(vm: Vm): Vm | null {
  if (vm.status === "starting") return { ...vm, status: "running", intent: "" };
  if (vm.status === "stopping") {
    return vm.intent === "delete"
      ? null
      : { ...vm, status: "stopped", intent: "" };
  }
  return vm;
}

export const STATUS_LABEL: Record<VmStatus, string> = {
  running: "Running",
  stopped: "Stopped",
  starting: "Starting",
  stopping: "Stopping",
  error: "Error",
};

/** The label shown for a machine: a reboot or a delete says what it is doing. */
export function statusLabel(vm: Pick<Vm, "status" | "intent">): string {
  if (vm.status === "starting" && vm.intent === "reboot") return "Rebooting";
  if (vm.status === "stopping" && vm.intent === "delete") return "Deleting";
  return STATUS_LABEL[vm.status];
}

/** Pure: the variant of a `ui-pill` for a tone. */
export const pillOf = (tone: Tone): string =>
  tone === "muted" ? "secondary" : tone;

export const STATUS_TONE: Record<VmStatus, Tone> = {
  running: "success",
  stopped: "muted",
  starting: "warning",
  stopping: "warning",
  error: "destructive",
};

/** Hours in a billing month (365 * 24 / 12). */
export const HOURS_PER_MONTH = 730;

/** `$0.0240` style price: hourly prices need four decimals. */
export const hourlyText = (hourly: number): string =>
  `$${hourly.toFixed(4).replace(/0{1,2}$/, "")}/hr`;

/** Pure: dollars as `$17.52` with thousands separators. */
export function dollars(value: number): string {
  const [whole, cents] = Math.abs(value).toFixed(2).split(".");
  return `${value < 0 ? "-" : ""}$${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${cents}`;
}

/** Pure: the monthly price if the machine ran all month. */
export const monthlyOf = (hourly: number): number =>
  Math.round(hourly * HOURS_PER_MONTH * 100) / 100;

export interface VmButton {
  id: VmAction;
  label: string;
  icon: string;
  variant: "default" | "outline" | "destructive" | "ghost";
}

const BUTTONS: Record<VmAction, VmButton> = {
  start: { id: "start", label: "Start", icon: "k-ai-play", variant: "default" },
  stop: { id: "stop", label: "Stop", icon: "k-ai-stop", variant: "outline" },
  reboot: {
    id: "reboot",
    label: "Reboot",
    icon: "k-ai-refresh",
    variant: "outline",
  },
  delete: {
    id: "delete",
    label: "Delete",
    icon: "k-ai-trash",
    variant: "ghost",
  },
};

export const buttonOf = (action: VmAction): VmButton => BUTTONS[action];

export interface VmCardProps {
  id: string;
  name: string;
  /** An emoji for the operating system. */
  emoji: string;
  osLabel: string;
  status: VmStatus;
  statusLabel: string;
  tone: Tone;
  /** The pill variant for the tone (`muted` is `secondary`). */
  pill: string;
  busy: boolean;
  vcpu: string;
  ram: string;
  disk: string;
  regionLabel: string;
  flag: string;
  ip: string;
  price: string;
  monthly: string;
  tags: string[];
  buttons: VmButton[];
  selected: boolean;
}

export interface Lookup {
  emoji: string;
  osLabel: string;
  regionLabel: string;
  flag: string;
}

/** Pure: what a card shows for a machine. `look` says how the image and region are called. */
export function cardOf(vm: Vm, look: Lookup, selected = false): VmCardProps {
  return {
    id: vm.id,
    name: vm.name,
    emoji: look.emoji,
    osLabel: look.osLabel,
    status: vm.status,
    statusLabel: statusLabel(vm),
    tone: STATUS_TONE[vm.status],
    pill: pillOf(STATUS_TONE[vm.status]),
    busy: isBusy(vm),
    vcpu: `${vm.vcpu}`,
    ram: `${vm.ram} GB`,
    disk: `${vm.disk} GB`,
    regionLabel: look.regionLabel,
    flag: look.flag,
    ip: vm.status === "stopped" ? "no public IP" : vm.ip,
    price: hourlyText(vm.hourly),
    monthly: `about ${dollars(monthlyOf(vm.hourly))}/mo`,
    tags: vm.tags,
    buttons: actionsFor(vm).map(buttonOf),
    selected,
  };
}
