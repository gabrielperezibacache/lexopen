import { prisma } from "@/lib/db";
import {
  diasEntre,
  semaforoPorDiasSinMovimiento,
  type Semaforo,
} from "@/lib/pjud/classify";
import {
  fetchPjudMovimientos,
  pjudProviderConfigured,
  pjudSyncIntervalMs,
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
  jobId?: string | null;
  lastMovimientoAt: string | null;
  nextSyncAt: string | null;
  diasSinMovimiento: number | null;
  semaforo: Semaforo;
  cuadernos?: string[];
  receptorCount?: number;
};

function externalKey(rit: string | null, tribunal: string) {
  return `${(rit || "").toUpperCase()}|${tribunal}`.slice(0, 180);
}

function nextSyncAtFrom(now = new Date()) {
  return new Date(now.getTime() + pjudSyncIntervalMs());
}

export async function syncCausaPjud(
  causaId: string,
  opts?: {
    actorId?: string | null;
    force?: boolean;
    trigger?: "manual" | "cron" | "retry" | "webhook" | "import";
  }
): Promise<SyncCausaResult> {
  const trigger = opts?.trigger || "manual";
  const causa = await prisma.causa.findUnique({
    where: { id: causaId },
    include: {
      abogado: { select: { id: true, role: true } },
      movimientos: { orderBy: { fecha: "desc" }, take: 1 },
    },
  });
  if (!causa) throw new Error("Causa no encontrada");

  const baseMeta = () => {
    const last = causa.movimientos[0] || null;
    const dias = last ? diasEntre(last.fecha) : null;
    return {
      lastMovimientoAt: last?.fecha.toISOString() || null,
      diasSinMovimiento: dias,
      semaforo: semaforoPorDiasSinMovimiento(dias),
      nextSyncAt: causa.pjudNextSyncAt?.toISOString() || null,
    };
  };

  if (!causa.pjudMonitoreoActivo && !opts?.force) {
    return {
      causaId,
      inserted: 0,
      skipped: 0,
      provider: "none",
      demo: false,
      note: "Monitoreo desactivado para esta causa.",
      status: "disabled",
      jobId: null,
      ...baseMeta(),
    };
  }

  const job = await prisma.pjudSyncJob.create({
    data: {
      causaId,
      status: "running",
      trigger,
      attempts: 1,
      startedAt: new Date(),
    },
  });

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
    const next = nextSyncAtFrom();
    await prisma.$transaction([
      prisma.causa.update({
        where: { id: causaId },
        data: {
          pjudLastSyncAt: new Date(),
          pjudNextSyncAt: next,
          pjudLastSyncStatus: "failed",
          pjudLastSyncNote: note,
          pjudFailCount: { increment: 1 },
          pjudExternalKey: externalKey(causa.rit, causa.tribunal),
        },
      }),
      prisma.pjudSyncJob.update({
        where: { id: job.id },
        data: {
          status: "failed",
          lastError: note,
          note,
          finishedAt: new Date(),
        },
      }),
    ]);
    throw e;
  }

  if (fetchResult.provider === "none") {
    const next = nextSyncAtFrom();
    await prisma.$transaction([
      prisma.causa.update({
        where: { id: causaId },
        data: {
          pjudLastSyncAt: new Date(),
          pjudNextSyncAt: next,
          pjudLastSyncStatus: "error",
          pjudLastSyncNote: fetchResult.note,
          pjudFailCount: { increment: 1 },
          pjudExternalKey: externalKey(causa.rit, causa.tribunal),
        },
      }),
      prisma.pjudSyncJob.update({
        where: { id: job.id },
        data: {
          status: "failed",
          lastError: fetchResult.note,
          note: fetchResult.note,
          finishedAt: new Date(),
        },
      }),
    ]);
    return {
      causaId,
      inserted: 0,
      skipped: 0,
      provider: "none",
      demo: false,
      note: fetchResult.note,
      status: "error",
      jobId: job.id,
      ...baseMeta(),
      nextSyncAt: next.toISOString(),
    };
  }

  let inserted = 0;
  let skipped = 0;
  const newRelevant: string[] = [];
  const next = nextSyncAtFrom();

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
        cuaderno: m.cuaderno || "Principal",
        folio: m.folio || null,
        etapa: m.etapa || null,
        tramite: m.tramite || null,
        esReceptor: Boolean(m.esReceptor),
        documentoRef: m.documentoRef || null,
        fecha: m.fecha,
      })),
      skipDuplicates: true,
    });
    inserted = created.count;
    skipped = fetchResult.movimientos.length - inserted;
    for (const movement of pending) {
      if (movement.relevante) newRelevant.push(movement.titulo);
    }

    const status = fetchResult.demo ? "demo" : "ok";
    await tx.causa.update({
      where: { id: causaId },
      data: {
        pjudMonitoreoActivo: true,
        pjudLastSyncAt: new Date(),
        pjudNextSyncAt: next,
        pjudLastSyncStatus: status,
        pjudLastSyncNote: fetchResult.note,
        pjudFailCount: 0,
        pjudExternalKey: externalKey(causa.rit, causa.tribunal),
        ...(fetchResult.sala ? { sala: fetchResult.sala } : {}),
      },
    });

    await tx.pjudSyncJob.update({
      where: { id: job.id },
      data: {
        status: "ok",
        inserted,
        skipped,
        note: fetchResult.note,
        finishedAt: new Date(),
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
  const cuadernos = [
    ...new Set(
      fetchResult.movimientos
        .map((m) => m.cuaderno || "Principal")
        .filter(Boolean) as string[]
    ),
  ];
  const receptorCount = fetchResult.movimientos.filter((m) => m.esReceptor).length;

  return {
    causaId,
    inserted,
    skipped,
    provider: fetchResult.provider,
    demo: fetchResult.demo,
    note: fetchResult.note,
    status: fetchResult.demo ? "demo" : "ok",
    jobId: job.id,
    lastMovimientoAt: latest?.fecha.toISOString() || null,
    nextSyncAt: next.toISOString(),
    diasSinMovimiento: dias,
    semaforo: semaforoPorDiasSinMovimiento(dias),
    cuadernos,
    receptorCount,
  };
}

export async function setMonitoreoActivo(causaId: string, activo: boolean) {
  return prisma.causa.update({
    where: { id: causaId },
    data: {
      pjudMonitoreoActivo: activo,
      pjudLastSyncStatus: activo ? "never" : "disabled",
      pjudLastSyncNote: activo
        ? null
        : "Monitoreo desactivado por el estudio.",
      pjudNextSyncAt: activo ? nextSyncAtFrom() : null,
      ...(activo ? {} : { pjudFailCount: 0 }),
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
      _count: {
        select: {
          movimientos: true,
          pjudSyncJobs: { where: { status: "failed" } },
        },
      },
    },
    orderBy: [{ pjudMonitoreoActivo: "desc" }, { updatedAt: "desc" }],
  });

  return causas.map((c) => {
    const last = c.movimientos[0] || null;
    const dias = last ? diasEntre(last.fecha) : null;
    const failed =
      c.pjudLastSyncStatus === "failed" ||
      c.pjudLastSyncStatus === "error" ||
      c.pjudFailCount > 0;
    return {
      id: c.id,
      titulo: c.titulo,
      rit: c.rit,
      tribunal: c.tribunal,
      sala: c.sala,
      materia: c.materia,
      etapa: c.etapa,
      estado: c.estado,
      abogado: c.abogado,
      cliente: c.cliente,
      monitoreoActivo: c.pjudMonitoreoActivo,
      lastSyncAt: c.pjudLastSyncAt,
      nextSyncAt: c.pjudNextSyncAt,
      lastSyncStatus: c.pjudLastSyncStatus,
      lastSyncNote: c.pjudLastSyncNote,
      failCount: c.pjudFailCount,
      failed,
      failedJobs: c._count.pjudSyncJobs,
      movimientosCount: c._count.movimientos,
      lastMovimiento: last
        ? {
            id: last.id,
            titulo: last.titulo,
            fecha: last.fecha,
            tipo: last.tipo,
            fuente: last.fuente,
            relevante: last.relevante,
            cuaderno: last.cuaderno,
          }
        : null,
      diasSinMovimiento: dias,
      semaforo: semaforoPorDiasSinMovimiento(dias),
    };
  });
}

export async function listFallidosMonitoreo(limit = 50) {
  const jobs = await prisma.pjudSyncJob.findMany({
    where: { status: "failed" },
    include: {
      causa: {
        select: {
          id: true,
          titulo: true,
          rit: true,
          tribunal: true,
          pjudFailCount: true,
          pjudLastSyncAt: true,
          pjudLastSyncNote: true,
          pjudMonitoreoActivo: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 200),
  });

  return jobs.map((job) => ({
    jobId: job.id,
    causaId: job.causaId,
    rit: job.causa.rit,
    titulo: job.causa.titulo,
    tribunal: job.causa.tribunal,
    monitoreoActivo: job.causa.pjudMonitoreoActivo,
    failCount: job.causa.pjudFailCount,
    lastError: job.lastError || job.causa.pjudLastSyncNote,
    trigger: job.trigger,
    createdAt: job.createdAt,
    finishedAt: job.finishedAt,
  }));
}

export async function retryFallidos(opts?: {
  actorId?: string | null;
  causaIds?: string[];
  limit?: number;
}) {
  const where = opts?.causaIds?.length
    ? { id: { in: opts.causaIds }, pjudMonitoreoActivo: true }
    : {
        pjudMonitoreoActivo: true,
        OR: [
          { pjudLastSyncStatus: "failed" },
          { pjudLastSyncStatus: "error" },
          { pjudFailCount: { gt: 0 } },
        ],
      };

  const causas = await prisma.causa.findMany({
    where,
    select: { id: true },
    take: opts?.limit || 50,
  });

  const results = [];
  for (const c of causas) {
    try {
      results.push(
        await syncCausaPjud(c.id, {
          actorId: opts?.actorId,
          force: true,
          trigger: "retry",
        })
      );
    } catch (e) {
      results.push({
        causaId: c.id,
        inserted: 0,
        skipped: 0,
        provider: "none" as const,
        demo: false,
        note: e instanceof Error ? e.message : "Error",
        status: "failed",
        jobId: null,
        lastMovimientoAt: null,
        nextSyncAt: null,
        diasSinMovimiento: null,
        semaforo: "gris" as const,
      });
    }
  }
  return results;
}

export function providerStatusPublic() {
  return {
    apiConfigured: pjudProviderConfigured(),
    webhookConfigured: pjudWebhookConfigured(),
    demoAllowed:
      process.env.PJUD_ALLOW_DEMO === "1" ||
      (process.env.NODE_ENV !== "production" &&
        process.env.PJUD_ALLOW_DEMO !== "0"),
    syncIntervalMinutes: Math.round(pjudSyncIntervalMs() / 60000),
    honesty: pjudProviderConfigured()
      ? "Conector partner API activo (PJUD_API_URL). UX paridad CausaMonitor sin scrapers ocultos."
      : "Sin API partner: use sync demo etiquetado, CSV oficial o webhook. LexOpen no scrapea ofpj ni custodia ClaveÚnica.",
  };
}
