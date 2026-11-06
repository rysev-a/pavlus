import { type Tone } from "../../blocks/admin-shell/shell.ts";
import {
  type Activity,
  type ActivityKind,
  logActivity,
} from "../../blocks/activity-feed/feed.ts";
import {
  type Contact,
  type ContactStatus,
} from "../../blocks/contact-card/contacts.ts";
import {
  type DealLite,
  isOpen,
  moveStage,
  nextStage,
  probOf,
  type StageDef,
  totalOf,
  weightedOf,
} from "../../blocks/deal-card/deals.ts";
import { type Score } from "../../blocks/leaderboard/board.ts";
import { isIso, TODAY } from "../../blocks/month-grid/dates.ts";
import { positive } from "../../blocks/record-sheet/sheet.ts";

export { TODAY };

export const STAGES: StageDef[] = [
  { id: "lead", title: "Lead", prob: 10, tone: "muted" },
  { id: "qualified", title: "Qualified", prob: 25, tone: "info" },
  { id: "proposal", title: "Proposal", prob: 50, tone: "default" },
  { id: "negotiation", title: "Negotiation", prob: 75, tone: "warning" },
  { id: "won", title: "Won", prob: 100, tone: "success" },
  { id: "lost", title: "Lost", prob: 0, tone: "destructive" },
];

export interface Rep {
  initials: string;
  name: string;
  /** What the rep should win this quarter. */
  quota: number;
}

export const REPS: Rep[] = [
  { initials: "MC", name: "Maya Chen", quota: 40000 },
  { initials: "DA", name: "Diego Alvarez", quota: 45000 },
  { initials: "PN", name: "Priya Nair", quota: 36000 },
  { initials: "TB", name: "Tom Becker", quota: 18000 },
  { initials: "LF", name: "Lena Fischer", quota: 60000 },
];

export interface Deal extends DealLite {
  contact: string;
  next: string;
  activity: Activity[];
}

const act = (
  id: string,
  kind: ActivityKind,
  title: string,
  text: string,
  who: string,
  when: string,
): Activity => ({ id, kind, title, text, who, when });

const deal = (
  id: string,
  title: string,
  company: string,
  amount: number,
  stage: string,
  owner: string,
  close: string,
  contact: string,
  next: string,
  activity: Activity[],
): Deal => ({
  id,
  title,
  company,
  amount,
  stage,
  owner,
  close,
  contact,
  next,
  activity,
});

export const CONTACTS: Contact[] = [
  {
    id: "c1",
    name: "Helena Voss",
    role: "Head of Operations",
    company: "Northwind Logistics",
    email: "helena.voss@northwind.example",
    phone: "+1 415 555 0142",
    status: "prospect",
    tags: ["Decision maker", "Logistics"],
    last: "2026-11-02",
  },
  {
    id: "c2",
    name: "Marcus Oyelaran",
    role: "CTO",
    company: "Brightwave Media",
    email: "marcus@brightwave.example",
    phone: "+1 212 555 0198",
    status: "prospect",
    tags: ["Champion", "Technical"],
    last: "2026-10-30",
  },
  {
    id: "c3",
    name: "Sofia Lindgren",
    role: "Buyer",
    company: "Fernhill Grocers",
    email: "sofia@fernhill.example",
    phone: "+1 617 555 0107",
    status: "lead",
    tags: ["Retail", "Webinar"],
    last: "2026-10-22",
  },
  {
    id: "c4",
    name: "Daniel Okafor",
    role: "Finance Director",
    company: "Kestrel Energy",
    email: "d.okafor@kestrel.example",
    phone: "+1 713 555 0166",
    status: "customer",
    tags: ["Renewal"],
    last: "2026-10-29",
  },
  {
    id: "c5",
    name: "Aiko Tanaka",
    role: "VP Product",
    company: "Haulwise",
    email: "aiko@haulwise.example",
    phone: "+1 206 555 0121",
    status: "prospect",
    tags: ["Analytics", "Decision maker"],
    last: "2026-10-31",
  },
  {
    id: "c6",
    name: "Grace Whitaker",
    role: "Practice Manager",
    company: "Oakline Dental",
    email: "grace@oakline.example",
    phone: "+1 503 555 0183",
    status: "customer",
    tags: ["Healthcare"],
    last: "2026-10-15",
  },
  {
    id: "c7",
    name: "Viktor Petrov",
    role: "Procurement Lead",
    company: "Pinecrest Hotels",
    email: "v.petrov@pinecrest.example",
    phone: "+1 305 555 0150",
    status: "prospect",
    tags: ["Hospitality", "Procurement"],
    last: "2026-11-03",
  },
  {
    id: "c8",
    name: "Nadia Haddad",
    role: "CISO",
    company: "Meridian Bank",
    email: "nadia.haddad@meridian.example",
    phone: "+1 312 555 0175",
    status: "prospect",
    tags: ["Security", "Compliance"],
    last: "2026-10-27",
  },
  {
    id: "c9",
    name: "Owen Callahan",
    role: "Owner",
    company: "Tidewater Cafe",
    email: "owen@tidewater.example",
    phone: "+1 410 555 0139",
    status: "lead",
    tags: ["Small business"],
    last: "2026-09-18",
  },
  {
    id: "c10",
    name: "Beatrice Sandoval",
    role: "Operations Manager",
    company: "Atlas Freight",
    email: "b.sandoval@atlas.example",
    phone: "+1 214 555 0112",
    status: "customer",
    tags: ["Logistics", "Renewal"],
    last: "2026-10-12",
  },
  {
    id: "c11",
    name: "Julian Brandt",
    role: "Founder",
    company: "Quillfeather Books",
    email: "julian@quillfeather.example",
    phone: "+1 415 555 0194",
    status: "lead",
    tags: ["Small business", "API"],
    last: "2026-10-05",
  },
  {
    id: "c12",
    name: "Rosa Delgado",
    role: "Head of Sales",
    company: "Orchard & Vine",
    email: "rosa@orchardvine.example",
    phone: "+1 707 555 0127",
    status: "churned",
    tags: ["Hospitality"],
    last: "2026-07-02",
  },
];

export const DEALS: Deal[] = [
  deal(
    "d1",
    "Annual plan, 40 seats",
    "Northwind Logistics",
    48000,
    "proposal",
    "MC",
    "2026-11-20",
    "c1",
    "Send the revised proposal with the volume discount",
    [
      act(
        "a3",
        "email",
        "Proposal sent",
        "40 seats, annual plan, onboarding included.",
        "Maya Chen",
        "Yesterday",
      ),
      act(
        "a2",
        "call",
        "Discovery call, 25 minutes",
        "They run three tools today and want one. Budget approved for Q1.",
        "Maya Chen",
        "Oct 28",
      ),
      act(
        "a1",
        "note",
        "Lead came from the webinar",
        "",
        "Marketing",
        "Oct 24",
      ),
    ],
  ),
  deal(
    "d2",
    "Pilot for two stores",
    "Fernhill Grocers",
    12500,
    "lead",
    "DA",
    "2026-12-04",
    "c3",
    "Book an intro call",
    [
      act(
        "a2",
        "email",
        "Welcome email",
        "Sent the pilot overview.",
        "Diego Alvarez",
        "Oct 22",
      ),
      act(
        "a1",
        "note",
        "Downloaded the retail guide",
        "",
        "Marketing",
        "Oct 21",
      ),
    ],
  ),
  deal(
    "d3",
    "Platform migration",
    "Brightwave Media",
    96000,
    "negotiation",
    "MC",
    "2026-11-01",
    "c2",
    "Get legal to approve the data clause",
    [
      act(
        "a4",
        "meeting",
        "Security review",
        "Their CTO asked for the pen-test report. Sent.",
        "Maya Chen",
        "Oct 30",
      ),
      act("a3", "stage", "Moved to Negotiation", "", "Maya Chen", "Oct 26"),
      act(
        "a2",
        "email",
        "Proposal accepted in principle",
        "",
        "Maya Chen",
        "Oct 24",
      ),
      act("a1", "call", "Kick-off call", "", "Maya Chen", "Oct 10"),
    ],
  ),
  deal(
    "d4",
    "Support add-on",
    "Kestrel Energy",
    18400,
    "won",
    "PN",
    "2026-10-29",
    "c4",
    "Hand over to customer success",
    [
      act(
        "a2",
        "won",
        "Deal won",
        "Signed for 12 months.",
        "Priya Nair",
        "Oct 29",
      ),
      act("a1", "call", "Pricing call", "", "Priya Nair", "Oct 20"),
    ],
  ),
  deal(
    "d5",
    "Fleet analytics",
    "Haulwise",
    64000,
    "qualified",
    "PN",
    "2026-12-12",
    "c5",
    "Schedule a technical demo",
    [
      act(
        "a2",
        "meeting",
        "Intro meeting",
        "Interested in route-level margins.",
        "Priya Nair",
        "Oct 31",
      ),
      act(
        "a1",
        "note",
        "Inbound from the conference",
        "",
        "Marketing",
        "Oct 18",
      ),
    ],
  ),
  deal(
    "d6",
    "Seat expansion",
    "Brightwave Media",
    22000,
    "qualified",
    "DA",
    "2026-12-01",
    "c2",
    "Confirm headcount for next year",
    [
      act(
        "a1",
        "email",
        "Expansion idea shared",
        "",
        "Diego Alvarez",
        "Oct 27",
      ),
    ],
  ),
  deal(
    "d7",
    "Onboarding package",
    "Oakline Dental",
    7800,
    "proposal",
    "TB",
    "2026-11-14",
    "c6",
    "Follow up on the quote",
    [
      act("a2", "email", "Quote sent", "", "Tom Becker", "Nov 2"),
      act("a1", "call", "Needs call", "", "Tom Becker", "Oct 29"),
    ],
  ),
  deal(
    "d8",
    "Regional rollout",
    "Pinecrest Hotels",
    132000,
    "negotiation",
    "LF",
    "2026-11-27",
    "c7",
    "Agree the payment schedule",
    [
      act(
        "a3",
        "meeting",
        "Procurement meeting",
        "Three hotels start in January, five more in spring.",
        "Lena Fischer",
        "Today",
      ),
      act("a2", "stage", "Moved to Negotiation", "", "Lena Fischer", "Oct 30"),
      act("a1", "call", "Discovery call", "", "Lena Fischer", "Oct 12"),
    ],
  ),
  deal(
    "d9",
    "Compliance module",
    "Meridian Bank",
    85000,
    "proposal",
    "LF",
    "2026-12-08",
    "c8",
    "Prepare the security questionnaire",
    [
      act("a2", "email", "Proposal sent", "", "Lena Fischer", "Oct 27"),
      act("a1", "meeting", "Compliance workshop", "", "Lena Fischer", "Oct 20"),
    ],
  ),
  deal(
    "d10",
    "Starter plan",
    "Tidewater Cafe",
    3600,
    "lead",
    "TB",
    "2026-11-30",
    "c9",
    "Call back on Thursday",
    [
      act(
        "a1",
        "note",
        "Asked for pricing on the website",
        "",
        "Marketing",
        "Sep 18",
      ),
    ],
  ),
  deal(
    "d11",
    "Data warehouse sync",
    "Kestrel Energy",
    41000,
    "lead",
    "MC",
    "2026-12-15",
    "c4",
    "Introduce the solutions engineer",
    [
      act(
        "a1",
        "email",
        "Idea from the renewal call",
        "",
        "Maya Chen",
        "Oct 29",
      ),
    ],
  ),
  deal(
    "d12",
    "Renewal, 25 seats",
    "Atlas Freight",
    29500,
    "won",
    "DA",
    "2026-10-15",
    "c10",
    "Send the welcome pack",
    [
      act(
        "a2",
        "won",
        "Deal won",
        "Renewed for two years.",
        "Diego Alvarez",
        "Oct 15",
      ),
      act("a1", "call", "Renewal call", "", "Diego Alvarez", "Oct 8"),
    ],
  ),
  deal(
    "d13",
    "Custom reports",
    "Orchard & Vine",
    15200,
    "won",
    "MC",
    "2026-10-09",
    "c12",
    "Schedule the training",
    [act("a1", "won", "Deal won", "", "Maya Chen", "Oct 9")],
  ),
  deal(
    "d19",
    "Departmental license",
    "Atlas Freight",
    24800,
    "won",
    "LF",
    "2026-10-18",
    "c10",
    "Schedule the kick-off",
    [act("a1", "won", "Deal won", "", "Lena Fischer", "Oct 18")],
  ),
  deal(
    "d14",
    "Multi-site license",
    "Pinecrest Hotels",
    54000,
    "lost",
    "TB",
    "2026-10-02",
    "c7",
    "",
    [
      act(
        "a2",
        "lost",
        "Deal lost",
        "Went with a competitor that was cheaper.",
        "Tom Becker",
        "Oct 2",
      ),
      act("a1", "call", "Pricing call", "", "Tom Becker", "Sep 25"),
    ],
  ),
  deal(
    "d15",
    "Training workshop",
    "Northwind Logistics",
    9400,
    "qualified",
    "PN",
    "2026-11-18",
    "c1",
    "Pick a date for the workshop",
    [act("a1", "email", "Workshop outline sent", "", "Priya Nair", "Oct 30")],
  ),
  deal(
    "d16",
    "API access tier",
    "Quillfeather Books",
    11800,
    "proposal",
    "DA",
    "2026-11-12",
    "c11",
    "Answer the rate-limit question",
    [
      act("a2", "email", "Proposal sent", "", "Diego Alvarez", "Oct 28"),
      act("a1", "call", "Intro call", "", "Diego Alvarez", "Oct 21"),
    ],
  ),
  deal(
    "d17",
    "Enterprise pack",
    "Meridian Bank",
    210000,
    "lead",
    "LF",
    "2027-01-29",
    "c8",
    "Map the stakeholders",
    [
      act(
        "a1",
        "note",
        "Introduced by the compliance team",
        "",
        "Lena Fischer",
        "Oct 28",
      ),
    ],
  ),
  deal(
    "d18",
    "Team plan",
    "Oakline Dental",
    6200,
    "won",
    "TB",
    "2026-10-21",
    "c6",
    "Collect the first invoice",
    [act("a1", "won", "Deal won", "", "Tom Becker", "Oct 21")],
  ),
];

// ---- pure helpers -----------------------------------------------------------

export const STAGE_TITLE = (id: string): string =>
  STAGES.find((s) => s.id === id)?.title ?? id;

const lookOfStage = (stage: string): { kind: ActivityKind; title: string } =>
  stage === "won"
    ? { kind: "won", title: "Deal won" }
    : stage === "lost"
      ? { kind: "lost", title: "Deal lost" }
      : { kind: "stage", title: `Moved to ${STAGE_TITLE(stage)}` };

/** Pure: a deal moved one stage over; the move is logged on its timeline. */
export function moveDeal(
  deals: Deal[],
  id: string,
  dir: "left" | "right",
  who = "You",
): Deal[] {
  const moved = moveStage(deals, STAGES, id, dir);
  return moved.map((d, i) => {
    const before = deals[i];
    if (d.id !== id || d.stage === before.stage) return d;
    const { kind, title } = lookOfStage(d.stage);
    return {
      ...d,
      activity: logActivity(d.activity, kind, title, "", who, "Today"),
    };
  });
}

/** Pure: a deal sent to `lost` (or put back to `lead`). */
export function loseDeal(deals: Deal[], id: string, who = "You"): Deal[] {
  return deals.map((d) =>
    d.id !== id || d.stage === "lost"
      ? d
      : {
          ...d,
          stage: "lost",
          activity: logActivity(
            d.activity,
            "lost",
            "Deal lost",
            "",
            who,
            "Today",
          ),
        },
  );
}

/** Pure: a note added to the timeline of a deal; an empty note changes nothing. */
export function addNote(
  deals: Deal[],
  id: string,
  text: string,
  who = "You",
): Deal[] {
  const clean = text.trim();
  if (!clean) return deals;
  return deals.map((d) =>
    d.id === id
      ? {
          ...d,
          activity: logActivity(
            d.activity,
            "note",
            "Note",
            clean,
            who,
            "Today",
          ),
        }
      : d,
  );
}

/** Pure: the next step of a deal changed (and logged when it really changed). */
export function setNextStep(
  deals: Deal[],
  id: string,
  text: string,
  who = "You",
): Deal[] {
  const clean = text.trim();
  return deals.map((d) =>
    d.id !== id || d.next === clean
      ? d
      : {
          ...d,
          next: clean,
          activity: logActivity(
            d.activity,
            "note",
            "Next step updated",
            clean,
            who,
            "Today",
          ),
        },
  );
}

/** Pure: the deals of one rep (`all` keeps everyone's). */
export const ownedBy = (deals: Deal[], owner: string): Deal[] =>
  owner === "all" ? deals : deals.filter((d) => d.owner === owner);

/** Pure: won against lost, as a percentage of the deals that were decided. */
export function winRate(deals: DealLite[]): number {
  const won = deals.filter((d) => d.stage === "won").length;
  const lost = deals.filter((d) => d.stage === "lost").length;
  return won + lost === 0 ? 0 : Math.round((won / (won + lost)) * 100);
}

export interface Totals {
  open: number;
  openCount: number;
  weighted: number;
  won: number;
  wonCount: number;
  rate: number;
}

/** Pure: the numbers on top of the pipeline. */
export function totals(deals: DealLite[]): Totals {
  const open = deals.filter((d) => isOpen(STAGES, d.stage));
  const won = deals.filter((d) => d.stage === "won");
  return {
    open: totalOf(open),
    openCount: open.length,
    weighted: Math.round(weightedOf(open, STAGES)),
    won: totalOf(won),
    wonCount: won.length,
    rate: winRate(deals),
  };
}

/** Pure: the weighted forecast of each open stage. */
export function weightedByStage(
  deals: DealLite[],
): { id: string; title: string; value: number; total: number }[] {
  return STAGES.filter((s) => s.prob > 0 && s.prob < 100).map((s) => {
    const mine = deals.filter((d) => d.stage === s.id);
    return {
      id: s.id,
      title: s.title,
      value: Math.round(weightedOf(mine, STAGES)),
      total: totalOf(mine),
    };
  });
}

/** Pure: the open deals by the month they should close (`2026-11`), weighted. */
export function weightedByMonth(
  deals: DealLite[],
): { id: string; value: number }[] {
  const months = new Map<string, number>();
  for (const d of deals) {
    if (!isOpen(STAGES, d.stage)) continue;
    const key = d.close.slice(0, 7);
    months.set(
      key,
      (months.get(key) ?? 0) + (d.amount * probOf(STAGES, d.stage)) / 100,
    );
  }
  return [...months]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, value]) => ({ id, value: Math.round(value) }));
}

/** Pure: what each rep has won, against the quota. */
export function scores(deals: DealLite[]): Score[] {
  return REPS.map((r) => {
    const won = deals.filter(
      (d) => d.owner === r.initials && d.stage === "won",
    );
    const open = deals.filter(
      (d) => d.owner === r.initials && isOpen(STAGES, d.stage),
    );
    return {
      id: r.initials,
      name: r.name,
      value: totalOf(won),
      target: r.quota,
      sub: `${won.length} won, ${open.length} open`,
    };
  });
}

/** Pure: the contact list after the status tab and the search text. */
export function contactsShown(
  list: Contact[],
  status: string,
  query: string,
): Contact[] {
  const q = query.trim().toLowerCase();
  return list.filter(
    (c) =>
      (status === "all" || c.status === (status as ContactStatus)) &&
      (!q ||
        `${c.name} ${c.company} ${c.role} ${c.tags.join(" ")}`
          .toLowerCase()
          .includes(q)),
  );
}

export const monthName = (key: string): string =>
  [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ][Number(key.slice(5, 7)) - 1];

export const dealTone = (stage: string): Tone =>
  STAGES.find((s) => s.id === stage)?.tone ?? "default";

// ---- the new deal form ------------------------------------------------------

export interface DealDraft {
  title: string;
  company: string;
  contact: string;
  amount: string;
  stage: string;
  close: string;
  owner: string;
}

export const emptyDraft = (): DealDraft => ({
  title: "",
  company: "",
  contact: CONTACTS[0].id,
  amount: "",
  stage: "lead",
  close: "2026-12-15",
  owner: REPS[0].initials,
});

/** Pure: what is wrong with the form, by field. */
export function validateDeal(d: DealDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!d.title.trim()) errors.title = "Give the deal a name.";
  if (!d.company.trim()) errors.company = "Which company is it with?";
  if (positive(d.amount) === null)
    errors.amount = "Enter an amount above zero.";
  if (!isIso(d.close)) errors.close = "Pick a close date.";
  else if (d.close < TODAY) errors.close = "The close date is in the past.";
  return errors;
}

/** Pure: the next free id (`d19`). */
export function nextDealId(deals: Deal[]): string {
  const max = deals.reduce(
    (m, d) => Math.max(m, Number(d.id.slice(1)) || 0),
    0,
  );
  return `d${max + 1}`;
}

/** Pure: the list with the deal of the form added at the end. */
export function addDeal(deals: Deal[], d: DealDraft): Deal[] {
  const rep = REPS.find((r) => r.initials === d.owner) ?? REPS[0];
  return [
    ...deals,
    {
      id: nextDealId(deals),
      title: d.title.trim(),
      company: d.company.trim(),
      amount: Math.round(positive(d.amount) ?? 0),
      stage: d.stage,
      owner: rep.initials,
      close: d.close,
      contact: d.contact,
      next: "Make the first contact",
      activity: [
        act(
          "a1",
          "note",
          "Deal created",
          `Starts in ${STAGE_TITLE(d.stage)}.`,
          rep.name,
          "Today",
        ),
      ],
    },
  ];
}

export { nextStage };
