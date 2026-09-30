import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/auth/session";
import { chileGreeting } from "@/lib/assistant/greeting";
import { buildInicioStatus } from "@/lib/assistant/status";
import {
  addCivilDays,
  civilDayQueryRange,
  civilSpanQueryRange,
  santiagoDateKey,
} from "@/lib/chile-time";
import { getI18n } from "@/lib/i18n/server";
import { pageTitleClass } from "@/components/ui";
import { InicioWorkbench } from "@/components/inicio/InicioWorkbench";
import type {
  InicioActivityCard,
  InicioCausaCard,
  InicioEventoCard,
  InicioInitialData,
  InicioPlazoCard,
  InicioSuggestion,
} from "@/components/inicio/types";

/** Línea de estado server-side (sin LLM): reemplaza `{token}` por conteos. */
function buildStatusLine(
  template: string,
  status: { plazosFatalesProximos: number; plazosProximos7d: number; eventosHoy: number; movimientosRecientes: number }
) {
  return template
    .replace("{fatales}", String(status.plazosFatalesProximos))
    .replace("{proximos}", String(status.plazosProximos7d))
    .replace("{eventosHoy}", String(status.eventosHoy))
    .replace("{movimientos}", String(status.movimientosRecientes));
}

function buildSuggestions(
  status: { plazosFatalesProximos: number; eventosHoy: number },
  chips: { plazosFatales: string; agendarManana: string; buscarCausa: string; resumirDocumento: string; plazoProximo: string }
): InicioSuggestion[] {
  const suggestions: InicioSuggestion[] = [];
  if (status.plazosFatalesProximos > 0) {
    suggestions.push({
      label: chips.plazosFatales,
      prompt: "¿Cuáles son mis plazos fatales de esta semana?",
    });
  } else {
    suggestions.push({
      label: chips.plazoProximo,
      prompt: "¿Cuáles son mis próximos plazos?",
    });
  }
  suggestions.push({
    label: chips.agendarManana,
    prompt: "Agenda una audiencia para mañana a las 10:00.",
  });
  suggestions.push({ label: chips.buscarCausa, prompt: "Busca la causa " });
  suggestions.push({
    label: chips.resumirDocumento,
    prompt: "Resume el último documento de la causa ",
  });
  return suggestions;
}

export default async function InicioPage() {
  const user = await requireStaff();
  const { t } = await getI18n();
  const now = new Date();

  const greeting = chileGreeting(user.name, now);
  const status = await buildInicioStatus(user.id, now);

  const todayYmd = santiagoDateKey(now);
  const in7dYmd = addCivilDays(todayYmd, 7);
  const hoyRange = civilDayQueryRange(todayYmd);
  const proxima7dRange = civilSpanQueryRange(todayYmd, in7dYmd);

  const [eventosHoyRaw, plazosHoyRaw, plazosProximosRaw, actividadRaw, causasRecientesRaw] =
    await Promise.all([
      prisma.evento.findMany({
        where: {
          estado: { not: "cancelado" },
          inicio: { gte: hoyRange.start, lte: hoyRange.end },
          responsableId: user.id,
        },
        orderBy: { inicio: "asc" },
        take: 5,
      }),
      prisma.plazo.findMany({
        where: {
          estado: "pendiente",
          fechaLimite: { gte: hoyRange.start, lte: hoyRange.end },
          responsableId: user.id,
        },
        include: { causa: { select: { id: true, rit: true, titulo: true } } },
        orderBy: { fechaLimite: "asc" },
        take: 5,
      }),
      prisma.plazo.findMany({
        where: {
          estado: "pendiente",
          fechaLimite: { gte: proxima7dRange.start, lte: proxima7dRange.end },
          responsableId: user.id,
        },
        include: { causa: { select: { id: true, rit: true, titulo: true } } },
        orderBy: { fechaLimite: "asc" },
        take: 5,
      }),
      prisma.activity.findMany({
        include: {
          user: { select: { name: true } },
          causa: { select: { id: true, rit: true, titulo: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      prisma.causa.findMany({
        where: user.role === "admin" ? {} : { abogadoId: user.id },
        select: { id: true, titulo: true, rit: true, estado: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 5,
      }),
    ]);

  const eventosHoy: InicioEventoCard[] = eventosHoyRaw.map((e) => ({
    id: e.id,
    titulo: e.titulo,
    tipo: e.tipo,
    inicio: e.inicio.toISOString(),
    fin: e.fin ? e.fin.toISOString() : null,
    causaId: e.causaId,
  }));

  const toPlazoCard = (p: (typeof plazosHoyRaw)[number]): InicioPlazoCard => ({
    id: p.id,
    titulo: p.titulo,
    fechaLimite: p.fechaLimite.toISOString(),
    esFatal: p.esFatal,
    causaId: p.causaId,
    causaLabel: p.causa ? p.causa.rit || p.causa.titulo : null,
  });

  const plazosHoy = plazosHoyRaw.map(toPlazoCard);
  const plazosProximos = plazosProximosRaw.map(toPlazoCard);

  const actividad: InicioActivityCard[] = actividadRaw.map((a) => ({
    id: a.id,
    tipo: a.tipo,
    mensaje: a.mensaje,
    createdAt: a.createdAt.toISOString(),
    userName: a.user?.name || null,
    causaId: a.causaId,
    siteId: a.siteId,
  }));

  const causasRecientes: InicioCausaCard[] = causasRecientesRaw.map((c) => ({
    id: c.id,
    titulo: c.titulo,
    rit: c.rit,
    estado: c.estado,
    updatedAt: c.updatedAt.toISOString(),
  }));

  const statusLine =
    status.plazosFatalesProximos > 0 ||
    status.plazosProximos7d > 0 ||
    status.eventosHoy > 0 ||
    status.movimientosRecientes > 0
      ? buildStatusLine(t("inicio.status.line"), status)
      : t("inicio.status.empty");

  const suggestions = buildSuggestions(status, {
    plazosFatales: t("inicio.chips.plazosFatales"),
    agendarManana: t("inicio.chips.agendarManana"),
    buscarCausa: t("inicio.chips.buscarCausa"),
    resumirDocumento: t("inicio.chips.resumirDocumento"),
    plazoProximo: t("inicio.chips.plazoProximo"),
  });

  const initialData: InicioInitialData = {
    hoy: { eventos: eventosHoy, plazos: plazosHoy },
    plazosProximos,
    actividad,
    causasRecientes,
    suggestions,
  };

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--sea)]">
          {t("inicio.eyebrow")}
        </p>
        <h1 className={pageTitleClass}>{greeting}</h1>
        <p
          className="mt-2 max-w-3xl text-sm text-[var(--ink-soft)]/80 sm:text-base"
          data-testid="inicio-status-line"
        >
          {statusLine}
        </p>
      </header>

      <InicioWorkbench initialData={initialData} />
    </div>
  );
}
