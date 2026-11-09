import Link from "next/link";
import { ArrowUpRight, CalendarDays, Clock3, FolderOpen, ListChecks } from "lucide-react";
import { buildInicioStatus } from "@/lib/assistant/status";
import { buildNavigation } from "@/lib/navigation/catalog";
import { getHostNavigationSections } from "@/lib/config/host-navigation-sections";
import { getI18n } from "@/lib/i18n/server";
import type { CausaAccessUser } from "@/lib/auth/causa-access";
import styles from "./DayOverview.module.css";
import { DayOverviewDisclosure } from "./DayOverviewDisclosure";
export async function DayOverview({ user }: { user: CausaAccessUser }) {
  const [{ locale }, visibleSections, status] = await Promise.all([getI18n(), getHostNavigationSections(), buildInicioStatus(user)]);
  const en = locale === "en", nav = buildNavigation(user, { visibleSections });
  const allowed = new Set(nav.entries.map(entry => entry.href));
  const cards = [
    { href: "/plazos?vista=mis-vencidos", gate: "/plazos", label: en ? "Overdue and pending" : "Vencidos pendientes", count: status.plazosVencidos, note: en ? "Assigned to you · all months" : "Asignados a ti · todos los meses", icon: Clock3, urgent: status.plazosVencidos > 0 },
    { href: "/plazos", gate: "/plazos", label: en ? "Deadlines · next 7 days" : "Plazos · próximos 7 días", count: status.plazosProximos7d, note: en ? `${status.plazosFatalesProximos} fatal deadlines · assigned to you` : `${status.plazosFatalesProximos} fatales · asignados a ti`, icon: ListChecks, urgent: status.plazosFatalesProximos > 0 },
    { href: "/calendario", gate: "/calendario", label: en ? "Today's events" : "Eventos de hoy", count: status.eventosHoy, note: en ? "Assigned to you · Santiago time" : "Asignados a ti · hora de Santiago", icon: CalendarDays, urgent: false },
  ].filter(card => allowed.has(card.gate));
  return <section className={styles.overview} aria-label={en ? "Your workday" : "Tu jornada"} data-testid="day-overview">
    <DayOverviewDisclosure title={en ? "Your workday" : "Tu jornada"} summary={cards.map(card => `${card.count} ${card.label.toLowerCase()}`).join(" · ")}>
    <div className={styles.header}><div><h2 id="day-overview-title">{en ? "Your workday" : "Tu jornada"}</h2><p>{en ? "Registered information you can access in LexOpen." : "Información registrada a la que tienes acceso en LexOpen."}</p></div>{<Link href={allowed.has("/mis-causas") ? "/mis-causas" : "/cuenta"} className="btn btn-secondary"><FolderOpen size={16} aria-hidden="true" />{allowed.has("/mis-causas") ? (en ? "Open my matters" : "Abrir Mis Causas") : (en ? "My account" : "Mi cuenta")}</Link>}</div>
    <div className={styles.cards}>{cards.map(({ href, label, count, note, icon: Icon, urgent }) => <Link key={href} href={href} className={styles.card} data-attention={urgent || undefined}><div className={styles.label}><Icon size={17} aria-hidden="true" /><span>{label}</span><ArrowUpRight size={15} aria-hidden="true" /></div><strong>{count}</strong><span className={styles.note}>{note}</span></Link>)}</div>
    </DayOverviewDisclosure>
  </section>;
}
