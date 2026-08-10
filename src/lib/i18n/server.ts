import { cookies, headers } from "next/headers";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  getDictionary,
  isLocale,
  negotiateLocale,
  translate,
  type Locale,
} from "@/lib/i18n";

export async function getLocale(): Promise<Locale> {
  const jar = await cookies();
  const fromCookie = jar.get(LOCALE_COOKIE)?.value;
  if (isLocale(fromCookie)) return fromCookie;

  const h = await headers();
  return negotiateLocale(h.get("accept-language"));
}

export async function getI18n() {
  const locale = await getLocale();
  const dict = getDictionary(locale);
  return {
    locale,
    dict,
    t: (path: string, fallback?: string) => translate(dict, path, fallback),
  };
}

export { DEFAULT_LOCALE, LOCALE_COOKIE };
