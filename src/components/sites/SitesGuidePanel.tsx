"use client";

import Link from "next/link";
import { useState } from "react";
import { useI18n } from "@/components/i18n/I18nProvider";

const STORAGE_KEY = "lexopen-sites-guide-collapsed";

export function SitesGuidePanel() {
  const { t } = useI18n();
  const [collapsed, setCollapsed] = useState(true);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
  }

  const rows = [
    {
      module: t("sites.guide.rows.causa.module"),
      purpose: t("sites.guide.rows.causa.purpose"),
      href: "/causas",
      link: t("sites.guide.rows.causa.link"),
    },
    {
      module: t("sites.guide.rows.espacio.module"),
      purpose: t("sites.guide.rows.espacio.purpose"),
      href: null,
      link: t("sites.guide.rows.espacio.link"),
    },
    {
      module: t("sites.guide.rows.documentos.module"),
      purpose: t("sites.guide.rows.documentos.purpose"),
      href: "/documentos",
      link: t("sites.guide.rows.documentos.link"),
    },
    {
      module: t("sites.guide.rows.portal.module"),
      purpose: t("sites.guide.rows.portal.purpose"),
      href: "/portal",
      link: t("sites.guide.rows.portal.link"),
    },
  ];

  return (
    <section className="panel mb-6 rounded-3xl border border-[var(--sea)]/15 bg-[linear-gradient(135deg,rgba(31,111,120,0.06),rgba(255,255,255,0.9))] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-lg font-semibold">{t("sites.guide.title")}</h2>
        <button type="button" className="btn btn-ghost text-sm" onClick={toggle}>
          {collapsed ? t("sites.guide.expand") : t("sites.guide.collapse")}
        </button>
      </div>
      {!collapsed && (
        <>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--line)] text-[var(--ink-soft)]/70">
                  <th className="px-3 py-2 font-medium">{t("sites.guide.columns.module")}</th>
                  <th className="px-3 py-2 font-medium">{t("sites.guide.columns.purpose")}</th>
                  <th className="px-3 py-2 font-medium">{t("sites.guide.columns.link")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.module} className="border-b border-[var(--line)]/60 last:border-0">
                    <td className="px-3 py-3 font-medium">{row.module}</td>
                    <td className="px-3 py-3 text-[var(--ink-soft)]/80">{row.purpose}</td>
                    <td className="px-3 py-3">
                      {row.href ? (
                        <Link href={row.href} className="text-[var(--sea)] hover:underline">
                          {row.link}
                        </Link>
                      ) : (
                        <span className="text-[var(--ink-soft)]/60">{row.link}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-sm text-[var(--ink-soft)]/75">{t("sites.guide.hint")}</p>
        </>
      )}
    </section>
  );
}
