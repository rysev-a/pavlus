import { initials, type Tone } from "../admin-shell/shell.ts";
import { daysBetween } from "../month-grid/dates.ts";

export type ContactStatus = "customer" | "prospect" | "lead" | "churned";

export interface Contact {
  id: string;
  name: string;
  role: string;
  company: string;
  email: string;
  phone: string;
  status: ContactStatus;
  tags: string[];
  /** ISO day of the last conversation. */
  last: string;
}

export interface ContactView {
  id: string;
  name: string;
  initials: string;
  role: string;
  company: string;
  email: string;
  phone: string;
  status: string;
  tone: Tone;
  tags: string[];
  last: string;
  selected: boolean;
}

export const STATUS_TONE: Record<ContactStatus, Tone> = {
  customer: "success",
  prospect: "info",
  lead: "warning",
  churned: "muted",
};

/** Pure: how long ago, in words: `today`, `yesterday`, `5 days ago`, `3 weeks ago`. */
export function agoText(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
}

/** Pure: the cards to show for a list of contacts. */
export function contactViews(
  list: Contact[],
  selected: string,
  today: string,
): ContactView[] {
  return list.map((c) => ({
    id: c.id,
    name: c.name,
    initials: initials(c.name),
    role: c.role,
    company: c.company,
    email: c.email,
    phone: c.phone,
    status: c.status,
    tone: STATUS_TONE[c.status],
    tags: c.tags,
    last: `Last talked ${agoText(daysBetween(c.last, today))}`,
    selected: c.id === selected,
  }));
}

/** Pure: the contacts that match a status (`all` passes everything) and a search text. */
export function searchContacts(
  list: Contact[],
  query: string,
  status: string,
): Contact[] {
  const q = query.trim().toLowerCase();
  return list.filter(
    (c) =>
      (status === "all" || c.status === status) &&
      (!q ||
        `${c.name} ${c.company} ${c.role} ${c.email} ${c.tags.join(" ")}`
          .toLowerCase()
          .includes(q)),
  );
}
