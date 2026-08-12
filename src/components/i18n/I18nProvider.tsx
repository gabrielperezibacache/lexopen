"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  getDictionary,
  translate,
  type Dictionary,
  type Locale,
} from "@/lib/i18n";

type I18nContextValue = {
  locale: Locale;
  dict: Dictionary;
  t: (path: string, fallback?: string) => string;
  setLocale: (locale: Locale) => Promise<void>;
  pending: boolean;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({
  locale: initialLocale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  const router = useRouter();
  const [override, setOverride] = useState<Locale | null>(null);
  const [pending, startTransition] = useTransition();
  const locale = override ?? initialLocale;
  const dict = useMemo(() => getDictionary(locale), [locale]);

  const setLocale = useCallback(
    async (next: Locale) => {
      if (next === locale) return;
      setOverride(next);
      await fetch("/api/locale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: next }),
      });
      startTransition(() => {
        router.refresh();
      });
      if (typeof document !== "undefined") {
        document.documentElement.lang = next;
      }
    },
    [locale, router]
  );

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      dict,
      t: (path, fallback) => translate(dict, path, fallback),
      setLocale,
      pending,
    }),
    [locale, dict, setLocale, pending]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return ctx;
}
