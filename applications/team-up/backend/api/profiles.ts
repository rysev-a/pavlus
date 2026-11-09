// Profiles (api): my profile, a public one by slug, and the writes — the
// fields, the professions (the match's hard filter), the skill ratings.
// Every flow namespaces its own session step, so the module owns all of its
// continuations; what a later step needs is parked in the request's slice
// (`state.requests[rid]`, the requests plugin's memory).

import {
  type HttpReq,
  httpEffector,
  invalid,
  oneOf,
  requestsEffector,
  type ServerState,
} from "@pavlus/backend";
import type { Effect, Message } from "@pavlus/core";
import { ProfileService } from "../db/services/profile-service.ts";
import { roleOf } from "../lib/views.ts";
import { trOf } from "../i18n/mod.ts";
import { sessionEffect, sessionUserOf, unauthorized } from "./session.ts";

const STATUSES = ["searching", "open", "not-searching"];

/** This rid's parked slice. */
const parked = (
  message: Message,
  state: ServerState,
): Record<string, unknown> => state.requests[message.ctx?.rid as string] ?? {};

export class ProfilesAPI {
  /** GET /api/profile/me */
  "profile.me"(message: Message): Effect[] {
    return sessionEffect(message.payload as HttpReq, "profile.me");
  }

  /**
   * GET /api/profile/editor — the form of the profile page: the profile, the
   * statuses the form offers and the texts of the page.
   */
  "profile.editor"(message: Message): Effect[] {
    return sessionEffect(message.payload as HttpReq, "profile.editor");
  }

  "profile.editor.sessionUser.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const user = sessionUserOf(message);
    if (!user) return [unauthorized()];
    return [
      requestsEffector.merge({ slug: user.slug }),
      ProfileService.bySlug(user.slug, "profile.editor.bySlug"),
    ];
  }

  "profile.editor.bySlug.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const profile = oneOf<{ slug: string }>(message);
    if (!profile)
      return [httpEffector.makeResponse(404, { error: "no such member" })];
    const tr = trOf(message.payload as HttpReq);
    return [
      httpEffector.makeResponse(200, {
        ...(profile as Record<string, unknown>),
        avatarUrl: `/api/avatars/${profile.slug}`,
        statuses: STATUSES.map((value) => ({
          value,
          label: roleOf(tr, value),
        })),
        strings: {
          title: tr.tr("Profile"),
          aboutYou: tr.tr("About you"),
          name: tr.tr("Name"),
          city: tr.tr("City"),
          bio: tr.tr("Bio"),
          status: tr.tr("Status"),
          photo: tr.tr("Photo"),
          publicPage: tr.tr("Public page"),
          professions: tr.tr("Professions"),
          skills: tr.tr("Skills"),
          save: tr.tr("Save"),
          saved: tr.tr("Saved"),
          notSelected: tr.tr("not selected"),
          loading: tr.tr("Loading…"),
        },
      }),
    ];
  }

  "profile.me.sessionUser.onSuccess"(message: Message): Effect[] {
    const user = sessionUserOf(message);
    if (!user) return [unauthorized()];
    return [
      requestsEffector.set("slug", user.slug),
      ProfileService.bySlug(user.slug),
    ];
  }

  /** GET /api/people/:slug */
  "profile.bySlug"(message: Message): Effect[] {
    const slug = (message.payload as HttpReq).params.slug ?? "";
    return [requestsEffector.set("slug", slug), ProfileService.bySlug(slug)];
  }

  "profile.bySlug.onSuccess"(message: Message): Effect[] {
    const profile = oneOf(message);
    return [
      profile
        ? httpEffector.makeResponse(200, profile)
        : httpEffector.makeResponse(404, { error: "no such member" }),
    ];
  }

  /** PUT /api/profile — the fields the profile page edits. */
  "profile.save"(message: Message): Effect[] {
    const req = message.payload as HttpReq;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const city = typeof body.city === "string" ? body.city.slice(0, 80) : "";
    const bio = typeof body.bio === "string" ? body.bio.slice(0, 500) : "";
    const status = STATUSES.includes(String(body.status))
      ? String(body.status)
      : "";
    if (!status) return invalid("status", "searching | open | not-searching");
    return [
      requestsEffector.merge({ city, bio, status }),
      ...sessionEffect(req, "profile.save"),
    ];
  }

  "profile.save.sessionUser.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const user = sessionUserOf(message);
    if (!user) return [unauthorized()];
    const { city, bio, status } = parked(message, state) as {
      city: string;
      bio: string;
      status: string;
    };
    return [ProfileService.update(user.id, city, bio, status)];
  }

  "profile.saved.onSuccess"(): Effect[] {
    return [httpEffector.makeResponse(200, { ok: true })];
  }

  /** PUT /api/profile/professions — `[{professionId, bucket}]`, replaced. */
  "profile.setProfessions"(message: Message): Effect[] {
    const req = message.payload as HttpReq;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const raw = Array.isArray(body.professions) ? body.professions : null;
    if (raw === null)
      return invalid("professions", "a list of {professionId, bucket}");
    const rows = raw
      .filter(
        (p): p is { professionId: number; bucket: string } =>
          typeof (p as Record<string, unknown>)?.professionId === "number" &&
          typeof (p as Record<string, unknown>)?.bucket === "string",
      )
      .map((p) => [p.professionId, p.bucket] as [number, string]);
    return [
      ...sessionEffect(req, "profile.setProfessions"),
      requestsEffector.merge({ rows }),
    ];
  }

  "profile.setProfessions.sessionUser.onSuccess"(message: Message): Effect[] {
    const user = sessionUserOf(message);
    if (!user) return [unauthorized()];
    return [
      requestsEffector.merge({ userId: user.id }),
      ProfileService.clearProfessions(user.id),
    ];
  }

  "profile.clearedProfessions.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const { userId, rows } = parked(message, state) as {
      userId: number;
      rows: [number, string][];
    };
    return [ProfileService.insertProfessions(userId, rows)];
  }

  "profile.savedProfessions.onSuccess"(): Effect[] {
    return [httpEffector.makeResponse(200, { ok: true })];
  }

  /** PUT /api/profile/skills — `[{skillId, level 1..10}]`, replaced. */
  "profile.setSkills"(message: Message): Effect[] {
    const req = message.payload as HttpReq;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const raw = Array.isArray(body.skills) ? body.skills : null;
    if (raw === null) return invalid("skills", "a list of {skillId, level}");
    const rows = raw
      .filter(
        (s): s is { skillId: number; level: number } =>
          typeof (s as Record<string, unknown>)?.skillId === "number" &&
          Number.isInteger((s as Record<string, unknown>)?.level) &&
          ((s as Record<string, unknown>).level as number) >= 1 &&
          ((s as Record<string, unknown>).level as number) <= 10,
      )
      .map((s) => [s.skillId, s.level] as [number, number]);
    return [
      ...sessionEffect(req, "profile.setSkills"),
      requestsEffector.merge({ rows }),
    ];
  }

  "profile.setSkills.sessionUser.onSuccess"(message: Message): Effect[] {
    const user = sessionUserOf(message);
    if (!user) return [unauthorized()];
    return [
      requestsEffector.merge({ userId: user.id }),
      ProfileService.clearSkills(user.id),
    ];
  }

  "profile.clearedSkills.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const { userId, rows } = parked(message, state) as {
      userId: number;
      rows: [number, number][];
    };
    return [ProfileService.insertSkills(userId, rows)];
  }

  "profile.savedSkills.onSuccess"(): Effect[] {
    return [httpEffector.makeResponse(200, { ok: true })];
  }

  "profile.failed"(): Effect[] {
    return [httpEffector.makeResponse(500, { error: "internal error" })];
  }
}
