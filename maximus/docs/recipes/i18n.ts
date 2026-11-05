import { computed, signal } from "../../src/mod.ts";

export type Dict = Record<string, string>;

/**
 * A signal-backed dictionary. `t("key", {n: 3})` reads the current locale's
 * dictionary, so any binding that calls it re-renders when the locale (or a
 * lazily loaded dictionary) changes. Placeholders are `{name}`, plural
 * variants are `key.one` / `key.other` chosen by Intl.PluralRules.
 */
export function createI18n(
  dictionaries: Record<string, Dict>,
  initial: string,
  fallback = initial,
) {
  const locale = signal(initial);
  const dicts = signal(dictionaries);
  const dict = computed(() => dicts()[locale()] ?? {});
  const rules = computed(() => new Intl.PluralRules(locale()));

  function t(
    key: string,
    params: Record<string, string | number> = {},
  ): string {
    const plural =
      typeof params.n === "number"
        ? `${key}.${rules().select(params.n)}`
        : null;
    const lookup = (d: Dict | undefined) =>
      (plural === null ? undefined : d?.[plural]) ?? d?.[key];
    const text = lookup(dict()) ?? lookup(dicts()[fallback]) ?? key;
    return text.replace(/\{(\w+)\}/g, (_, name: string) =>
      name in params ? String(params[name]) : `{${name}}`,
    );
  }
  /** Add or replace a dictionary (for example after `import("./fr.json")`). */
  function addDictionary(loc: string, d: Dict) {
    dicts.update((all) => ({ ...all, [loc]: d }));
  }
  return { locale, t, addDictionary };
}
