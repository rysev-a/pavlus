/**
 * The members (api): the public directory (`/users`) and a member's page
 * (`/users/{slug}`). The directory answers the filter chips (level, labels,
 * city, status), the sort row, the cards of the members and the pager; the
 * member page answers the card, the rated skills grouped by profession and
 * the viewer's relation to the member (the friend button).
 *
 * The chips are plain links with a server-computed address: a click on a
 * selected chip removes its value (the original's `toggle_href`). The
 * addresses come from `backend/lib/urls.ts`, the pager from
 * `backend/lib/paging.ts` — the same helpers the original's `routes.rs` used.
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
import { AuthService } from "../db/services/auth-service.ts";
import {
  collectUnique,
  kindStatus,
  levelRank,
  matchesCities,
  matchesLabels,
  matchesLevels,
  matchesStatuses,
  memberCard,
  type MemberRow,
  type MemberSkillRow,
  MemberService,
  skillGroups,
  sortMembers,
  sortOf,
  STATUS_KINDS,
} from "../db/services/member-service.ts";
import { type Locale, localeOf, trOf } from "../i18n/mod.ts";
import {
  DIRECTORY_PER_PAGE,
  links,
  pagingOf,
  requestedPage,
} from "../lib/paging.ts";
import { formatDate, roleOf } from "../lib/views.ts";
import { parseFilters, sortHref, toggleHref } from "../lib/urls.ts";
import { SESSION_COOKIE, sliceOf } from "./session.ts";

/** The sort buttons of the directory: the value and the text of the button. */
const SORT_OPTIONS: [string, string][] = [
  ["created", "By registration date"],
  ["updated", "By profile update"],
  ["last_login", "By last sign-in"],
  ["age", "By age"],
];

/** The level chips of the directory: the value and the text of the chip. */
const LEVEL_OPTIONS = ["Junior", "Middle", "Senior", "Lead"];

/** The relation of a member to the viewer, as the friend button shows it. */
const relationOf = (status: string | undefined): string => {
  switch (status) {
    case "waiting":
    case "incoming":
    case "friends":
      return status;
    default:
      return "none";
  }
};

/**
 * The query of a request, as a string ("a=1&a=2"): the payload carries it
 * parsed, the shared helpers of the port want it raw.
 */
const rawQueryOf = (
  query: Record<string, string | string[]> | undefined,
): string => {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(query ?? {})) {
    for (const one of Array.isArray(value) ? value : [value]) {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(one)}`);
    }
  }
  return parts.join("&");
};

/** The request's parked slice. */
const parked = (
  message: Message,
  state: ServerState,
): Record<string, unknown> => sliceOf(message, state);

/** The translator of the parked language. */
const translatorOf = (lang: Locale) => trOf({ cookies: { lang } });

/** The empty member page (the answer of an unknown slug). */
const emptyMember = (slug: string) => ({
  user: null,
  skillGroups: [],
  since: "",
  friend: { slug, relation: "none" },
});

export class MembersAPI {
  /** GET /api/public/members — the directory. */
  "members.list"(message: Message): Effect[] {
    const req = message.payload as HttpReq;
    const raw = rawQueryOf(req.query);
    return [
      requestsEffector.merge({ raw, lang: localeOf(req) }),
      MemberService.all(),
    ];
  }

  "members.rows.onSuccess"(message: Message, state: ServerState): Effect[] {
    const rows = rowsOf<MemberRow>(message);
    const { raw, lang } = parked(message, state) as {
      raw: string;
      lang: Locale;
    };
    const tr = translatorOf(lang);
    const filters = parseFilters(raw);

    // the selected values of the query
    const labels = filters.labels ?? [];
    const cities = filters.cities ?? [];
    const statuses = (filters.status ?? []).filter((kind) =>
      STATUS_KINDS.includes(kind),
    );
    const levels = filters.level ?? [];
    const ranks = levels
      .map((level) => levelRank(level))
      .filter((rank): rank is number => rank !== undefined);
    const sort = sortOf(filters.sort?.[0]);

    // filter, sort and cut the page out
    const hits = sortMembers(
      rows.filter(
        (row) =>
          matchesLevels(row, labels, ranks) &&
          matchesLabels(row, labels) &&
          matchesCities(row, cities) &&
          matchesStatuses(row, statuses),
      ),
      sort,
    );
    const paging = pagingOf(
      hits.length,
      requestedPage(raw),
      DIRECTORY_PER_PAGE,
    );
    const from = Math.min((paging.page - 1) * paging.perPage, hits.length);
    const to = Math.min(from + paging.perPage, hits.length);

    // the option lists are built from the WHOLE collection, not from the
    // filtered subset (the same rule as the blog's tag chips)
    const allLabels = collectUnique(rows.flatMap((row) => row.labels));
    const allCities = collectUnique(rows.map((row) => row.city));
    const option = (
      value: string,
      checked: boolean,
      key: string,
    ): {
      value: string;
      label: string;
      checked: boolean;
      href: string;
    } => ({
      value,
      label: tr.tr(value),
      checked,
      href: toggleHref(filters, key, value),
    });

    return [
      httpEffector.makeResponse(200, {
        users: hits.slice(from, to).map((row) => memberCard(tr, row)),
        strings: {
          title: tr.tr("Members"),
          sort: tr.tr("Sort:"),
          level: tr.tr("Level:"),
          labels: tr.tr("Labels:"),
          city: tr.tr("City:"),
          status: tr.tr("Status:"),
          reset: tr.tr("Reset filters"),
          empty: tr.tr(
            "Nothing matches these conditions. Try changing the query or resetting the filters.",
          ),
        },
        pager: links(paging, "/users", raw, {
          previous: tr.tr("Previous"),
          next: tr.tr("Next"),
        }),
        sorts: SORT_OPTIONS.map(([value, label]) => ({
          value,
          label: tr.tr(label),
          checked: sort === value,
          href: sortHref(filters, value),
        })),
        labels: allLabels.map((value) =>
          option(
            value,
            labels.some((sel) => sel.toLowerCase() === value.toLowerCase()),
            "labels",
          ),
        ),
        cities: allCities.map((value) =>
          option(value, cities.includes(value), "cities"),
        ),
        statuses: STATUS_KINDS.map((kind) => ({
          value: kind,
          label: roleOf(tr, kindStatus(kind)),
          checked: statuses.includes(kind),
          href: toggleHref(filters, "status", kind),
        })),
        levels: LEVEL_OPTIONS.map((value) => ({
          value,
          label: tr.tr(value),
          checked: levels.some(
            (sel) => sel.toLowerCase() === value.toLowerCase(),
          ),
          href: toggleHref(filters, "level", value),
        })),
        filtersActive:
          labels.length > 0 ||
          cities.length > 0 ||
          statuses.length > 0 ||
          levels.length > 0,
      }),
    ];
  }

  /** GET /api/public/member/:slug — one member. */
  "member.get"(message: Message): Effect[] {
    const req = message.payload as HttpReq;
    const slug = req.params.slug ?? "";
    if (!slug) return [httpEffector.makeResponse(404, emptyMember(slug))];
    const lang = localeOf(req);
    const token = req.cookies?.[SESSION_COOKIE];
    const effects: Effect[] = [
      requestsEffector.merge({ slug, lang, viewerId: 0 }),
    ];
    if (!token) {
      // a guest: the card and the skills, no friend button
      effects.push(MemberService.bySlug(slug));
      return effects;
    }
    effects.push(AuthService.sessionUser(token, "member.sessionUser"));
    return effects;
  }

  /** The viewer (when there is one): the relation of the friend button. */
  "member.sessionUser.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const user = oneOf<{ id: number }>(message);
    const { slug } = parked(message, state) as { slug: string };
    return [
      requestsEffector.merge({ viewerId: user?.id ?? 0 }),
      MemberService.bySlug(slug),
    ];
  }

  "member.row.onSuccess"(message: Message, state: ServerState): Effect[] {
    const row = oneOf<MemberRow>(message);
    const { slug } = parked(message, state) as { slug: string };
    if (!row) return [httpEffector.makeResponse(404, emptyMember(slug))];
    return [requestsEffector.merge({ row }), MemberService.skills(row.userId)];
  }

  "member.skills.onSuccess"(message: Message, state: ServerState): Effect[] {
    const skills = rowsOf<MemberSkillRow>(message);
    const { row, viewerId } = parked(message, state) as {
      row: MemberRow;
      viewerId: number;
    };
    return [
      requestsEffector.merge({ skills }),
      MemberService.relation(viewerId, row.userId),
    ];
  }

  "member.relation.onSuccess"(message: Message, state: ServerState): Effect[] {
    const relation = oneOf<{ status: string }>(message);
    const { row, skills, viewerId, lang } = parked(message, state) as {
      row: MemberRow;
      skills: MemberSkillRow[];
      viewerId: number;
      lang: Locale;
    };
    const tr = translatorOf(lang);
    // no viewer: the old link into the app; your own page: no button
    const friend =
      viewerId === 0
        ? "guest"
        : viewerId === row.userId
          ? "hidden"
          : relationOf(relation?.status);
    return [
      httpEffector.makeResponse(200, {
        user: memberCard(tr, row),
        skillGroups: skillGroups(tr, row, skills),
        since: tr.trArgs("On TeamUp since {date}", {
          date: formatDate(tr, row.createdAt),
        }),
        friend: { slug: row.slug, relation: friend },
      }),
    ];
  }

  "members.failed"(): Effect[] {
    return [httpEffector.makeResponse(500, { error: "internal error" })];
  }
}
