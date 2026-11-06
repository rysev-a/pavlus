import { Component, type Effect, type Message } from "@pavlus/frontend";
import {
  storeEffector as store,
  timeEffector as time,
} from "@pavlus/frontend/plugins";
import { lookupOf } from "../vm-wizard/wizard.ts";
import {
  begin,
  cardOf,
  pendingAction,
  settle,
  TRANSITION_MS,
  type Vm,
  type VmAction,
  type VmCardProps,
} from "./vm.ts";
import view from "./vm-card.pavlus";

const vm = (partial: Partial<Vm> & Pick<Vm, "id" | "name">): Vm => ({
  image: "ubuntu-24",
  region: "fra",
  ip: "203.0.113.20",
  vcpu: 2,
  ram: 4,
  disk: 80,
  hourly: 0.035,
  status: "running",
  intent: "",
  hours: 0,
  tags: [],
  ...partial,
});

export const SAMPLE: Vm[] = [
  vm({ id: "a", name: "web-frontend-01", tags: ["prod", "nginx"] }),
  vm({
    id: "b",
    name: "build-runner",
    image: "debian-12",
    region: "nyc",
    status: "stopped",
    hourly: 0.0788,
    vcpu: 4,
    ram: 8,
    disk: 160,
  }),
  vm({
    id: "c",
    name: "legacy-erp",
    image: "windows-2022",
    region: "ams",
    status: "error",
    hourly: 0.071,
    tags: ["windows"],
  }),
];

export interface VmCardState {
  vms: Vm[];
  cards: VmCardProps[];
  last: string;
}

const cardsOf = (vms: Vm[]): VmCardProps[] =>
  vms.map((v) => cardOf(v, lookupOf(v)));

export const initial: VmCardState = {
  vms: SAMPLE,
  cards: cardsOf(SAMPLE),
  last: "Nothing pressed yet.",
};

export class VmCardPage extends Component<VmCardState> {
  view = view;

  _show(vms: Vm[], last: string, more: Effect[] = []): Effect[] {
    return [
      store.set("vms", vms),
      store.set("cards", cardsOf(vms)),
      store.set("last", last),
      ...more,
    ];
  }

  "card.act"(msg: Message, s: VmCardState): Effect[] {
    const [id, action] = msg.payload as [string, VmAction];
    const before = s.vms.find((v) => v.id === id);
    if (!before) return [];
    const after = begin(before, action);
    if (after === before) return [];
    const pending = pendingAction(after) ?? action;
    return this._show(
      s.vms.map((v) => (v.id === id ? after : v)),
      `${before.name}: ${action}`,
      [time.setTimeout(`vm:${id}`, TRANSITION_MS[pending], "settled", id)],
    );
  }

  settled(msg: Message, s: VmCardState): Effect[] {
    const id = msg.payload as string;
    const vms = s.vms.flatMap((v) => {
      if (v.id !== id) return [v];
      const next = settle(v);
      return next ? [next] : [];
    });
    return this._show(vms, s.last);
  }

  leave(): Effect[] {
    return [time.cancelAll()];
  }
}

export const page = new VmCardPage();
