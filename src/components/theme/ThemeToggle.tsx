"use client";

import { Moon, Sun } from "lucide-react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { useTheme } from "@/components/theme/ThemeProvider";

export function ThemeToggle({
  className = "",
  variant = "light",
}: {
  className?: string;
  variant?: "light" | "dark";
}) {
  const { resolved, toggle } = useTheme();
  const { t } = useI18n();
  const isDark = resolved === "dark";
  const label = isDark ? t("common.themeLight") : t("common.themeDark");

  return (
    <button
      type="button"
      className={
        className ||
        (variant === "dark"
          ? "grid min-h-[40px] min-w-[40px] place-items-center rounded-xl bg-white/10 text-white"
          : "grid min-h-[40px] min-w-[40px] place-items-center rounded-xl border border-[var(--line)] bg-[var(--surface-solid)] text-[var(--ink)]")
      }
      onClick={toggle}
      aria-label={label}
      title={label}
    >
      {isDark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
