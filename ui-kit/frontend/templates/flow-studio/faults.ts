// Fault injection: the faults of a scenario, the toggles of the run bar (chips) and
// the toggles on a plugin hop. Pure: model in, model out.
import {
  type Fault,
  type FaultKind,
  type Model,
  DEFAULT_ERROR_CODE,
  findNode,
} from "./model.ts";

export interface Chip {
  id: string;
  label: string;
  hint: string;
  kind: FaultKind;
  target: string;
  code: string;
  ms: number;
}

/** The toggles of the run bar. */
export const CHIPS: Chip[] = [
  {
    id: "pg-error",
    label: "Postgres error",
    hint: "every Postgres call fails with SQLSTATE 40001",
    kind: "error",
    target: "plugin:pg",
    code: "40001",
    ms: 0,
  },
  {
    id: "redis-timeout",
    label: "Redis timeout",
    hint: "every Redis call waits for its timeout, then fails with ETIMEDOUT",
    kind: "timeout",
    target: "plugin:redis",
    code: "",
    ms: 0,
  },
  {
    id: "slow",
    label: "Slow query",
    hint: "every Postgres call takes 1.5 s longer",
    kind: "slow",
    target: "plugin:pg",
    code: "",
    ms: 1500,
  },
  {
    id: "abort",
    label: "Client abort",
    hint: "the client of every request hangs up 40 ms after it started",
    kind: "abort",
    target: "",
    code: "",
    ms: 40,
  },
  {
    id: "deadline",
    label: "Request timeout",
    hint: "every request has a deadline of 120 ms",
    kind: "deadline",
    target: "",
    code: "",
    ms: 120,
  },
];

const sameChip = (f: Fault, c: Chip): boolean =>
  f.kind === c.kind && (c.target === "" || f.target === c.target);

export const chipOn = (m: Model, c: Chip): boolean =>
  m.scenario.faults.some((f) => f.on && sameChip(f, c));

function withFaults(m: Model, faults: Fault[]): Model {
  return { ...m, scenario: { ...m.scenario, faults } };
}

/** Turns a chip on (making its fault when needed) or off (every fault of its kind). */
export function toggleChip(m: Model, id: string): Model {
  const c = CHIPS.find((x) => x.id === id);
  if (!c) return m;
  const faults = m.scenario.faults;
  if (chipOn(m, c))
    return withFaults(
      m,
      faults.map((f) => (sameChip(f, c) ? { ...f, on: false } : f)),
    );
  const mine = faults.find((f) => f.id === `chip-${c.id}`);
  if (mine)
    return withFaults(
      m,
      faults.map((f) => (f === mine ? { ...f, on: true } : f)),
    );
  return withFaults(m, [
    ...faults,
    {
      id: `chip-${c.id}`,
      kind: c.kind,
      target: c.target,
      rid: "",
      code: c.code,
      ms: c.ms,
      on: true,
    },
  ]);
}

/** A fault on one hop (an effect node), toggled from the inspector. */
export function toggleNodeFault(m: Model, nodeId: string, kind: FaultKind): Model {
  const node = findNode(m, nodeId);
  if (!node) return m;
  const id = `n-${nodeId}-${kind}`;
  const faults = m.scenario.faults;
  const have = faults.find((f) => f.id === id);
  if (have)
    return withFaults(
      m,
      faults.map((f) => (f.id === id ? { ...f, on: !f.on } : f)),
    );
  return withFaults(m, [
    ...faults,
    {
      id,
      kind,
      target: nodeId,
      rid: "",
      code: kind === "error" ? (DEFAULT_ERROR_CODE[node.plugin] ?? "ERR") : "",
      ms: kind === "slow" ? 1500 : 0,
      on: true,
    },
  ]);
}

export const nodeFault = (m: Model, nodeId: string, kind: FaultKind): Fault | undefined =>
  m.scenario.faults.find((f) => f.id === `n-${nodeId}-${kind}`);

export function updateFault(m: Model, id: string, patch: Partial<Fault>): Model {
  return withFaults(
    m,
    m.scenario.faults.map((f) => (f.id === id ? { ...f, ...patch } : f)),
  );
}

export function removeFault(m: Model, id: string): Model {
  return withFaults(
    m,
    m.scenario.faults.filter((f) => f.id !== id),
  );
}

export const activeFaults = (m: Model): Fault[] =>
  m.scenario.faults.filter((f) => f.on);

export function faultText(m: Model, f: Fault): string {
  const where = f.target
    ? f.target.startsWith("plugin:")
      ? `every ${f.target.slice(7)} call`
      : (findNode(m, f.target)?.title ?? f.target)
    : "the request";
  const who = f.rid ? ` of ${f.rid}` : "";
  switch (f.kind) {
    case "error":
      return `${where}${who} fails with ${f.code || "an error"}${f.ms ? ` (first ${f.ms} attempts)` : ""}`;
    case "timeout":
      return `${where}${who} times out`;
    case "slow":
      return `${where}${who} takes ${f.ms || 1500} ms longer`;
    case "abort":
      return `the client${who} hangs up after ${f.ms || 30} ms`;
    case "deadline":
      return `the deadline${who} is ${f.ms || 200} ms`;
  }
}
