// Match (api): the feed of open slots for me, and the candidates of a slot
// for the owner. The percentages come from computeMatch (pure, match.ts) —
// the handlers only fetch the inputs and sort.

import {
  type HttpReq,
  httpEffector,
  oneOf,
  requestsEffector,
  rowsOf,
  type ServerState,
} from "@pavlus/backend";
import type { Effect, Message } from "@pavlus/core";
import { ProfileService } from "../db/services/profile-service.ts";
import { ProjectService } from "../db/services/project-service.ts";
import { localeOf, trOf, type Tr } from "../i18n/mod.ts";
import {
  budgetLabel,
  deadlineLabel,
  kindLabel,
  payLabel,
} from "../lib/views.ts";
import {
  bestBucket,
  byMatchDesc,
  computeMatch,
  type MatchResult,
  type MyProfession,
  type MySkill,
  type SlotSkill,
} from "../match.ts";
import { sessionEffect, sessionUserOf, unauthorized } from "./session.ts";

/** How many projects the feed shows (the original's `FEED_LIMIT`). */
const FEED_LIMIT = 30;

/** The texts of the feed's filters (the translation lives on the server). */
const feedStrings = (tr: Tr): Record<string, string> => ({
  query: tr.tr("Name, tag…"),
  profession: tr.tr("Profession"),
  grade: tr.tr("Grade"),
  allProfessions: tr.tr("All professions"),
  anyGrade: tr.tr("Any grade"),
  search: tr.tr("Search"),
  loading: tr.tr("Loading…"),
  empty: tr.tr("No matching projects yet."),
  noProfession: tr.tr(
    "Add a profession to your profile and a selection will appear here.",
  ),
  apply: tr.tr("Apply"),
  applied: tr.tr("Application sent"),
  viewApplication: tr.tr("View the application"),
  applyTitle: tr.tr("Apply: {name}"),
  founder: tr.tr("Founder: {name}"),
});

const parked = (
  message: Message,
  state: ServerState,
): Record<string, unknown> => state.requests[message.ctx?.rid as string] ?? {};

export interface FeedItem {
  slotId: number;
  projectSlug: string;
  projectName: string;
  tagline: string;
  kind: string;
  owner: string;
  profession: string;
  bucket: string;
  match: MatchResult | null;
  myBucket: string | null;
}

/** One open slot of the feed (the original's `SlotItem`). */
export interface FeedSlot {
  id: number;
  professionId: number;
  /** The slug of the profession (the filter speaks slugs). */
  profession: string;
  professionName: string;
  bucket: string;
  /** "Frontend developer · middle" — the translation lives here. */
  title: string;
  description: string;
  /** What the slot pays ("" when it says nothing). */
  payLabel: string;
  /** The caller already has a pending application for this slot. */
  applied: boolean;
  /** The required skills with their level (1..10). */
  skills: { skillId: number; name: string; level: number }[];
  /** The match of the caller for this slot (null: no common profession). */
  match: MatchResult | null;
  /** Why the percent is what it is: "Rust 8/7 ✓", "grade too low". */
  why: string[];
}

/** One project of the feed (the original's `StartupItem`). */
export interface FeedProject {
  slug: string;
  name: string;
  tagline: string;
  tags: string[];
  kind: string;
  /** The kind as it is shown ("Organization", "Part-time work"). */
  kindLabel: string;
  city: string;
  budget: number | null;
  budgetCurrency: string;
  /** "Budget: 150,000 RUB" ("" when there is no budget). */
  budgetLabel: string;
  deadline: string;
  /** "Deadline: Dec 1, 2026" ("" when there is no deadline). */
  deadlineLabel: string;
  ownerName: string;
  /** "Founder: Anna" — the founder's name and their grade. */
  ownerLabel: string;
  openSlots: number;
  /** The best percent among the listed slots (null: no slot fits). */
  bestPercent: number | null;
  slots: FeedSlot[];
}

/** The filters of the feed (the original's `FeedParams`). */
interface FeedFilters {
  /** Free text: every word must occur in the name, the tagline or the tags. */
  q: string;
  /** The slug of the profession a slot must have. */
  role: string;
  /** The grade a slot must have. */
  grade: string;
}

/** One row of the feed's raw query. */
interface FeedRow {
  slug: string;
  name: string;
  tagline: string;
  tags: string[];
  kind: string;
  city: string;
  budget: number | null;
  budgetCurrency: string;
  deadline: string;
  ownerName: string;
  ownerProfession: string;
  ownerBucket: string;
  openSlots: number;
  slots: {
    id: number;
    professionId: number;
    profession: string;
    professionName: string;
    bucket: string;
    description: string;
    pay: string | null;
    payFrom: number | null;
    payTo: number | null;
    currency: string | null;
    applied: boolean;
    skills: { skillId: number; name: string; level: number }[];
  }[];
}

/** The query of the feed: the first value of every key. */
const filtersOf = (req: HttpReq): FeedFilters => {
  const query = req.query ?? {};
  const one = (key: string): string => {
    const value = query[key];
    return String(
      Array.isArray(value) ? (value[0] ?? "") : (value ?? ""),
    ).trim();
  };
  return { q: one("q"), role: one("role"), grade: one("grade") };
};

/** The free text of the filter: every word must occur in the text. */
const matchesText = (row: FeedRow, q: string): boolean => {
  const query = q.trim().toLowerCase();
  if (!query) return true;
  const hay = [row.name, row.tagline, (row.tags ?? []).join(" ")]
    .join(" ")
    .toLowerCase();
  return query.split(/\s+/).every((word) => hay.includes(word));
};

export class MatchAPI {
  /** GET /api/match/feed — my skills cover which open slots? */
  "match.feed"(message: Message): Effect[] {
    return sessionEffect(message.payload as HttpReq, "match.feed");
  }

  "match.feed.sessionUser.onSuccess"(message: Message): Effect[] {
    const user = sessionUserOf(message);
    if (!user) return [unauthorized()];
    return [
      requestsEffector.merge({ userId: user.id }),
      ProfileService.myProfessions(user.id),
    ];
  }

  /**
   * GET /api/match/startups — the feed of the projects to join (the original's
   * `MatchPanel`): the projects that are not mine and not my team, with their
   * open slots, the filters applied and the best match first.
   */
  "match.startups"(message: Message): Effect[] {
    const req = message.payload as HttpReq;
    return [
      requestsEffector.merge({
        filters: filtersOf(req),
        locale: localeOf(req),
      }),
      ...sessionEffect(req, "match.startups"),
    ];
  }

  "match.startups.sessionUser.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const user = sessionUserOf(message);
    if (!user) return [unauthorized()];
    return [
      requestsEffector.merge({ userId: user.id }),
      ProfileService.myProfessions(user.id, "match.startups.professions"),
    ];
  }

  "match.startups.professions.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const { userId } = parked(message, state) as { userId: number };
    return [
      requestsEffector.merge({ professions: rowsOf<MyProfession>(message) }),
      ProfileService.mySkills(userId, "match.startups.skills"),
    ];
  }

  "match.startups.skills.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const { userId } = parked(message, state) as { userId: number };
    return [
      requestsEffector.merge({ skills: rowsOf<MySkill>(message) }),
      ProjectService.matchFeed(userId, "match.startups.projects"),
    ];
  }

  "match.startups.projects.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const { professions, skills, filters } = parked(message, state) as {
      professions: MyProfession[];
      skills: MySkill[];
      filters: FeedFilters;
    };
    const locale =
      (parked(message, state) as { locale?: string }).locale ?? "en";
    const tr = trOf({ cookies: { lang: locale } });
    const mine = new Map(skills.map((s) => [s.skillId, s.level]));
    const rows = rowsOf<FeedRow>(message);

    const items: FeedProject[] = [];
    for (const row of rows) {
      if (!matchesText(row, filters.q)) continue;
      const slots: FeedSlot[] = [];
      for (const slot of row.slots ?? []) {
        if (filters.role && slot.profession !== filters.role) continue;
        if (filters.grade && slot.bucket !== filters.grade) continue;
        const match = computeMatch(professions, skills, {
          slotId: slot.id,
          professionId: slot.professionId,
          bucket: slot.bucket,
          skills: slot.skills.map((s) => ({
            skillId: s.skillId,
            level: s.level,
          })),
        });
        // the reasons of the percent: the skills one by one, then the grade
        // (no match — no reasons: the slot is not the member's profession)
        const why: string[] = [];
        if (match) {
          for (const skill of slot.skills) {
            const have = mine.get(skill.skillId) ?? 0;
            why.push(
              `${tr.tr(skill.name)} ${have}/${skill.level}${have >= skill.level ? " ✓" : ""}`,
            );
          }
          why.push(match.gradeOk ? tr.tr("grade ✓") : tr.tr("grade too low"));
        }
        slots.push({
          id: slot.id,
          professionId: slot.professionId,
          profession: slot.profession,
          professionName: slot.professionName,
          bucket: slot.bucket,
          title: `${tr.tr(slot.professionName)} · ${tr.tr(slot.bucket)}`,
          description: slot.description ?? "",
          payLabel: payLabel(
            tr,
            slot.pay,
            slot.payFrom,
            slot.payTo,
            slot.currency,
          ),
          applied: slot.applied,
          skills: slot.skills,
          match,
          why,
        });
      }
      // a project without a slot left is not a suggestion
      if (!slots.length) continue;
      const percents = slots
        .map((s) => s.match?.percent)
        .filter((p): p is number => p !== null && p !== undefined);
      const ownerGrade = row.ownerBucket ? ` · ${tr.tr(row.ownerBucket)}` : "";
      items.push({
        slug: row.slug,
        name: row.name,
        tagline: row.tagline ?? "",
        tags: row.tags ?? [],
        kind: row.kind,
        kindLabel: kindLabel(tr, row.kind),
        city: row.city ?? "",
        budget: row.budget,
        budgetCurrency: row.budgetCurrency ?? "",
        budgetLabel: budgetLabel(tr, row.budget, row.budgetCurrency),
        deadline: row.deadline ?? "",
        deadlineLabel: deadlineLabel(tr, row.deadline),
        ownerName: row.ownerName ?? "",
        ownerLabel: row.ownerName
          ? `${tr.trArgs("Founder: {name}", { name: row.ownerName })}${
              row.ownerProfession
                ? ` · ${tr.tr(row.ownerProfession)}${ownerGrade}`
                : ""
            }`
          : "",
        openSlots: row.openSlots ?? slots.length,
        bestPercent: percents.length ? Math.max(...percents) : null,
        slots,
      });
    }
    // the best match first, then the name
    items.sort((a, b) => {
      const pa = a.bestPercent ?? -1;
      const pb = b.bestPercent ?? -1;
      if (pa !== pb) return pb - pa;
      return a.name.localeCompare(b.name);
    });
    const total = items.length;
    const shown = items.slice(0, FEED_LIMIT);
    return [
      httpEffector.makeResponse(200, {
        // without a profession there is no match to compute at all
        canMatch: professions.length > 0,
        items: shown,
        total,
        strings: {
          ...feedStrings(tr),
          // "Showing the best {shown} of {total}…" — only when there are more
          more:
            total > shown.length
              ? tr.trArgs(
                  "Showing the best {shown} of {total}. Narrow the search with the filters.",
                  { shown: String(shown.length), total: String(total) },
                )
              : "",
        },
      }),
    ];
  }

  "profile.myProfessions.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const { userId } = parked(message, state) as { userId: number };
    return [
      requestsEffector.merge({ professions: rowsOf<MyProfession>(message) }),
      ProfileService.mySkills(userId),
    ];
  }

  "profile.mySkills.onSuccess"(message: Message): Effect[] {
    return [
      requestsEffector.merge({ skills: rowsOf<MySkill>(message) }),
      ProjectService.openSlots(),
    ];
  }

  "projects.openSlots.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const { professions, skills } = parked(message, state) as {
      professions: MyProfession[];
      skills: MySkill[];
    };
    // the professions/skills replies arrive as rows; the slots carry json
    const slots = rowsOf<{
      slotId: number;
      professionId: number;
      bucket: string;
      projectSlug: string;
      projectName: string;
      tagline: string;
      kind: string;
      owner: string;
      skills: SlotSkill[];
    }>(message);
    // the profession is a hard filter: slots I have no profession for are
    // not mine to see in the feed (match: null never reaches the list)
    const feed: FeedItem[] = slots
      .map((s) => ({
        slot: s,
        match: computeMatch(professions, skills, {
          slotId: s.slotId,
          professionId: s.professionId,
          bucket: s.bucket,
          skills: s.skills,
        }),
      }))
      .filter(({ match }) => match !== null)
      .map(({ slot: s, match }) => ({
        slotId: s.slotId,
        projectSlug: s.projectSlug,
        projectName: s.projectName,
        tagline: s.tagline,
        kind: s.kind,
        owner: s.owner,
        profession: String(s.professionId),
        bucket: s.bucket,
        match,
        myBucket: bestBucket(professions, s.professionId),
      }));
    feed.sort(byMatchDesc);
    return [httpEffector.makeResponse(200, feed)];
  }

  /** GET /api/match/candidates/:slotId — the owner's view. */
  "match.candidates"(message: Message): Effect[] {
    const req = message.payload as HttpReq;
    const slotId = Number(req.params.slotId);
    if (!Number.isInteger(slotId))
      return [httpEffector.makeResponse(404, { error: "no such slot" })];
    return [
      requestsEffector.set("slotId", slotId),
      ...sessionEffect(req, "match.candidates"),
    ];
  }

  "match.candidates.sessionUser.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const user = sessionUserOf(message);
    if (!user) return [unauthorized()];
    const { slotId } = parked(message, state) as { slotId: number };
    return [
      requestsEffector.merge({ userId: user.id }),
      ProjectService.candidates(slotId),
    ];
  }

  "projects.candidates.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const { slotId } = parked(message, state) as { slotId: number };
    return [
      requestsEffector.merge({ people: rowsOf(message) }),
      ProjectService.slotWithSkills(slotId),
    ];
  }

  "projects.candidatesSlot.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const { people } = parked(message, state) as {
      people: {
        userId: number;
        name: string;
        slug: string;
        city: string;
        status: string;
        bucket: string;
        skills: MySkill[];
      }[];
    };
    const slot = oneOf<{
      slotId: number;
      professionId: number;
      bucket: string;
      skills: SlotSkill[];
    }>(message);
    if (!slot)
      return [httpEffector.makeResponse(404, { error: "no such slot" })];
    const list = people.map((p) => ({
      userId: p.userId,
      name: p.name,
      slug: p.slug,
      city: p.city,
      status: p.status,
      match: computeMatch(
        [{ professionId: slot.professionId, bucket: p.bucket }],
        p.skills,
        slot,
      ),
    }));
    list.sort(byMatchDesc);
    const { slotId } = parked(message, state) as { slotId: number };
    return [httpEffector.makeResponse(200, { slotId, items: list })];
  }

  "match.failed"(): Effect[] {
    return [httpEffector.makeResponse(500, { error: "internal error" })];
  }
}
