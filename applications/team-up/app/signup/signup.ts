/**
 * The signup page (`/app/signup`): the registration form of the signed-in
 * app. POST /api/auth/register answers with the session cookie, so a
 * successful registration lands on the feed right away.
 */
import { Component, type Effect, type Message } from "@pavlus/frontend";
import {
  httpEffector as http,
  routerEffector as router,
  storeEffector as store,
} from "@pavlus/frontend/plugins";
import { DomPlugin } from "@pavlus/frontend/plugins/dom";
import type { AppState } from "../state.ts";
import view from "./signup.pavlus";

/** The page's slice: what the outlet hands it (state.signup). */
export type SignupSlice = AppState["signup"];

export class SignupPage extends Component<SignupSlice> {
  view = view;

  paint(msg: Message): Effect[] {
    const { prev, next } = msg.payload as {
      prev: SignupSlice;
      next: SignupSlice;
    };
    return [DomPlugin.update(view.diff(prev, next))];
  }

  enter(): Effect[] {
    return [
      store.set("error", "", { onSuccess: "paint" }),
      store.set("busy", false, { onSuccess: "paint" }),
    ];
  }

  setName(msg: Message): Effect[] {
    return [store.set("name", msg.event?.value ?? "", { onSuccess: "paint" })];
  }

  setEmail(msg: Message): Effect[] {
    return [store.set("email", msg.event?.value ?? "", { onSuccess: "paint" })];
  }

  setPassword(msg: Message): Effect[] {
    return [
      store.set("password", msg.event?.value ?? "", { onSuccess: "paint" }),
    ];
  }

  setConfirm(msg: Message): Effect[] {
    return [
      store.set("confirm", msg.event?.value ?? "", { onSuccess: "paint" }),
    ];
  }

  /** The form's own check first — the server answers the rest. */
  submit(_msg: Message, s: SignupSlice): Effect[] {
    if (s.busy) return [];
    const name = s.name.trim();
    const email = s.email.trim();
    const password = s.password;
    let error = "";
    if (!name) error = "Tell us your name.";
    else if (!email.includes("@")) error = "The email must look like an email.";
    else if (password.length < 6)
      error = "The password needs six characters or more.";
    else if (password !== s.confirm) error = "The passwords do not match.";
    if (error) return [store.set("error", error, { onSuccess: "paint" })];
    return [
      store.set("busy", true, { onSuccess: "paint" }),
      store.set("error", "", { onSuccess: "paint" }),
      http.request({
        id: "signup",
        url: "/api/auth/register",
        method: "POST",
        body: { name, email, password },
        onSuccess: "signup.loaded",
        onError: "signup.failed",
      }),
    ];
  }

  /** The account is created and the cookie is set: the feed is next. */
  "signup.loaded"(): Effect[] {
    // the feed is outside this page's base: the address is absolute
    return [router.navigate("/app", { absolute: true })];
  }

  "signup.failed"(msg: Message): Effect[] {
    const payload = msg.payload as {
      error?: string;
      data?: { error?: string };
    };
    return [
      store.set("busy", false, { onSuccess: "paint" }),
      store.set(
        "error",
        payload.data?.error ?? payload.error ?? "could not sign up",
        { onSuccess: "paint" },
      ),
    ];
  }
}
