// Directory (api): the professions and the skill tree, in one call.

import { type HttpReq, httpEffector, oneOf } from "@pavlus/backend";
import type { Effect, Message } from "@pavlus/core";
import { DirectoryService } from "../db/services/directory-service.ts";
import { trOf } from "../i18n/mod.ts";

export class DirectoryAPI {
  "dir.list"(): Effect[] {
    return [DirectoryService.all()];
  }

  /** The options of the match feed's filters: the professions and the grades. */
  "dir.filters"(): Effect[] {
    return [DirectoryService.options()];
  }

  "dir.options.onSuccess"(message: Message): Effect[] {
    const tr = trOf(message.payload as HttpReq);
    const row = oneOf(message) as {
      professions: { slug: string; name: string }[];
      buckets: string[];
    };
    return [
      httpEffector.makeResponse(200, {
        professions: row.professions ?? [],
        buckets: (row.buckets ?? []).map((value) => ({
          value,
          label: tr.tr(
            value === "junior"
              ? "Junior"
              : value === "middle"
                ? "Middle"
                : value === "senior"
                  ? "Senior"
                  : "Lead",
          ),
        })),
      }),
    ];
  }

  "dir.all.onSuccess"(message: Message): Effect[] {
    const tr = trOf(message.payload as HttpReq);
    const buckets = ["junior", "middle", "senior", "lead"].map((value) => ({
      value,
      label: tr.tr(
        value === "junior"
          ? "Junior"
          : value === "middle"
            ? "Middle"
            : value === "senior"
              ? "Senior"
              : "Lead",
      ),
    }));
    return [
      httpEffector.makeResponse(200, {
        ...(oneOf(message) as Record<string, unknown>),
        buckets,
        strings: {
          title: tr.tr("Professions"),
          myProfessions: tr.tr("My professions"),
          availableProfessions: tr.tr("Available professions"),
          level: tr.tr("Level in the profession"),
          skills: tr.tr("Skills"),
          remove: tr.tr("Remove the profession"),
          addHint: tr.tr(
            "Add a profession: skills are chosen within it. Click a profession to add it.",
          ),
          emptyMine: tr.tr("You have no professions yet."),
          noSkills: tr.tr("There are no skills for this profession yet."),
          rating: tr.tr("Rating"),
          clearRating: tr.tr("Clear the rating"),
          levelAria: tr.tr("Level: {skill}"),
          levelHint: tr.tr(
            "The chosen level fills in approximate skill ratings. Adjust any of them: a scale segment (1–10), × clears the rating.",
          ),
        },
      }),
    ];
  }

  "dir.failed"(): Effect[] {
    return [httpEffector.makeResponse(500, { error: "internal error" })];
  }
}
