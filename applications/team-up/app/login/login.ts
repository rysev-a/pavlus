/**
 * The login page (`/login`): one form, the demo accounts listed underneath
 * (the demo world's password is teamup123 for everyone). On success it asks
 * /api/auth/me (the login answer is just a cookie) and lands on the feed.
 */
import { Component, type Effect, type Message } from "@pavlus/frontend";
import {
  httpEffector as http,
  routerEffector as router,
  storeEffector as store,
} from "@pavlus/frontend/plugins";
import { DomPlugin } from "@pavlus/frontend/plugins/dom";
import type { AppState } from "../state.ts";
import view from "./login.pavlus";

/** The page's slice: what the outlet hands it (state.login). */
export type LoginSlice = AppState["login"];

export class LoginPage extends Component<LoginSlice> {
  view = view;

  paint(msg: Message): Effect[] {
    const { prev, next } = msg.payload as {
      prev: LoginSlice;
      next: LoginSlice;
    };
    return [DomPlugin.update(view.diff(prev, next))];
  }

  enter(): Effect[] {
    return [
      store.set("error", "", { onSuccess: "paint" }),
      store.set("busy", false, { onSuccess: "paint" }),
    ];
  }

  setEmail(msg: Message): Effect[] {
    return [store.set("email", msg.event?.value ?? "", { onSuccess: "paint" })];
  }

  setPassword(msg: Message): Effect[] {
    return [
      store.set("password", msg.event?.value ?? "", { onSuccess: "paint" }),
    ];
  }

  /** Prefill with a demo account's email (the template's buttons). */
  pick(msg: Message): Effect[] {
    const email = String(msg.payload ?? "");
    return [
      store.set("email", email, { onSuccess: "paint" }),
      store.set("password", "teamup123", { onSuccess: "paint" }),
    ];
  }

  submit(_msg: Message, s: LoginSlice): Effect[] {
    if (s.busy) return [];
    return [
      store.set("busy", true, { onSuccess: "paint" }),
      store.set("error", "", { onSuccess: "paint" }),
      http.request({
        id: "login",
        url: "/api/auth/login",
        method: "POST",
        body: { email: s.email, password: s.password },
        onSuccess: "login.ok",
        onError: "login.no",
      }),
    ];
  }

  "login.ok"(): Effect[] {
    // the cookie is set (the shell asks who it belongs to); land on the feed
    return [router.navigate("/app", { absolute: true })];
  }

  "login.no"(msg: Message): Effect[] {
    return [
      store.set("busy", false, { onSuccess: "paint" }),
      store.set(
        "error",
        (msg.payload as { error?: string }).error ?? "could not sign in",
        { onSuccess: "paint" },
      ),
    ];
  }
}
