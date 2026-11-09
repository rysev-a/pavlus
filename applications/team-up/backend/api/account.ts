// The account (api): the settings page of the member — the password, the
// e-mail address, the language of the account and the deletion of the
// account.
//
// Every change asks for the current password again: a stolen session alone
// cannot take the account over.

import {
  cryptoEffector,
  type HttpReq,
  httpEffector,
  oneOf,
  requestsEffector,
  type ServerState,
} from "@pavlus/backend";
import type { Effect, Message } from "@pavlus/core";
import { AuthService } from "../db/services/auth-service.ts";
import { trOf } from "../i18n/mod.ts";
import {
  SESSION_COOKIE,
  sessionCookie,
  sessionEffect,
  sessionUserOf,
  unauthorized,
} from "./session.ts";

/** The new password is at least this long. */
const PASSWORD_MIN = 8;
/** The name of the locale of the account. */
const LOCALES = ["en", "ru"];

const parked = (
  message: Message,
  state: ServerState,
): Record<string, unknown> => state.requests[message.ctx?.rid as string] ?? {};

const bodyOf = (message: Message): Record<string, unknown> =>
  ((message.payload as HttpReq).body ?? {}) as Record<string, unknown>;

export class AccountAPI {
  // ----- the password -----

  /** PUT /api/account/password */
  "account.password"(message: Message): Effect[] {
    const req = message.payload as HttpReq;
    const body = bodyOf(message);
    const tr = trOf(req);
    const current = String(body.current_password ?? "");
    const next = String(body.new_password ?? "");
    if (next.length < PASSWORD_MIN)
      return [
        httpEffector.makeResponse(422, {
          error: tr.tr("The new password must be at least 8 characters"),
        }),
      ];
    if (next === current)
      return [
        httpEffector.makeResponse(422, {
          error: tr.tr("The new password must differ from the current one"),
        }),
      ];
    return [
      requestsEffector.merge({ current, next }),
      ...sessionEffect(req, "account.password"),
    ];
  }

  "account.password.sessionUser.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const user = sessionUserOf(message);
    if (!user) return [unauthorized()];
    return [
      requestsEffector.merge({ userId: user.id, email: user.email }),
      AuthService.byEmail(user.email, "account.password.byEmail"),
    ];
  }

  /** The current password is checked before anything is written. */
  "account.password.byEmail.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const row = oneOf<{ password_hash: string }>(message);
    const tr = trOf(message.payload as HttpReq);
    if (!row)
      return [
        httpEffector.makeResponse(403, {
          error: tr.tr("The password is wrong"),
        }),
      ];
    const slice = parked(message, state) as { current: string };
    return [
      cryptoEffector.verify(slice.current, row.password_hash, {
        replyTo: "account.password.verified",
      }),
    ];
  }

  "account.password.verified"(message: Message, state: ServerState): Effect[] {
    const ok = (message.payload as { ok: boolean }).ok;
    const tr = trOf(message.payload as HttpReq);
    if (!ok)
      return [
        httpEffector.makeResponse(403, {
          error: tr.tr("The password is wrong"),
        }),
      ];
    const slice = parked(message, state) as { next: string };
    return [
      cryptoEffector.hash(slice.next, { replyTo: "account.password.hashed" }),
    ];
  }

  "account.password.hashed"(message: Message, state: ServerState): Effect[] {
    const hash = (message.payload as { hash: string }).hash;
    const slice = parked(message, state) as { userId: number };
    return [
      AuthService.updatePassword(
        slice.userId,
        hash,
        "account.password.passwordUpdated",
      ),
    ];
  }

  /** Every session of the account ends; this browser gets a new one. */
  "account.password.passwordUpdated.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const slice = parked(message, state) as { userId: number };
    return [
      requestsEffector.merge({ userId: slice.userId }),
      AuthService.dropSessions(
        slice.userId,
        "account.password.sessionsDropped",
      ),
    ];
  }

  "account.password.sessionsDropped.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const slice = parked(message, state) as { userId: number };
    return [
      cryptoEffector.randomToken({
        bytes: 32,
        replyTo: "account.password.token",
      }),
    ];
  }

  "account.password.token"(message: Message, state: ServerState): Effect[] {
    const token = (message.payload as { token: string }).token;
    const slice = parked(message, state) as { userId: number };
    return [
      requestsEffector.merge({ token }),
      AuthService.insertSession(
        token,
        slice.userId,
        "account.password.session",
      ),
    ];
  }

  "account.password.session.onSuccess"(message: Message): Effect[] {
    const token = (message.payload as { token: string }).token;
    return [
      httpEffector.respond({
        status: 200,
        json: { ok: true, token },
        ...sessionCookie(token),
      }),
    ];
  }

  // ----- the e-mail address -----

  /** PUT /api/account/email */
  "account.email"(message: Message): Effect[] {
    const req = message.payload as HttpReq;
    const body = bodyOf(message);
    const tr = trOf(req);
    const password = String(body.password ?? "");
    const email = String(body.email ?? "")
      .trim()
      .toLowerCase();
    const at = email.split("@");
    const valid =
      email.length > 0 &&
      email.length <= 254 &&
      !/\s/.test(email) &&
      at.length === 2 &&
      at[0] !== "" &&
      at[1]!.includes(".") &&
      !at[1]!.startsWith(".") &&
      !at[1]!.endsWith(".");
    if (!valid)
      return [
        httpEffector.makeResponse(422, {
          error: tr.tr("Enter a valid e-mail address"),
        }),
      ];
    return [
      requestsEffector.merge({ password, email }),
      ...sessionEffect(req, "account.email"),
    ];
  }

  "account.email.sessionUser.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const user = sessionUserOf(message);
    if (!user) return [unauthorized()];
    const tr = trOf(message.payload as HttpReq);
    const slice = parked(message, state) as { email: string };
    if (user.email === slice.email)
      return [
        httpEffector.makeResponse(422, {
          error: tr.tr("This is already your e-mail address"),
        }),
      ];
    return [
      requestsEffector.merge({ userId: user.id, email: user.email }),
      AuthService.byEmail(user.email, "account.email.byEmail"),
    ];
  }

  "account.email.byEmail.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const row = oneOf<{ password_hash: string }>(message);
    const tr = trOf(message.payload as HttpReq);
    if (!row)
      return [
        httpEffector.makeResponse(403, {
          error: tr.tr("The password is wrong"),
        }),
      ];
    const slice = parked(message, state) as { password: string };
    return [
      cryptoEffector.verify(slice.password, row.password_hash, {
        replyTo: "account.email.verified",
      }),
    ];
  }

  "account.email.verified"(message: Message, state: ServerState): Effect[] {
    const ok = (message.payload as { ok: boolean }).ok;
    const tr = trOf(message.payload as HttpReq);
    if (!ok)
      return [
        httpEffector.makeResponse(403, {
          error: tr.tr("The password is wrong"),
        }),
      ];
    const slice = parked(message, state) as { userId: number; email: string };
    return [
      AuthService.updateEmail(
        slice.userId,
        slice.email,
        "account.email.emailUpdated",
      ),
    ];
  }

  "account.email.emailUpdated.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const slice = parked(message, state) as { email: string };
    return [
      httpEffector.makeResponse(200, {
        email: slice.email,
        is_email_verified: false,
      }),
    ];
  }

  // ----- the language of the account -----

  /** PUT /api/auth/preferences — the language of the account. */
  "auth.preferences"(message: Message): Effect[] {
    const body = bodyOf(message);
    const locale = String(body.locale ?? "")
      .trim()
      .toLowerCase();
    if (!LOCALES.includes(locale))
      return [httpEffector.makeResponse(422, { error: "unknown language" })];
    return [
      requestsEffector.merge({ locale }),
      ...sessionEffect(message.payload as HttpReq, "auth.preferences"),
    ];
  }

  "auth.preferences.sessionUser.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const user = sessionUserOf(message);
    if (!user) return [unauthorized()];
    const slice = parked(message, state) as { locale: string };
    return [
      AuthService.updateLocale(
        user.id,
        slice.locale,
        "auth.preferences.localeUpdated",
      ),
    ];
  }

  "auth.preferences.localeUpdated.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const slice = parked(message, state) as { locale: string };
    return [httpEffector.makeResponse(200, { locale: slice.locale })];
  }

  // ----- the deletion of the account -----

  /** DELETE /api/account — the member is gone, with everything of them. */
  "account.delete"(message: Message): Effect[] {
    const req = message.payload as HttpReq;
    const body = bodyOf(message);
    const password = String(body.password ?? "");
    return [
      requestsEffector.merge({ password }),
      ...sessionEffect(req, "account.delete"),
    ];
  }

  "account.delete.sessionUser.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const user = sessionUserOf(message);
    if (!user) return [unauthorized()];
    const tr = trOf(message.payload as HttpReq);
    if (user.isAdmin)
      return [
        httpEffector.makeResponse(403, {
          error: tr.tr(
            "An administrator account is deleted in the back office",
          ),
        }),
      ];
    return [
      requestsEffector.merge({ userId: user.id, email: user.email }),
      AuthService.byEmail(user.email, "account.delete.byEmail"),
    ];
  }

  "account.delete.byEmail.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const row = oneOf<{ password_hash: string }>(message);
    const tr = trOf(message.payload as HttpReq);
    if (!row)
      return [
        httpEffector.makeResponse(403, {
          error: tr.tr("The password is wrong"),
        }),
      ];
    const slice = parked(message, state) as { password: string };
    return [
      cryptoEffector.verify(slice.password, row.password_hash, {
        replyTo: "account.delete.verified",
      }),
    ];
  }

  "account.delete.verified"(message: Message, state: ServerState): Effect[] {
    const ok = (message.payload as { ok: boolean }).ok;
    const tr = trOf(message.payload as HttpReq);
    if (!ok)
      return [
        httpEffector.makeResponse(403, {
          error: tr.tr("The password is wrong"),
        }),
      ];
    const slice = parked(message, state) as { userId: number };
    return [
      AuthService.ownedProjectsWithTeam(
        slice.userId,
        "account.delete.ownedProjects",
      ),
    ];
  }

  /** A member who owns a project with a team has to clear the team first. */
  "account.delete.ownedProjects.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const rows = oneOf(message);
    const tr = trOf(message.payload as HttpReq);
    if (rows)
      return [
        httpEffector.makeResponse(409, {
          error: tr.tr(
            "You own projects with a team: remove the team members first",
          ),
        }),
      ];
    const slice = parked(message, state) as { userId: number };
    return [
      AuthService.deleteMemberData(
        slice.userId,
        "account.delete.memberDataDeleted",
      ),
    ];
  }

  "account.delete.memberDataDeleted.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    return [
      AuthService.deleteEmptyThreads("account.delete.emptyThreadsDeleted"),
    ];
  }

  "account.delete.emptyThreadsDeleted.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const slice = parked(message, state) as { userId: number };
    return [AuthService.deleteUser(slice.userId, "account.delete.userDeleted")];
  }

  "account.delete.userDeleted.onSuccess"(message: Message): Effect[] {
    return [
      httpEffector.respond({
        status: 204,
        json: null,
        ...sessionCookie("", true),
      }),
    ];
  }

  "account.failed"(): Effect[] {
    return [httpEffector.makeResponse(500, { error: "database error" })];
  }
}
