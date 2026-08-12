export const LOCALES = ["es", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "es";
export const LOCALE_COOKIE = "lexopen_locale";

export function isLocale(value: string | null | undefined): value is Locale {
  return Boolean(value && (LOCALES as readonly string[]).includes(value));
}

export function negotiateLocale(acceptLanguage: string | null): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;
  const parts = acceptLanguage
    .split(",")
    .map((p) => p.trim().split(";")[0]?.toLowerCase())
    .filter(Boolean) as string[];
  for (const part of parts) {
    if (part.startsWith("es")) return "es";
    if (part.startsWith("en")) return "en";
  }
  return DEFAULT_LOCALE;
}

export const LOCALE_LABELS: Record<Locale, string> = {
  es: "Español",
  en: "English",
};
