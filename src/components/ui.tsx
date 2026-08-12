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
