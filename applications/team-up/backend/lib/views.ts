/**
 * The small helpers the public pages share: the initials of a name, the hue
 * of an avatar, the date and the excerpt formats, the role of a member. The
 * original teamUP had them in `routes.rs` (`initials`, `avatar_hue_class`,
 * `format_date`, `excerpt`, `role_css_class`).
 */

import { type Tr } from "../i18n/mod.ts";

/** Up to two first letters of the words of a name. */
export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0] ?? "")
    .join("")
    .toUpperCase();
}

/** The hue of an avatar: the sum of the slug's bytes, six buckets. */
export function avatarHueClass(base: string, slug: string): string {
  let sum = 0;
  for (const byte of new TextEncoder().encode(slug)) sum += byte;
  return `${base} avatar-hue-${sum % 6}`;
}

const MONTHS_EN = [
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
];

const MONTHS_RU = [
  "янв",
  "фев",
  "мар",
  "апр",
  "мая",
  "июн",
  "июл",
  "авг",
  "сен",
  "окт",
  "ноя",
  "дек",
];

/** A date as the original wrote it: `Sep 12, 2026` (en) / `12.09.2026` (ru). */
export function formatDate(tr: Tr, iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (tr.locale === "ru") {
    return `${String(day).padStart(2, "0")}.${String(month).padStart(2, "0")}.${year}`;
  }
  return `${MONTHS_EN[month - 1] ?? ""} ${day}, ${year}`;
}

/** The month name alone (the Russian one is a genitive form). */
export function formatMonth(tr: Tr, iso: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const month = Number(m[2]);
  return tr.locale === "ru"
    ? `${MONTHS_RU[month - 1] ?? ""} ${m[1]}`
    : `${MONTHS_EN[month - 1] ?? ""} ${m[1]}`;
}

/** The first words of a text, cut at a word and closed with an ellipsis. */
export function excerpt(text: string, limit: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= limit) return clean;
  const cut = clean.slice(0, limit);
  const space = cut.lastIndexOf(" ");
  return `${(space > 0 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** The css class of a member's status: `founder`, `in-search`, `open`, `none`. */
export function roleCssClass(status: string): string {
  switch (status) {
    case "searching":
      return "in-search";
    case "open":
      return "open";
    case "founder":
      return "founder";
    default:
      return "none";
  }
}

/** The text of a member's status (the original's `status_kind`). */
export function roleOf(tr: Tr, status: string): string {
  switch (status) {
    case "searching":
      return tr.tr("Looking for a project");
    case "open":
      return tr.tr("Open to offers");
    case "founder":
      return tr.tr("Founder");
    default:
      return tr.tr("Not looking");
  }
}

/** The kind of a project: `Startup`, `Organization`, `Part-time work`. */
export function kindLabel(tr: Tr, kind: string): string {
  switch (kind) {
    case "company":
      return tr.tr("Organization");
    case "part-time":
      return tr.tr("Part-time work");
    default:
      return tr.tr("Startup");
  }
}

/** The work mode of a project: `Remote`, `In the office`, `Hybrid`. */
export function workModeLabel(tr: Tr, mode: string): string {
  switch (mode) {
    case "office":
      return tr.tr("In the office");
    case "hybrid":
      return tr.tr("Hybrid");
    default:
      return tr.tr("Remote");
  }
}

/** The status of a project: `Active`, `Archived`, `Closed`, `Cancelled`. */
export function statusLabel(tr: Tr, status: string): string {
  switch (status) {
    case "paused":
      return tr.tr("Archived");
    case "done":
      return tr.tr("Closed");
    case "cancelled":
      return tr.tr("Cancelled");
    default:
      return tr.tr("Active");
  }
}

/** The pay of a slot: `Paid · 150,000–250,000 RUB / month`, `Unpaid`, … */
export function payLabel(
  tr: Tr,
  pay: string | null,
  from: number | null,
  to: number | null,
  currency: string | null,
): string {
  const money = (n: number): string => n.toLocaleString("en-US");
  if (pay === "paid" && from !== null && to !== null && currency) {
    return tr.trArgs("Paid · {from}–{to} {currency} / month", {
      from: money(from),
      to: money(to),
      currency,
    });
  }
  if (pay === "paid" && from !== null && currency) {
    return tr.trArgs("Paid · from {from} {currency} / month", {
      from: money(from),
      currency,
    });
  }
  if (pay === "paid") return tr.tr("Paid");
  if (pay === "equity") return tr.tr("Equity");
  if (pay === "unpaid") return tr.tr("Unpaid");
  // the slot says nothing about the pay: the line stays empty (the original)
  return "";
}

/** The budget of a project: `Budget: 150,000 RUB`. */
export function budgetLabel(
  tr: Tr,
  budget: number | null,
  currency: string | null,
): string {
  if (budget === null) return "";
  return tr.trArgs("Budget: {amount} {currency}", {
    amount: budget.toLocaleString("en-US"),
    currency: currency ?? "",
  });
}

/** The deadline of a project: `Deadline: Dec 1, 2026`. */
export function deadlineLabel(tr: Tr, deadline: string | null): string {
  if (!deadline) return "";
  return tr.trArgs("Deadline: {date}", { date: formatDate(tr, deadline) });
}

/** The match class of a percent: `is-good` (80+), `is-mid` (50+), `is-low`. */
export function matchClass(percent: number): string {
  if (percent >= 80) return "is-good";
  if (percent >= 50) return "is-mid";
  return "is-low";
}
