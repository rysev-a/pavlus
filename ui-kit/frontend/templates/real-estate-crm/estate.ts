import type { Tone } from "../../blocks/admin-shell/shell.ts";
import {
  type AgendaEntry,
  agendaDays,
} from "../../blocks/agenda-list/agenda.ts";
import {
  action,
  type ColumnDef,
  meter,
  number,
  pill,
  type Row,
  rowOf,
  strong,
  text,
} from "../../blocks/data-grid/grid.ts";
import type {
  ColumnDef as BoardDef,
  Task,
} from "../../blocks/kanban-board/board.ts";
import { isIso, TODAY } from "../../blocks/month-grid/dates.ts";
import {
  type Property,
  type PropertyKind,
  price,
  STATUS_TONE,
} from "../../blocks/property-card/properties.ts";
import { positive } from "../../blocks/record-sheet/sheet.ts";

export { TODAY };

const prop = (
  id: string,
  title: string,
  address: string,
  city: string,
  cost: number,
  beds: number,
  baths: number,
  area: number,
  kind: PropertyKind,
  status: Property["status"],
  agent: string,
  listed: string,
): Property => ({
  id,
  title,
  address,
  city,
  price: cost,
  beds,
  baths,
  area,
  kind,
  status,
  agent,
  listed,
});

export const PROPERTIES: Property[] = [
  prop(
    "p1",
    "Garden house with studio",
    "14 Alder Lane",
    "Brookfield",
    735000,
    4,
    3,
    188,
    "house",
    "active",
    "Ines Duarte",
    "2026-10-12",
  ),
  prop(
    "p2",
    "Bright two-bed near the park",
    "9 Linden Court, Apt 5",
    "Riverside",
    412000,
    2,
    1,
    78,
    "apartment",
    "pending",
    "Omar Haddad",
    "2026-09-30",
  ),
  prop(
    "p3",
    "Converted warehouse loft",
    "221 Mill Street",
    "Old Town",
    598000,
    1,
    2,
    112,
    "loft",
    "active",
    "Ines Duarte",
    "2026-10-25",
  ),
  prop(
    "p4",
    "Family home with pool",
    "88 Cedar Ridge",
    "Brookfield",
    889000,
    5,
    4,
    246,
    "house",
    "active",
    "Omar Haddad",
    "2026-10-02",
  ),
  prop(
    "p5",
    "Stone cottage by the creek",
    "3 Willow Bend",
    "Fairhaven",
    365000,
    2,
    1,
    96,
    "cottage",
    "active",
    "Ines Duarte",
    "2026-10-28",
  ),
  prop(
    "p6",
    "Sunny studio flat",
    "40 Harbor Street, Apt 12",
    "Riverside",
    238000,
    1,
    1,
    41,
    "apartment",
    "sold",
    "Omar Haddad",
    "2026-08-14",
  ),
  prop(
    "p7",
    "Renovated townhouse",
    "17 Chapel Row",
    "Old Town",
    645000,
    3,
    2,
    141,
    "house",
    "pending",
    "Ines Duarte",
    "2026-09-18",
  ),
  prop(
    "p8",
    "Penthouse with terrace",
    "1 Skyline Plaza",
    "Riverside",
    975000,
    3,
    3,
    164,
    "apartment",
    "draft",
    "Omar Haddad",
    "2026-11-02",
  ),
];

export const AGENTS = ["Ines Duarte", "Omar Haddad"];

export type Stage = "inquiry" | "viewing" | "offer" | "contract" | "closed";

export interface Lead {
  id: string;
  name: string;
  email: string;
  min: number;
  max: number;
  beds: number;
  kind: PropertyKind;
  city: string;
  stage: Stage;
  agent: string;
  /** The property the lead asked about. */
  asked: string;
}

export const LEADS: Lead[] = [
  {
    id: "l1",
    name: "Dana Whitfield",
    email: "dana.w@mail.example",
    min: 650000,
    max: 800000,
    beds: 4,
    kind: "house",
    city: "Brookfield",
    stage: "offer",
    agent: "Ines Duarte",
    asked: "p1",
  },
  {
    id: "l2",
    name: "Tomas Reyes",
    email: "tomas.reyes@mail.example",
    min: 350000,
    max: 430000,
    beds: 2,
    kind: "apartment",
    city: "Riverside",
    stage: "contract",
    agent: "Omar Haddad",
    asked: "p2",
  },
  {
    id: "l3",
    name: "Priya and Sam Kapoor",
    email: "kapoors@mail.example",
    min: 500000,
    max: 650000,
    beds: 1,
    kind: "loft",
    city: "Old Town",
    stage: "viewing",
    agent: "Ines Duarte",
    asked: "p3",
  },
  {
    id: "l4",
    name: "Leonard Fisk",
    email: "l.fisk@mail.example",
    min: 800000,
    max: 950000,
    beds: 5,
    kind: "house",
    city: "Brookfield",
    stage: "inquiry",
    agent: "Omar Haddad",
    asked: "p4",
  },
  {
    id: "l5",
    name: "Miriam Okonkwo",
    email: "miriam.o@mail.example",
    min: 300000,
    max: 400000,
    beds: 2,
    kind: "cottage",
    city: "Fairhaven",
    stage: "viewing",
    agent: "Ines Duarte",
    asked: "p5",
  },
  {
    id: "l6",
    name: "Jonas Lindqvist",
    email: "jonas.l@mail.example",
    min: 200000,
    max: 260000,
    beds: 1,
    kind: "apartment",
    city: "Riverside",
    stage: "closed",
    agent: "Omar Haddad",
    asked: "p6",
  },
  {
    id: "l7",
    name: "Aisha Rahman",
    email: "aisha.r@mail.example",
    min: 580000,
    max: 700000,
    beds: 3,
    kind: "house",
    city: "Old Town",
    stage: "contract",
    agent: "Ines Duarte",
    asked: "p7",
  },
  {
    id: "l8",
    name: "Victor Ng",
    email: "victor.ng@mail.example",
    min: 900000,
    max: 1100000,
    beds: 3,
    kind: "apartment",
    city: "Riverside",
    stage: "inquiry",
    agent: "Omar Haddad",
    asked: "p8",
  },
  {
    id: "l9",
    name: "Clara Beaumont",
    email: "clara.b@mail.example",
    min: 400000,
    max: 520000,
    beds: 2,
    kind: "house",
    city: "Fairhaven",
    stage: "inquiry",
    agent: "Ines Duarte",
    asked: "p5",
  },
];

export const STAGES: BoardDef[] = [
  { id: "inquiry", title: "Inquiry" },
  { id: "viewing", title: "Viewing" },
  { id: "offer", title: "Offer" },
  { id: "contract", title: "Contract" },
  { id: "closed", title: "Closed" },
];

// ---- matching ---------------------------------------------------------------

/**
 * Pure: how well a property suits a buyer, 0 to 100. Budget counts 40 (inside the
 * range, or close to it), bedrooms 25, the kind of home 15 and the town 20.
 */
export function matchScore(lead: Lead, p: Property): number {
  let score = 0;
  if (p.price >= lead.min && p.price <= lead.max) score += 40;
  else {
    const miss =
      p.price < lead.min
        ? (lead.min - p.price) / lead.min
        : (p.price - lead.max) / lead.max;
    score += miss <= 0.1 ? 25 : miss <= 0.25 ? 10 : 0;
  }
  if (p.beds >= lead.beds) score += p.beds === lead.beds ? 25 : 18;
  else if (p.beds === lead.beds - 1) score += 10;
  if (p.kind === lead.kind) score += 15;
  if (p.city === lead.city) score += 20;
  return score;
}

export interface Match {
  property: Property;
  score: number;
}

/** Pure: the available properties best first (sold and draft homes are left out). */
export function bestMatches(lead: Lead, list: Property[], limit = 4): Match[] {
  return list
    .filter((p) => p.status === "active" || p.status === "pending")
    .map((property) => ({ property, score: matchScore(lead, property) }))
    .sort(
      (a, b) => b.score - a.score || a.property.id.localeCompare(b.property.id),
    )
    .slice(0, limit);
}

export const matchTone = (score: number): Tone =>
  score >= 75 ? "success" : score >= 50 ? "warning" : "destructive";

/** Pure: the buyers that suit a property, best first. */
export function buyersFor(
  p: Property,
  leads: Lead[],
  limit = 4,
): { lead: Lead; score: number }[] {
  return leads
    .filter((l) => l.stage !== "closed")
    .map((lead) => ({ lead, score: matchScore(lead, p) }))
    .sort((a, b) => b.score - a.score || a.lead.id.localeCompare(b.lead.id))
    .slice(0, limit);
}

// ---- listings ---------------------------------------------------------------

export const NEXT_STATUS: Record<Property["status"], Property["status"]> = {
  draft: "active",
  active: "pending",
  pending: "sold",
  sold: "sold",
};

export const STATUS_ACTION: Record<Property["status"], string> = {
  draft: "Publish",
  active: "Mark pending",
  pending: "Mark sold",
  sold: "",
};

export function advanceListing(list: Property[], id: string): Property[] {
  return list.map((p) =>
    p.id === id ? { ...p, status: NEXT_STATUS[p.status] } : p,
  );
}

export function listingsShown(
  list: Property[],
  status: string,
  query: string,
): Property[] {
  const q = query.trim().toLowerCase();
  return list.filter(
    (p) =>
      (status === "all" || p.status === status) &&
      (!q ||
        `${p.title} ${p.address} ${p.city} ${p.kind}`
          .toLowerCase()
          .includes(q)),
  );
}

export const LISTING_COLUMNS: ColumnDef[] = [
  { key: "home", label: "Property", sortable: true },
  { key: "price", label: "Price", align: "right", sortable: true },
  { key: "facts", label: "Size" },
  { key: "status", label: "Status" },
  { key: "agent", label: "Agent" },
];

export function listingRows(
  list: Property[],
  sortKey: string,
  dir: "asc" | "desc",
  selected: string,
): Row[] {
  const sign = dir === "asc" ? 1 : -1;
  const sorted = sortKey
    ? [...list].sort((a, b) =>
        sortKey === "price"
          ? (a.price - b.price) * sign
          : a.title.localeCompare(b.title) * sign,
      )
    : list;
  return sorted.map((p) =>
    rowOf(
      LISTING_COLUMNS,
      p.id,
      {
        home: strong(p.title, `${p.address}, ${p.city}`),
        price: number(price(p.price)),
        facts: text(`${p.beds} bed · ${p.baths} bath · ${p.area} m²`),
        status: pill(p.status, STATUS_TONE[p.status]),
        agent: text(p.agent),
      },
      STATUS_ACTION[p.status]
        ? [action("advance", STATUS_ACTION[p.status])]
        : [],
      p.id === selected,
    ),
  );
}

// ---- leads ------------------------------------------------------------------

export const LEAD_COLUMNS: ColumnDef[] = [
  { key: "name", label: "Buyer", sortable: true },
  { key: "budget", label: "Budget", align: "right" },
  { key: "wants", label: "Looking for" },
  { key: "stage", label: "Stage" },
  { key: "match", label: "Best match" },
];

const STAGE_TONE: Record<Stage, Tone> = {
  inquiry: "muted",
  viewing: "info",
  offer: "warning",
  contract: "default",
  closed: "success",
};

const k = (n: number): string => `$${Math.round(n / 1000)}k`;

export function leadRows(
  list: Lead[],
  props: Property[],
  selected: string,
  sortByName: boolean,
): Row[] {
  const sorted = sortByName
    ? [...list].sort((a, b) => a.name.localeCompare(b.name))
    : list;
  return sorted.map((l) => {
    const best = bestMatches(l, props, 1)[0];
    return rowOf(
      LEAD_COLUMNS,
      l.id,
      {
        name: strong(l.name, l.email),
        budget: number(`${k(l.min)} – ${k(l.max)}`),
        wants: text(`${l.beds}+ bed ${l.kind}, ${l.city}`),
        stage: pill(l.stage, STAGE_TONE[l.stage]),
        match: best
          ? meter(best.score, matchTone(best.score), `${best.score}% match`)
          : text("None"),
      },
      [],
      l.id === selected,
    );
  });
}

// ---- pipeline ---------------------------------------------------------------

/** Pure: the buyers as cards for the kanban board. */
export function pipelineTasks(leads: Lead[], props: Property[]): Task[] {
  return leads.map((l) => {
    const p = props.find((x) => x.id === l.asked);
    return {
      id: l.id,
      title: l.name,
      column: l.stage,
      project: p ? p.title : "",
      who: l.agent
        .split(" ")
        .map((w) => w[0])
        .join(""),
      due: p ? k(p.price) : "",
      tag: l.stage === "closed" ? "Closed" : l.kind,
      tone: STAGE_TONE[l.stage],
    };
  });
}

export function moveLead(
  list: Lead[],
  id: string,
  dir: "left" | "right",
): Lead[] {
  return list.map((l) => {
    if (l.id !== id) return l;
    const i = STAGES.findIndex((s) => s.id === l.stage);
    const j = dir === "left" ? i - 1 : i + 1;
    return j < 0 || j >= STAGES.length
      ? l
      : { ...l, stage: STAGES[j].id as Stage };
  });
}

// ---- commission -------------------------------------------------------------

export const COMMISSION_RATE = 0.03;
export const AGENT_SHARE = 0.6;

export interface Commission {
  id: string;
  buyer: string;
  home: string;
  stage: Stage;
  agent: string;
  sale: number;
  fee: number;
  share: number;
}

/** Pure: the commission of each buyer who made an offer or went further. */
export function commissions(leads: Lead[], props: Property[]): Commission[] {
  return leads
    .filter(
      (l) =>
        l.stage === "offer" || l.stage === "contract" || l.stage === "closed",
    )
    .map((l) => {
      const p = props.find((x) => x.id === l.asked);
      const sale = p ? p.price : 0;
      const fee = Math.round(sale * COMMISSION_RATE);
      return {
        id: l.id,
        buyer: l.name,
        home: p ? p.title : "",
        stage: l.stage,
        agent: l.agent,
        sale,
        fee,
        share: Math.round(fee * AGENT_SHARE),
      };
    });
}

export interface CommissionTotals {
  earned: number;
  contract: number;
  offer: number;
}

export function commissionTotals(list: Commission[]): CommissionTotals {
  const sum = (stage: Stage) =>
    list.filter((c) => c.stage === stage).reduce((s, c) => s + c.fee, 0);
  return {
    earned: sum("closed"),
    contract: sum("contract"),
    offer: sum("offer"),
  };
}

export const COMMISSION_COLUMNS: ColumnDef[] = [
  { key: "deal", label: "Sale" },
  { key: "price", label: "Price", align: "right" },
  { key: "fee", label: "Commission (3%)", align: "right" },
  { key: "share", label: "Agent share (60%)", align: "right" },
  { key: "stage", label: "Stage" },
];

export function commissionRows(list: Commission[]): Row[] {
  return list.map((c) =>
    rowOf(COMMISSION_COLUMNS, c.id, {
      deal: strong(c.home, `${c.buyer}, ${c.agent}`),
      price: number(price(c.sale)),
      fee: number(price(c.fee)),
      share: number(price(c.share)),
      stage: pill(c.stage, STAGE_TONE[c.stage]),
    }),
  );
}

// ---- viewings ---------------------------------------------------------------

export interface ViewingDraft {
  property: string;
  lead: string;
  date: string;
  time: string;
}

export const emptyViewing = (property = "p1", lead = "l1"): ViewingDraft => ({
  property,
  lead,
  date: "2026-11-05",
  time: "10:00",
});

const entry = (
  id: string,
  date: string,
  time: string,
  title: string,
  sub: string,
  done: boolean,
  cancelled = false,
): AgendaEntry => ({
  id,
  date,
  time,
  title,
  sub,
  status: cancelled ? "cancelled" : done ? "done" : "booked",
  tone: cancelled ? "destructive" : done ? "muted" : "info",
  action: done || cancelled ? "" : "Mark done",
  done: done || cancelled,
});

export const VIEWINGS: AgendaEntry[] = [
  entry(
    "v1",
    "2026-11-03",
    "09:30",
    "14 Alder Lane",
    "Dana Whitfield with Ines Duarte",
    true,
  ),
  entry(
    "v2",
    "2026-11-03",
    "15:00",
    "9 Linden Court, Apt 5",
    "Tomas Reyes with Omar Haddad",
    false,
  ),
  entry(
    "v3",
    "2026-11-04",
    "11:15",
    "221 Mill Street",
    "Priya and Sam Kapoor with Ines Duarte",
    false,
  ),
  entry(
    "v4",
    "2026-11-06",
    "14:00",
    "3 Willow Bend",
    "Miriam Okonkwo with Ines Duarte",
    false,
  ),
  entry(
    "v5",
    "2026-11-07",
    "10:30",
    "88 Cedar Ridge",
    "Leonard Fisk with Omar Haddad",
    false,
  ),
];

export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Pure: what is wrong with the viewing form, by field. */
export function validateViewing(
  d: ViewingDraft,
  list: AgendaEntry[],
  props: Property[],
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!isIso(d.date)) errors.date = "Pick a date.";
  else if (d.date < TODAY) errors.date = "That day has passed.";
  if (!TIME_RE.test(d.time)) errors.time = "Use a time like 14:30.";
  const home = props.find((p) => p.id === d.property);
  if (
    !errors.date &&
    !errors.time &&
    home &&
    list.some(
      (e) =>
        e.date === d.date &&
        e.time === d.time &&
        e.title === home.address &&
        e.status !== "cancelled",
    )
  ) {
    errors.time = "This home already has a viewing at that time.";
  }
  return errors;
}

export function addViewing(
  list: AgendaEntry[],
  d: ViewingDraft,
  props: Property[],
  leads: Lead[],
): AgendaEntry[] {
  const home = props.find((p) => p.id === d.property);
  const lead = leads.find((l) => l.id === d.lead);
  const max = list.reduce((m, e) => Math.max(m, Number(e.id.slice(1)) || 0), 0);
  return [
    ...list,
    entry(
      `v${max + 1}`,
      d.date,
      d.time,
      home?.address ?? "",
      `${lead?.name ?? ""} with ${home?.agent ?? ""}`,
      false,
    ),
  ];
}

export const markDone = (list: AgendaEntry[], id: string): AgendaEntry[] =>
  list.map((e) =>
    e.id === id ? entry(e.id, e.date, e.time, e.title, e.sub, true) : e,
  );

export const cancelViewing = (list: AgendaEntry[], id: string): AgendaEntry[] =>
  list.map((e) =>
    e.id === id ? entry(e.id, e.date, e.time, e.title, e.sub, false, true) : e,
  );

export const viewingDays = (list: AgendaEntry[]) =>
  agendaDays(list, TODAY, "2026-11-04");
