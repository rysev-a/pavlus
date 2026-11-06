/** Firewall rules: the record, the validation of a new rule and the list operations. */

export type Proto = "tcp" | "udp" | "icmp";
export type RuleAction = "allow" | "deny";

export interface Rule {
  id: string;
  proto: Proto;
  /** `22`, a range `8000-8100`, or `any` (ICMP has no port). */
  port: string;
  /** `any`, an address `10.0.0.5` or a network `10.0.0.0/16`. */
  source: string;
  action: RuleAction;
  note: string;
}

export interface RuleDraft {
  proto: Proto;
  port: string;
  source: string;
  action: RuleAction;
  note: string;
}

export const emptyDraft = (): RuleDraft => ({
  proto: "tcp",
  port: "",
  source: "",
  action: "allow",
  note: "",
});

const octet = (s: string): boolean =>
  /^\d{1,3}$/.test(s) && Number(s) >= 0 && Number(s) <= 255;

/** Pure: is this an IPv4 address with an optional `/prefix`? */
export function validSource(source: string): boolean {
  const s = source.trim().toLowerCase();
  if (s === "any") return true;
  const [addr, prefix, ...extra] = s.split("/");
  if (extra.length > 0) return false;
  const parts = addr.split(".");
  if (parts.length !== 4 || !parts.every(octet)) return false;
  if (prefix === undefined) return true;
  return /^\d{1,2}$/.test(prefix) && Number(prefix) <= 32;
}

/** Pure: the error of a port or a range, or an empty string. */
export function portError(port: string, proto: Proto): string {
  const p = port.trim().toLowerCase();
  if (proto === "icmp") return "";
  if (p === "") return "Give a port, a range such as 8000-8100, or any.";
  if (p === "any") return "";
  const range = /^(\d{1,5})(?:-(\d{1,5}))?$/.exec(p);
  if (!range) return "Use a number, a range such as 8000-8100, or any.";
  const from = Number(range[1]);
  const to = range[2] === undefined ? from : Number(range[2]);
  if (from < 1 || to > 65535) return "Ports go from 1 to 65535.";
  if (to < from) return "The range ends before it starts.";
  return "";
}

export type RuleErrors = Partial<Record<"port" | "source", string>>;

/** Pure: the errors of a draft (`{}` when it is fine). A duplicate of an existing rule is refused. */
export function validateRule(draft: RuleDraft, rules: Rule[]): RuleErrors {
  const errors: RuleErrors = {};
  const port = portError(draft.port, draft.proto);
  if (port) errors.port = port;
  if (draft.source.trim() === "")
    errors.source = "Give an address, a network such as 10.0.0.0/16, or any.";
  else if (!validSource(draft.source))
    errors.source = "That is not an IPv4 address or network.";
  if (!errors.port && !errors.source) {
    const next = ruleOf(draft, "probe");
    if (rules.some((r) => sameRule(r, next)))
      errors.port = "This rule already exists.";
  }
  return errors;
}

/** Pure: a rule from a draft, with the port and source written the same way every time. */
export function ruleOf(draft: RuleDraft, id: string): Rule {
  return {
    id,
    proto: draft.proto,
    port: draft.proto === "icmp" ? "any" : draft.port.trim().toLowerCase(),
    source: draft.source.trim().toLowerCase(),
    action: draft.action,
    note: draft.note.trim(),
  };
}

export const sameRule = (a: Rule, b: Rule): boolean =>
  a.proto === b.proto &&
  a.port === b.port &&
  a.source === b.source &&
  a.action === b.action;

/** Pure: the list with a new rule at the end (the caller gives the number for the id). */
export const addRule = (
  rules: Rule[],
  draft: RuleDraft,
  seq: number,
): Rule[] => [...rules, ruleOf(draft, `r${seq}`)];

export const removeRule = (rules: Rule[], id: string): Rule[] =>
  rules.filter((r) => r.id !== id);

/** Pure: does the rule open a sensitive port to everyone? */
export function isRisky(rule: Rule): boolean {
  if (rule.action !== "allow") return false;
  if (rule.source !== "any" && rule.source !== "0.0.0.0/0") return false;
  if (rule.proto !== "tcp") return false;
  if (rule.port === "any") return true;
  return ["22", "3389", "3306", "5432", "6379", "27017"].includes(rule.port);
}

export interface RuleRow extends Rule {
  /** `allow` is green, `deny` red. */
  tone: "success" | "destructive";
  risky: boolean;
  protoLabel: string;
}

export interface RulesProps {
  rows: RuleRow[];
  proto: Proto;
  port: string;
  source: string;
  action: RuleAction;
  note: string;
  portError: string;
  sourceError: string;
  noPort: boolean;
}

/** Pure: what the block shows. */
export function rulesProps(
  rules: Rule[],
  draft: RuleDraft,
  errors: RuleErrors,
): RulesProps {
  return {
    rows: rules.map((r) => ({
      ...r,
      tone: r.action === "allow" ? "success" : "destructive",
      risky: isRisky(r),
      protoLabel: r.proto.toUpperCase(),
    })),
    ...draft,
    portError: errors.port ?? "",
    sourceError: errors.source ?? "",
    noPort: draft.proto === "icmp",
  };
}
