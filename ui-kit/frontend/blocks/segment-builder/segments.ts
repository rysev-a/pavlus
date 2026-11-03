export type FieldKind = "choice" | "number" | "text";

export interface FieldDef {
  id: string;
  label: string;
  kind: FieldKind;
  /** The values of a `choice` field. */
  choices?: string[];
}

export interface Rule {
  id: string;
  field: string;
  op: string;
  value: string;
}

/** A person of the audience: fields by id. */
export type Person = Record<string, string | number>;

export interface Choice {
  value: string;
  label: string;
  selected: boolean;
}

export interface RuleView {
  id: string;
  kind: FieldKind;
  fields: Choice[];
  ops: Choice[];
  /** The values of a choice field, with one selected. */
  values: Choice[];
  value: string;
  placeholder: string;
}

export interface Summary {
  count: number;
  total: number;
  pct: number;
  text: string;
}

const OPS: Record<FieldKind, [string, string][]> = {
  choice: [
    ["is", "is"],
    ["isnt", "is not"],
  ],
  number: [
    ["over", "is over"],
    ["under", "is under"],
    ["exactly", "is exactly"],
  ],
  text: [
    ["contains", "contains"],
    ["is", "is"],
  ],
};

export const defOf = (defs: FieldDef[], id: string): FieldDef =>
  defs.find((d) => d.id === id) ?? defs[0];

/** Pure: the operators a kind of field offers. */
export const opsOf = (kind: FieldKind): [string, string][] => OPS[kind];

/** Pure: the value a new rule on a field starts with. */
export function startValue(def: FieldDef): string {
  if (def.kind === "choice") return def.choices?.[0] ?? "";
  return def.kind === "number" ? "0" : "";
}

/** Pure: does one person pass one rule? A rule with an empty value passes everyone. */
export function passes(person: Person, rule: Rule, defs: FieldDef[]): boolean {
  const def = defOf(defs, rule.field);
  const have = person[def.id];
  if (rule.value.trim() === "") return true;
  if (def.kind === "number") {
    const a = Number(have);
    const b = Number(rule.value);
    if (!Number.isFinite(b)) return true;
    if (rule.op === "over") return a > b;
    if (rule.op === "under") return a < b;
    return a === b;
  }
  const a = String(have).toLowerCase();
  const b = rule.value.trim().toLowerCase();
  if (rule.op === "contains") return a.includes(b);
  if (rule.op === "isnt") return a !== b;
  return a === b;
}

/** Pure: who is in the segment (`all` rules must pass, or any one of them). */
export function segment(
  people: Person[],
  rules: Rule[],
  defs: FieldDef[],
  all: boolean,
): Person[] {
  if (rules.length === 0) return people;
  return people.filter((p) =>
    all
      ? rules.every((r) => passes(p, r, defs))
      : rules.some((r) => passes(p, r, defs)),
  );
}

/** Pure: the count of the segment, the share of the audience, and a sentence. */
export function summary(
  people: Person[],
  rules: Rule[],
  defs: FieldDef[],
  all: boolean,
): Summary {
  const count = segment(people, rules, defs, all).length;
  const total = people.length;
  const pct = total === 0 ? 0 : Math.round((count / total) * 100);
  return {
    count,
    total,
    pct,
    text: `${count} of ${total} people (${pct}%)`,
  };
}

const pick = (list: [string, string][], selected: string): Choice[] =>
  list.map(([value, label]) => ({
    value,
    label,
    selected: value === selected,
  }));

/** Pure: what the view shows for each rule. */
export function ruleViews(rules: Rule[], defs: FieldDef[]): RuleView[] {
  return rules.map((r) => {
    const def = defOf(defs, r.field);
    return {
      id: r.id,
      kind: def.kind,
      fields: pick(
        defs.map((d): [string, string] => [d.id, d.label]),
        def.id,
      ),
      ops: pick(OPS[def.kind], r.op),
      values: pick(
        (def.choices ?? []).map((c): [string, string] => [c, c]),
        r.value,
      ),
      value: r.value,
      placeholder: def.kind === "number" ? "A number" : "A word",
    };
  });
}

const nextId = (rules: Rule[]): string => {
  const max = rules.reduce(
    (m, r) => Math.max(m, Number(r.id.replace(/\D/g, "")) || 0),
    0,
  );
  return `r${max + 1}`;
};

/** Pure: a new rule on the first field. */
export function addRule(rules: Rule[], defs: FieldDef[]): Rule[] {
  const def = defs[0];
  return [
    ...rules,
    {
      id: nextId(rules),
      field: def.id,
      op: OPS[def.kind][0][0],
      value: startValue(def),
    },
  ];
}

export const removeRule = (rules: Rule[], id: string): Rule[] =>
  rules.filter((r) => r.id !== id);

/** Pure: a rule moved to another field (the operator and the value start again). */
export function setField(
  rules: Rule[],
  defs: FieldDef[],
  id: string,
  field: string,
): Rule[] {
  const def = defOf(defs, field);
  return rules.map((r) =>
    r.id === id
      ? { ...r, field: def.id, op: OPS[def.kind][0][0], value: startValue(def) }
      : r,
  );
}

export const setOp = (rules: Rule[], id: string, op: string): Rule[] =>
  rules.map((r) => (r.id === id ? { ...r, op } : r));

export const setValue = (rules: Rule[], id: string, value: string): Rule[] =>
  rules.map((r) => (r.id === id ? { ...r, value } : r));
