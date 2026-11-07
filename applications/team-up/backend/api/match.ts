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
    return [httpEffector.makeResponse(200, list)];
  }

  "match.failed"(): Effect[] {
    return [httpEffector.makeResponse(500, { error: "internal error" })];
  }
}
