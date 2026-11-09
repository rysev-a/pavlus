// The person page (`/api/people/:slug`): the member as the viewer sees them —
// the profile, the relation with the viewer, the block and the contacts (the
// friends and the member alone see them).

import {
  type HttpReq,
  httpEffector,
  oneOf,
  requestsEffector,
  type ServerState,
} from "@pavlus/backend";
import type { Effect, Message } from "@pavlus/core";
import { AuthService } from "../db/services/auth-service.ts";
import { PersonService } from "../db/services/person-service.ts";
import { localeOf, trOf, type Tr } from "../i18n/mod.ts";
import { initialsOf, roleOf } from "../lib/views.ts";
import { SESSION_COOKIE } from "./session.ts";

/** The request's parked slice. */
const parked = (
  message: Message,
  state: ServerState,
): Record<string, unknown> =>
  state.requests[(message.ctx?.rid as string) ?? ""] ?? {};

/** The zone of a skill's level (the original's `level_zone`). */
const levelZone = (level: number): string => {
  if (level <= 3) return "junior";
  if (level <= 6) return "middle";
  if (level <= 8) return "senior";
  return "lead";
};

/** The texts of the person page. */
const personStrings = (tr: Tr): Record<string, string> => ({
  loading: tr.tr("Loading…"),
  missing: tr.tr("Member not found"),
  missingText: tr.tr("The link may be out of date."),
  self: tr.tr("This is your profile."),
  edit: tr.tr("Edit"),
  waiting: tr.tr("Request sent, waiting for an answer."),
  cancelRequest: tr.tr("Cancel the request"),
  incoming: tr.tr("Wants to add you as a friend."),
  accept: tr.tr("Accept"),
  decline: tr.tr("Decline"),
  friends: tr.tr("You are friends."),
  removeFriend: tr.tr("Remove from friends"),
  addFriend: tr.tr("Add to friends"),
  write: tr.tr("Write"),
  block: tr.tr("Block"),
  unblock: tr.tr("Unblock"),
  report: tr.tr("Report"),
  reportTitle: tr.tr("Report {name}"),
  about: tr.tr("About"),
  professions: tr.tr("Professions and areas"),
  skills: tr.tr("Skills"),
  contacts: tr.tr("Contacts"),
  noContacts: tr.tr("No contacts given."),
  contactsHidden: tr.tr("Contacts are visible to friends only."),
});

export class PeopleAPI {
  /** GET /api/people/:slug — the person page's data. */
  "people.view"(message: Message): Effect[] {
    const req = message.payload as HttpReq;
    const slug = req.params.slug ?? "";
    const token = req.cookies[SESSION_COOKIE];
    const base = requestsEffector.merge({ locale: localeOf(req), slug });
    if (!token) {
      return [
        base,
        requestsEffector.merge({ viewerId: 0 }),
        PersonService.bySlug(slug, 0, "people.view.person"),
      ];
    }
    return [base, AuthService.sessionUser(token, "people.view.session")];
  }

  "people.view.session.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const user = oneOf<{ id: number }>(message);
    const { slug } = parked(message, state) as { slug: string };
    const viewerId = user?.id ?? 0;
    return [
      requestsEffector.merge({ viewerId }),
      PersonService.bySlug(slug, viewerId, "people.view.person"),
    ];
  }

  "people.view.person.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const row = oneOf<{
      userId: number;
      slug: string;
      name: string;
      city: string;
      bio: string;
      status: string;
      birthYear: number | null;
      domains: string[];
      contacts: string;
      professions: { slug: string; name: string; bucket: string }[];
      skills: {
        slug: string;
        name: string;
        level: number;
        profession: string | null;
      }[];
      relationRow: string | null;
      blocked: boolean;
    }>(message);
    const { locale, viewerId } = parked(message, state) as {
      locale: string;
      viewerId: number;
    };
    const tr = trOf({ cookies: { lang: locale } });
    if (!row)
      return [httpEffector.makeResponse(404, { error: "no such member" })];

    // the relation with the viewer (the original's states)
    const relation =
      row.userId === viewerId
        ? "self"
        : row.relationRow === "friends"
          ? "friends"
          : row.relationRow === "waiting"
            ? "waiting"
            : row.relationRow === "incoming"
              ? "incoming"
              : "none";

    // the skills, grouped by the profession they belong to
    const groups = new Map<
      string,
      { title: string; skills: typeof row.skills }
    >();
    for (const skill of row.skills) {
      const title = skill.profession ?? tr.tr("Skills");
      const group = groups.get(title) ?? { title, skills: [] };
      group.skills.push(skill);
      groups.set(title, group);
    }
    const skillGroups = [...groups.values()].map((g) => ({
      title: g.title,
      skills: g.skills.map((s) => ({
        slug: s.slug,
        name: tr.tr(s.name),
        level: s.level,
        zone: tr.tr(levelZone(s.level)),
        // the meter's ten segments (the zone of every segment, as the original)
        segments: Array.from({ length: 10 }, (_, i) =>
          i + 1 <= s.level
            ? `pf__seg pe__seg is-on is-${levelZone(i + 1)}`
            : "pf__seg pe__seg",
        ),
      })),
    }));

    // the contacts: the friends and the member alone see them
    const contacts =
      relation === "friends" || relation === "self" ? row.contacts : null;
    const age =
      row.birthYear && row.birthYear > 1900
        ? new Date().getFullYear() - row.birthYear
        : 0;

    return [
      httpEffector.makeResponse(200, {
        person: {
          userId: row.userId,
          slug: row.slug,
          name: row.name,
          city: row.city,
          bio: row.bio,
          role: roleOf(tr, row.status),
          status: row.status,
          age,
          ageLabel: tr.trPlural("{n} year old", "{n} years old", age),
          domains: row.domains,
          professions: row.professions.map((p) => ({
            slug: p.slug,
            name: tr.tr(p.name),
            bucket: tr.tr(p.bucket),
          })),
          skillGroups,
          relation,
          blocked: row.blocked,
          contacts,
          initials: initialsOf(row.name),
        },
        strings: personStrings(tr),
      }),
    ];
  }

  "people.failed"(): Effect[] {
    return [httpEffector.makeResponse(500, { error: "internal error" })];
  }
}
