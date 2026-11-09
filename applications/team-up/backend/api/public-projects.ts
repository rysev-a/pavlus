/**
 * The public project catalog (`GET /api/public/projects`) and the public
 * project page (`GET /api/public/project/:slug`) — the original teamUP's
 * `public_startups.rs`.
 *
 * The catalog filters the projects and their open slots (the slot filters
 * work on the vacancies: a project whose slots all fail is dropped), sorts
 * them and answers one page of cards — plus the chips of the filter form,
 * every chip carrying the address that adds or removes its value and keeps
 * the other filters. The detail answers one project with its team and its
 * positions; a cancelled project is a 404 for everybody but its owner.
 */

import {
  type HttpReq,
  httpEffector,
  oneOf,
  requestsEffector,
  rowsOf,
  type ServerState,
} from "@pavlus/backend";
import type { Effect, Message } from "@pavlus/core";
import { AuthService, type SessionUser } from "../db/services/auth-service.ts";
import {
  type CardRow,
  type CardSlotRow,
  type DetailRow,
  PublicProjectService,
  type ViewerRow,
} from "../db/services/public-project-service.ts";
import { type Locale, localeOf, Tr } from "../i18n/mod.ts";
import {
  CATALOG_PER_PAGE,
  links,
  pagingOf,
  type PageLink,
  rangeOf,
  requestedPage,
} from "../lib/paging.ts";
import { catalogHref, type Filters, parseFilters } from "../lib/urls.ts";
import {
  avatarHueClass,
  budgetLabel,
  deadlineLabel,
  formatDate,
  kindLabel,
  matchClass,
  payLabel,
  statusLabel,
  workModeLabel,
} from "../lib/views.ts";
import { computeMatch } from "../match.ts";
import { SESSION_COOKIE, sliceOf } from "./session.ts";

/** The catalog's kinds, work modes, grades and pays (the original's). */
const KINDS = ["startup", "company", "part-time"];
const MODES = ["remote", "office", "hybrid"];
const GRADES = ["junior", "middle", "senior", "lead"];
const PAYS = ["paid", "equity", "unpaid"];

/** The query keys that may repeat (the original's `CatalogParams` lists). */
const MULTI_KEYS = [
  "domain",
  "kind",
  "mode",
  "role",
  "grade",
  "pay",
  "skill",
] as const;

/** One chip of the filter form. */
interface Chip {
  value: string;
  label: string;
  checked: boolean;
  href: string;
}

/** One slot of a card, as the card shows it. */
interface SlotView {
  id: number;
  title: string;
  description: string;
  skillsLine: string;
  payLabel: string;
  matched: { percent: number; gradeOk: boolean; why: string } | null;
  matchClass: string;
}

/** One card of the catalog, as the answer shows it. */
interface CardView {
  slug: string;
  name: string;
  tagline: string;
  tags: string[];
  statusLabel: string;
  status: string;
  kind: string;
  kindLabel: string;
  workModeLabel: string;
  city: string;
  budgetLabel: string;
  deadlineLabel: string;
  ownerName: string;
  ownerRole: string;
  openSlots: number;
  isMember: boolean;
  favorite: boolean;
  slots: SlotView[];
}

/** The answer of the catalog (`ProjectsSlice` in app/state.ts). */
interface CatalogAnswer {
  q: string;
  filters: Record<string, Chip[]>;
  checked: Record<string, string[]>;
  sort: string;
  canMatch: boolean;
  meProfessions: string[];
  countLabel: string;
  cards: CardView[];
  pager: PageLink[];
  saved: { id: number; name: string; href: string }[];
  filtered: boolean;
  /** The texts of the page (the translation lives in the backend). */
  strings: Record<string, string>;
}

export class PublicProjectsAPI {
  /** GET /api/public/projects?kind=company&q=rust */
  "projects.catalog"(message: Message): Effect[] {
    const req = message.payload as HttpReq;
    const effects: Effect[] = [
      requestsEffector.set("raw", rawQueryOf(req.query)),
      requestsEffector.set("locale", localeOf(req)),
    ];
    const token = req.cookies?.[SESSION_COOKIE];
    if (!token) {
      // a guest: the catalog answers without the viewer's data
      effects.push(
        PublicProjectService.cards(null),
        PublicProjectService.viewer(null),
      );
      return effects;
    }
    effects.push(
      requestsEffector.set("token", token),
      AuthService.sessionUser(token, "projects.catalog.sessionUser"),
    );
    return effects;
  }

  /** The viewer is known: the catalog reads the projects and the viewer. */
  "projects.catalog.sessionUser.onSuccess"(message: Message): Effect[] {
    const user = oneOf<SessionUser>(message);
    const viewerId = user?.id ?? null;
    return [
      requestsEffector.set("viewerId", viewerId),
      PublicProjectService.cards(viewerId),
      PublicProjectService.viewer(viewerId),
    ];
  }

  /** The projects are here; the viewer's data may still be on its way. */
  "projects.catalog.cards.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const cards = rowsOf<CardRow>(message);
    const slice = sliceOf(message, state);
    const viewer = slice.viewer as ViewerRow | undefined;
    const merge = requestsEffector.merge({ cards });
    if (!viewer) return [merge];
    return [
      merge,
      httpEffector.makeResponse(200, catalogAnswer(slice, cards, viewer)),
    ];
  }

  /** The viewer's data is here; the projects may still be on their way. */
  "projects.catalog.viewer.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const viewer = oneOf<ViewerRow>(message) ?? emptyViewer();
    const slice = sliceOf(message, state);
    const cards = slice.cards as CardRow[] | undefined;
    const merge = requestsEffector.merge({ viewer });
    if (!cards) return [merge];
    return [
      merge,
      httpEffector.makeResponse(200, catalogAnswer(slice, cards, viewer)),
    ];
  }

  "projects.catalog.failed"(): Effect[] {
    return [httpEffector.makeResponse(500, { error: "internal error" })];
  }

  /** GET /api/public/project/:slug */
  "projects.detail"(message: Message): Effect[] {
    const req = message.payload as HttpReq;
    const slug = req.params.slug ?? "";
    const effects: Effect[] = [
      requestsEffector.set("slug", slug),
      requestsEffector.set("locale", localeOf(req)),
    ];
    const token = req.cookies?.[SESSION_COOKIE];
    if (!token) {
      effects.push(PublicProjectService.detail(slug));
      return effects;
    }
    effects.push(
      requestsEffector.set("token", token),
      AuthService.sessionUser(token, "projects.detail.sessionUser"),
    );
    return effects;
  }

  /** The viewer is known: the project page may show it to its owner. */
  "projects.detail.sessionUser.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const user = oneOf<SessionUser>(message);
    const slice = sliceOf(message, state);
    const slug = (slice.slug as string | undefined) ?? "";
    return [
      requestsEffector.set("viewerId", user?.id ?? null),
      PublicProjectService.detail(slug),
    ];
  }

  /** The project: its team, its positions, its texts. */
  "projects.detail.row.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const row = oneOf<DetailRow>(message);
    const slice = sliceOf(message, state);
    const tr = new Tr((slice.locale as Locale | undefined) ?? "en");
    const viewerId = (slice.viewerId as number | null | undefined) ?? null;
    if (!row) {
      return [httpEffector.makeResponse(404, { project: null })];
    }
    const project = detailAnswer(tr, row, viewerId);
    if (!project) {
      // a cancelled project is a 404 for everybody but its owner
      return [httpEffector.makeResponse(404, { project: null })];
    }
    return [httpEffector.makeResponse(200, { project })];
  }

  "projects.detail.failed"(): Effect[] {
    return [httpEffector.makeResponse(500, { error: "internal error" })];
  }
}

/* ------------------------------------------------------------- the catalog */

/** The catalog's answer: the chips, the cards, the pager. */
function catalogAnswer(
  slice: Record<string, unknown>,
  cards: CardRow[],
  viewer: ViewerRow,
): CatalogAnswer {
  const tr = new Tr((slice.locale as Locale | undefined) ?? "en");
  const raw = (slice.raw as string | undefined) ?? "";
  const viewerId = (slice.viewerId as number | null | undefined) ?? null;
  const filters = parseFilters(raw, MULTI_KEYS);

  const q = first(filters, "q");
  const domain = many(filters, "domain");
  const kind = many(filters, "kind");
  const mode = many(filters, "mode");
  const role = many(filters, "role");
  const grade = many(filters, "grade");
  const pay = many(filters, "pay");
  const skill = many(filters, "skill");
  const looking = first(filters, "looking");
  const scope = first(filters, "scope");
  const saved = first(filters, "saved");
  const asked = first(filters, "sort");

  const canMatch = viewer.professions.length > 0;
  const sort = sortOf(asked, canMatch);
  const favorites = new Set(viewer.favorites);

  // the filters of the addresses: what the visitor has chosen so far
  const active: Filters = {
    q: q ? [q] : [],
    domain,
    kind,
    mode,
    role,
    grade,
    pay,
    skill,
    looking: looking === "1" ? ["1"] : [],
    scope: scope === "mine" ? ["mine"] : [],
    saved: saved === "1" ? ["1"] : [],
    sort: asked ? [asked] : [],
  };

  const chip = (value: string, label: string, key: string): Chip => ({
    value,
    label,
    checked: many(filters, key).includes(value),
    href: toggleHref(active, key, value),
  });

  // the options come from everything visible, not from the filtered subset
  const domains = distinct(cards.flatMap((c) => c.tags));
  const roleNames = new Map<string, string>();
  for (const card of cards) {
    for (const slot of card.slots) {
      if (!roleNames.has(slot.profession)) {
        roleNames.set(slot.profession, slot.professionName);
      }
    }
  }
  // the roles are sorted by the name as shown
  const roles = [...roleNames.keys()].sort((a, b) =>
    compare(tr.tr(roleNames.get(a) ?? a), tr.tr(roleNames.get(b) ?? b)),
  );
  const skills = skillOrder(cards, viewer.tree);

  const chips: Record<string, Chip[]> = {
    kind: KINDS.map((k) => chip(k, kindLabel(tr, k), "kind")),
    mode: MODES.map((m) => chip(m, workModeLabel(tr, m), "mode")),
    domain: domains.map((d) => chip(d, d, "domain")),
    role: roles.map((r) => chip(r, tr.tr(roleNames.get(r) ?? r), "role")),
    pay: PAYS.map((p) => chip(p, payLabel(tr, p, null, null, null), "pay")),
    grade: GRADES.map((g) => chip(g, g, "grade")),
    skill: skills.map((s) => chip(s.slug, tr.tr(s.name), "skill")),
    // the three checks of the form: one chip each, the address toggles it
    looking: [
      {
        value: "1",
        label: tr.tr("Only with open slots"),
        checked: looking === "1",
        href: toggleHref(active, "looking", "1"),
      },
    ],
    scope: [
      {
        value: "mine",
        label: tr.tr("Only mine"),
        checked: scope === "mine",
        href: toggleHref(active, "scope", "mine"),
      },
    ],
    saved: [
      {
        value: "1",
        label: tr.tr("Only saved"),
        checked: saved === "1",
        href: toggleHref(active, "saved", "1"),
      },
    ],
  };

  const checked: Record<string, string[]> = {
    domain,
    kind,
    mode,
    role,
    grade,
    pay,
    skill,
    looking: looking === "1" ? ["1"] : [],
    scope: scope === "mine" ? ["mine"] : [],
    saved: saved === "1" ? ["1"] : [],
  };

  // filter and sort on the cheap data, then build the views of one page
  const hasSlotFilter =
    role.length > 0 || grade.length > 0 || pay.length > 0 || skill.length > 0;
  const hits: Hit[] = [];
  for (const card of cards) {
    if (!matchesText(tr, card, q)) continue;
    if (domain.length > 0 && !card.tags.some((t) => domain.includes(t))) {
      continue;
    }
    if (kind.length > 0 && !kind.includes(card.kind)) continue;
    if (mode.length > 0 && !mode.includes(card.workMode)) continue;
    const isMember = card.ownerId === viewerId || card.viewerJoined;
    if (scope === "mine" && !isMember) continue;
    if (saved === "1" && !favorites.has(card.slug)) continue;
    // the slot filters work on the vacancies; the card shows the ones that passed
    const shown = card.slots.filter((slot) =>
      slotPasses(slot, { role, grade, pay, skill }),
    );
    if ((hasSlotFilter || looking === "1") && shown.length === 0) {
      continue;
    }
    hits.push({ card, shown, isMember });
  }

  const myProfessions = viewer.professions.map((p) => ({
    professionId: p.professionId,
    bucket: p.bucket,
  }));
  const mySkills = new Map(viewer.skills.map((s) => [s.skillId, s.level]));
  const withMatch = hits.map((hit) => {
    const slots = hit.shown.map((slot) => {
      const matched = canMatch
        ? matchOf(tr, myProfessions, viewer.skills, mySkills, slot)
        : null;
      return { slot, matched };
    });
    const best = slots.reduce(
      (top, one) => Math.max(top, one.matched?.percent ?? -1),
      -1,
    );
    return { ...hit, slots, best };
  });

  if (sort === "match") {
    withMatch.sort(
      (a, b) => b.best - a.best || b.card.createdAt - a.card.createdAt,
    );
  } else if (sort === "vacancies") {
    withMatch.sort(
      (a, b) =>
        b.card.slots.length - a.card.slots.length ||
        b.card.createdAt - a.card.createdAt,
    );
  } else {
    withMatch.sort((a, b) => b.card.createdAt - a.card.createdAt);
  }

  const paging = pagingOf(
    withMatch.length,
    requestedPage(raw),
    CATALOG_PER_PAGE,
  );
  const pager = links(paging, "/projects", raw, {
    previous: tr.tr("Previous"),
    next: tr.tr("Next"),
  });
  const { from, to } = rangeOf(paging);
  const shown = withMatch.slice(from, to);

  const filtered =
    q.trim() !== "" ||
    domain.length > 0 ||
    kind.length > 0 ||
    mode.length > 0 ||
    hasSlotFilter ||
    looking === "1" ||
    scope === "mine" ||
    saved === "1";

  return {
    q,
    filters: chips,
    checked,
    sort,
    canMatch,
    meProfessions: viewer.professions.map(
      (p) => `${capitalize(p.bucket)} ${tr.tr(p.name)}`,
    ),
    countLabel: countLabel(tr, withMatch.length),
    cards: shown.map((hit) =>
      cardAnswer(
        tr,
        hit.card,
        hit.slots,
        hit.isMember,
        favorites.has(hit.card.slug),
      ),
    ),
    pager,
    saved: viewer.saved.map((s) => ({
      id: s.id,
      name: s.name,
      href: `/projects?${s.query}`,
    })),
    filtered,
    // the texts of the page (the translation lives in the backend)
    strings: {
      title: tr.tr("Project search"),
      search: tr.tr("Search"),
      placeholder: tr.tr("name, description or author"),
      kind: tr.tr("Kind"),
      where: tr.tr("Where"),
      category: tr.tr("Category"),
      role: tr.tr("Slot profession"),
      pay: tr.tr("Pay"),
      grade: tr.tr("Grade"),
      skill: tr.tr("Slot skill"),
      sort: tr.tr("Sort"),
      byMatch: tr.tr("by match"),
      newest: tr.tr("newest first"),
      vacancies: tr.tr("most vacancies"),
      find: tr.tr("Find"),
      myProfile: tr.tr("My profile"),
      matchTitle: tr.tr("Match with slots"),
      signInHint: tr.tr(
        "Sign in and fill in your profile — we will show how well you fit each slot.",
      ),
      savedSearches: tr.tr("Saved searches"),
      nothingSaved: tr.tr("Nothing saved yet."),
      savedName: tr.tr("Name of the search"),
      saveSearch: tr.tr("Save this search"),
      delete: tr.tr("Delete"),
      looking: tr.tr("Looking for people"),
      onTeam: tr.tr("You are on the team"),
      openSlots: tr.tr("Open slots"),
      details: tr.tr("Details"),
      match: tr.tr("match"),
      nothingFound: tr.tr("Nothing found"),
      loosen: tr.tr(
        "Try loosening the filters, for example remove the grade or the skill.",
      ),
      resetFilters: tr.tr("Reset filters"),
      noProjects: tr.tr("No projects yet"),
      checkLater: tr.tr("Check back later."),
      pages: tr.tr("Pages"),
    },
  };
}

/** One project that passed the filters. */
interface Hit {
  card: CardRow;
  shown: CardSlotRow[];
  isMember: boolean;
}

/** The card of one project. */
function cardAnswer(
  tr: Tr,
  card: CardRow,
  slots: { slot: CardSlotRow; matched: Matched | null }[],
  isMember: boolean,
  favorite: boolean,
): CardView {
  return {
    slug: card.slug,
    name: card.name,
    tagline: card.tagline,
    tags: card.tags,
    statusLabel: statusLabel(tr, card.status),
    status: card.status,
    kind: card.kind,
    kindLabel: kindLabel(tr, card.kind),
    workModeLabel: card.workMode ? workModeLabel(tr, card.workMode) : "",
    city: card.city,
    budgetLabel: budgetLabel(tr, card.budget, card.budgetCurrency),
    deadlineLabel: deadlineLabel(tr, card.deadline),
    ownerName: card.ownerName,
    ownerRole: ownerRole(tr, card),
    openSlots: card.slots.length,
    isMember,
    favorite,
    slots: slots.map((one) => ({
      id: one.slot.id,
      title: `${tr.tr(one.slot.professionName)} · ${one.slot.bucket}`,
      description: one.slot.description,
      skillsLine: one.slot.skills.length
        ? one.slot.skills
            .map((sk) => `${tr.tr(sk.name)} ${sk.level}+`)
            .join(" · ")
        : tr.tr("no skills specified"),
      payLabel: one.slot.pay
        ? payLabel(
            tr,
            one.slot.pay,
            one.slot.payFrom,
            one.slot.payTo,
            one.slot.currency,
          )
        : "",
      matched: one.matched,
      matchClass: one.matched ? matchClass(one.matched.percent) : "",
    })),
  };
}

/** The viewer's match for one slot (the original's `compute_match`). */
interface Matched {
  percent: number;
  gradeOk: boolean;
  why: string;
}

function matchOf(
  tr: Tr,
  professions: { professionId: number; bucket: string }[],
  skills: { skillId: number; level: number }[],
  mySkills: Map<number, number>,
  slot: CardSlotRow,
): Matched | null {
  const result = computeMatch(professions, skills, {
    slotId: slot.id,
    professionId: slot.professionId,
    bucket: slot.bucket,
    skills: slot.skills.map((sk) => ({ skillId: sk.skillId, level: sk.level })),
  });
  if (!result) return null;
  // a slot that names no skills is a perfect match (the original's rule)
  const percent = result.percent ?? 100;
  const lines = slot.skills.map((sk, i) => {
    const mine = mySkills.get(sk.skillId) ?? 0;
    return `${tr.tr(sk.name)} ${result.details[i] ?? ""}${mine >= sk.level ? " ✓" : ""}`;
  });
  lines.push(result.gradeOk ? tr.tr("grade ✓") : tr.tr("grade too low"));
  return { percent, gradeOk: result.gradeOk, why: lines.join(" · ") };
}

/** The slot filters work on the vacancies (any of the chosen values). */
function slotPasses(
  slot: CardSlotRow,
  filters: { role: string[]; grade: string[]; pay: string[]; skill: string[] },
): boolean {
  if (filters.role.length > 0 && !filters.role.includes(slot.profession)) {
    return false;
  }
  if (filters.grade.length > 0 && !filters.grade.includes(slot.bucket)) {
    return false;
  }
  if (filters.pay.length > 0 && !filters.pay.includes(slot.pay ?? "")) {
    return false;
  }
  if (
    filters.skill.length > 0 &&
    !slot.skills.some((sk) => filters.skill.includes(sk.slug))
  ) {
    return false;
  }
  return true;
}

/** Free text over the name, the tagline, the tags, the owner and the roles. */
function matchesText(tr: Tr, card: CardRow, q: string): boolean {
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = [
    card.name,
    card.tagline,
    card.tags.join(" "),
    card.ownerName,
    ...card.slots.flatMap((s) => [s.professionName, tr.tr(s.professionName)]),
  ]
    .join(" ")
    .toLowerCase();
  return words.every((word) => hay.includes(word));
}

/** The founder's role on the card ("Designer · senior"); empty without one. */
function ownerRole(tr: Tr, card: CardRow): string {
  if (card.kind !== "startup") return "";
  const profession = card.ownerProfession ?? "";
  if (!profession) return "";
  const bucket = card.ownerBucket ?? "";
  return bucket ? `${tr.tr(profession)} · ${bucket}` : tr.tr(profession);
}

/** The sort of the list: `match` for a viewer with a profession, else `new`. */
function sortOf(asked: string, canMatch: boolean): string {
  if (asked === "match" && canMatch) return "match";
  if (asked === "vacancies") return "vacancies";
  if (asked === "new") return "new";
  return canMatch ? "match" : "new";
}

/** The count of the list: "Found: 12 projects". */
function countLabel(tr: Tr, n: number): string {
  // the plural helper leaves the English `{n}` alone — put the number in
  return tr
    .trPlural("Found: {n} project", "Found: {n} projects", n)
    .replace(/\{n\}/g, String(n));
}

/* ------------------------------------------------------------- the detail */

/** One project of the public page. */
function detailAnswer(
  tr: Tr,
  row: DetailRow,
  viewerId: number | null,
): Record<string, unknown> | null {
  if (row.status === "cancelled" && row.ownerId !== viewerId) return null;
  const team: {
    slug: string;
    name: string;
    role: string;
    avatarClass: string;
  }[] = [
    {
      slug: row.ownerSlug,
      name: row.ownerName,
      role: founderRole(tr, row),
      avatarClass: avatarClass(row.ownerSlug),
    },
  ];
  for (const slot of row.slots) {
    if (slot.status !== "joined" || !slot.memberSlug) continue;
    team.push({
      slug: slot.memberSlug,
      name: slot.memberName ?? "",
      role: `${tr.tr(slot.professionName)} · ${slot.bucket}`,
      avatarClass: avatarClass(slot.memberSlug),
    });
  }
  return {
    slug: row.slug,
    name: row.name,
    tagline: row.tagline,
    description: row.description,
    tags: row.tags,
    statusLabel: statusLabel(tr, row.status),
    status: row.status,
    kindLabel: kindLabel(tr, row.kind),
    kind: row.kind,
    workModeLabel: row.workMode ? workModeLabel(tr, row.workMode) : "",
    city: row.city,
    website: row.website,
    budgetLabel: budgetLabel(tr, row.budget, row.budgetCurrency),
    deadlineLabel: deadlineLabel(tr, row.deadline),
    date: formatDate(tr, row.createdOn),
    ownerName: row.ownerName,
    ownerSlug: row.ownerSlug,
    openCount: row.slots.filter((s) => s.status === "open").length,
    team,
    slots: row.slots.map((slot) => ({
      id: slot.id,
      title: `${tr.tr(slot.professionName)} · ${slot.bucket}`,
      description: slot.description,
      skills: slot.skills.map((sk) => ({
        name: tr.tr(sk.name),
        level: sk.level,
      })),
      payLabel: slot.pay
        ? payLabel(tr, slot.pay, slot.payFrom, slot.payTo, slot.currency)
        : "",
      status: slotStatus(tr, slot.status),
      memberName: slot.memberName ?? "",
      memberSlug: slot.memberSlug ?? "",
    })),
  };
}

/** The founder's role in the team ("Founder · Designer · senior"). */
function founderRole(tr: Tr, row: DetailRow): string {
  const parts = [tr.tr("Founder")];
  const profession = row.ownerProfession ?? "";
  if (profession) parts.push(tr.tr(profession));
  const bucket = row.ownerBucket ?? "";
  if (bucket) parts.push(bucket);
  return parts.join(" · ");
}

/**
 * The hue of an avatar: the helper's own base is empty, the class of the
 * element is in the template (`startup-team__avatar`).
 */
function avatarClass(slug: string): string {
  return avatarHueClass("", slug).trim();
}

/** The status of a position: "Open", "Invitation sent" or "Taken". */
function slotStatus(tr: Tr, status: string): string {
  if (status === "open" || status === "left") return tr.tr("Open");
  if (status === "invited") return tr.tr("Invitation sent");
  return tr.tr("Taken");
}

/* ---------------------------------------------------------------- helpers */

/** The request's query as a raw string ("kind=company&kind=startup"). */
function rawQueryOf(
  query: Record<string, string | string[]> | undefined,
): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(query ?? {})) {
    for (const one of Array.isArray(value) ? value : [value]) {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(one)}`);
    }
  }
  return parts.join("&");
}

/**
 * The address of a chip's click: the value is added when it is not there and
 * removed when it is; the other filters stay. (lib/urls.ts's `toggleHref` is
 * bound to the members list — its path and its key order — so the catalog
 * toggles with `catalogHref`, the catalog's own order.)
 */
function toggleHref(filters: Filters, key: string, value: string): string {
  const values = filters[key] ?? [];
  const next: Filters = { ...filters };
  next[key] = values.includes(value)
    ? values.filter((v) => v !== value)
    : [...values, value];
  return catalogHref(next);
}

/** The first value of a filter (the ones that may repeat come as a list). */
function first(filters: Filters, key: string): string {
  return (filters[key] ?? [])[0] ?? "";
}

/** Every value of a filter. */
function many(filters: Filters, key: string): string[] {
  return filters[key] ?? [];
}

/** The distinct values of a list, in the order they came. */
function distinct(values: string[]): string[] {
  const out: string[] = [];
  for (const value of values) if (!out.includes(value)) out.push(value);
  return out;
}

/**
 * The skills the slots ask for, in the order of the skill tree: the category
 * of the tree first (its root node), then the directory itself.
 */
function skillOrder(
  cards: CardRow[],
  tree: ViewerRow["tree"],
): { slug: string; name: string }[] {
  const byId = new Map(tree.map((node) => [node.id, node]));
  const index = new Map(tree.map((node, i) => [node.slug, i]));
  const rootOf = (slug: string): { index: number; name: string } => {
    let node = tree.find((one) => one.slug === slug);
    if (!node) return { index: Number.MAX_SAFE_INTEGER, name: slug };
    while (node.parentId !== null) {
      const parent = byId.get(node.parentId);
      if (!parent) break;
      node = parent;
    }
    return {
      index: index.get(node.slug) ?? Number.MAX_SAFE_INTEGER,
      name: node.name,
    };
  };
  const used = new Map<string, string>();
  for (const card of cards) {
    for (const slot of card.slots) {
      for (const skill of slot.skills) {
        if (!used.has(skill.slug)) used.set(skill.slug, skill.name);
      }
    }
  }
  return [...used.entries()]
    .map(([slug, name]) => ({ slug, name, root: rootOf(slug) }))
    .sort((a, b) => {
      if (a.root.index !== b.root.index) return a.root.index - b.root.index;
      return (index.get(a.slug) ?? 0) - (index.get(b.slug) ?? 0);
    })
    .map(({ slug, name }) => ({ slug, name }));
}

/** A viewer's data that is empty (a guest). */
function emptyViewer(): ViewerRow {
  return { professions: [], skills: [], favorites: [], saved: [], tree: [] };
}

/** "senior" → "Senior". */
function capitalize(text: string): string {
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}

/** The comparison of two labels (the original's sort by the shown name). */
function compare(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}
