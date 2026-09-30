import Link from "next/link";
import { getI18n } from "@/lib/i18n/server";
import { pageTitleClass } from "@/components/ui";

export default async function NotFound() {
  const { t } = await getI18n();
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col justify-center px-6 py-16">
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--sea)]">
        404
      </p>
      <h1 className={`${pageTitleClass} mt-2`}>{t("errors.notFoundTitle")}</h1>
      <p className="mt-3 text-sm text-[var(--muted)]">
        {t("errors.notFoundDescription")}
      </p>
      <Link
        href="/inicio"
        className="btn btn-primary mt-6 inline-flex w-fit items-center justify-center"
      >
        {t("errors.goHome")}
      </Link>
    </main>
  );
}
