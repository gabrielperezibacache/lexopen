import { format } from "date-fns";
import { es, enUS } from "date-fns/locale";
import type { Locale } from "@/lib/i18n";

function dateFnsLocale(locale?: Locale | string | null) {
  return locale === "en" ? enUS : es;
}

export function formatDate(
  value?: string | Date | null,
  locale?: Locale | string | null
) {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return format(d, "dd MMM yyyy", { locale: dateFnsLocale(locale) });
}

export function formatDateTime(
  value?: string | Date | null,
  locale?: Locale | string | null
) {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return format(d, "dd MMM yyyy · HH:mm", { locale: dateFnsLocale(locale) });
}

export function StatusBadge({
  estado,
}: {
  estado: string;
}) {
  const map: Record<string, string> = {
    activa: "badge-activa",
    pendiente: "badge-pendiente",
    vencido: "badge-vencido",
    cumplido: "badge-activa",
    terminada: "badge-ink",
    archivada: "badge-ink",
    suspensa: "badge-pendiente",
  };
  return <span className={`badge ${map[estado] || "badge-ink"}`}>{estado}</span>;
}

/** Shared responsive display title scale for app pages. */
export const pageTitleClass =
  "display mt-2 break-words text-2xl sm:text-3xl md:text-4xl";

export const pageToolbarClass =
  "mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between";

