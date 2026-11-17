import Link from "next/link";
import { CalendarDays, Clock3, FolderOpen, ListChecks } from "lucide-react";
import { buildInicioStatus } from "@/lib/assistant/status";
import { buildNavigation } from "@/lib/navigation/catalog";
import { getHostNavigationSections } from "@/lib/config/host-navigation-sections";
import { getI18n } from "@/lib/i18n/server";
import { upcomingDeadlinePeriod } from "@/lib/deadlines/views";
import { formatCivilDate } from "@/lib/chile-time";
import type { CausaAccessUser } from "@/lib/auth/causa-access";
import styles from "./DayOverview.module.css";
export async function DayOverview({ user }: { user: CausaAccessUser }) {
  const now = new Date();
  const [{ locale }, visibleSections, status] = await Promise.all([
    getI18n(),
    getHostNavigationSections(),
    buildInicioStatus(user, now),
  ]);
  const en = locale === "en",
    nav = buildNavigation(user, { visibleSections });
  const allowed = new Set(nav.entries.map((entry) => entry.href));
  const period = upcomingDeadlinePeriod(now);
  const cards = [
    {
      href: "/plazos?vista=mis-vencidos",
      gate: "/plazos",
      label: en ? "Overdue and pending" : "Vencidos pendientes",
      count: status.plazosVencidos,
      note: en ? "All months" : "Todos los meses",
      icon: Clock3,
      urgent: status.plazosVencidos > 0,
    },
    {
      href: "/plazos?vista=proximos",
      gate: "/plazos",
      label: en ? "Upcoming deadlines" : "Próximos plazos",
      count: status.plazosProximos7d,
      note: `${en ? "Through" : "Hasta"} ${formatCivilDate(period.through)}${status.plazosFatalesProximos ? ` · ${status.plazosFatalesProximos} ${en ? "fatal" : "fatales"}` : ""}`,
      icon: ListChecks,
      urgent: status.plazosFatalesProximos > 0,
    },
    {
      href: `/calendario?vista=semana&semana=${period.first}`,
      gate: "/calendario",
      label: en ? "Today's events" : "Eventos de hoy",
      count: status.eventosHoy,
      note: en ? "Open agenda" : "Ver agenda",
      icon: CalendarDays,
      urgent: false,
    },
  ].filter((card) => allowed.has(card.gate));
  return (
    <section
      className={styles.overview}
      aria-label={en ? "Your workday" : "Tu jornada"}
      data-testid="day-overview"
    >
      <div className={styles.header}>
        <div>
          <h2>{en ? "Your workday" : "Tu jornada"}</h2>
          <span>
            {en
              ? "Assigned to you · Santiago time"
              : "Asignados a ti · hora de Santiago"}
          </span>
        </div>
        <Link href={allowed.has("/mis-causas") ? "/mis-causas" : "/cuenta"}>
          <FolderOpen size={15} aria-hidden="true" />
          {allowed.has("/mis-causas")
            ? en
              ? "My matters"
              : "Mis Causas"
            : en
              ? "My account"
              : "Mi cuenta"}
        </Link>
      </div>
      <div className={styles.cards}>
        {cards.map(({ href, label, count, note, icon: Icon, urgent }) => (
          <Link
            key={href}
            href={href}
            className={styles.card}
            data-attention={urgent || undefined}
          >
            <span className={styles.label}>
              <Icon size={15} aria-hidden="true" />
              {label}
            </span>
            <strong>{count}</strong>
            <span className={styles.note}>{note}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
