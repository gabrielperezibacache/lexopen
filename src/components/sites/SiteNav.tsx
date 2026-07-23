"use client";

import Link from "next/link";
import { ReactNode } from "react";
import { cn } from "@/lib/chile";

const tabs = [
  { href: "", label: "Overview" },
  { href: "/archivos", label: "Files" },
  { href: "/tareas", label: "Tasks" },
  { href: "/wiki", label: "Wiki" },
  { href: "/isheets", label: "iSheets" },
  { href: "/qa", label: "Q&A" },
  { href: "/personas", label: "People" },
  { href: "/flujos", label: "Workflows" },
];

export function SiteNav({
  siteId,
  siteName,
  tipo,
  color,
  active,
}: {
  siteId: string;
  siteName: string;
  tipo: string;
  color: string;
  active: string;
}) {
  return (
    <div className="mb-6 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/sites" className="text-sm text-[var(--sea)]">
            ← Sites
          </Link>
          <div className="mt-2 flex items-center gap-3">
            <span className="h-4 w-4 rounded-full" style={{ background: color }} />
            <h1 className="display text-3xl md:text-4xl">{siteName}</h1>
          </div>
          <p className="mt-1 text-sm uppercase tracking-[0.14em] text-[var(--ink-soft)]/60">
            {tipo.replace("_", " ")} · HighQ site
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-1 border-b border-[var(--line)] pb-1">
        {tabs.map((t) => {
          const href = `/sites/${siteId}${t.href}`;
          const isActive = active === t.href;
          return (
            <Link
              key={t.href || "overview"}
              href={href}
              className={cn(
                "rounded-t-lg px-3 py-2 text-sm font-medium transition",
                isActive
                  ? "bg-white text-[var(--ink)] shadow-sm"
                  : "text-[var(--ink-soft)]/70 hover:text-[var(--ink)]"
              )}
            >
              {t.label}
            </Link>
          );
        })}
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
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--sea)]">
          {eyebrow}
        </p>
        <h1 className="display mt-2 text-4xl">{title}</h1>
        {subtitle && <p className="mt-2 max-w-2xl text-[var(--ink-soft)]/80">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}
