"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/components/i18n/I18nProvider";

const LABEL_KEYS: Record<string, string> = {
  inicio: "nav.home",
  dashboard: "nav.panel",
  causas: "nav.cases",
  plazos: "nav.deadlines",
  calendario: "nav.calendar",
  tareas: "nav.tasks",
  clientes: "nav.clients",
  portal: "nav.portal",
  documentos: "nav.documents",
  minutas: "nav.minutes",
  jurisprudencia: "nav.jurisprudence",
  facturacion: "nav.billing",
  configuracion: "nav.settings",
  integraciones: "nav.integrations",
  auditoria: "nav.audit",
  correo: "nav.mailbox",
  buscar: "nav.search",
  notificaciones: "nav.notifications",
  sites: "nav.sites",
  mensajes: "nav.messages",
  flujos: "nav.workflows",
  personas: "nav.people",
  agente: "nav.assistant",
  cuenta: "nav.account",
};

export function Breadcrumbs() {
  const pathname = usePathname() || "/";
  const { t } = useI18n();
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return null;

  const crumbs = parts.map((part, index) => {
    const href = "/" + parts.slice(0, index + 1).join("/");
    const key = LABEL_KEYS[part];
    const label = key ? t(key) : decodeURIComponent(part);
    return { href, label, last: index === parts.length - 1 };
  });

  return (
    <nav aria-label={t("common.breadcrumbs")} className="min-w-0">
      <ol className="flex flex-wrap items-center gap-1 text-xs text-[var(--muted)]">
        <li>
          <Link href="/inicio" className="hover:text-[var(--sea)]">
            {t("nav.home")}
          </Link>
        </li>
        {crumbs.map((c) => (
          <li key={c.href} className="flex min-w-0 items-center gap-1">
            <span aria-hidden="true">/</span>
            {c.last ? (
              <span className="truncate font-medium text-[var(--ink)]" aria-current="page">
                {c.label}
              </span>
            ) : (
              <Link href={c.href} className="truncate hover:text-[var(--sea)]">
                {c.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
