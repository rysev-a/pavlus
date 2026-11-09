// Auth (api): register, login, me, logout — scrypt through the crypto plugin
// (an effect, so these handlers stay pure), the session through pg, the
// cookie through the http respond.

import {
  cryptoEffector,
  type HttpReq,
  httpEffector,
  invalid,
  oneOf,
  requestsEffector,
  type ServerState,
} from "@pavlus/backend";
import type { Effect, Message } from "@pavlus/core";
import { AuthService } from "../db/services/auth-service.ts";
import { SESSION_COOKIE, sessionCookie, tokenOf } from "./session.ts";

interface Credentials {
  email: string;
  password: string;
  name?: string;
}

const credentialsOf = (req: HttpReq): Credentials | null => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!email.includes("@") || password.length < 6) return null;
  return { email, password, name: name || email.split("@")[0]! };
};

const slugify = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "member";

export class AuthAPI {
  "auth.register"(message: Message): Effect[] {
    const creds = credentialsOf(message.payload as HttpReq);
    if (!creds)
      return invalid("email/password", "an email and a 6+ character password");
    return [
      requestsEffector.merge({ creds }),
      AuthService.emailFree(creds.email),
    ];
  }

  "auth.emailFree.onSuccess"(message: Message, state: ServerState): Effect[] {
    if (oneOf(message))
      return [httpEffector.makeResponse(409, { error: "this email is taken" })];
    const { creds } = (state.requests[message.ctx?.rid as string] ?? {}) as {
      creds: Credentials;
    };
    return [cryptoEffector.hash(creds.password, { replyTo: "auth.hashed" })];
  }

  "auth.hashed"(message: Message, state: ServerState): Effect[] {
    const hash = (message.payload as { hash: string }).hash;
    const { creds } = (state.requests[message.ctx?.rid as string] ?? {}) as {
      creds: Credentials;
    };
    return [
      requestsEffector.merge({ hash }),
      AuthService.createUser(creds.email, creds.name ?? "", hash),
    ];
  }

  "auth.createdUser.onSuccess"(message: Message): Effect[] {
    const user = oneOf<{ id: number; email: string; name: string }>(message);
    if (!user) return [];
    // slug + id: unique without a retry loop
    return [
      requestsEffector.merge({ userId: user.id }),
      AuthService.createProfile(user.id, `${slugify(user.name)}-${user.id}`),
    ];
  }

  "auth.createdProfile.onSuccess"(): Effect[] {
    return [cryptoEffector.randomToken({ bytes: 32, replyTo: "auth.token" })];
  }

  "auth.login"(message: Message): Effect[] {
    const creds = credentialsOf(message.payload as HttpReq);
    if (!creds) return invalid("email/password", "an email and a password");
    return [
      requestsEffector.merge({ creds }),
      AuthService.byEmail(creds.email),
    ];
  }

  "auth.byEmail.onSuccess"(message: Message, state: ServerState): Effect[] {
    const row = oneOf<{
      id: number;
      email: string;
      name: string;
      password_hash: string;
    }>(message);
    if (!row)
      return [httpEffector.makeResponse(401, { error: "no such email" })];
    const { creds } = (state.requests[message.ctx?.rid as string] ?? {}) as {
      creds: Credentials;
    };
    return [
      requestsEffector.merge({
        userId: row.id,
        hash: row.password_hash,
      }),
      cryptoEffector.verify(creds.password, row.password_hash, {
        replyTo: "auth.verified",
      }),
    ];
  }

  "auth.verified"(message: Message, state: ServerState): Effect[] {
    const ok = (message.payload as { ok: boolean }).ok;
    if (!ok)
      return [httpEffector.makeResponse(401, { error: "wrong password" })];
    return [cryptoEffector.randomToken({ bytes: 32, replyTo: "auth.token" })];
  }

  "auth.token"(message: Message, state: ServerState): Effect[] {
    const token = (message.payload as { token: string }).token;
    const userId = (state.requests[message.ctx?.rid as string] ?? {}).userId as
      | number
      | undefined;
    if (!userId) return []; // register path continues from its own flow
    return [
      requestsEffector.merge({ token }),
      AuthService.insertSession(token, userId),
    ];
  }

  "auth.session.onSuccess"(message: Message, state: ServerState): Effect[] {
    const token = (state.requests[message.ctx?.rid as string] ?? {})
      .token as string;
    return [
      httpEffector.respond({
        status: 200,
        json: { ok: true },
        ...sessionCookie(token),
      }),
    ];
  }

  "auth.me"(message: Message): Effect[] {
    const token = (message.payload as HttpReq).cookies[SESSION_COOKIE];
    if (!token) return [httpEffector.makeResponse(401, { error: "guest" })];
    return [
      requestsEffector.set("token", token),
      AuthService.sessionUser(token),
    ];
  }

  "auth.sessionUser.onSuccess"(message: Message): Effect[] {
    const user = oneOf(message);
    return [
      user
        ? httpEffector.makeResponse(200, user)
        : httpEffector.makeResponse(401, { error: "guest" }),
    ];
  }

  "auth.logout"(message: Message): Effect[] {
    const token = (message.payload as HttpReq).cookies[SESSION_COOKIE];
    if (!token)
      return [
        httpEffector.respond({
          status: 200,
          json: { ok: true },
          ...sessionCookie("", true),
        }),
      ];
    return [
      requestsEffector.set("token", token),
      AuthService.deleteSession(token),
    ];
  }

  /** The db failed: the request answers 500 instead of waiting. */
  "auth.failed"(): Effect[] {
    return [httpEffector.makeResponse(500, { error: "database error" })];
  }

  "auth.loggedOut.onSuccess"(message: Message, state: ServerState): Effect[] {
    return [
      httpEffector.respond({
        status: 200,
        json: { ok: true },
        ...sessionCookie(tokenOf(message, state), true),
      }),
    ];
  }
}
