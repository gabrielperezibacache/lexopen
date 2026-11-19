import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { serializable } from "@/lib/command-execution";
import { fetchSafeOutbound } from "@/lib/net/safe-url";
import { fetchPjudMovimientos } from "./provider";
import { normalizePjudCuaderno, type PjudFetchedMovimiento } from "./types";
import { pjudDocumentRefHash } from "./document-identity";
import {
  ingestPjudDocumentBuffer, isBackupableDocumentoRef, listPendingPjudDocumentMovimientos,
  readPjudDocumentResponse, validPjudDownloadedContent,
} from "./pdf-backup";
import {
  authorizeManualImport, claimManualImport, finishClaim, LEASE_MS, updateClaim, type ClaimedManualImport,
} from "./manual-import-store";
export { getCausaDocImportStatus, startCausaDocImport, type CausaDocImportStatus } from "./manual-import-store";

/** Folio sólo es identidad dentro de su cuaderno y cuando hay un único match. */
export async function findDocumentImportMovimiento(
  causaId: string,
  movement: Pick<PjudFetchedMovimiento, "externalId" | "folio" | "cuaderno">,
  db: Prisma.TransactionClient = prisma
) {
  const select = { id: true, documentoRef: true, folio: true, cuaderno: true, titulo: true } as const;
  if (movement.externalId) {
    const exact = await db.causaMovimiento.findFirst({
      where: { causaId, externalId: movement.externalId },
      select,
    });
    if (exact) {
      const cuaderno = normalizePjudCuaderno(movement.cuaderno);
      if (!cuaderno || cuaderno !== normalizePjudCuaderno(exact.cuaderno)) return null;
      const incomingFolio = movement.folio?.trim();
      const storedFolio = exact.folio?.trim();
      if (incomingFolio && storedFolio && incomingFolio !== storedFolio) return null;
      return exact;
    }
  }
  const folio = movement.folio?.trim();
  const cuaderno = movement.cuaderno?.trim();
  if (!folio || !normalizePjudCuaderno(cuaderno)) return null;
  const matches = await db.causaMovimiento.findMany({
    where: {
      causaId,
      folio,
      cuaderno: { equals: cuaderno, mode: "insensitive" },
    },
    select,
    take: 2,
  });
  return matches.length === 1 ? matches[0] : null;
}

type WorkerOptions = {
  causaId?: string;
  fetchMovimientos?: typeof fetchPjudMovimientos;
  fetchDocument?: typeof fetchSafeOutbound;
  enqueue?: Parameters<typeof ingestPjudDocumentBuffer>[0]["enqueue"];
};
type MovementIdentity = Pick<PjudFetchedMovimiento, "externalId" | "folio" | "cuaderno">;
type Movement = NonNullable<Awaited<ReturnType<typeof findDocumentImportMovimiento>>>;

async function assertActive(job: ClaimedManualImport, db: Prisma.TransactionClient = prisma) {
  await updateClaim(job, {}, db);
  await authorizeManualImport(job.causaId, job.actorId, db);
}

/** The same cuaderno/folio check protects a stored link and its captured bytes. */
async function resolveImportSource(job: ClaimedManualImport, movement: PjudFetchedMovimiento) {
  return serializable(async tx => {
    await assertActive(job, tx);
    const row = await findDocumentImportMovimiento(job.causaId, movement, tx);
    if (!row || row.documentoRef?.startsWith("doc:") || row.documentoRef?.startsWith("lexopen:")) return null;
    const link = movement.documentoRef?.trim();
    if (link && isBackupableDocumentoRef(link) && row.documentoRef !== link) {
      const updated = await tx.causaMovimiento.updateMany({
        where: { id: row.id, causaId: job.causaId, documentoRef: row.documentoRef, folio: row.folio, cuaderno: row.cuaderno },
        data: { documentoRef: link },
      });
      if (!updated.count) return null;
      row.documentoRef = link;
    }
    return row;
  });
}

async function runBatch(job: ClaimedManualImport, options: WorkerOptions) {
  const { causaId, actorId } = job;
  const completed = new Set([...job.savedIds, ...job.skippedIds, ...job.failedIds]);
  let saved = job.savedIds.length, failed = job.failedIds.length;
  let coverageNote = job.phase === "download" ? job.note : null;
  const remaining = () => job.maxPerRun - completed.size;

  async function importDocument(mov: Movement, read: () => Promise<{
    bytes: Buffer; filename?: string | null; mime?: string | null; esReceptor?: boolean;
  } | null>, identity?: MovementIdentity) {
    if (completed.has(mov.id) || remaining() <= 0) return;
    await assertActive(job);
    await updateClaim(job, { currentLabel: mov.folio ? `Folio ${mov.folio}` : "Importando documento" });
    let result: "saved" | "skipped" | "failed" = "skipped";
    try {
      const original = await read();
      if (!original) result = "failed";
      else {
        const received = await ingestPjudDocumentBuffer({
          causaId, movimientoId: mov.id, actorId, bytes: original.bytes, filename: original.filename,
          mimeHint: original.mime, esReceptor: original.esReceptor, enqueue: options.enqueue,
          expectedSourceRefHash: pjudDocumentRefHash(causaId, mov.id, mov.documentoRef || ""),
          manualBatch: {
            guard: async tx => {
              await assertActive(job, tx);
              if (identity && (await findDocumentImportMovimiento(causaId, identity, tx))?.id !== mov.id) {
                throw new Error("Cambió la identidad del movimiento.");
              }
            },
            saved: async tx => { await updateClaim(job, { savedIds: { push: mov.id } }, tx); },
          },
        });
        // A concurrent sync may have linked it first, without consuming a saved receipt from this batch.
        if (received && await prisma.pjudManualImport.count({ where: { id: job.id, savedIds: { has: mov.id } } })) result = "saved";
      }
    } catch {
      await assertActive(job);
      // The original and its checkpoint commit together, including after an ambiguous database response.
      result = await prisma.pjudManualImport.count({ where: { id: job.id, savedIds: { has: mov.id } } }) ? "saved" : "failed";
    }
    if (result === "saved") saved++;
    if (result === "failed") { failed++; await updateClaim(job, { failedIds: { push: mov.id } }); }
    if (result === "skipped") await updateClaim(job, { skippedIds: { push: mov.id } });
    completed.add(mov.id);
  }

  if (job.phase === "scrape") {
    await assertActive(job);
    const cause = await prisma.causa.findUniqueOrThrow({ where: { id: causaId }, select: {
      id: true, rit: true, ruc: true, tribunal: true, titulo: true, caratula: true,
    } });
    await updateClaim(job, { currentLabel: "Consultando OJV", note: null });
    const found = await (options.fetchMovimientos ?? fetchPjudMovimientos)(cause, { assertActive: () => assertActive(job) })
      .catch(() => null);
    if (!found || found.provider === "none" || found.demo) coverageNote = "No se pudo consultar OJV.";
    else if (found.cuadernos?.status === "partial") coverageNote = "Quedaron cuadernos pendientes de lectura.";
    await assertActive(job);
    for (const movement of found && !found.demo ? found.movimientos : []) {
      if (!movement.documentoBytes?.length && !isBackupableDocumentoRef(movement.documentoRef)) continue;
      const row = await resolveImportSource(job, movement);
      if (row && movement.documentoBytes?.length) {
        const bytes = movement.documentoBytes;
        await importDocument(row, async () => {
          const filename = movement.documentoFilename;
          const mime = /\.pdf$/i.test(filename || "") ? "application/pdf" : "application/octet-stream";
          const ref = isBackupableDocumentoRef(row.documentoRef) ? row.documentoRef! : "https://www.pjud.cl/documento";
          if (!validPjudDownloadedContent(bytes, mime, ref, 20 * 1024 * 1024)) return null;
          return { bytes, mime, filename, esReceptor: movement.esReceptor };
        }, movement);
      }
    }
    await updateClaim(job, { phase: "download", note: coverageNote });
  }
  await assertActive(job);
  const pending = remaining() > 0 ? await listPendingPjudDocumentMovimientos(causaId, remaining(), [...completed]) : [];
  await updateClaim(job, { total: completed.size + pending.length, currentLabel: "Descargando documentos" });
  for (const [i, row] of pending.entries()) {
    if (i > 0 && job.delayMs) await new Promise(resolve => setTimeout(resolve, job.delayMs));
    await importDocument(row, async () => {
      const ref = row.documentoRef!;
      const response = await (options.fetchDocument ?? fetchSafeOutbound)(ref, {
        allowHttp: process.env.NODE_ENV !== "production", signal: AbortSignal.timeout(45_000), headers: { Accept: "application/pdf,*/*" },
      });
      if (!response.ok) { await response.body?.cancel(); return null; }
      const mime = response.headers.get("content-type") || "application/octet-stream";
      const bytes = await readPjudDocumentResponse(response);
      if (!validPjudDownloadedContent(bytes, mime, ref, 20 * 1024 * 1024)) return null;
      return { bytes, mime, filename: new URL(ref).pathname.split("/").pop(), esReceptor: row.esReceptor };
    });
  }
  await assertActive(job);
  const incomplete = Boolean(coverageNote) || failed > 0;
  const note = [`Documentos importados: ${saved}.`, ...(failed ? [`Fallidos: ${failed}.`] : []),
    ...(coverageNote ? [coverageNote] : []), ...(incomplete ? ["Puede volver a intentar los pendientes."] : [])].join(" ");
  await finishClaim(job, incomplete ? "failed" : "done", note);
}

/** Called after a manual request and by the Host worker to reclaim an interrupted batch. */
export async function processManualDocumentImport(options: WorkerOptions = {}) {
  const job = await claimManualImport(options.causaId);
  if (!job) return;
  // A slow portal request may outlast the lease. Renewal never revives an expired claim.
  const heartbeat = setInterval(() => { void updateClaim(job, {}).catch(() => undefined); }, LEASE_MS / 3);
  heartbeat.unref();
  try {
    await runBatch(job, options);
  } catch {
    await finishClaim(job, "failed", "La importación se interrumpió. Compruebe el acceso a la causa y la configuración del Host.")
      .catch(() => undefined); // A replacement worker owns the next report if our lease expired.
  } finally {
    clearInterval(heartbeat);
  }
}
