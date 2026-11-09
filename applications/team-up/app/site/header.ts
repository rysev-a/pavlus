/**
 * The header of the public site: the brand, the links, the visitor and the
 * language switch (the original teamUP's `partials/header.html`).
 *
 * The header is a child of the shell: it owns the burger menu — the button
 * opens and closes it, and a click outside closes it (the shell's
 * `closeMenu`). The language switch is a plain link to the backend: the
 * server writes the cookie, saves the language of the account and sends the
 * visitor back to the page (the original did it with a cookie and a reload).
 *
 * The header sees the site's shell (`state.site`) and the path of the page
 * (the shell's `props` add it): the strings, the visitor, the burger.
 */
import { Component, type Effect, type Message } from "@pavlus/frontend";
import { storeEffector as store } from "@pavlus/frontend/plugins";
import { DomPlugin } from "@pavlus/frontend/plugins/dom";
import type { AppState } from "../state.ts";
import view from "./header.pavlus";

/** What the header sees: the shell of the site and the path of the page. */
export type SiteHeaderState = AppState["site"] & { path: string };

export class SiteHeader extends Component<SiteHeaderState> {
  view = view;

  /** The burger: the menu opens and closes. */
  toggle(_msg: Message, s: SiteHeaderState): Effect[] {
    return [store.set("burger", !s.burger)];
  }

  /**
   * A click inside the menu: the menu stays open. The click does not reach
   * the shell, so the shell's `closeMenu` does not close it — the original
   * kept the menu open too (only a click outside closed it).
   */
  inside(): Effect[] {
    return [];
  }

  /** The header paints itself: the burger's class and its aria. */
  paint(msg: Message): Effect[] {
    const { prev, next } = msg.payload as {
      prev: SiteHeaderState;
      next: SiteHeaderState;
    };
    return [DomPlugin.update(view.diff(prev, next))];
  }
}
