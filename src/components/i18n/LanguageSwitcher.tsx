"use client";

import { ChevronDown } from "lucide-react";
import { LOCALES, LOCALE_LABELS, type Locale } from "@/lib/i18n";
import { useI18n } from "@/components/i18n/I18nProvider";

type Props = {
  variant?: "dark" | "light" | "compact";
  className?: string;
};

export function LanguageSwitcher({
  variant = "light",
  className = "",
}: Props) {
  const { locale, setLocale, pending, t } = useI18n();

  const base =
    variant === "dark"
      ? "border-white/20 bg-white/5 text-white"
      : variant === "compact"
        ? "border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] text-xs"
        : "border-[var(--line)] bg-[var(--surface-solid)] text-[var(--ink)]";

  return (
    <label className={`inline-flex items-center gap-2 ${className}`}>
      <span className="sr-only">{t("common.language")}</span>
      <span className="relative inline-flex items-center">
        <select
          data-custom-select
          className={`min-h-11 appearance-none rounded-full border py-1.5 ps-3 pe-11 font-medium outline-none focus:ring-2 focus:ring-[var(--sea)]/40 ${base}`}
          value={locale}
          disabled={pending}
          onChange={(e) => void setLocale(e.target.value as Locale)}
        >
          {LOCALES.map((code) => (
            <option key={code} value={code}>
              {LOCALE_LABELS[code]}
            </option>
          ))}
        </select>
        <ChevronDown size={14} aria-hidden="true" className="pointer-events-none absolute end-4" />
      </span>
    </label>
  );
}
