import { pad2, type Tone } from "../../blocks/admin-shell/shell.ts";
import type {
  Activity,
  ActivityKind,
} from "../../blocks/activity-feed/feed.ts";
import type { Contact } from "../../blocks/contact-card/contacts.ts";
import {
  type ColumnDef,
  type Row,
  rowOf,
  type Sort,
  sortBy,
  strong,
  text,
  pill,
} from "../../blocks/data-grid/grid.ts";
import type { Article } from "../../blocks/suggestion-list/suggest.ts";
import {
  appendMessage,
  type ThreadMessage,
} from "../../blocks/ticket-thread/thread.ts";

export type Status = "open" | "pending" | "solved";
export type Priority = "urgent" | "high" | "normal" | "low";
export type Channel = "email" | "chat" | "phone";

export interface Ticket {
  id: string;
  subject: string;
  customer: string;
  status: Status;
  priority: Priority;
  /** Initials of the agent, or empty. */
  assignee: string;
  channel: Channel;
  opened: string;
  /** Seconds left to the first reply when the clock starts. */
  slaLeft: number;
  /** An agent has answered: the clock stopped. */
  responded: boolean;
  messages: ThreadMessage[];
}

export interface Agent {
  initials: string;
  name: string;
}

export const AGENTS: Agent[] = [
  { initials: "JW", name: "Jonas Weber" },
  { initials: "AO", name: "Amara Osei" },
  { initials: "LF", name: "Lucas Ferreira" },
  { initials: "ML", name: "Mei Lin" },
];

export const ME = AGENTS[0];

export const agentName = (initials: string): string =>
  AGENTS.find((a) => a.initials === initials)?.name ?? "Unassigned";

export const PRIORITY_RANK: Record<Priority, number> = {
  urgent: 3,
  high: 2,
  normal: 1,
  low: 0,
};
export const PRIORITY_TONE: Record<Priority, Tone> = {
  urgent: "destructive",
  high: "warning",
  normal: "info",
  low: "muted",
};
export const STATUS_TONE: Record<Status, Tone> = {
  open: "info",
  pending: "warning",
  solved: "success",
};

export const CUSTOMERS: Contact[] = [
  {
    id: "u1",
    name: "Elena Marquez",
    role: "Finance lead",
    company: "Tallow & Finch",
    email: "elena@tallowfinch.example",
    phone: "+1 646 555 0131",
    status: "customer",
    tags: ["Pro plan", "Since 2024"],
    last: "2026-11-02",
  },
  {
    id: "u2",
    name: "Raj Patel",
    role: "Developer",
    company: "Northbeam Labs",
    email: "raj@northbeam.example",
    phone: "+44 20 5550 0178",
    status: "customer",
    tags: ["API", "Team plan"],
    last: "2026-11-03",
  },
  {
    id: "u3",
    name: "Hanna Virtanen",
    role: "Office manager",
    company: "Kivi Design",
    email: "hanna@kividesign.example",
    phone: "+358 40 555 0192",
    status: "customer",
    tags: ["Starter"],
    last: "2026-10-30",
  },
  {
    id: "u4",
    name: "Carlos Mendes",
    role: "Owner",
    company: "Mendes Bakery",
    email: "carlos@mendesbakery.example",
    phone: "+1 305 555 0114",
    status: "prospect",
    tags: ["Trial"],
    last: "2026-11-03",
  },
  {
    id: "u5",
    name: "Sarah Goldberg",
    role: "Operations",
    company: "Harbor Health",
    email: "sarah.g@harborhealth.example",
    phone: "+1 617 555 0166",
    status: "customer",
    tags: ["Enterprise", "SSO"],
    last: "2026-11-01",
  },
  {
    id: "u6",
    name: "Tomasz Nowak",
    role: "Admin",
    company: "Vistula Logistics",
    email: "t.nowak@vistula.example",
    phone: "+48 22 555 0170",
    status: "customer",
    tags: ["Team plan"],
    last: "2026-10-27",
  },
  {
    id: "u7",
    name: "Yuki Sato",
    role: "Designer",
    company: "Blue Lantern Studio",
    email: "yuki@bluelantern.example",
    phone: "+81 3 5550 0145",
    status: "churned",
    tags: ["Cancelled"],
    last: "2026-09-14",
  },
  {
    id: "u8",
    name: "Fatima Rahman",
    role: "Founder",
    company: "Sundial Tutors",
    email: "fatima@sundial.example",
    phone: "+1 408 555 0188",
    status: "customer",
    tags: ["Starter", "Annual"],
    last: "2026-10-31",
  },
];

type M = [ThreadMessage["side"], string, string];

const thread = (who: string, agent: string, list: M[]): ThreadMessage[] =>
  list.map(([side, body, when], i) => ({
    id: `m${i + 1}`,
    side,
    who: side === "customer" ? who : agent,
    text: body,
    when,
  }));

const ticket = (
  id: string,
  subject: string,
  customer: string,
  status: Status,
  priority: Priority,
  assignee: string,
  channel: Channel,
  opened: string,
  slaLeft: number,
  responded: boolean,
  messages: M[],
): Ticket => ({
  id,
  subject,
  customer,
  status,
  priority,
  assignee,
  channel,
  opened,
  slaLeft,
  responded,
  messages: thread(
    CUSTOMERS.find((c) => c.id === customer)?.name ?? "Customer",
    agentName(assignee || "JW"),
    messages,
  ),
});

export const TICKETS: Ticket[] = [
  ticket(
    "T-1051",
    "CSV export comes out empty",
    "u1",
    "open",
    "urgent",
    "JW",
    "email",
    "Mon, 16:20",
    540,
    false,
    [
      [
        "customer",
        "Hi, since Monday our exports to CSV come out empty. We have a board meeting on Thursday and need the numbers. Can you help?",
        "Mon, 16:20",
      ],
      [
        "note",
        "Known issue with exports over 50k rows, fix ships Wednesday. Offer the manual export meanwhile.",
        "Mon, 17:05",
      ],
    ],
  ),
  ticket(
    "T-1050",
    "Webhook retries are not firing",
    "u2",
    "open",
    "high",
    "AO",
    "email",
    "Today, 08:42",
    1500,
    false,
    [
      [
        "customer",
        "Our endpoint was down for ten minutes last night and none of the failed webhooks were retried. The docs say we get three retries with backoff. Is that still true?",
        "Today, 08:42",
      ],
    ],
  ),
  ticket(
    "T-1049",
    "How do I add a second user?",
    "u3",
    "open",
    "normal",
    "",
    "chat",
    "Today, 09:15",
    6300,
    false,
    [
      [
        "customer",
        "Hello! We are on the Starter plan. Can I add my colleague so she can see the invoices?",
        "Today, 09:15",
      ],
    ],
  ),
  ticket(
    "T-1048",
    "Charged twice for November",
    "u8",
    "open",
    "urgent",
    "",
    "email",
    "Today, 09:48",
    260,
    false,
    [
      [
        "customer",
        "I see two charges of $29 on my card for November, both on the 1st. Please refund one of them.",
        "Today, 09:48",
      ],
    ],
  ),
  ticket(
    "T-1047",
    "SSO login loops back to the sign-in page",
    "u5",
    "pending",
    "high",
    "LF",
    "email",
    "Mon, 11:02",
    0,
    true,
    [
      [
        "customer",
        "Since our IdP certificate rotation, users get sent back to the sign-in page after they log in.",
        "Mon, 11:02",
      ],
      [
        "agent",
        "Thanks Sarah. Could you send me the SAML response from the browser network tab? Remove the personal data first.",
        "Mon, 11:30",
      ],
      [
        "customer",
        "Attached. The audience value looks different from last week.",
        "Mon, 15:12",
      ],
      [
        "agent",
        "Found it: the audience still points to the old entity ID. I sent the corrected metadata, please re-upload it.",
        "Tue, 09:20",
      ],
    ],
  ),
  ticket(
    "T-1046",
    "Trial ends tomorrow, can I extend it?",
    "u4",
    "open",
    "normal",
    "ML",
    "chat",
    "Today, 07:55",
    4200,
    false,
    [
      [
        "customer",
        "We only started using the product on Friday. Could the trial be extended by a week?",
        "Today, 07:55",
      ],
    ],
  ),
  ticket(
    "T-1045",
    "Invoice needs our VAT number",
    "u6",
    "pending",
    "low",
    "JW",
    "email",
    "Fri, 14:10",
    0,
    true,
    [
      [
        "customer",
        "Please add our VAT number PL5252000000 to the October invoice.",
        "Fri, 14:10",
      ],
      [
        "agent",
        "Done, I regenerated the invoice. You can download it from Billing, Invoices. Does it look right?",
        "Fri, 15:02",
      ],
    ],
  ),
  ticket(
    "T-1044",
    "Dark mode makes the charts unreadable",
    "u3",
    "open",
    "low",
    "",
    "chat",
    "Today, 09:31",
    9800,
    false,
    [
      [
        "customer",
        "The grey lines on the dashboard are almost invisible in dark mode.",
        "Today, 09:31",
      ],
    ],
  ),
  ticket(
    "T-1043",
    "Cancel my subscription",
    "u7",
    "solved",
    "normal",
    "AO",
    "email",
    "Oct 12",
    0,
    true,
    [
      [
        "customer",
        "Please cancel my subscription at the end of this period.",
        "Oct 12, 10:00",
      ],
      [
        "agent",
        "Done. Your plan stays active until 14 November and you will not be charged again.",
        "Oct 12, 10:20",
      ],
      ["customer", "Thank you!", "Oct 12, 10:31"],
    ],
  ),
  ticket(
    "T-1042",
    "API rate limit seems lower than documented",
    "u2",
    "solved",
    "high",
    "AO",
    "email",
    "Oct 28",
    0,
    true,
    [
      [
        "customer",
        "We get 429 errors at about 60 requests a minute. The docs say 120.",
        "Oct 28, 13:44",
      ],
      [
        "agent",
        "You are on the Team plan, which allows 60 per minute. The 120 limit is for Enterprise. I linked the plan comparison.",
        "Oct 28, 14:05",
      ],
      ["customer", "Got it, thanks. We will batch the calls.", "Oct 28, 14:20"],
    ],
  ),
  ticket(
    "T-1041",
    "Phone call: login code never arrives",
    "u8",
    "open",
    "high",
    "LF",
    "phone",
    "Today, 10:02",
    2100,
    false,
    [
      [
        "customer",
        "Call summary: the customer does not receive the SMS login code on her new number.",
        "Today, 10:02",
      ],
    ],
  ),
  ticket(
    "T-1040",
    "Where can I download the logo kit?",
    "u1",
    "solved",
    "low",
    "ML",
    "chat",
    "Oct 20",
    0,
    true,
    [
      ["customer", "Do you have a press kit with the logo?", "Oct 20, 12:00"],
      [
        "agent",
        "Yes, it is at the bottom of the About page under Press.",
        "Oct 20, 12:04",
      ],
    ],
  ),
  ticket(
    "T-1039",
    "Data residency question for our contract",
    "u5",
    "pending",
    "normal",
    "JW",
    "email",
    "Fri, 09:30",
    0,
    true,
    [
      [
        "customer",
        "Legal asks whether all customer data stays in the EU region.",
        "Fri, 09:30",
      ],
      [
        "agent",
        "Yes, production data and backups stay in Frankfurt. I attached the sub-processor list.",
        "Fri, 11:00",
      ],
    ],
  ),
  ticket(
    "T-1038",
    "Mobile app crashes when attaching a photo",
    "u6",
    "open",
    "high",
    "",
    "email",
    "Today, 06:40",
    3300,
    false,
    [
      [
        "customer",
        "On Android 15 the app closes as soon as I choose a photo from the gallery.",
        "Today, 06:40",
      ],
    ],
  ),
];

export const CANNED = [
  {
    id: "greet",
    label: "Greeting",
    text: "Hello {name}, thanks for getting in touch.",
  },
  {
    id: "invest",
    label: "Looking into it",
    text: "I am looking into this now and will update you within the hour.",
  },
  {
    id: "logs",
    label: "Need details",
    text: "Could you send me a screenshot or the exact steps that lead to the problem? It helps me reproduce it.",
  },
  {
    id: "refund",
    label: "Refund issued",
    text: "I have issued the refund. It usually appears on your statement within 3 to 5 business days.",
  },
  {
    id: "close",
    label: "Closing",
    text: "I will mark this as solved. If anything is still off, just reply and it reopens.",
  },
];

export const ARTICLES: Article[] = [
  {
    id: "k1",
    title: "Export a report to CSV",
    snippet:
      "Choose a date range, press Export and download the file from the bell menu. Exports over 50,000 rows are emailed.",
    tag: "Reports",
    keywords: "download csv excel empty export rows",
  },
  {
    id: "k2",
    title: "Reset your password or login code",
    snippet:
      "Use the link on the sign-in page. SMS codes can be re-sent after 60 seconds or switched to an authenticator app.",
    tag: "Account",
    keywords: "login locked sign in email sms code password",
  },
  {
    id: "k3",
    title: "Refunds and double charges",
    snippet:
      "If a payment appears twice, the second one is a pending authorization and drops off in 3 to 5 days. Otherwise we refund it.",
    tag: "Billing",
    keywords: "charged twice refund invoice payment card",
  },
  {
    id: "k4",
    title: "Add and remove team members",
    snippet:
      "Owners can invite people from Settings, Team. Starter plans include 2 seats, Team plans include 10.",
    tag: "Account",
    keywords: "user seat invite colleague second",
  },
  {
    id: "k5",
    title: "Webhook delivery and retries",
    snippet:
      "Failed deliveries are retried 3 times with exponential backoff: after 1, 5 and 30 minutes.",
    tag: "Developers",
    keywords: "webhook retry endpoint api backoff",
  },
  {
    id: "k6",
    title: "API rate limits by plan",
    snippet:
      "Starter 30, Team 60 and Enterprise 120 requests per minute. Responses carry a Retry-After header.",
    tag: "Developers",
    keywords: "429 limit requests plan throttle",
  },
  {
    id: "k7",
    title: "Configure single sign-on (SAML)",
    snippet:
      "Upload your IdP metadata, then check that the audience matches the entity ID shown on the SSO page.",
    tag: "Security",
    keywords: "sso saml idp certificate login loop audience",
  },
  {
    id: "k8",
    title: "Extend or end a trial",
    snippet: "Trials last 14 days. Support can extend a trial once by 7 days.",
    tag: "Billing",
    keywords: "trial extend expires plan",
  },
];

// ---- the clock --------------------------------------------------------------

/** The clock of the desk when the page opens: 10:05 on Tuesday. */
export const START_MINUTE = 10 * 60 + 5;

/** Pure: `Today, 10:07` for the desk clock `now` seconds after it started. */
export function clockLabel(now: number): string {
  const total = START_MINUTE + Math.floor(now / 60);
  return `Today, ${pad2(Math.floor(total / 60) % 24)}:${pad2(total % 60)}`;
}

/** Pure: `7:05`, or `1:40:12` when it is over an hour. */
export function countdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s % 60)}` : `${m}:${pad2(s % 60)}`;
}

export interface Sla {
  text: string;
  tone: Tone;
  /** Seconds left (negative when breached); Infinity when no clock runs. */
  left: number;
  running: boolean;
}

/** Pure: the first-reply promise of a ticket `now` seconds after the page opened. */
export function slaOf(t: Ticket, now: number): Sla {
  if (t.status === "solved") {
    return { text: "Solved", tone: "success", left: Infinity, running: false };
  }
  if (t.responded) {
    return { text: "Replied", tone: "muted", left: Infinity, running: false };
  }
  const left = t.slaLeft - now;
  if (left <= 0) {
    return {
      text: `Late ${countdown(-left)}`,
      tone: "destructive",
      left,
      running: true,
    };
  }
  return {
    text: countdown(left),
    tone: left <= 600 ? "destructive" : left <= 1800 ? "warning" : "success",
    left,
    running: true,
  };
}

// ---- filters and rows -------------------------------------------------------

export interface DeskFilter {
  status: string;
  priority: string;
  assignee: string;
  query: string;
}

/** Pure: the tickets that pass the status tab, the priority, the agent and the search. */
export function ticketsShown(list: Ticket[], f: DeskFilter): Ticket[] {
  const q = f.query.trim().toLowerCase();
  return list.filter(
    (t) =>
      (f.status === "all" || t.status === f.status) &&
      (f.priority === "all" || t.priority === f.priority) &&
      (f.assignee === "all" ||
        (f.assignee === "none"
          ? t.assignee === ""
          : t.assignee === f.assignee)) &&
      (!q ||
        `${t.id} ${t.subject} ${CUSTOMERS.find((c) => c.id === t.customer)?.name ?? ""}`
          .toLowerCase()
          .includes(q)),
  );
}

export const customerOf = (id: string): Contact =>
  CUSTOMERS.find((c) => c.id === id) ?? CUSTOMERS[0];

export const COLUMNS: ColumnDef[] = [
  { key: "subject", label: "Ticket", sortable: true },
  { key: "priority", label: "Priority", sortable: true },
  { key: "status", label: "Status", sortable: true },
  { key: "assignee", label: "Agent" },
  { key: "sla", label: "First reply in", sortable: true, align: "right" },
];

/** Pure: the grid rows, sorted. SLA sorts by the time left, priority by its rank. */
export function ticketRows(
  list: Ticket[],
  now: number,
  sort: Sort | null,
  selected = "",
): Row[] {
  const sorted = sortBy(list, sort, (t, key) =>
    key === "sla"
      ? Math.min(slaOf(t, now).left, 1e9)
      : key === "priority"
        ? PRIORITY_RANK[t.priority]
        : key === "status"
          ? t.status
          : t.subject,
  );
  return sorted.map((t) => {
    const sla = slaOf(t, now);
    return rowOf(
      COLUMNS,
      t.id,
      {
        subject: strong(t.subject, `${t.id} · ${customerOf(t.customer).name}`),
        priority: pill(t.priority, PRIORITY_TONE[t.priority]),
        status: pill(t.status, STATUS_TONE[t.status]),
        assignee: text(
          t.assignee ? agentName(t.assignee).split(" ")[0] : "Unassigned",
        ),
        sla: pill(sla.text, sla.tone),
      },
      [],
      t.id === selected,
    );
  });
}

// ---- changes ----------------------------------------------------------------

export interface Reply {
  text: string;
  internal: boolean;
  status: Status;
}

/** Pure: a reply (or an internal note) added to a ticket. An agent reply stops the SLA clock. */
export function applyReply(
  list: Ticket[],
  id: string,
  reply: Reply,
  when: string,
  who = ME.name,
): Ticket[] {
  return list.map((t) =>
    t.id !== id
      ? t
      : {
          ...t,
          messages: appendMessage(
            t.messages,
            reply.internal ? "note" : "agent",
            who,
            reply.text,
            when,
          ),
          responded: t.responded || !reply.internal,
          status: reply.internal ? t.status : reply.status,
          assignee: t.assignee || ME.initials,
        },
  );
}

export const setStatus = (
  list: Ticket[],
  id: string,
  status: Status,
): Ticket[] => list.map((t) => (t.id === id ? { ...t, status } : t));

export const setAssignee = (
  list: Ticket[],
  id: string,
  assignee: string,
): Ticket[] => list.map((t) => (t.id === id ? { ...t, assignee } : t));

export const setPriority = (
  list: Ticket[],
  id: string,
  priority: Priority,
): Ticket[] => list.map((t) => (t.id === id ? { ...t, priority } : t));

const KIND: Record<Channel, ActivityKind> = {
  email: "email",
  chat: "reply",
  phone: "call",
};

/** Pure: the other tickets of the same customer, as a timeline. */
export function historyOf(
  list: Ticket[],
  customer: string,
  except: string,
): Activity[] {
  return list
    .filter((t) => t.customer === customer && t.id !== except)
    .map((t) => ({
      id: t.id,
      kind: KIND[t.channel],
      title: t.subject,
      text: `${t.id}, ${t.status}`,
      who: t.assignee ? agentName(t.assignee) : "Unassigned",
      when: t.opened,
    }));
}

export interface DeskStats {
  open: number;
  pending: number;
  solved: number;
  unassigned: number;
  atRisk: number;
  late: number;
}

/** Pure: the numbers of the overview. A ticket is at risk when its first reply is due within 30 minutes. */
export function deskStats(list: Ticket[], now: number): DeskStats {
  const live = list.filter((t) => t.status !== "solved");
  const slas = live.map((t) => slaOf(t, now));
  return {
    open: list.filter((t) => t.status === "open").length,
    pending: list.filter((t) => t.status === "pending").length,
    solved: list.filter((t) => t.status === "solved").length,
    unassigned: live.filter((t) => t.assignee === "").length,
    atRisk: slas.filter((s) => s.running && s.left > 0 && s.left <= 1800)
      .length,
    late: slas.filter((s) => s.running && s.left <= 0).length,
  };
}

/** Pure: how many live tickets each agent holds. */
export function workload(list: Ticket[]): { agent: Agent; count: number }[] {
  return AGENTS.map((agent) => ({
    agent,
    count: list.filter(
      (t) => t.assignee === agent.initials && t.status !== "solved",
    ).length,
  }));
}

/** The words of the search that starts when a ticket opens. */
export const queryOf = (t: Ticket): string =>
  t.subject.replace(/[^\w\s]/g, " ");

/** Pure: a draft with a help article added to it (on a new line when there is text). */
export function withArticle(draft: string, article: Article): string {
  const line = `${article.title}: ${article.snippet}`;
  return draft.trim()
    ? `${draft.replace(/\s+$/, "")}\n\n${line}`
    : `This article should help. ${line}`;
}
