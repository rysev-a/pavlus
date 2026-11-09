/**
 * The account recovery: the forgotten password (`/app/forgot`), the new
 * password (`/app/reset`) and the verification of the address
 * (`/app/verify`). One page, three addresses — the original's three routes.
 *
 * The token of the reset and of the verification comes from the query of the
 * address (`?token=…`).
 */
import { Component, type Effect, type Message } from "@pavlus/frontend";
import {
  httpEffector as http,
  routerEffector as router,
  storeEffector as store,
} from "@pavlus/frontend/plugins";
import { DomPlugin } from "@pavlus/frontend/plugins/dom";
import { routePath, type AppState } from "../state.ts";
import view from "./recovery.pavlus";

/** The page's slice: what the outlet hands it (state.authRecovery). */
export type AuthRecoverySlice = AppState["authRecovery"];

/** The mode of the page: which of the three the address stands for. */
export const modeOf = (path: string): "forgot" | "reset" | "verify" => {
  if (path.includes("/reset")) return "reset";
  if (path.includes("/verify")) return "verify";
  return "forgot";
};

/** The token of the query (`?token=…`). */
const tokenOf = (search: string): string => {
  const match = /[?&]token=([^&]+)/.exec(search);
  return match?.[1] ? decodeURIComponent(match[1]) : "";
};

export class AuthRecoveryPage extends Component<AuthRecoverySlice> {
  view = view;

  paint(msg: Message): Effect[] {
    const { prev, next } = msg.payload as {
      prev: AuthRecoverySlice;
      next: AuthRecoverySlice;
    };
    return [DomPlugin.update(view.diff(prev, next))];
  }

  enter(msg: Message, s: AuthRecoverySlice): Effect[] {
    const mode = modeOf(routePath(s.route) || "/app/forgot");
    const token = tokenOf(s.route?.search ?? "");
    const effects: Effect[] = [
      store.set("mode", mode, { onSuccess: "paint" }),
      store.set("error", "", { onSuccess: "paint" }),
      store.set("done", false, { onSuccess: "paint" }),
      store.set("notice", "", { onSuccess: "paint" }),
    ];
    if (token) effects.push(store.set("token", token, { onSuccess: "paint" }));
    // the texts of the page
    effects.push(
      http.request({
        id: "strings",
        url: "/api/auth/recovery",
        onSuccess: "strings.loaded",
        onError: "strings.loaded",
      }),
    );
    if (mode === "verify" && token) {
      // the address is confirmed right away: the link opens it
      effects.push(
        http.request({
          id: "verify",
          method: "POST",
          url: "/api/auth/verify",
          body: { token },
          onSuccess: "verify.done",
          onError: "verify.failed",
        }),
      );
    }
    return effects;
  }

  /** The texts of the page. */
  "strings.loaded"(msg: Message): Effect[] {
    const data = msg.payload as { data?: { strings?: Record<string, string> } };
    const strings = data.data?.strings;
    if (!strings) return [];
    return [store.set("strings", strings, { onSuccess: "paint" })];
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

  /** The forgotten password: the link goes to the address. */
  submit(_msg: Message, s: AuthRecoverySlice): Effect[] {
    const mode = modeOf(routePath(s.route) || "/app/forgot");
    if (s.busy) return [];
    if (mode === "forgot") {
      if (!s.email.includes("@")) return [];
      return [
        store.set("busy", true, { onSuccess: "paint" }),
        store.set("error", "", { onSuccess: "paint" }),
        http.request({
          id: "forgot",
          method: "POST",
          url: "/api/auth/forgot",
          body: { email: s.email },
          onSuccess: "forgot.done",
          onError: "failed",
        }),
      ];
    }
    // the new password: the form checks that the two are the same
    if (s.password !== s.confirm) {
      return [
        store.set("error", s.strings.mismatch ?? "The passwords do not match", {
          onSuccess: "paint",
        }),
      ];
    }
    if (s.password.length < 8) {
      return [
        store.set(
          "error",
          s.strings.tooShort ?? "The password must be at least 8 characters",
          { onSuccess: "paint" },
        ),
      ];
    }
    return [
      store.set("busy", true, { onSuccess: "paint" }),
      store.set("error", "", { onSuccess: "paint" }),
      http.request({
        id: "reset",
        method: "POST",
        url: "/api/auth/reset",
        body: { token: s.token, password: s.password },
        onSuccess: "reset.done",
        onError: "failed",
      }),
    ];
  }

  /** The link is sent. */
  "forgot.done"(msg: Message): Effect[] {
    const strings = (
      msg.payload as { data?: { strings?: Record<string, string> } }
    )?.data?.strings;
    return [
      store.set("busy", false, { onSuccess: "paint" }),
      store.set("done", true, { onSuccess: "paint" }),
      store.set(
        "notice",
        strings?.sent ?? "If this address is registered, we have sent a link.",
        { onSuccess: "paint" },
      ),
      ...(strings
        ? [store.set("strings", strings, { onSuccess: "paint" })]
        : []),
    ];
  }

  /** The password is changed. */
  "reset.done"(msg: Message): Effect[] {
    const strings = (
      msg.payload as { data?: { strings?: Record<string, string> } }
    )?.data?.strings;
    return [
      store.set("busy", false, { onSuccess: "paint" }),
      store.set("done", true, { onSuccess: "paint" }),
      store.set(
        "notice",
        strings?.done ??
          "The password is changed. You can sign in with it now.",
        { onSuccess: "paint" },
      ),
      ...(strings
        ? [store.set("strings", strings, { onSuccess: "paint" })]
        : []),
    ];
  }

  /** The address is confirmed. */
  "verify.done"(msg: Message): Effect[] {
    const strings = (
      msg.payload as { data?: { strings?: Record<string, string> } }
    )?.data?.strings;
    return [
      store.set("busy", false, { onSuccess: "paint" }),
      store.set("done", true, { onSuccess: "paint" }),
      store.set(
        "notice",
        strings?.verified ?? "Your address is confirmed. Welcome!",
        { onSuccess: "paint" },
      ),
      ...(strings
        ? [store.set("strings", strings, { onSuccess: "paint" })]
        : []),
    ];
  }

  /** Something went wrong: the backend's own words. */
  failed(msg: Message): Effect[] {
    const error = (msg.payload as { error?: string }).error ?? "";
    const strings = (
      msg.payload as { data?: { strings?: Record<string, string> } }
    )?.data?.strings;
    return [
      store.set("busy", false, { onSuccess: "paint" }),
      store.set("error", error, { onSuccess: "paint" }),
      ...(strings
        ? [store.set("strings", strings, { onSuccess: "paint" })]
        : []),
    ];
  }

  "verify.failed"(msg: Message): Effect[] {
    return this.failed(msg);
  }

  /** To the login page. */
  toLogin(): Effect[] {
    return [router.navigate("/app/login", { absolute: true })];
  }
}
