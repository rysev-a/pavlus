// signup / login / logout / me. The password is hashed and verified by the
// `crypto` plugin (effects in, messages out), so every function here is pure.
//
// login is a state machine:
//   lookup (pg) -> verify (crypto) -> token (crypto) -> store (redis) -> 200
import type { Message } from "@service-laboratory/pavlus";
import {
  K,
  answer,
  at,
  crypto,
  internal,
  invalid,
  log,
  pg,
  problem,
  redis,
  rq,
  sharedOf,
  sql,
  tokenOf,
  type AppState,
  type Handler,
  type RouteFn,
  type User,
} from "./kit.ts";
import { validateLogin, validateSignup } from "./validate.ts";

const signup: RouteFn = (call) => {
  const v = validateSignup(call.http.body);
  if (!v.ok) return invalid(call.route, v.errors);
  return [
    rq.merge({ step: "hash", email: v.value.email }),
    rq.set(["http", "body"], undefined), // the password must not linger
    crypto.hash(v.value.password, {
      replyTo: "auth.signup.hashed",
      onError: "auth.failed",
    }),
  ];
};

const login: RouteFn = (call) => {
  const v = validateLogin(call.http.body);
  if (!v.ok) return invalid(call.route, v.errors);
  return [
    rq.merge({
      step: "lookup",
      email: v.value.email,
      secret: v.value.password,
    }),
    rq.set(["http", "body"], undefined),
    pg.query(
      sql`select id, email, password_hash from users where email = ${v.value.email}`,
      { replyTo: "auth.login.found", onError: "auth.failed" },
    ),
  ];
};

const logout: RouteFn = (call) => [
  rq.set("step", "logout"),
  redis.del(K.session(tokenOf(call.http)!), {
    replyTo: "auth.logout.done",
    onError: "auth.failed",
  }),
];

const me: RouteFn = (call) => answer(call.route, 200, { user: call.user });

export const routes: Record<string, RouteFn> = {
  "auth.signup": signup,
  "auth.login": login,
  "auth.logout": logout,
  "auth.me": me,
};

const rows = (msg: Message) =>
  (msg.payload as { rows: Record<string, unknown>[] }).rows;

export const auth: Handler = (msg: Message, state: AppState) => {
  switch (msg.id) {
    // ---- signup
    case "auth.signup.hashed": {
      const r = at(state, msg, "hash");
      if (!r) return [];
      return [
        rq.set("step", "insert"),
        pg.query(
          sql`insert into users (email, password_hash)
              values (${r.email as string}, ${(msg.payload as { hash: string }).hash})
              returning id, email`,
          { replyTo: "auth.signup.inserted", onError: "auth.signup.failed" },
        ),
      ];
    }
    case "auth.signup.inserted": {
      const r = at(state, msg, "insert");
      if (!r) return [];
      const user = rows(msg)[0] as unknown as User;
      return [
        log.info("signup", { userId: user.id }),
        ...answer(r.route, 201, { user }),
      ];
    }
    case "auth.signup.failed": {
      const r = at(state, msg, "insert");
      if (!r) return [];
      const e = msg.payload as { code: string };
      return e.code === "23505"
        ? problem(r.route, 409, "email_taken", "email already registered")
        : internal(r.route, "signup.insert", e);
    }

    // ---- login
    case "auth.login.found": {
      const r = at(state, msg, "lookup");
      if (!r) return [];
      const row = rows(msg)[0] as
        | { id: number; email: string; password_hash: string }
        | undefined;
      // Unknown email: still burn a verify against the dummy hash so the
      // response time does not reveal which emails exist.
      const hash = row?.password_hash ?? sharedOf(state).dummyHash;
      if (!hash) return unauthorized(r.route, "no_dummy");
      return [
        rq.merge({
          step: "verify",
          candidate: row ? { id: row.id, email: row.email } : null,
        }),
        crypto.verify(r.secret as string, hash, {
          replyTo: "auth.login.verified",
          onError: "auth.failed",
        }),
      ];
    }
    case "auth.login.verified": {
      const r = at(state, msg, "verify");
      if (!r) return [];
      const okPassword = (msg.payload as { ok: boolean }).ok;
      if (!okPassword || !r.candidate)
        return unauthorized(r.route, r.candidate ? "bad_password" : "no_user");
      return [
        rq.merge({ step: "token", secret: undefined }),
        crypto.randomToken({
          replyTo: "auth.login.token",
          onError: "auth.failed",
        }),
      ];
    }
    case "auth.login.token": {
      const r = at(state, msg, "token");
      if (!r) return [];
      const token = (msg.payload as { token: string }).token;
      return [
        rq.merge({ step: "store", token }),
        redis.set(K.session(token), JSON.stringify(r.candidate), {
          ex: state.config.sessionTtlSec,
          replyTo: "auth.login.stored",
          onError: "auth.failed",
        }),
      ];
    }
    case "auth.login.stored": {
      const r = at(state, msg, "store");
      if (!r) return [];
      const user = r.candidate as User;
      const token = r.token as string;
      return [
        log.info("login", { userId: user.id }),
        ...answer(
          r.route,
          200,
          { token, user },
          {
            cookies: {
              sid: { value: token, maxAge: state.config.sessionTtlSec },
            },
          },
        ),
      ];
    }

    // ---- logout
    case "auth.logout.done": {
      const r = at(state, msg, "logout");
      if (!r) return [];
      return answer(r.route, 204, undefined, {
        cookies: { sid: { value: "", maxAge: 0 } },
      });
    }

    // ---- infrastructure failure anywhere in the above
    case "auth.failed": {
      const r = msg.ctx
        ? (state.requests[msg.ctx.rid as string] as { route?: string })
        : undefined;
      return internal(r?.route ?? "auth", "auth", msg.payload);
    }
  }
  return undefined;
};

/** The same 401 for "no such user" and "wrong password"; the reason is only logged. */
const unauthorized = (route: string, reason: string) => [
  log.warn("login failed", { reason }),
  ...problem(route, 401, "invalid_credentials", "invalid email or password"),
];
