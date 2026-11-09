// The account recovery: the forgotten password, the new password and the
// verification of the address.
//
// The original never says whether an address is registered: the answer is the
// same for a known and for an unknown one, so nobody can probe the accounts.
// The letter itself is not sent (the port has no mailer): like the original's
// mailer in its dev mode, it is written to the server's log, so the link can
// be read there.

import {
  cryptoEffector,
  type HttpReq,
  httpEffector,
  oneOf,
  requestsEffector,
  type ServerState,
} from "@pavlus/backend";
import type { Effect, Message } from "@pavlus/core";
import {
  AuthTokenService,
  hashToken,
  type TokenKind,
} from "../db/services/auth-token-service.ts";
import { AuthService } from "../db/services/auth-service.ts";
import { localeOf, trOf, type Tr } from "../i18n/mod.ts";
import { sliceOf } from "./session.ts";

/** The body of a request, as a plain object. */
const bodyOf = (message: Message): Record<string, unknown> => {
  const body = (message.payload as HttpReq).body;
  return (body ?? {}) as Record<string, unknown>;
};

/** The rate limits of the recovery (the original's `auth` package). */
const FORGOT_EMAIL_MAX = 3;
const FORGOT_IP_MAX = 10;
const WINDOW_HOURS = 1;

/** The address of the request (the proxy puts it into the header). */
const ipOf = (req: HttpReq): string => {
  const headers = req.headers ?? {};
  const raw = headers["x-forwarded-for"];
  const first = Array.isArray(raw) ? raw[0] : raw;
  if (first) return String(first).split(",")[0]?.trim() ?? "";
  const real = headers["x-real-ip"];
  return String(Array.isArray(real) ? real[0] : (real ?? "")).trim();
};

/** The texts of the three pages. */
const recoveryStrings = (tr: Tr): Record<string, string> => ({
  forgotTitle: tr.tr("Forgot your password?"),
  forgotText: tr.tr(
    "Write your e-mail and we will send you a link to set a new password.",
  ),
  email: tr.tr("Email"),
  send: tr.tr("Send the link"),
  sent: tr.tr(
    "If this address is registered, we have sent a link to it. Check your mail.",
  ),
  resetTitle: tr.tr("Set a new password"),
  resetText: tr.tr("Choose a new password for your account."),
  password: tr.tr("New password"),
  confirm: tr.tr("Repeat the password"),
  save: tr.tr("Save"),
  done: tr.tr("The password is changed. You can sign in with it now."),
  verifyTitle: tr.tr("Confirm your address"),
  verified: tr.tr("Your address is confirmed. Welcome!"),
  invalid: tr.tr("The link is not valid any more. Ask for a new one."),
  mismatch: tr.tr("The passwords do not match"),
  tooShort: tr.tr("The password must be at least 8 characters"),
  tooMany: tr.tr("Too many requests, try again later"),
  backToLogin: tr.tr("Back to the login"),
  toTheApp: tr.tr("To the app"),
});

export class AuthRecoveryAPI {
  /** GET /api/auth/recovery — the texts of the three pages. */
  "auth.recovery"(message: Message): Effect[] {
    const tr = trOf(message.payload as HttpReq);
    return [httpEffector.makeResponse(200, { strings: recoveryStrings(tr) })];
  }

  /**
   * POST /api/auth/forgot — the answer is always the same: the link goes to
   * the address when the account exists, and the answer says nothing about it.
   */
  "auth.forgot"(message: Message): Effect[] {
    const req = message.payload as HttpReq;
    const body = bodyOf(message);
    const email = String(body.email ?? "")
      .trim()
      .toLowerCase();
    if (!email.includes("@"))
      return [
        httpEffector.makeResponse(202, {
          ok: true,
          strings: recoveryStrings(trOf(req)),
        }),
      ];
    const ip = ipOf(req);
    const since = new Date(
      Date.now() - WINDOW_HOURS * 3600 * 1000,
    ).toISOString();
    return [
      requestsEffector.merge({ email, ip, since, locale: localeOf(req) }),
      AuthTokenService.countSince(
        `forgot:email:${email}`,
        since,
        "auth.forgot.emailRate",
      ),
      AuthTokenService.countSince(
        `forgot:ip:${ip}`,
        since,
        "auth.forgot.ipRate",
      ),
    ];
  }

  "auth.forgot.rate.onSuccess"(message: Message, state: ServerState): Effect[] {
    const row = oneOf<{ n: number }>(message);
    const slice = sliceOf(message, state) as {
      email: string;
      ip: string;
      since: string;
      locale: string;
    };
    const tr = trOf({ cookies: { lang: slice.locale ?? "en" } });
    if ((row?.n ?? 0) >= FORGOT_EMAIL_MAX)
      return [
        httpEffector.makeResponse(429, { error: tr.tr("Too many requests") }),
      ];
    return [
      requestsEffector.merge({ ipLeft: slice.ip }),
      AuthTokenService.countSince(
        `forgot:ip:${slice.ip}`,
        slice.since,
        "auth.forgot.ipRate",
      ),
    ];
  }

  "auth.forgot.ipRate.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const row = oneOf<{ n: number }>(message);
    const slice = sliceOf(message, state) as {
      email: string;
      ip: string;
      locale: string;
    };
    const tr = trOf({ cookies: { lang: slice.locale ?? "en" } });
    if ((row?.n ?? 0) >= FORGOT_IP_MAX)
      return [
        httpEffector.makeResponse(429, { error: tr.tr("Too many requests") }),
      ];
    return [AuthService.byEmail(slice.email, "auth.forgot.byEmail")];
  }

  /** The account exists — the link goes to the address. */
  "auth.forgot.byEmail.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const row = oneOf<{ id: number }>(message);
    const slice = sliceOf(message, state) as {
      email: string;
      ip: string;
      locale: string;
    };
    const tr = trOf({ cookies: { lang: slice.locale ?? "en" } });
    if (!row)
      // an unknown address: the answer is the same, nothing is sent
      return [
        httpEffector.makeResponse(202, {
          ok: true,
          strings: recoveryStrings(tr),
        }),
      ];
    return [
      requestsEffector.merge({ userId: row.id }),
      cryptoEffector.randomToken({ bytes: 32, replyTo: "auth.forgot.token" }),
    ];
  }

  "auth.forgot.token"(message: Message, state: ServerState): Effect[] {
    const token = (message.payload as { token: string }).token;
    const slice = sliceOf(message, state) as {
      userId: number;
      email: string;
      ip: string;
      locale: string;
    };
    return [
      requestsEffector.merge({ token, tokenHash: hashToken(token) }),
      AuthTokenService.create(slice.userId, "password_reset", hashToken(token)),
    ];
  }

  /** The token is stored: the letter is written to the log. */
  "authToken.created.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const slice = sliceOf(message, state) as {
      email: string;
      ip: string;
      token: string;
      locale: string;
    };
    const tr = trOf({ cookies: { lang: slice.locale ?? "en" } });
    const link = `/app/reset?token=${slice.token}`;
    // the port has no mailer: the letter goes to the log, as the original's
    // mailer does in its dev mode
    console.log(
      `[team-up] the letter for ${slice.email}: ${tr.tr("Set a new password")} — ${link}`,
    );
    return [
      AuthTokenService.note(
        `forgot:email:${slice.email}`,
        "auth.forgot.noteEmail",
      ),
      AuthTokenService.note(`forgot:ip:${slice.ip}`, "auth.forgot.noteIp"),
      httpEffector.makeResponse(202, {
        ok: true,
        strings: recoveryStrings(tr),
      }),
    ];
  }

  /** POST /api/auth/reset — the new password. */
  "auth.reset"(message: Message): Effect[] {
    const req = message.payload as HttpReq;
    const body = bodyOf(message);
    const token = String(body.token ?? "").trim();
    const password = String(body.password ?? "");
    const tr = trOf(req);
    if (!token || password.length < 8)
      return [
        httpEffector.makeResponse(422, {
          error: tr.tr("The password must be at least 8 characters"),
        }),
      ];
    return [
      requestsEffector.merge({ token, password, locale: localeOf(req) }),
      cryptoEffector.hash(password, { replyTo: "auth.reset.hashed" }),
    ];
  }

  "auth.reset.hashed"(message: Message, state: ServerState): Effect[] {
    const hash = (message.payload as { hash: string }).hash;
    const slice = sliceOf(message, state) as {
      token: string;
      password: string;
    };
    return [
      requestsEffector.merge({ hash }),
      AuthTokenService.find("password_reset", hashToken(slice.token)),
    ];
  }

  "authToken.found.onSuccess"(message: Message, state: ServerState): Effect[] {
    const row = oneOf<{ id: number; userId: number }>(message);
    const slice = sliceOf(message, state) as { hash: string; locale: string };
    const tr = trOf({ cookies: { lang: slice.locale ?? "en" } });
    if (!row)
      return [
        httpEffector.makeResponse(422, {
          error: tr.tr("The link is not valid any more. Ask for a new one."),
          strings: recoveryStrings(tr),
        }),
      ];
    return [
      requestsEffector.merge({ tokenId: row.id, userId: row.userId }),
      AuthService.updatePassword(row.userId, slice.hash, "auth.reset.saved"),
    ];
  }

  /** The password is changed: every session of the account ends. */
  "auth.reset.saved.onSuccess"(message: Message, state: ServerState): Effect[] {
    const slice = sliceOf(message, state) as {
      tokenId: number;
      userId: number;
    };
    return [
      AuthService.dropSessions(
        Number(slice.userId),
        "auth.reset.sessionsDropped",
      ),
    ];
  }

  "auth.reset.sessionsDropped.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const slice = sliceOf(message, state) as {
      tokenId: number;
      locale: string;
    };
    const tr = trOf({ cookies: { lang: slice.locale ?? "en" } });
    return [
      AuthTokenService.spend(slice.tokenId),
      httpEffector.makeResponse(200, {
        ok: true,
        strings: recoveryStrings(tr),
      }),
    ];
  }

  /** POST /api/auth/verify — the address is confirmed. */
  "auth.verify"(message: Message): Effect[] {
    const req = message.payload as HttpReq;
    const body = bodyOf(message);
    const token = String(body.token ?? "").trim();
    const tr = trOf(req);
    if (!token)
      return [
        httpEffector.makeResponse(422, {
          error: tr.tr("The link is not valid any more. Ask for a new one."),
          strings: recoveryStrings(tr),
        }),
      ];
    return [
      requestsEffector.merge({ token, locale: localeOf(req) }),
      AuthTokenService.find("verify_email", hashToken(token)),
    ];
  }

  "auth.verify.found.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const row = oneOf<{ id: number }>(message);
    const slice = sliceOf(message, state) as { locale: string };
    const tr = trOf({ cookies: { lang: slice.locale ?? "en" } });
    if (!row)
      return [
        httpEffector.makeResponse(422, {
          error: tr.tr("The link is not valid any more. Ask for a new one."),
          strings: recoveryStrings(tr),
        }),
      ];
    return [
      AuthTokenService.spend(row.id),
      httpEffector.makeResponse(200, {
        ok: true,
        strings: recoveryStrings(tr),
      }),
    ];
  }

  /** The db failed: the request answers 500 instead of waiting. */
  "authToken.failed"(): Effect[] {
    return [httpEffector.makeResponse(500, { error: "database error" })];
  }
}
