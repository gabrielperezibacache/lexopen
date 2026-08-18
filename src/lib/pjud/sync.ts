import { prisma } from "@/lib/db";
import { httpError } from "@/lib/auth/access";
import {
  diasEntre,
  semaforoPorDiasSinMovimiento,
  type Semaforo,
} from "@/lib/pjud/classify";
import {
  fetchPjudMovimientos,
  pjudLiveIngestConfigured,
  pjudProviderConfigured,
  pjudSyncIntervalMs,
  type PjudFetchResult,
} from "@/lib/pjud/provider";
import { captchaSolverConfigured, captchaSolverStatusPublic } from "@/lib/pjud/captcha-solver";
import {
  probeScraperSidecarHealth,
  scraperSidecarConfigured,
} from "@/lib/pjud/scraper-sidecar";
import { pdfBackupEnabled, backupMovimientoDocuments, ingestPjudDocumentBuffer } from "@/lib/pjud/pdf-backup";
import { isPlaceholderTribunal } from "@/lib/pjud/ojv-dom";
import { publicScrapeEnabled, publicScrapeReady, claveUnicaAutomationAllowed } from "@/lib/pjud/public-scrape";
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
  escritosPendientes?: number;
};

function externalKey(rit: string | null, tribunal: string) {
  return `${(rit || "").toUpperCase()}|${tribunal}`.slice(0, 180);
}

function nextSyncAtFrom(now = new Date(), failCount = 0) {
  const base = pjudSyncIntervalMs();
  // Exponential backoff on repeated failures (cap 8× interval).
  const factor =
    failCount <= 0
      ? 1
      : Math.min(8, 2 ** Math.min(Math.max(failCount - 1, 0), 3));
  return new Date(now.getTime() + base * factor);
}

export async function syncCausaPjud(
  causaId: string,
  opts?: {
    actorId?: string | null;
    force?: boolean;
    trigger?: "manual" | "cron" | "retry" | "webhook" | "import";
    existingJobId?: string | null;
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

  const job = opts?.existingJobId
    ? await prisma.pjudSyncJob.update({
        where: { id: opts.existingJobId },
        data: {
          status: "running",
          trigger,
          startedAt: new Date(),
        },
      })
    : await prisma.pjudSyncJob.create({
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
    const failCountAfter = (causa.pjudFailCount || 0) + 1;
    const next = nextSyncAtFrom(new Date(), failCountAfter);
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
    throw httpError(note, 502);
  }

  if (fetchResult.provider === "none") {
    const failCountAfter = (causa.pjudFailCount || 0) + 1;
    const next = nextSyncAtFrom(new Date(), failCountAfter);
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
        pendienteResolucion: Boolean(m.pendienteResolucion),
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
        pjudSource: fetchResult.provider,
        ...(fetchResult.sala ? { sala: fetchResult.sala } : {}),
        ...(fetchResult.resolvedTribunal &&
        (isPlaceholderTribunal(causa.tribunal) ||
          fetchResult.resolvedTribunal.length > causa.tribunal.length)
          ? { tribunal: fetchResult.resolvedTribunal.slice(0, 180) }
          : {}),
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

  let pdfBackedUp = 0;
  // Prefer bytes captured with OJV session cookies during scrape.
  for (const m of fetchResult.movimientos) {
    if (!m.documentoBytes?.byteLength) continue;
    const mov = await prisma.causaMovimiento.findFirst({
      where: { causaId, externalId: m.externalId },
      select: { id: true, documentoRef: true },
    });
    if (!mov || mov.documentoRef?.startsWith("doc:")) continue;
    try {
      const id = await ingestPjudDocumentBuffer({
        causaId,
        movimientoId: mov.id,
        bytes: m.documentoBytes,
        filename: m.documentoFilename,
        esReceptor: m.esReceptor,
      });
      if (id) pdfBackedUp += 1;
    } catch {
      /* best-effort */
    }
  }
  if (pdfBackupEnabled()) {
    try {
      const backup = await backupMovimientoDocuments(causaId);
      pdfBackedUp += backup.saved;
    } catch {
      /* PDF backup is best-effort */
    }
  }

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
  const escritosPendientes = fetchResult.movimientos.filter(
    (m) => m.pendienteResolucion
  ).length;
  const noteExtras = [
    receptorCount ? `${receptorCount} receptor` : null,
    escritosPendientes ? `${escritosPendientes} escritos por resolver` : null,
    pdfBackedUp > 0 ? `PDF backup ${pdfBackedUp}` : null,
  ].filter(Boolean);

  return {
    causaId,
    inserted,
    skipped,
    provider: fetchResult.provider,
    demo: fetchResult.demo,
    note: noteExtras.length
      ? `${fetchResult.note} · ${noteExtras.join(" · ")}`
      : fetchResult.note,
    status: fetchResult.demo ? "demo" : "ok",
    jobId: job.id,
    lastMovimientoAt: latest?.fecha.toISOString() || null,
    nextSyncAt: next.toISOString(),
    diasSinMovimiento: dias,
    semaforo: semaforoPorDiasSinMovimiento(dias),
    cuadernos,
    receptorCount,
    escritosPendientes,
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

/** Dismiss sticky sync errors/notes without changing monitoreo on/off. */
export async function clearCausaPjudSyncMessages(causaId: string) {
  const causa = await prisma.causa.findUnique({
    where: { id: causaId },
    select: {
      id: true,
      pjudLastSyncStatus: true,
      pjudMonitoreoActivo: true,
    },
  });
  if (!causa) throw httpError("Causa no encontrada", 404);

  const failedStatus =
    causa.pjudLastSyncStatus === "failed" ||
    causa.pjudLastSyncStatus === "error";

  return prisma.causa.update({
    where: { id: causaId },
    data: {
      pjudLastSyncNote: null,
      pjudFailCount: 0,
      ...(failedStatus
        ? {
            pjudLastSyncStatus: causa.pjudMonitoreoActivo ? "ok" : "disabled",
          }
        : {}),
    },
  });
}

/**
 * Clear sticky failed-sync notices for the whole monitoreo cartera:
 * reset causa fail counters/notes and dismiss failed queue jobs from the UI list.
 */
export async function clearFallidosMonitoreoAvisos(opts?: {
  causaIds?: string[];
  limit?: number;
}) {
  const limit = Math.min(Math.max(opts?.limit ?? 200, 1), 500);
  const causaFilter = opts?.causaIds?.length
    ? { id: { in: opts.causaIds.slice(0, limit) } }
    : {
        OR: [
          { pjudLastSyncStatus: { in: ["failed", "error"] } },
          { pjudFailCount: { gt: 0 } },
        ],
      };

  const causas = await prisma.causa.findMany({
    where: causaFilter,
    select: {
      id: true,
      pjudLastSyncStatus: true,
      pjudMonitoreoActivo: true,
    },
    take: limit,
  });

  let clearedCausas = 0;
  for (const causa of causas) {
    const failedStatus =
      causa.pjudLastSyncStatus === "failed" ||
      causa.pjudLastSyncStatus === "error";
    await prisma.causa.update({
      where: { id: causa.id },
      data: {
        pjudLastSyncNote: null,
        pjudFailCount: 0,
        ...(failedStatus
          ? {
              pjudLastSyncStatus: causa.pjudMonitoreoActivo ? "ok" : "disabled",
            }
          : {}),
      },
    });
    clearedCausas += 1;
  }

  const jobWhere = {
    status: "failed" as const,
    ...(opts?.causaIds?.length
      ? { causaId: { in: opts.causaIds.slice(0, limit) } }
      : {}),
  };
  const dismissedJobs = await prisma.pjudSyncJob.updateMany({
    where: jobWhere,
    data: {
      status: "dismissed",
      note: "Aviso limpiado desde Monitoreo",
      finishedAt: new Date(),
    },
  });

  return {
    clearedCausas,
    dismissedJobs: dismissedJobs.count,
  };
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
      ruc: c.ruc,
      tribunal: c.tribunal,
      sala: c.sala,
      proximaTabla: c.proximaTabla,
      proximaTablaNota: c.proximaTablaNota,
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
      pjudFromMisCausas: c.pjudFromMisCausas,
      pjudSource: c.pjudSource,
      pjudOrigin: c.pjudOrigin,
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
  const { requeueFailedJobs, processPendingSyncJobs } = await import(
    "@/lib/pjud/queue"
  );
  const requeued = await requeueFailedJobs({
    causaIds: opts?.causaIds,
    limit: opts?.limit,
  });
  return processPendingSyncJobs({
    actorId: opts?.actorId,
    limit: opts?.limit,
    jobIds: requeued.map((j) => j.id),
  });
}

export function providerStatusPublic() {
  const captcha = captchaSolverStatusPublic();
  const cuFlag = process.env.PJUD_CLAVEUNICA_SCRAPE?.trim();
  // Sync helper cannot see UI opt-in; async version overlays FirmSettings.
  // Kill-switch (0) is always OFF; flag=1 is ON; absent is "opt-in pending".
  const claveUnicaScrapeEnabled =
    cuFlag === "0" ? false : cuFlag === "1" ? true : false;
  return {
    apiConfigured: pjudProviderConfigured(),
    scraperSidecarConfigured: scraperSidecarConfigured(),
    publicScrapeEnabled: publicScrapeEnabled(),
    publicScrapeReady: publicScrapeReady(),
    captchaConfigured: captchaSolverConfigured(),
    captcha,
    claveUnicaScrapeEnabled,
    claveUnicaEnv: cuFlag ?? null,
    liveIngestConfigured: pjudLiveIngestConfigured(),
    webhookConfigured: pjudWebhookConfigured(),
    pdfBackupEnabled: pdfBackupEnabled(),
    syncConcurrency: Number(process.env.PJUD_SYNC_CONCURRENCY || 5) || 5,
    demoAllowed:
      process.env.PJUD_ALLOW_DEMO === "1" ||
      (process.env.NODE_ENV !== "production" &&
        process.env.PJUD_ALLOW_DEMO !== "0"),
    syncIntervalMinutes: Math.round(pjudSyncIntervalMs() / 60000),
    honesty: pjudLiveIngestConfigured()
      ? scraperSidecarConfigured()
        ? "La consulta en vivo está disponible mediante el servicio auxiliar del Host. Su ClaveÚnica se guarda cifrada aquí; la Oficina Judicial Virtual y el CAPTCHA se consultan por internet."
        : publicScrapeReady()
          ? `La consulta en vivo está disponible desde LexOpen (${captcha.provider || "CAPTCHA"} configurado). Su ClaveÚnica permanece cifrada en este servidor.`
          : pjudProviderConfigured()
            ? "La consulta en vivo usa una API de socio externo. Sus datos y ClaveÚnica siguen en su Host."
            : "La consulta en vivo está lista."
      : captcha.configError
        ? `Aún no hay consulta en vivo: ${captcha.configError} Mientras tanto puede importar por CSV o modo demo. LexOpen sigue corriendo en su Host.`
        : "Aún no hay consulta en vivo. Configure el servicio auxiliar, la consulta directa con CAPTCHA, una API de socio o importe por CSV. LexOpen corre en su Host; solo las consultas al Poder Judicial o CAPTCHA salen a internet.",
  };
}

/** Status + probe corto al sidecar (/health). */
export async function providerStatusPublicAsync() {
  const base = providerStatusPublic();
  const sidecar = await probeScraperSidecarHealth();
  let claveUnicaOptedIn = false;
  try {
    const { getClaveUnicaStatus } = await import("@/lib/pjud/claveunica");
    const cu = await getClaveUnicaStatus();
    claveUnicaOptedIn = Boolean(cu.enabled && cu.hasPassword);
  } catch {
    claveUnicaOptedIn = false;
  }
  const claveUnicaOn = claveUnicaAutomationAllowed(claveUnicaOptedIn);
  let honesty = base.honesty;
  if (sidecar.configured && !sidecar.reachable) {
    honesty = publicScrapeReady()
      ? "El servicio auxiliar no responde; LexOpen usará la consulta directa. Pida al administrador del Host que lo arranque, o revise Integraciones → PJUD."
      : "El servicio auxiliar está configurado pero apagado. Arránquelo en el Host, o active la consulta directa con CAPTCHA (Integraciones → PJUD).";
  } else if (sidecar.configured && sidecar.reachable) {
    honesty =
      "El servicio auxiliar del Host está activo. Su ClaveÚnica se guarda cifrada aquí; la Oficina Judicial Virtual y el CAPTCHA se consultan por internet.";
  }
  return {
    ...base,
    sidecar,
    claveUnicaScrapeEnabled: claveUnicaOn,
    honesty,
  };
}
