import { Component, type Effect, type Message } from "@pavlus/frontend";
import { storeEffector as store } from "@pavlus/frontend/plugins";
import {
  addRule,
  emptyDraft,
  type Proto,
  type Rule,
  type RuleAction,
  type RuleDraft,
  type RulesProps,
  removeRule,
  rulesProps,
  validateRule,
} from "./rules.ts";
import view from "./rules-table.pavlus";

export const SEED: Rule[] = [
  {
    id: "r1",
    proto: "tcp",
    port: "22",
    source: "any",
    action: "allow",
    note: "SSH",
  },
  {
    id: "r2",
    proto: "tcp",
    port: "443",
    source: "any",
    action: "allow",
    note: "HTTPS",
  },
  {
    id: "r3",
    proto: "tcp",
    port: "5432",
    source: "10.0.0.0/16",
    action: "allow",
    note: "Postgres from the private network",
  },
];

export interface RulesTableState {
  list: Rule[];
  draft: RuleDraft;
  seq: number;
  rules: RulesProps;
}

export const initial: RulesTableState = {
  list: SEED,
  draft: emptyDraft(),
  seq: 4,
  rules: rulesProps(SEED, emptyDraft(), {}),
};

export class RulesTablePage extends Component<RulesTableState> {
  view = view;

  "rules.remove"(msg: Message, s: RulesTableState): Effect[] {
    const list = removeRule(s.list, msg.payload as string);
    return [
      store.set("list", list),
      store.set("rules", rulesProps(list, s.draft, {})),
    ];
  }

  "rules.field"(msg: Message, s: RulesTableState): Effect[] {
    const name = msg.payload as keyof RuleDraft;
    const value = msg.event?.value ?? "";
    const draft: RuleDraft = {
      ...s.draft,
      [name]:
        name === "proto"
          ? (value as Proto)
          : name === "action"
            ? (value as RuleAction)
            : value,
    };
    return [
      store.set("draft", draft),
      store.set("rules", rulesProps(s.list, draft, {})),
    ];
  }

  "rules.add"(_msg: Message, s: RulesTableState): Effect[] {
    const errors = validateRule(s.draft, s.list);
    if (Object.keys(errors).length > 0) {
      return [store.set("rules", rulesProps(s.list, s.draft, errors))];
    }
    const list = addRule(s.list, s.draft, s.seq);
    const draft = emptyDraft();
    return [
      store.set("list", list),
      store.set("seq", s.seq + 1),
      store.set("draft", draft),
      store.set("rules", rulesProps(list, draft, {})),
    ];
  }
}

export const page = new RulesTablePage();
