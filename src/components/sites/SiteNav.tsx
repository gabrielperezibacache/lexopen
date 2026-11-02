"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/chile";
import { useI18n } from "@/components/i18n/I18nProvider";
import { pageTitleClass } from "@/components/ui";
import { FileStack, BookOpen, Newspaper, Table2, ListTodo, MessagesSquare, Users, GitBranch, LayoutDashboard } from "lucide-react";

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
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const revealActive = () => {
      const selected = nav.querySelector<HTMLElement>('[aria-current="page"]');
      if (selected) nav.scrollLeft += selected.getBoundingClientRect().left - nav.getBoundingClientRect().left - 8;
    };
    revealActive();
    const observer = new ResizeObserver(revealActive);
    observer.observe(nav);
    return () => observer.disconnect();
  }, [active]);
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

  const icons = [LayoutDashboard, FileStack, BookOpen, Newspaper, Table2, ListTodo, MessagesSquare, Users, GitBranch];
  const breadcrumb = [clienteName, causaRit].filter(Boolean).join(" · ");

  return (
    <div className="mb-6 min-w-0 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <Link href={clientView ? "/portal" : "/sites"} className="inline-flex min-h-11 items-center text-sm text-[var(--sea)] hover:underline">
            {clientView ? t("siteTabs.backToPortal") : t("siteTabs.backToSites")}
          </Link>
          <div className="mt-2 flex min-w-0 items-start gap-3">
            <span
              className="mt-2.5 h-3 w-3 shrink-0 rounded-full"
              style={{ background: color }}
            />
            <h1 className={cn(pageTitleClass, "mt-0 min-w-0 break-words")} title={siteName}>
              {siteName}
            </h1>
          </div>
          <p className="mt-2 text-sm text-[var(--ink-soft)]">
            {tipoLabel}
            {isClientVisible && (
              <span className="ml-2 badge badge-sea">{t("siteTabs.portalVisible")}</span>
            )}
            {status === "archived" && (
              <span className="ml-2 badge badge-ink">{t("siteTabs.archived")}</span>
            )}
          </p>
          {breadcrumb && !clientView && (
            <p className="mt-2 break-words text-sm text-[var(--ink-soft)]">{breadcrumb}</p>
          )}
        </div>
      </div>
      <nav ref={navRef} aria-label={siteName} className="max-w-full overflow-x-auto overscroll-x-contain border-b border-[var(--line)] pb-2 [scrollbar-width:thin]">
        <div className="flex min-w-max items-center gap-1">
          {visibleTabs.map((tab) => {
                    const href = `/sites/${siteId}${tab.href}`;
                    const isActive = active === tab.href;
                    const Icon = icons[allTabs.indexOf(tab)];
                    return (
                      <Link
                        key={tab.href || "overview"}
                        href={href}
                        aria-current={isActive ? "page" : undefined}
                        className={cn(
                          "inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-medium whitespace-nowrap transition-colors touch-manipulation",
                          isActive
                            ? "bg-[var(--sea-soft)] text-[var(--sea)]"
                            : "text-[var(--ink-soft)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"
                        )}
                      >
                        <Icon size={16} aria-hidden="true" className="shrink-0" />
                        {tab.label}
                      </Link>
                    );
                  })}
        </div>
      </nav>
    </div>
  );
}

/** Re-export Phase 2 headers — prefer `@/components/ui`. */
export { PageHeader, ModuleHeader } from "@/components/ui/PageHeader";
