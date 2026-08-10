import type { Locale } from "@/lib/i18n/config";
import { es, type Dictionary } from "@/lib/i18n/dictionaries/es";
import { en } from "@/lib/i18n/dictionaries/en";

const dictionaries: Record<Locale, Dictionary> = { es, en };

export type { Dictionary };
export type { Locale } from "@/lib/i18n/config";
export {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  LOCALE_LABELS,
  LOCALES,
  isLocale,
  negotiateLocale,
} from "@/lib/i18n/config";

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale] || es;
}

/** Dot-path lookup, e.g. `nav.home` */
export function translate(
  dict: Dictionary,
  path: string,
  fallback?: string
): string {
  const parts = path.split(".");
  let cur: unknown = dict;
  for (const part of parts) {
    if (cur && typeof cur === "object" && part in (cur as object)) {
      cur = (cur as Record<string, unknown>)[part];
    } else {
      return fallback ?? path;
    }
  }
  return typeof cur === "string" ? cur : fallback ?? path;
}
