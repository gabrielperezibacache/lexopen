import { getI18n } from "@/lib/i18n/server";

export default async function AppLoading() {
  const { t } = await getI18n();
  return (
    <div role="status" aria-live="polite" className="panel h-40 animate-pulse motion-reduce:animate-none rounded-3xl p-6 text-sm text-[var(--ink-soft)]/65">
      {t("common.loadingApp")}
    </div>
  );
}
