// The welcome page of the app (`/app`): it greets the member and, while the
// profile is blank, asks to fill it in (the original's `AppIndex`).
//
// The greeting is built here — the port translates on the server, so the page
// only receives the ready text.

import {
  type HttpReq,
  httpEffector,
  oneOf,
  requestsEffector,
  type ServerState,
} from "@pavlus/backend";
import type { Effect, Message } from "@pavlus/core";
import { trOf } from "../i18n/mod.ts";
import { WelcomeService } from "../db/services/welcome-service.ts";
import {
  sessionEffect,
  sessionUserOf,
  sliceOf,
  unauthorized,
} from "./session.ts";

export class WelcomeAPI {
  /** GET /api/welcome */
  "welcome.get"(message: Message): Effect[] {
    return sessionEffect(message.payload as HttpReq, "welcome.get");
  }

  "welcome.get.sessionUser.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const user = sessionUserOf(message);
    if (!user) return [unauthorized()];
    const tr = trOf(message.payload as HttpReq);
    // "Welcome, {name}!" — the first name of the member, as the original does
    const first = (user.name || "").trim().split(/\s+/)[0] ?? "";
    const greeting = first
      ? tr.trArgs("Welcome, {name}!", { name: first })
      : tr.tr("Welcome!");
    return [
      requestsEffector.merge({ greeting }),
      WelcomeService.profile(user.id),
    ];
  }

  "welcome.profile.onSuccess"(message: Message, state: ServerState): Effect[] {
    const row = oneOf<{ professions: number; skills: number }>(message);
    const tr = trOf(message.payload as HttpReq);
    const slice = sliceOf(message, state);
    // the profile is full enough when it holds a profession or a skill
    const ready = (row?.professions ?? 0) > 0 || (row?.skills ?? 0) > 0;
    return [
      httpEffector.makeResponse(200, {
        greeting: String(slice.greeting ?? ""),
        profileReady: ready,
        strings: {
          ready: tr.tr("Your profile is complete: time to look for a project."),
          completeTitle: tr.tr("Complete your profile"),
          completeText: tr.tr(
            "Tell us about yourself: profession, skills and city, so projects can find you.",
          ),
          goProfile: tr.tr("Go to your profile"),
          whatNext: tr.tr("What next"),
          findProject: tr.tr("Find a project"),
          myProfile: tr.tr("My profile"),
        },
      }),
    ];
  }

  "welcome.failed"(): Effect[] {
    return [httpEffector.makeResponse(500, { error: "database error" })];
  }
}
