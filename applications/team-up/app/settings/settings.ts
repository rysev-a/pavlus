/**
 * The settings page (`/app/settings`): the account (the language), the
 * topics of the letters, the blocked people, the password, the e-mail
 * address and the deletion of the account.
 *
 * Every change asks the backend and the answer (the notice or the error)
 * comes back from it — the backend knows the account and the language.
 */
import { Component, type Effect, type Message } from "@pavlus/frontend";
import {
  httpEffector as http,
  routerEffector as router,
  storeEffector as store,
} from "@pavlus/frontend/plugins";
import { DomPlugin } from "@pavlus/frontend/plugins/dom";
import type { AppState, Me } from "../state.ts";
import view from "./settings.pavlus";

/** The page's slice: what the outlet hands it (state.settings). */
export type SettingsSlice = AppState["settings"];

export class SettingsPage extends Component<SettingsSlice> {
  view = view;

  paint(msg: Message): Effect[] {
    const { prev, next } = msg.payload as {
      prev: SettingsSlice;
      next: SettingsSlice;
    };
    return [DomPlugin.update(view.diff(prev, next))];
  }

  /** The page was entered: the account, the topics and the blocked people. */
  enter(): Effect[] {
    return [
      store.set("error", "", { onSuccess: "paint" }),
      store.set("notice", "", { onSuccess: "paint" }),
      http.request({
        id: "settings",
        url: "/api/auth/me",
        onSuccess: "settings.me",
        onError: "settings.guest",
      }),
      http.request({
        id: "settingsTopics",
        url: "/api/notifications/settings",
        onSuccess: "settings.topics",
        onError: "settings.failed",
      }),
      http.request({
        id: "settingsBlocks",
        url: "/api/blocks",
        onSuccess: "settings.blocks",
        onError: "settings.failed",
      }),
    ];
  }

  /** The account: the name, the e-mail and the language. */
  "settings.me"(msg: Message): Effect[] {
    const me = (msg.payload as { data: Me | null }).data;
    return [
      store.set("name", me?.name ?? "", { onSuccess: "paint" }),
      store.set("email", me?.email ?? "", { onSuccess: "paint" }),
      store.set("locale", me?.locale ?? "en", { onSuccess: "paint" }),
    ];
  }

  "settings.topics"(msg: Message): Effect[] {
    const data = (msg.payload as { data: SettingsSlice["topics"] }).data;
    return [store.set("topics", data, { onSuccess: "paint" })];
  }

  "settings.blocks"(msg: Message): Effect[] {
    const data = (msg.payload as { data: { blocks: SettingsSlice["blocks"] } })
      .data;
    return [store.set("blocks", data?.blocks ?? [], { onSuccess: "paint" })];
  }

  "settings.guest"(): Effect[] {
    return [router.navigate("/app/login", { absolute: true })];
  }

  /** Something went wrong: the backend's answer says what. */
  "settings.failed"(msg: Message): Effect[] {
    const data = (msg.payload as { data?: { error?: string } })?.data;
    return [
      store.set("error", data?.error ?? "could not save", {
        onSuccess: "paint",
      }),
    ];
  }

  // ----- the forms -----

  setCurrent(msg: Message): Effect[] {
    return [
      store.set("currentPassword", msg.event?.value ?? "", {
        onSuccess: "paint",
      }),
    ];
  }

  setNew(msg: Message): Effect[] {
    return [
      store.set("newPassword", msg.event?.value ?? "", { onSuccess: "paint" }),
    ];
  }

  setEmailPassword(msg: Message): Effect[] {
    return [
      store.set("emailPassword", msg.event?.value ?? "", {
        onSuccess: "paint",
      }),
    ];
  }

  setNewEmail(msg: Message): Effect[] {
    return [
      store.set("newEmail", msg.event?.value ?? "", { onSuccess: "paint" }),
    ];
  }

  setDeletePassword(msg: Message): Effect[] {
    return [
      store.set("deletePassword", msg.event?.value ?? "", {
        onSuccess: "paint",
      }),
    ];
  }

  /** The language of the account. */
  changeLocale(msg: Message, s: SettingsSlice): Effect[] {
    const locale = String(msg.event?.value ?? "en");
    return [
      http.request({
        id: "settingsLocale",
        url: "/api/auth/preferences",
        method: "PUT",
        body: { locale },
        onSuccess: "settings.localeSaved",
        onError: "settings.failed",
      }),
    ];
  }

  "settings.localeSaved"(msg: Message): Effect[] {
    const data = (msg.payload as { data: { locale: string } }).data;
    return [
      store.set("locale", data?.locale ?? "en", { onSuccess: "paint" }),
      store.set("notice", "The language of the account is saved.", {
        onSuccess: "paint",
      }),
    ];
  }

  /** One topic of the letters is switched. */
  toggleTopic(msg: Message, s: SettingsSlice): Effect[] {
    const topic = String(msg.payload ?? "");
    const on = !s.topics[topic as "applications"];
    const body = { [topic]: on };
    return [
      store.set(`topics.${topic}`, on, { onSuccess: "paint" }),
      http.request({
        id: "settingsTopic",
        url: "/api/notifications/settings",
        method: "PUT",
        body,
        onSuccess: "settings.topicSaved",
        onError: "settings.topicFailed",
      }),
    ];
  }

  "settings.topicSaved"(): Effect[] {
    return [
      store.set("notice", "The letters are saved.", { onSuccess: "paint" }),
    ];
  }

  "settings.topicFailed"(msg: Message): Effect[] {
    const data = (msg.payload as { data?: { error?: string } })?.data;
    return [
      store.set("error", data?.error ?? "could not save", {
        onSuccess: "paint",
      }),
    ];
  }

  /** The password of the account. */
  changePassword(_msg: Message, s: SettingsSlice): Effect[] {
    return [
      http.request({
        id: "settingsPassword",
        url: "/api/account/password",
        method: "PUT",
        body: {
          current_password: s.currentPassword,
          new_password: s.newPassword,
        },
        onSuccess: "settings.passwordSaved",
        onError: "settings.failed",
      }),
    ];
  }

  "settings.passwordSaved"(): Effect[] {
    return [
      store.set("currentPassword", "", { onSuccess: "paint" }),
      store.set("newPassword", "", { onSuccess: "paint" }),
      store.set("notice", "The password is changed.", { onSuccess: "paint" }),
    ];
  }

  /** The e-mail address of the account. */
  changeEmail(_msg: Message, s: SettingsSlice): Effect[] {
    return [
      http.request({
        id: "settingsEmail",
        url: "/api/account/email",
        method: "PUT",
        body: { password: s.emailPassword, email: s.newEmail },
        onSuccess: "settings.emailSaved",
        onError: "settings.failed",
      }),
    ];
  }

  "settings.emailSaved"(msg: Message): Effect[] {
    const data = (msg.payload as { data: { email: string } }).data;
    return [
      store.set("email", data?.email ?? "", { onSuccess: "paint" }),
      store.set("emailPassword", "", { onSuccess: "paint" }),
      store.set("newEmail", "", { onSuccess: "paint" }),
      store.set("notice", "The e-mail address is changed.", {
        onSuccess: "paint",
      }),
    ];
  }

  /** A blocked person is let back. */
  unblock(msg: Message): Effect[] {
    const slug = String(msg.payload ?? "");
    if (!slug) return [];
    return [
      http.request({
        id: "settingsUnblock",
        url: `/api/blocks/${encodeURIComponent(slug)}`,
        method: "DELETE",
        onSuccess: "settings.unblocked",
        onError: "settings.failed",
      }),
    ];
  }

  "settings.unblocked"(): Effect[] {
    return [
      store.set("notice", "The person is not blocked any more.", {
        onSuccess: "paint",
      }),
      http.request({
        id: "settingsBlocks",
        url: "/api/blocks",
        onSuccess: "settings.blocks",
        onError: "settings.failed",
      }),
    ];
  }

  /** The account goes away. */
  deleteAccount(_msg: Message, s: SettingsSlice): Effect[] {
    return [
      http.request({
        id: "settingsDelete",
        url: "/api/account",
        method: "DELETE",
        body: { password: s.deletePassword },
        onSuccess: "settings.deleted",
        onError: "settings.failed",
      }),
    ];
  }

  "settings.deleted"(): Effect[] {
    return [router.navigate("/app/login", { absolute: true })];
  }
}
