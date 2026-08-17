"use client";

import Link from "next/link";
import { ReactNode } from "react";
import { cn } from "@/lib/chile";
import { useI18n } from "@/components/i18n/I18nProvider";
import { pageTitleClass } from "@/components/ui";

type Tab = { href: string; label: string; group: "content" | "collab" };

export function SiteNav({
  siteId,
  siteName,
  tipo,
  color,
  active,
  clientView = false,
  clienteName,
  causaRit,
  isClientVisible = false,
  status,
}: {
  siteId: string;
  siteName: string;
  tipo: string;
  color: string;
  active: string;
  clientView?: boolean;
  clienteName?: string | null;
  causaRit?: string | null;
  isClientVisible?: boolean;
  status?: string;
}) {
  const { t, dict } = useI18n();
  const allTabs: Tab[] = [
    { href: "", label: t("siteTabs.overview"), group: "content" },
    { href: "/archivos", label: t("siteTabs.files"), group: "content" },
    { href: "/wiki", label: t("siteTabs.wiki"), group: "content" },
    { href: "/blog", label: t("siteTabs.blog"), group: "content" },
    { href: "/isheets", label: t("siteTabs.isheets"), group: "content" },
    { href: "/tareas", label: t("siteTabs.tasks"), group: "collab" },
    { href: "/qa", label: t("siteTabs.qa"), group: "collab" },
    { href: "/personas", label: t("siteTabs.people"), group: "collab" },
    { href: "/flujos", label: t("siteTabs.workflows"), group: "collab" },
  ];
  const visibleTabs = clientView
    ? allTabs.filter(
        (tab) =>
          tab.href === "/archivos" || tab.href === "/qa" || tab.href === "/blog"
      )
    : allTabs;
  const tipoLabel =
    dict.siteTabs.types[tipo as keyof typeof dict.siteTabs.types] ||
    tipo.replace("_", " ");

  const groups: Array<{ key: Tab["group"]; tabs: Tab[] }> = clientView
    ? [{ key: "content", tabs: visibleTabs }]
    : [
        {
          key: "content",
          tabs: visibleTabs.filter((tab) => tab.group === "content"),
        },
        {
          key: "collab",
          tabs: visibleTabs.filter((tab) => tab.group === "collab"),
        },
      ];

  const breadcrumb = [clienteName, causaRit, siteName].filter(Boolean).join(" · ");

  return (
    <div className="mb-6 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <Link href={clientView ? "/portal" : "/sites"} className="text-sm text-[var(--sea)]">
            {clientView ? t("siteTabs.backToPortal") : t("siteTabs.backToSites")}
          </Link>
          <div className="mt-2 flex min-w-0 items-start gap-3">
            <span
              className="mt-1.5 h-4 w-4 shrink-0 rounded-full"
              style={{ background: color }}
            />
            <h1 className={cn(pageTitleClass, "mt-0")} title={siteName}>
              {siteName}
            </h1>
          </div>
          <p className="mt-1 text-sm text-[var(--ink-soft)]/70">
            {tipoLabel}
            {isClientVisible && (
              <span className="ml-2 badge badge-sea">{t("siteTabs.portalVisible")}</span>
            )}
            {status === "archived" && (
              <span className="ml-2 badge badge-ink">{t("siteTabs.archived")}</span>
            )}
          </p>
          {breadcrumb && !clientView && (
            <p className="mt-1 text-xs text-[var(--ink-soft)]/60">{breadcrumb}</p>
          )}
        </div>
      </div>
      <div className="relative space-y-2">
        {groups.map((group) => (
          <div key={group.key}>
            {!clientView && (
              <p className="mb-1 px-1 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-soft)]/55">
                {t(`siteTabs.tabGroups.${group.key}`)}
              </p>
            )}
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 right-0 z-[1] w-8 bg-gradient-to-l from-[var(--paper)] to-transparent md:hidden" />
              <div className="-mx-1 overflow-x-auto overscroll-x-contain border-b border-[var(--line)] pb-1 [scrollbar-width:thin]">
                <div className="flex min-w-max gap-1 px-1">
                  {group.tabs.map((tab) => {
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
          </div>
        ))}
      </div>
    </div>
  );
}

/** Shared page header for app and module routes. */
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--sea)]">
            {eyebrow}
          </p>
        ) : null}
        <h1 className={cn(pageTitleClass, !eyebrow && "mt-0")}>{title}</h1>
        {subtitle ? (
          <div className="mt-2 max-w-2xl text-sm text-[var(--ink-soft)]/80 sm:text-base">
            {subtitle}
          </div>
        ) : null}
      </div>
      {actions ? (
        <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
          {actions}
        </div>
      ) : null}
    </div>
  );
}

/** Alias with required eyebrow — delegates to PageHeader. */
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
    <PageHeader
      eyebrow={eyebrow}
      title={title}
      subtitle={subtitle}
      actions={actions}
    />
  );
}
