"use client";

import { useI18n } from "@/components/i18n/I18nProvider";
import { ErrorState } from "@/components/ui/ErrorState";

export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const { t } = useI18n();
  const forbidden =
    error.message === "Prohibido" || error.message === "Forbidden";

  return (
    <ErrorState
      eyebrow={t("errors.eyebrow")}
      title={t("errors.title")}
      description={
        forbidden
          ? t("errors.forbidden")
          : process.env.NODE_ENV === "production"
            ? t("errors.genericProd")
            : error.message
      }
      retryLabel={t("common.retry")}
      onRetry={retry}
    />
  );
}
