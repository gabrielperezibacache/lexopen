"use client";

import { useI18n } from "@/components/i18n/I18nProvider";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useI18n();
  const forbidden =
    error.message === "Prohibido" || error.message === "Forbidden";

  return (
    <div className="panel rounded-3xl p-6">
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--danger)]">
        {t("errors.eyebrow")}
      </p>
      <h1 className="display mt-2 text-3xl">{t("errors.title")}</h1>
      <p className="mt-2 text-sm text-[var(--ink-soft)]/75">
        {forbidden
          ? t("errors.forbidden")
          : process.env.NODE_ENV === "production"
            ? t("errors.genericProd")
            : error.message}
      </p>
      <button className="btn btn-primary mt-4" type="button" onClick={reset}>
        {t("common.retry")}
      </button>
    </div>
  );
}
