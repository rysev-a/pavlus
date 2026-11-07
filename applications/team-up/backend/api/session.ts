// The session helper: every protected handler starts the same way — the
// cookie's token goes to the db, `auth.sessionUser.onSuccess` reads the user
// (or answers 401). The step's id is namespaced per module (every module owns
// its own flow; ids must not repeat across modules).

import {
  type HttpReq,
  httpEffector,
  oneOf,
  requestsEffector,
  type ServerState,
} from "@pavlus/backend";
import type { Effect, Message } from "@pavlus/core";
import { AuthService, type SessionUser } from "../db/services/auth-service.ts";

export const SESSION_COOKIE = "teamup_session";

export type { SessionUser };

/** Park the token and look the user up; `${ns}.sessionUser.onSuccess` follows. */
export function sessionEffect(req: HttpReq, ns: string): Effect[] {
  const token = req.cookies[SESSION_COOKIE];
  if (!token) return [];
  return [
    requestsEffector.set("token", token),
    AuthService.sessionUser(token, `${ns}.sessionUser`),
  ];
}

/** Whom the lookup resolved to (undefined = nobody). */
export function sessionUserOf(message: Message): SessionUser | undefined {
  return oneOf<SessionUser>(message);
}

/** The request's parked slice. */
export const sliceOf = (
  message: Message,
  state: ServerState,
): Record<string, unknown> => {
  const rid = message.ctx?.rid;
  return state.requests[typeof rid === "string" ? rid : ""] ?? {};
};

/** The token this request parked (logout answers with it cleared). */
export const tokenOf = (message: Message, state: ServerState): string =>
  (sliceOf(message, state).token as string) ?? "";

export const unauthorized = (): Effect =>
  httpEffector.makeResponse(401, { error: "sign in first" });

export const sessionCookie = (
  token: string,
  clear = false,
): {
  cookies: Record<
    string,
    { value: string; httpOnly: boolean; path: string; maxAge?: number }
  >;
} => ({
  cookies: {
    [SESSION_COOKIE]: clear
      ? { value: "", httpOnly: true, path: "/", maxAge: 0 }
      : { value: token, httpOnly: true, path: "/", maxAge: 30 * 24 * 3600 },
  },
});
