import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import { patch } from "../admin-shell/shell.ts";
import {
  addRule,
  type FieldDef,
  type Person,
  removeRule,
  type Rule,
  ruleViews,
  type RuleView,
  setField,
  setOp,
  setValue,
  summary,
} from "./segments.ts";
import view from "./segment-builder.pavlus";

export const FIELDS: FieldDef[] = [
  {
    id: "plan",
    label: "Plan",
    kind: "choice",
    choices: ["Free", "Pro", "Team"],
  },
  {
    id: "country",
    label: "Country",
    kind: "choice",
    choices: ["US", "UK", "DE", "FR"],
  },
  { id: "orders", label: "Orders", kind: "number" },
  { id: "city", label: "City", kind: "text" },
];

const PEOPLE: Person[] = [
  { id: "u1", plan: "Pro", country: "US", orders: 12, city: "Austin" },
  { id: "u2", plan: "Free", country: "DE", orders: 1, city: "Berlin" },
  { id: "u3", plan: "Team", country: "UK", orders: 30, city: "Leeds" },
  { id: "u4", plan: "Pro", country: "FR", orders: 6, city: "Lyon" },
  { id: "u5", plan: "Free", country: "US", orders: 0, city: "Boston" },
  { id: "u6", plan: "Pro", country: "DE", orders: 9, city: "Munich" },
  { id: "u7", plan: "Team", country: "US", orders: 21, city: "Austin" },
  { id: "u8", plan: "Free", country: "UK", orders: 2, city: "London" },
];

export interface SegmentBuilderState {
  rules: Rule[];
  all: boolean;
  views: RuleView[];
  count: number;
  total: number;
  pct: number;
  text: string;
}

const derive = (rules: Rule[], all: boolean) => ({
  rules,
  all,
  views: ruleViews(rules, FIELDS),
  ...summary(PEOPLE, rules, FIELDS, all),
});

const START: Rule[] = [{ id: "r1", field: "plan", op: "is", value: "Pro" }];

export const initial: SegmentBuilderState = derive(START, true);

export class SegmentBuilderPage extends Component<SegmentBuilderState> {
  view = view;

  "seg.add"(_msg: Message, s: SegmentBuilderState): Effect[] {
    return patch(derive(addRule(s.rules, FIELDS), s.all));
  }

  "seg.remove"(msg: Message, s: SegmentBuilderState): Effect[] {
    return patch(derive(removeRule(s.rules, msg.payload as string), s.all));
  }

  "seg.setfield"(msg: Message, s: SegmentBuilderState): Effect[] {
    return patch(
      derive(
        setField(
          s.rules,
          FIELDS,
          msg.payload as string,
          msg.event?.value ?? "",
        ),
        s.all,
      ),
    );
  }

  "seg.setop"(msg: Message, s: SegmentBuilderState): Effect[] {
    return patch(
      derive(
        setOp(s.rules, msg.payload as string, msg.event?.value ?? ""),
        s.all,
      ),
    );
  }

  "seg.setvalue"(msg: Message, s: SegmentBuilderState): Effect[] {
    return patch(
      derive(
        setValue(s.rules, msg.payload as string, msg.event?.value ?? ""),
        s.all,
      ),
    );
  }

  "seg.setmode"(msg: Message, s: SegmentBuilderState): Effect[] {
    return patch(derive(s.rules, msg.event?.value !== "any"));
  }
}

export const page = new SegmentBuilderPage();
