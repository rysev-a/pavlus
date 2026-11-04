import {
  Component,
  type Effect,
  type Message,
} from "@service-laboratory/pavlus";
import {
  httpEffector as http,
  loggerEffector as log,
  storeEffector as store,
} from "@service-laboratory/pavlus/plugins";
import view from "./settings.pavlus";

export interface SettingsState {
  /** What the backend has. */
  theme: string;
  /** What the radios show. */
  choice: string;
  status: "idle" | "loading" | "failed";
  saveStatus: "idle" | "saving" | "failed";
  /** The save went through and the theme is applied. */
  saved: boolean;
}

export const initialSettings: SettingsState = {
  theme: "",
  choice: "",
  status: "idle",
  saveStatus: "idle",
  saved: false,
};

/**
 * The `/system/settings` page: the app's theme. Saving puts the choice in the
 * database and applies it, as a `theme` effect: a plugin puts the class on
 * `<html>` (the application code stays free of side effects).
 */
export class Settings extends Component<SettingsState> {
  view = view;

  // Entered by the router: read the saved theme.
  enter(): Effect[] {
    return [
      store.set("status", "loading"),
      http.request({
        id: "settings",
        url: "/api/settings",
        onSuccess: "loaded",
        onError: "failed",
      }),
    ];
  }

  loaded(msg: Message): Effect[] {
    const theme = (msg.payload as { data: { theme: string } }).data.theme;
    return [
      store.set("theme", theme),
      store.set("choice", theme),
      store.set("status", "idle"),
      store.set("saved", false),
    ];
  }

  failed(): Effect[] {
    return [store.set("status", "failed")];
  }

  /** A radio was picked; nothing is saved until "Save". */
  choose(msg: Message): Effect[] {
    return [
      store.set("choice", msg.event?.value ?? ""),
      store.set("saved", false),
    ];
  }

  save(_msg: Message, s: SettingsState): Effect[] {
    return [
      store.set("saveStatus", "saving"),
      http.request({
        id: "save",
        method: "PUT",
        url: "/api/settings",
        body: { theme: s.choice },
        onSuccess: "themeSaved",
        onError: "saveFailed",
      }),
    ];
  }

  themeSaved(msg: Message): Effect[] {
    const theme = (msg.payload as { data: { theme: string } }).data.theme;
    return [
      store.set("theme", theme),
      store.set("choice", theme),
      store.set("saveStatus", "idle"),
      store.set("saved", true),
      // The side effect: a plugin puts the class on the document's root.
      { plugin: "theme", type: "apply", theme },
    ];
  }

  saveFailed(msg: Message): Effect[] {
    return [
      store.set("saveStatus", "failed"),
      log.warn("theme not saved", msg.payload),
    ];
  }
}

export const settingsPage = new Settings();
