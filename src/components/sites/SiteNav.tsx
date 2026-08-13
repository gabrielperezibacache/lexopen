"use client";

import Link from "next/link";
import { ReactNode } from "react";
import { cn } from "@/lib/chile";
import { useI18n } from "@/components/i18n/I18nProvider";

export function SiteNav({
  siteId,
  siteName,
  tipo,
  color,
  active,
  clientView = false,
}: {
  siteId: string;
  siteName: string;
  tipo: string;
  color: string;
  active: string;
  clientView?: boolean;
}) {
  const { t, dict } = useI18n();
  const tabs = [
    { href: "", label: t("siteTabs.overview") },
    { href: "/archivos", label: t("siteTabs.files") },
    { href: "/tareas", label: t("siteTabs.tasks") },
    { href: "/wiki", label: t("siteTabs.wiki") },
    { href: "/isheets", label: t("siteTabs.isheets") },
    { href: "/qa", label: t("siteTabs.qa") },
    { href: "/personas", label: t("siteTabs.people") },
    { href: "/flujos", label: t("siteTabs.workflows") },
  ];
  const visibleTabs = clientView
    ? tabs.filter((tab) => tab.href === "/archivos" || tab.href === "/qa")
    : tabs;
  const tipoLabel =
    dict.siteTabs.types[tipo as keyof typeof dict.siteTabs.types] ||
    tipo.replace("_", " ");

  return (
    <div className="mb-6 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href={clientView ? "/portal" : "/sites"} className="text-sm text-[var(--sea)]">
            {clientView ? t("siteTabs.backToPortal") : t("siteTabs.backToSites")}
          </Link>
          <div className="mt-2 flex items-center gap-3">
            <span className="h-4 w-4 rounded-full" style={{ background: color }} />
            <h1 className="display text-2xl sm:text-3xl md:text-4xl">{siteName}</h1>
          </div>
          <p className="mt-1 text-sm uppercase tracking-[0.14em] text-[var(--ink-soft)]/60">
            {tipoLabel} · {t("siteTabs.spaceLabel")}
          </p>
        </div>
      </div>
      <div className="-mx-1 overflow-x-auto overscroll-x-contain border-b border-[var(--line)] pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex min-w-max gap-1 px-1">
          {visibleTabs.map((tab) => {
            const href = `/sites/${siteId}${tab.href}`;
            const isActive = active === tab.href;
            return (
              <Link
                key={tab.href || "overview"}
                href={href}
                className={cn(
                  "rounded-t-lg px-3 py-2.5 text-sm font-medium whitespace-nowrap transition touch-manipulation",
                  isActive
                    ? "bg-white text-[var(--ink)] shadow-sm"
                    : "text-[var(--ink-soft)]/70 hover:text-[var(--ink)]"
                )}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function ModuleHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--sea)]">
          {eyebrow}
        </p>
        <h1 className="display mt-2 text-2xl sm:text-3xl md:text-4xl">{title}</h1>
        {subtitle && (
          <p className="mt-2 max-w-2xl text-sm text-[var(--ink-soft)]/80 sm:text-base">{subtitle}</p>
        )}
      </div>
      {actions ? (
        <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
