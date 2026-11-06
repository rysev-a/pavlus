import { Component, type Effect, type Message } from "@pavlus/frontend";
import { storeEffector as store } from "@pavlus/frontend/plugins";
import { dollars } from "../vm-card/vm.ts";
import view from "./vm-wizard.pavlus";
import {
  hourlyOf,
  type KeyChoice,
  monthlyPrice,
  readyToCreate,
  reduce,
  startWizard,
  type WizardProps,
  type WizardState,
  wizardProps,
} from "./wizard.ts";

export const KEYS: KeyChoice[] = [
  {
    id: "k1",
    name: "alex-laptop",
    fingerprint: "SHA256:3f9Kq1vB0dY7mTz2LhW8xRn4Cs6aEoUj5pGiN1yDtVk",
  },
  {
    id: "k2",
    name: "ci-deploy",
    fingerprint: "SHA256:Qm8Zr2Xc7LpV4tHn1WsB9yDfJ0aKeUoG6iNx3TgYhRw",
  },
];

export const TAKEN = ["web-frontend-01", "db-primary"];

export interface VmWizardState {
  w: WizardState;
  wiz: WizardProps;
  created: string;
}

const first = startWizard();

export const initial: VmWizardState = {
  w: first,
  wiz: wizardProps(first, KEYS),
  created: "",
};

export class VmWizardPage extends Component<VmWizardState> {
  view = view;

  _set(w: WizardState, created = ""): Effect[] {
    return [
      store.set("w", w),
      store.set("wiz", wizardProps(w, KEYS)),
      store.set("created", created),
    ];
  }

  "wiz.act"(msg: Message, s: VmWizardState): Effect[] {
    const [kind, id] = msg.payload as [string, string];
    return this._set(reduce(s.w, kind, id, TAKEN));
  }

  "wiz.field"(msg: Message, s: VmWizardState): Effect[] {
    return this._set(
      reduce(s.w, msg.payload as string, msg.event?.value ?? "", TAKEN),
    );
  }

  "wiz.back"(_msg: Message, s: VmWizardState): Effect[] {
    return this._set(reduce(s.w, "back", "", TAKEN));
  }

  "wiz.next"(_msg: Message, s: VmWizardState): Effect[] {
    if (s.w.step === 4 && readyToCreate(s.w.draft, TAKEN)) {
      const d = s.w.draft;
      return this._set(
        startWizard(),
        `${d.name.trim()} would cost ${dollars(monthlyPrice(d))} a month (${hourlyOf(d)} an hour).`,
      );
    }
    return this._set(reduce(s.w, "next", "", TAKEN));
  }

  "wiz.cancel"(): Effect[] {
    return this._set(startWizard());
  }
}

export const page = new VmWizardPage();
