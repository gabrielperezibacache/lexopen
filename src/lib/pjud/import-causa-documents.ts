import { prisma } from "@/lib/db";
import { httpError } from "@/lib/auth/access";
import { fetchPjudMovimientos } from "@/lib/pjud/provider";
import {
  backupMovimientoDocuments,
  ingestPjudDocumentBuffer,
  isBackupableDocumentoRef,
  pjudDocDownloadDelayMs,
  pjudDocDownloadMaxPerRun,
} from "@/lib/pjud/pdf-backup";

export type CausaDocImportStatus = {
  causaId: string;
  status: "idle" | "running" | "done" | "failed";
  phase: "idle" | "scrape" | "download" | "done";
  total: number;
  completed: number;
  saved: number;
  skipped: number;
  failed: number;
  currentLabel: string | null;
  note: string | null;
  delayMs: number;
  maxPerRun: number;
  startedAt: string | null;
  finishedAt: string | null;
};

type JobRecord = CausaDocImportStatus & {
  promise?: Promise<void>;
};

const jobs = new Map<string, JobRecord>();
/** Global lock: only one causa document import at a time (protect OJV). */
let globalRunningCausaId: string | null = null;

function idleStatus(causaId: string): CausaDocImportStatus {
  return {
    causaId,
    status: "idle",
    phase: "idle",
    total: 0,
    completed: 0,
    saved: 0,
    skipped: 0,
    failed: 0,
    currentLabel: null,
    note: null,
    delayMs: pjudDocDownloadDelayMs(),
    maxPerRun: pjudDocDownloadMaxPerRun(),
    startedAt: null,
    finishedAt: null,
  };
}

function publicStatus(job: JobRecord): CausaDocImportStatus {
  const { promise: _promise, ...rest } = job;
  return rest;
}

export function getCausaDocImportStatus(causaId: string): CausaDocImportStatus {
  const job = jobs.get(causaId);
  return job ? publicStatus(job) : idleStatus(causaId);
}

export function isCausaDocImportRunning(causaId?: string) {
  if (causaId) {
    return jobs.get(causaId)?.status === "running";
  }
  return globalRunningCausaId != null;
}

async function countPendingDocumentoRefs(causaId: string) {
  const rows = await prisma.causaMovimiento.findMany({
    where: { causaId, documentoRef: { not: null } },
    select: { documentoRef: true },
    take: 200,
  });
  return rows.filter((r) => {
    const ref = r.documentoRef?.trim();
    if (!ref || ref.startsWith("doc:") || ref.startsWith("lexopen:")) return false;
    return isBackupableDocumentoRef(ref) || /^https?:\/\//i.test(ref);
  }).length;
}

async function runImport(causaId: string) {
  const job = jobs.get(causaId);
  if (!job) return;

  const max = pjudDocDownloadMaxPerRun();
  const delayMs = pjudDocDownloadDelayMs();
  job.delayMs = delayMs;
  job.maxPerRun = max;

  try {
    const causa = await prisma.causa.findUnique({
      where: { id: causaId },
      select: {
        id: true,
        rit: true,
        ruc: true,
        tribunal: true,
        titulo: true,
        caratula: true,
      },
    });
    if (!causa) throw httpError("Causa no encontrada", 404);

    const pendingBefore = await countPendingDocumentoRefs(causaId);
    job.total = Math.min(Math.max(pendingBefore, 1), max);
    job.phase = "scrape";
    job.currentLabel = "Consultando OJV / Mis Causas…";
    job.note =
      "Importa cada PDF a LexOpen (Documento) de inmediato, en cola secuencial.";

    // Phase 1: authenticated/public scrape captures PDF bytes with session cookies.
    let scrapeSaved = 0;
    try {
      const fetchResult = await fetchPjudMovimientos({
        id: causa.id,
        rit: causa.rit,
        ruc: causa.ruc,
        tribunal: causa.tribunal,
        titulo: causa.titulo,
        caratula: causa.caratula,
      });

      // Persist OJV http refs onto local movimientos so phase 2 / UI can import them.
      for (const m of fetchResult.movimientos) {
        const ref = m.documentoRef?.trim();
        if (!m.externalId || !ref || !/^https?:\/\//i.test(ref)) continue;
        if (ref.startsWith("doc:")) continue;
        const mov = await prisma.causaMovimiento.findFirst({
          where: { causaId, externalId: m.externalId },
          select: { id: true, documentoRef: true },
        });
        if (!mov || mov.documentoRef?.startsWith("doc:")) continue;
        if (mov.documentoRef !== ref) {
          await prisma.causaMovimiento.update({
            where: { id: mov.id },
            data: { documentoRef: ref },
          });
        }
      }

      const withBytes = fetchResult.movimientos.filter(
        (m) => m.documentoBytes?.byteLength
      );
      job.total = Math.max(job.total, Math.min(withBytes.length, max));
      job.phase = "download";

      for (const m of withBytes) {
        if (scrapeSaved >= max) break;
        if (!m.documentoBytes?.byteLength) continue;

        let mov =
          m.externalId
            ? await prisma.causaMovimiento.findFirst({
                where: { causaId, externalId: m.externalId },
                select: {
                  id: true,
                  documentoRef: true,
                  folio: true,
                  titulo: true,
                },
              })
            : null;
        if (!mov && m.folio?.trim()) {
          mov = await prisma.causaMovimiento.findFirst({
            where: {
              causaId,
              folio: m.folio.trim(),
              NOT: { documentoRef: { startsWith: "doc:" } },
            },
            select: {
              id: true,
              documentoRef: true,
              folio: true,
              titulo: true,
            },
            orderBy: { fecha: "desc" },
          });
        }
        if (!mov || mov.documentoRef?.startsWith("doc:")) {
          job.skipped += 1;
          job.completed += 1;
          continue;
        }
        job.currentLabel =
          mov.folio?.trim()
            ? `Folio ${mov.folio}`
            : (mov.titulo || m.titulo).slice(0, 80);
        try {
          const id = await ingestPjudDocumentBuffer({
            causaId,
            movimientoId: mov.id,
            bytes: m.documentoBytes,
            filename: m.documentoFilename,
            esReceptor: m.esReceptor,
          });
          if (id) {
            scrapeSaved += 1;
            job.saved += 1;
          } else {
            job.skipped += 1;
          }
        } catch {
          job.failed += 1;
        }
        job.completed += 1;
      }
    } catch (error) {
      job.note =
        error instanceof Error
          ? `Scrape: ${error.message}. Se intentará respaldo por URL si hay enlaces.`
          : "Scrape falló; se intentará respaldo por URL.";
    }

    // Phase 2: remaining http(s) refs — sequential + delay; always force LexOpen ingest.
    job.phase = "download";
    job.currentLabel = "Importando pendientes a LexOpen…";
    const remainingBudget = Math.max(0, max - scrapeSaved);
    if (remainingBudget > 0) {
      const backup = await backupMovimientoDocuments(causaId, {
        max: remainingBudget,
        delayMs,
        force: true,
        onProgress: (info) => {
          job.currentLabel = info.label;
          job.completed = scrapeSaved + info.index;
          job.total = Math.max(job.total, scrapeSaved + info.total);
        },
      });
      job.saved += backup.saved;
      job.skipped += backup.skipped;
      if (backup.attempted === 0 && scrapeSaved === 0) {
        job.note =
          job.note ||
          "No había documentos pendientes. Sincronice movimientos primero y vuelva a importar.";
      }
    }

    job.status = "done";
    job.phase = "done";
    job.currentLabel = null;
    job.finishedAt = new Date().toISOString();
    job.note =
      job.saved > 0
        ? `Importados ${job.saved} documento(s) a LexOpen (disponibles en el timeline y el expediente para ver, descargar y usar con IA)${job.failed ? ` · ${job.failed} fallido(s)` : ""}.`
        : job.note ||
          "No se importaron documentos nuevos. Revise sync PJUD / scrape activo.";
  } catch (error) {
    job.status = "failed";
    job.phase = "done";
    job.finishedAt = new Date().toISOString();
    job.currentLabel = null;
    job.note =
      error instanceof Error ? error.message : "Error al importar documentos";
  } finally {
    if (globalRunningCausaId === causaId) globalRunningCausaId = null;
  }
}

/**
 * Start a sequential document import for one causa.
 * Only one import runs globally at a time to avoid saturating OJV.
 */
export function startCausaDocImport(causaId: string): {
  started: boolean;
  alreadyRunning: boolean;
  globalBusy: boolean;
  status: CausaDocImportStatus;
} {
  const existing = jobs.get(causaId);
  if (existing?.status === "running") {
    return {
      started: false,
      alreadyRunning: true,
      globalBusy: false,
      status: publicStatus(existing),
    };
  }
  if (globalRunningCausaId && globalRunningCausaId !== causaId) {
    const other = jobs.get(globalRunningCausaId);
    return {
      started: false,
      alreadyRunning: false,
      globalBusy: true,
      status: other
        ? {
            ...idleStatus(causaId),
            note: `Espere: ya hay una descarga en curso en otra causa (${globalRunningCausaId.slice(0, 8)}…).`,
            status: "idle",
          }
        : {
            ...idleStatus(causaId),
            note: "Espere: ya hay una descarga de documentos en curso.",
          },
    };
  }

  const job: JobRecord = {
    ...idleStatus(causaId),
    status: "running",
    phase: "scrape",
    startedAt: new Date().toISOString(),
    note: "Iniciando descarga secuencial…",
  };
  globalRunningCausaId = causaId;
  jobs.set(causaId, job);
  job.promise = runImport(causaId);
  return {
    started: true,
    alreadyRunning: false,
    globalBusy: false,
    status: publicStatus(job),
  };
}
