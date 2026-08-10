"use client";

import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { useI18n } from "@/components/i18n/I18nProvider";

export function LanguageSettingsPanel() {
  const { t } = useI18n();
  return (
    <section className="panel rounded-3xl p-5">
      <h2 className="text-lg font-semibold">{t("settings.languageTitle")}</h2>
      <p className="mt-2 max-w-2xl text-sm text-[var(--ink-soft)]/75">
        {t("settings.languageHelp")}
      </p>
      <div className="mt-4">
        <LanguageSwitcher />
      </div>
    </section>
  );
}
