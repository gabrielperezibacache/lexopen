"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { formatDate, formatDateTime, UrgenciaBadge } from "@/components/ui";
import { useI18n } from "@/components/i18n/I18nProvider";
import type {
  InicioActivityCard,
  InicioCausaCard,
  InicioEventoCard,
  InicioPlazoCard,
} from "@/components/inicio/types";

function CardShell({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="panel flex flex-col gap-3 rounded-3xl p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-[0.1em] text-[var(--ink-soft)]/70">
          {title}
        </h2>
        {action}
      </div>
      <div className="space-y-2 text-sm">{children}</div>
    </div>
  );
}

export function HoyCard({
  eventos,
  plazos,
}: {
  eventos: InicioEventoCard[];
  plazos: InicioPlazoCard[];
}) {
  const { t, locale } = useI18n();
  const empty = eventos.length === 0 && plazos.length === 0;
  return (
    <CardShell title={t("inicio.cards.hoy.title")}>
      {empty && (
        <p className="text-[var(--ink-soft)]/65">{t("inicio.cards.hoy.empty")}</p>
      )}
      {eventos.map((e) => (
        <Link
          key={e.id}
          href="/calendario"
          className="block truncate rounded-lg bg-amber-100 px-2 py-1.5 text-amber-950"
          title={e.titulo}
        >
          {formatDateTime(e.inicio, locale)} · {e.titulo}
        </Link>
      ))}
      {plazos.map((p) => (
        <Link
          key={p.id}
          href={p.causaId ? `/causas/${p.causaId}` : "/plazos"}
          className={`block truncate rounded-lg px-2 py-1.5 ${
            p.esFatal ? "bg-red-100 text-red-800" : "bg-[var(--copper)]/15 text-[var(--ink)]"
          }`}
          title={p.titulo}
        >
          {p.esFatal ? "Fatal · " : "Plazo · "}
          {p.titulo}
        </Link>
      ))}
    </CardShell>
  );
}

export function PlazosCard({ plazos }: { plazos: InicioPlazoCard[] }) {
  const { t } = useI18n();
  return (
    <CardShell
      title={t("inicio.cards.plazos.title")}
      action={
        <Link href="/plazos" className="text-xs text-[var(--sea)]">
          {t("dashboard.viewAll")}
        </Link>
      }
    >
      {plazos.length === 0 && (
        <p className="text-[var(--ink-soft)]/65">{t("inicio.cards.plazos.empty")}</p>
      )}
      {plazos.map((p) => (
        <Link
          key={p.id}
          href={p.causaId ? `/causas/${p.causaId}` : "/plazos"}
          className="flex items-center justify-between gap-2 rounded-lg border border-[var(--line)] px-2 py-1.5 hover:bg-white/70"
        >
          <span className="min-w-0 truncate">
            {p.esFatal ? "Fatal · " : ""}
            {p.titulo}
          </span>
          <UrgenciaBadge fecha={p.fechaLimite} />
        </Link>
      ))}
    </CardShell>
  );
}

export function ActividadCard({ items }: { items: InicioActivityCard[] }) {
  const { t, locale } = useI18n();
  return (
    <CardShell title={t("inicio.cards.actividad.title")}>
      {items.length === 0 && (
        <p className="text-[var(--ink-soft)]/65">{t("inicio.cards.actividad.empty")}</p>
      )}
      {items.map((a) => (
        <div key={a.id} className="rounded-lg border border-[var(--line)] px-2 py-1.5">
          <p className="truncate">{a.mensaje}</p>
          <p className="text-xs text-[var(--ink-soft)]/60">
            {a.userName || t("dashboard.activity.system")} · {formatDate(a.createdAt, locale)}
            {a.causaId && (
              <>
                {" · "}
                <Link href={`/causas/${a.causaId}`} className="text-[var(--sea)]">
                  {t("inicio.result.view")}
                </Link>
              </>
            )}
          </p>
        </div>
      ))}
    </CardShell>
  );
}

export function CausasCard({ items }: { items: InicioCausaCard[] }) {
  const { t } = useI18n();
  return (
    <CardShell
      title={t("inicio.cards.causas.title")}
      action={
        <Link href="/causas" className="text-xs text-[var(--sea)]">
          {t("dashboard.viewAll")}
        </Link>
      }
    >
      {items.length === 0 && (
        <p className="text-[var(--ink-soft)]/65">{t("inicio.cards.causas.empty")}</p>
      )}
      {items.map((c) => (
        <Link
          key={c.id}
          href={`/causas/${c.id}`}
          className="flex items-center justify-between gap-2 rounded-lg border border-[var(--line)] px-2 py-1.5 hover:bg-white/70"
        >
          <span className="min-w-0 truncate">{c.rit || c.titulo}</span>
          <span className="badge badge-ink shrink-0">{c.estado}</span>
        </Link>
      ))}
    </CardShell>
  );
}
