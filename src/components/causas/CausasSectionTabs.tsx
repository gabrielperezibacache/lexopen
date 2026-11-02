"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/components/i18n/I18nProvider";
import { cn } from "@/lib/chile";
import { shouldShowCausasSectionTabs } from "@/lib/causas/section-tabs";

export function CausasSectionTabs({
  canOperateClaveUnica,
}: {
  canOperateClaveUnica: boolean;
}) {
  const pathname = usePathname() || "";
  const { t } = useI18n();

  if (!shouldShowCausasSectionTabs(pathname)) return null;

  const tabs = [
    { href: "/causas", label: t("causas.tabs.expediente"), exact: true },
    { href: "/causas/monitoreo", label: t("causas.tabs.cartera") },
    {
      href: "/causas/mis-causas",
      label: t("causas.tabs.claveunica"),
      hint: canOperateClaveUnica ? undefined : t("causas.tabs.claveunicaHint"),
    },
  ] as const;

  return (
    <nav
      aria-label={t("causas.tabs.nav")}
      data-testid="causas-section-tabs"
      className="flex flex-nowrap gap-1 overflow-x-auto rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface-solid)] p-1"
    >
      {tabs.map((tab) => {
        const active = "exact" in tab && tab.exact
          ? pathname === tab.href
          : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            title={"hint" in tab ? tab.hint : undefined}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-[var(--radius-sm)] px-2 py-2 text-sm font-medium transition-colors sm:px-3",
              active
                ? "bg-[var(--sea-solid)] text-white"
                : "text-[var(--ink-soft)]/80 hover:bg-[var(--sea)]/8 hover:text-[var(--ink)]"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
