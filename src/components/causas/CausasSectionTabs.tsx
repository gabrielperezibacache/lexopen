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
      className="flex flex-wrap gap-1 rounded-2xl border border-[var(--line)] bg-white/70 p-1"
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
            className={cn(
              "rounded-xl px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-[var(--sea)] text-white"
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
