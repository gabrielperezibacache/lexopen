import { prisma } from "@/lib/db";
import {
  diasEntre,
  semaforoPorDiasSinMovimiento,
  type Semaforo,
} from "@/lib/pjud/classify";
import {
  fetchPjudMovimientos,
  pjudProviderConfigured,
  type PjudFetchResult,
} from "@/lib/pjud/provider";
import { pjudWebhookConfigured } from "@/lib/pjud/webhook";

export type SyncCausaResult = {
  causaId: string;
  inserted: number;
  skipped: number;
  provider: PjudFetchResult["provider"];
  demo: boolean;
  note: string;
  status: string;
  lastMovimientoAt: string | null;
  diasSinMovimiento: number | null;
  semaforo: Semaforo;
};

function externalKey(rit: string | null, tribunal: string) {
  return `${(rit || "").toUpperCase()}|${tribunal}`.slice(0, 180);
}

export async function syncCausaPjud(
  causaId: string,
  opts?: { actorId?: string | null; force?: boolean }
): Promise<SyncCausaResult> {
  const causa = await prisma.causa.findUnique({
    where: { id: causaId },
    include: {
      abogado: { select: { id: true, role: true } },
      movimientos: { orderBy: { fecha: "desc" }, take: 1 },
    },
  });
  if (!causa) throw new Error("Causa no encontrada");

  if (!causa.pjudMonitoreoActivo && !opts?.force) {
    return {
      causaId,
      inserted: 0,
      skipped: 0,
      provider: "none",
      demo: false,
      note: "Monitoreo desactivado para esta causa.",
      status: "disabled",
      lastMovimientoAt: causa.movimientos[0]?.fecha.toISOString() || null,
      diasSinMovimiento: causa.movimientos[0]
        ? diasEntre(causa.movimientos[0].fecha)
        : null,
      semaforo: semaforoPorDiasSinMovimiento(
        causa.movimientos[0] ? diasEntre(causa.movimientos[0].fecha) : null
      ),
    };
  }

  let fetchResult: PjudFetchResult;
  try {
    fetchResult = await fetchPjudMovimientos({
      id: causa.id,
      rit: causa.rit,
      ruc: causa.ruc,
      tribunal: causa.tribunal,
      titulo: causa.titulo,
      caratula: causa.caratula,
    });
  } catch (e) {
    const note = e instanceof Error ? e.message : "Error de sync";
    await prisma.causa.update({
      where: { id: causaId },
      data: {
        pjudLastSyncAt: new Date(),
        pjudLastSyncStatus: "error",
        pjudLastSyncNote: note,
        pjudExternalKey: externalKey(causa.rit, causa.tribunal),
      },
    });
    throw e;
  }

  if (fetchResult.provider === "none") {
    await prisma.causa.update({
      where: { id: causaId },
      data: {
        pjudLastSyncAt: new Date(),
        pjudLastSyncStatus: "error",
        pjudLastSyncNote: fetchResult.note,
        pjudExternalKey: externalKey(causa.rit, causa.tribunal),
      },
    });
    return {
      causaId,
      inserted: 0,
      skipped: 0,
      provider: "none",
      demo: false,
      note: fetchResult.note,
      status: "error",
      lastMovimientoAt: causa.movimientos[0]?.fecha.toISOString() || null,
      diasSinMovimiento: causa.movimientos[0]
        ? diasEntre(causa.movimientos[0].fecha)
        : null,
      semaforo: semaforoPorDiasSinMovimiento(
        causa.movimientos[0] ? diasEntre(causa.movimientos[0].fecha) : null
      ),
    };
  }

  let inserted = 0;
  let skipped = 0;
  const newRelevant: string[] = [];

  await prisma.$transaction(async (tx) => {
    const externalIds = fetchResult.movimientos.map((m) => m.externalId);
    const existing = externalIds.length
      ? await tx.causaMovimiento.findMany({
          where: { causaId, externalId: { in: externalIds } },
          select: { externalId: true },
        })
      : [];
    const existingIds = new Set(
      existing.map((row) => row.externalId).filter((id): id is string => Boolean(id))
    );
    const pending = fetchResult.movimientos.filter(
      (movement) => !existingIds.has(movement.externalId)
    );
    const created = await tx.causaMovimiento.createMany({
      data: pending.map((m) => ({
        causaId,
        titulo: m.titulo,
        detalle: m.detalle || null,
        fuente: m.fuente,
        tipo: m.tipo || "otro",
        referencia: m.referencia || null,
        externalId: m.externalId,
        relevante: Boolean(m.relevante),
        fecha: m.fecha,
      })),
      skipDuplicates: true,
    });
    inserted = created.count;
    skipped = fetchResult.movimientos.length - inserted;
    for (const movement of pending) {
      if (movement.relevante) newRelevant.push(movement.titulo);
    }

    const status = fetchResult.demo ? "demo" : inserted > 0 ? "ok" : "ok";
    await tx.causa.update({
      where: { id: causaId },
      data: {
        pjudMonitoreoActivo: true,
        pjudLastSyncAt: new Date(),
        pjudLastSyncStatus: status,
        pjudLastSyncNote: fetchResult.note,
        pjudExternalKey: externalKey(causa.rit, causa.tribunal),
      },
    });

    if (inserted > 0) {
      await tx.activity.create({
        data: {
          tipo: "pjud",
          mensaje: `Sync PJUD: +${inserted} movimiento(s)${fetchResult.demo ? " (demo)" : ""}`,
          causaId,
          userId: opts?.actorId || undefined,
        },
      });
    }

    if (
      newRelevant.length &&
      causa.abogadoId &&
      causa.abogado?.role !== "cliente"
    ) {
      await tx.notification.create({
        data: {
          title: `Movimiento relevante · ${causa.rit || causa.titulo}`,
          body: newRelevant.slice(0, 3).join(" · "),
          href: `/causas/${causaId}`,
          userId: causa.abogadoId,
        },
      });
    }
  });

  const latest = await prisma.causaMovimiento.findFirst({
    where: { causaId },
    orderBy: { fecha: "desc" },
  });
  const dias = latest ? diasEntre(latest.fecha) : null;

  return {
    causaId,
    inserted,
    skipped,
    provider: fetchResult.provider,
    demo: fetchResult.demo,
    note: fetchResult.note,
    status: fetchResult.demo ? "demo" : "ok",
    lastMovimientoAt: latest?.fecha.toISOString() || null,
    diasSinMovimiento: dias,
    semaforo: semaforoPorDiasSinMovimiento(dias),
  };
}

export async function setMonitoreoActivo(causaId: string, activo: boolean) {
  return prisma.causa.update({
    where: { id: causaId },
    data: {
      pjudMonitoreoActivo: activo,
      pjudLastSyncStatus: activo
        ? "never"
        : "disabled",
      pjudLastSyncNote: activo
        ? null
        : "Monitoreo desactivado por el estudio.",
    },
  });
}

export async function listCarteraMonitoreo() {
  const causas = await prisma.causa.findMany({
    where: { estado: "activa" },
    include: {
      abogado: { select: { id: true, name: true } },
      cliente: { select: { id: true, razonSocial: true } },
      movimientos: { orderBy: { fecha: "desc" }, take: 1 },
      _count: { select: { movimientos: true } },
    },
    orderBy: [{ pjudMonitoreoActivo: "desc" }, { updatedAt: "desc" }],
  });

  return causas.map((c) => {
    const last = c.movimientos[0] || null;
    const dias = last ? diasEntre(last.fecha) : null;
    return {
      id: c.id,
      titulo: c.titulo,
      rit: c.rit,
      tribunal: c.tribunal,
      materia: c.materia,
      etapa: c.etapa,
      estado: c.estado,
      abogado: c.abogado,
      cliente: c.cliente,
      monitoreoActivo: c.pjudMonitoreoActivo,
      lastSyncAt: c.pjudLastSyncAt,
      lastSyncStatus: c.pjudLastSyncStatus,
      lastSyncNote: c.pjudLastSyncNote,
      movimientosCount: c._count.movimientos,
      lastMovimiento: last
        ? {
            id: last.id,
            titulo: last.titulo,
            fecha: last.fecha,
            tipo: last.tipo,
            fuente: last.fuente,
            relevante: last.relevante,
          }
        : null,
      diasSinMovimiento: dias,
      semaforo: semaforoPorDiasSinMovimiento(dias),
    };
  });
}

export function providerStatusPublic() {
  return {
    apiConfigured: pjudProviderConfigured(),
    webhookConfigured: pjudWebhookConfigured(),
    demoAllowed:
      process.env.PJUD_ALLOW_DEMO === "1" ||
      (process.env.NODE_ENV !== "production" &&
        process.env.PJUD_ALLOW_DEMO !== "0"),
    honesty: pjudProviderConfigured()
      ? "Conector partner API activo (PJUD_API_URL)."
      : "Sin API partner: use sync demo etiquetado o importe CSV desde consulta oficial.",
  };
}
