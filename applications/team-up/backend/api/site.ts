/**
 * The shell of the public site: the language of the request and the visitor
 * in the header (an avatar and an email when signed in, a "Sign in" link when
 * not). The original teamUP read the same things in its header partial
 * (`nav_user` in `routes.rs`).
 */

import {
  type HttpReq,
  httpEffector,
  oneOf,
  requestsEffector,
  type ServerState,
} from "@pavlus/backend";
import type { Effect, Message } from "@pavlus/core";
import { AuthService } from "../db/services/auth-service.ts";
import {
  LOCALE_NAMES,
  LOCALES,
  type Locale,
  localeOf,
  trOf,
} from "../i18n/mod.ts";
import { avatarHueClass, initialsOf } from "../lib/views.ts";
import { SESSION_COOKIE, sliceOf } from "./session.ts";

export interface SiteNav {
  signedIn: boolean;
  email: string;
  initials: string;
  avatarClass: string;
}

export interface SiteResponse {
  /** The language of the request. */
  lang: Locale;
  /** The languages the site speaks; `active` marks the current one. */
  locales: { code: Locale; name: string; active: boolean }[];
  /** The visitor in the header. */
  nav: SiteNav;
  /** The texts of the header and the footer, already translated. */
  strings: SiteStrings;
}

/** The texts the shell shows (the header and the footer of every page). */
export interface SiteStrings {
  projects: string;
  blog: string;
  members: string;
  about: string;
  signIn: string;
  myAccount: string;
  language: string;
  openMenu: string;
  closeMenu: string;
  footerBlurb: string;
  contacts: string;
  findUs: string;
  address: string;
  privacy: string;
  copyright: string;
}

const guestNav = (): SiteNav => ({
  signedIn: false,
  email: "",
  initials: "",
  avatarClass: "",
});

export class SiteAPI {
  /** GET /api/site */
  "site.get"(message: Message): Effect[] {
    const req = message.payload as HttpReq;
    const lang = localeOf(req);
    const token = req.cookies?.[SESSION_COOKIE];
    if (!token) {
      return [httpEffector.makeResponse(200, answer(lang, guestNav()))];
    }
    return [
      requestsEffector.set("lang", lang),
      AuthService.sessionUser(token, "site.sessionUser"),
    ];
  }

  "site.sessionUser.onSuccess"(message: Message, state: ServerState): Effect[] {
    const user = oneOf<{
      id: number;
      email: string;
      name: string;
      slug: string;
    }>(message);
    const lang = (sliceOf(message, state).lang as Locale | undefined) ?? "en";
    if (!user) {
      return [httpEffector.makeResponse(200, answer(lang, guestNav()))];
    }
    const nav: SiteNav = {
      signedIn: true,
      email: user.email,
      initials: initialsOf(user.name),
      avatarClass: avatarHueClass("header__avatar", user.slug),
    };
    return [httpEffector.makeResponse(200, answer(lang, nav))];
  }

  /** The old address of the original: /startups → /projects (a 301). */
  "site.oldStartups"(message: Message): Effect[] {
    const req = message.payload as HttpReq;
    return [httpEffector.redirect(`/projects${queryOf(req.query)}`, 301)];
  }

  /** /startups/{slug} → /projects/{slug} (a 301). */
  "site.oldStartup"(message: Message): Effect[] {
    const req = message.payload as HttpReq;
    const slug = req.params.slug ?? "";
    return [
      httpEffector.redirect(`/projects/${slug}${queryOf(req.query)}`, 301),
    ];
  }

  // ----- the language switch -----

  /**
   * GET /api/lang/:code — the switch of the header. The original wrote the
   * cookie in the browser and reloaded the page; here the server does it: the
   * cookie is written, the account (a signed-in visitor) gets the language
   * too, and the visitor goes back to the page they came from.
   */
  "site.lang"(message: Message): Effect[] {
    const req = message.payload as HttpReq;
    const code = String(req.params.code ?? "")
      .trim()
      .toLowerCase();
    if (!(LOCALES as readonly string[]).includes(code))
      return [httpEffector.redirect("/", 302)];
    const next = nextOf(req);
    const token = req.cookies?.[SESSION_COOKIE];
    if (!token) return [langAnswer(code, next)];
    return [
      requestsEffector.merge({ lang: code, next }),
      AuthService.sessionUser(token, "site.lang.sessionUser"),
    ];
  }

  /** The visitor is signed in: the account gets the language as well. */
  "site.lang.sessionUser.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const user = oneOf<{ id: number }>(message);
    const slice = sliceOf(message, state) as { lang: string; next: string };
    if (!user) return [langAnswer(slice.lang, slice.next)];
    return [
      AuthService.updateLocale(user.id, slice.lang, "site.lang.localeUpdated"),
    ];
  }

  /** The account has the language: the visitor goes back to the page. */
  "site.lang.localeUpdated.onSuccess"(
    message: Message,
    state: ServerState,
  ): Effect[] {
    const slice = sliceOf(message, state) as { lang: string; next: string };
    return [langAnswer(slice.lang, slice.next)];
  }
}

/** The answer of the language switch: the cookie and the way back. */
const langAnswer = (code: string, next: string): Effect =>
  httpEffector.respond({
    status: 302,
    redirect: next,
    cookies: {
      lang: {
        value: code,
        maxAge: 31536000,
        path: "/",
        sameSite: "Lax",
        httpOnly: false,
      },
    },
  });

/**
 * Where the language switch sends the visitor back to: the page they asked
 * for (`next`, a path of this site only), else the page they came from (the
 * referer), else the home page.
 */
const nextOf = (req: HttpReq): string => {
  const asked = req.query?.next;
  const path = Array.isArray(asked) ? asked[0] : asked;
  if (path && path.startsWith("/") && !path.startsWith("//")) return path;
  const referer = req.headers?.referer;
  const from = Array.isArray(referer) ? referer[0] : referer;
  if (from) {
    try {
      const url = new URL(from);
      return `${url.pathname}${url.search}`;
    } catch {
      // a broken referer: the home page
    }
  }
  return "/";
};

/** The query of a request, as a string ("?a=1&a=2"). */
const queryOf = (
  query: Record<string, string | string[]> | undefined,
): string => {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(query ?? {})) {
    for (const one of Array.isArray(value) ? value : [value]) {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(one)}`);
    }
  }
  return parts.length ? `?${parts.join("&")}` : "";
};

const answer = (lang: Locale, nav: SiteNav): SiteResponse => {
  const tr = trOf({ cookies: { lang } });
  return {
    lang,
    locales: LOCALES.map((code) => ({
      code,
      name: LOCALE_NAMES[code],
      active: code === lang,
    })),
    nav,
    strings: {
      projects: tr.tr("Projects"),
      blog: tr.tr("Blog"),
      members: tr.tr("Members"),
      about: tr.tr("About"),
      signIn: tr.tr("Sign in"),
      myAccount: tr.tr("My account"),
      language: tr.tr("Language"),
      openMenu: tr.tr("Open menu"),
      closeMenu: tr.tr("Close menu"),
      footerBlurb: tr.tr(
        "TeamUp is a service for those who want to launch a project but not alone. Find like-minded people, build a team and grow your idea together.",
      ),
      contacts: tr.tr("Contacts"),
      findUs: tr.tr("Find us on social media"),
      address: tr.tr("1 Example Street, Moscow"),
      privacy: tr.tr("Privacy policy"),
      copyright: tr.tr("© 2026 TeamUp, a team-finding service."),
    },
  };
};

/** The translator of a request (the pages use it for their texts). */
export { trOf };
