/**
 * The texts of the pages and the API messages. English is the source and the
 * key (`tr("Projects")`); the Russian dictionary is `dictionary.ts` — the
 * original teamUP kept it in `src/i18n/ru.rs`, in the same shape (the key is
 * the English text, a plural entry holds `one|few|many`).
 *
 * The language of a request is negotiated the way the original did it: the
 * `lang` cookie first, then `Accept-Language`, then English. The cookie is
 * what the language switcher in the header writes.
 */

import { LOCALES, type Locale, RU } from "./dictionary.ts";

export { LOCALES, type Locale };

/** The languages the site speaks, with their native names. */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  ru: "Русский",
};

const isLocale = (code: string): code is Locale =>
  (LOCALES as readonly string[]).includes(code);

/** The translator of one request. */
export class Tr {
  /** The language of the request. */
  readonly locale: Locale;

  constructor(locale: Locale = "en") {
    this.locale = locale;
  }

  /** The English text with the Russian one, when there is one. */
  tr(english: string): string {
    if (this.locale === "en") return english;
    return RU[english] ?? english;
  }

  /** `tr` with `{name}` placeholders replaced. */
  trArgs(english: string, args: Record<string, string | number>): string {
    return this.tr(english).replace(/\{(\w+)\}/g, (whole, name: string) =>
      name in args ? String(args[name]) : whole,
    );
  }

  /**
   * The plural form of a count. The key is the English plural; the Russian
   * value holds `one|few|many`.
   */
  trPlural(one: string, other: string, n: number): string {
    if (this.locale === "en") {
      return (n === 1 ? one : other).replace(/\{n\}/g, String(n));
    }
    const entry = RU[other];
    if (!entry) return n === 1 ? one : other;
    const forms = entry.split("|");
    const text = forms[ruPluralIndex(n)] ?? forms[forms.length - 1];
    return text.replace(/\{n\}/g, String(n));
  }
}

/** The Russian plural rule: one / few / many. */
function ruPluralIndex(n: number): number {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 0;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 1;
  return 2;
}

/** The shape of the request payload the http plugin hands to a handler. */
export interface Requestish {
  cookies?: Record<string, string>;
  headers?: Record<string, string | string[] | undefined>;
}

/** The language of a request: the `lang` cookie, then `Accept-Language`. */
export function localeOf(request: Requestish | undefined): Locale {
  const cookie = request?.cookies?.lang;
  if (cookie && isLocale(cookie)) return cookie;
  const header = request?.headers?.["accept-language"];
  const raw = Array.isArray(header) ? header.join(",") : (header ?? "");
  for (const part of raw.split(",")) {
    const code = part.split(";")[0]?.trim().toLowerCase().slice(0, 2);
    if (code && isLocale(code)) return code;
  }
  return "en";
}

/** The translator of a request. */
export function trOf(request: Requestish | undefined): Tr {
  return new Tr(localeOf(request));
}
