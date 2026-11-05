import { createHash } from "node:crypto";
import { pjudDocumentRefHash } from "./document-identity";
import { assertCausaCapability } from "@/lib/auth/causa-access";
import { prisma } from "@/lib/db";
import { fetchSafeOutbound, isSafeOutboundHttpUrl } from "@/lib/net/safe-url";
import { putObject } from "@/lib/storage";
import { enqueueDocumentProcessing } from "@/lib/document-processing-queue";

/**
 * PDF backup: explicit PJUD_PDF_BACKUP=1|0, else on when public scrape is enabled
 * (docs are required for download + AI review of OJV anexos).
 * The document-download kill switch takes precedence over every backup mode.
 */
export function pdfBackupEnabled() {
  if (process.env.PJUD_DOC_DOWNLOADS?.trim() === "0") return false;
  const raw = process.env.PJUD_PDF_BACKUP?.trim();
  if (raw === "0") return false;
  if (raw === "1") return true;
  return process.env.PJUD_PUBLIC_SCRAPE === "1";
}

/** Pause between sequential OJV/PJUD document downloads (ms). Default 2500. */
export function pjudDocDownloadDelayMs() {
  const n = Number(process.env.PJUD_DOC_DOWNLOAD_DELAY_MS);
  if (!Number.isFinite(n) || n < 0) return 2500;
  return Math.min(Math.floor(n), 30_000);
}

/** Max documents downloaded in one import/scrape pass. Default 20, cap 50. */
export function pjudDocDownloadMaxPerRun() {
  const n = Number(process.env.PJUD_DOC_DOWNLOAD_MAX);
  if (!Number.isFinite(n) || n <= 0) return 20;
  return Math.min(Math.floor(n), 50);
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/** True when buffer looks like a PDF (%PDF). */
export function looksLikePdf(buf: Buffer) {
  if (buf.byteLength < 5) return false;
  return buf.subarray(0, 5).toString("utf8") === "%PDF-";
}

/** PJUD document hosts only — not arbitrary public HTTPS (SSRF / data exfil). */
function isAllowedPjudDocumentoHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "pjud.cl" || host === "www.pjud.cl") return true;
  return host.endsWith(".pjud.cl") && host.length > ".pjud.cl".length;
}

export function isBackupableDocumentoRef(ref: string | null | undefined) {
  if (!ref?.trim()) return false;
  const value = ref.trim();
  if (value.startsWith("doc:") || value.startsWith("lexopen:")) return false;
  if (!/^https?:\/\//i.test(value)) return false;
  // OJV / pjud.cl hosts only — block SSRF to private/metadata and unrelated HTTPS.
  if (
    !isSafeOutboundHttpUrl(value, {
      allowHttp: process.env.NODE_ENV !== "production",
    })
  ) {
    return false;
  }
  try {
    return isAllowedPjudDocumentoHost(new URL(value).hostname);
  } catch {
    return false;
  }
}

/**
 * Persist PDF/DOC bytes captured during scrape into Documento + link movimiento.
 */
export async function ingestPjudDocumentBuffer(opts: {
  causaId: string;
  movimientoId: string;
  bytes: Buffer;
  filename?: string | null;
  esReceptor?: boolean;
  mimeHint?: string | null;
  receiptLeaseToken?: string;
  requireReceipt?: boolean;
  enqueue?: typeof enqueueDocumentProcessing;
}) {
  const buf = opts.bytes;
  if (buf.byteLength < 100 || buf.byteLength > 20 * 1024 * 1024) {
    return null;
  }
  if (
    /^\s*<(!DOCTYPE|html|head|body)/i.test(buf.subarray(0, 200).toString("utf8"))
  ) {
    return null;
  }
  const mime = looksLikePdf(buf)
    ? "application/pdf"
    : opts.mimeHint && !/text\/html/i.test(opts.mimeHint)
      ? opts.mimeHint
      : "application/octet-stream";
  if (
    !looksLikePdf(buf) &&
    !/pdf|octet-stream|msword|officedocument/i.test(mime)
  ) {
    return null;
  }

  // Check the durable tombstone before even writing storage bytes again.
  const receipt = await prisma.pjudDocumentJob.findUnique({ where: { movimientoId: opts.movimientoId }, select: { status: true, documentoId: true, actorId: true, leaseToken: true, leaseExpiresAt: true } });
  if (receipt?.status === "saved") return receipt.documentoId;
  if ((opts.requireReceipt || opts.receiptLeaseToken) && !receipt) return null;
  if (receipt && !receipt.actorId) return null;
  if (opts.receiptLeaseToken && (!receipt || receipt.status !== "running" || receipt.leaseToken !== opts.receiptLeaseToken || !receipt.leaseExpiresAt || receipt.leaseExpiresAt <= new Date())) return null;
  if (receipt?.actorId) {
    const cause = await prisma.causa.findUniqueOrThrow({ where: { id: opts.causaId }, select: { pjudDocumentDownloadOwnerId: true, pjudDocumentDownloadsEnabled: true, pjudMonitoreoActivo: true } });
    if (!cause.pjudDocumentDownloadsEnabled || !cause.pjudMonitoreoActivo || cause.pjudDocumentDownloadOwnerId !== receipt.actorId) return null;
    const actor = await prisma.user.findUniqueOrThrow({ where: { id: receipt.actorId }, select: { id: true, role: true, capabilityGrants: true, capabilityRevokes: true } });
    await assertCausaCapability(opts.causaId, actor, "causa.write");
  }
  const existingMovement = await prisma.causaMovimiento.findUnique({ where: { id: opts.movimientoId }, select: { causaId: true, documentoRef: true } });
  if (!existingMovement || existingMovement.causaId !== opts.causaId) throw new Error("Documento fuera del expediente");
  if (existingMovement.documentoRef?.startsWith("doc:")) return existingMovement.documentoRef.slice(4);

  const filename = (opts.filename || `pjud-${opts.movimientoId}.pdf`)
    .replace(/[^\w.\-()+ ]+/g, "_")
    .slice(0, 180);
  const sourceSha256 = createHash("sha256").update(buf).digest("hex");
  const key = `pjud/${encodeURIComponent(opts.causaId)}/${encodeURIComponent(opts.movimientoId)}/${sourceSha256}`;
  await putObject({ key, body: buf, contentType: mime });
  const result = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Causa" WHERE id = ${opts.causaId} FOR UPDATE`;
    const movement = await tx.causaMovimiento.findUniqueOrThrow({ where: { id: opts.movimientoId } });
    if (movement.causaId !== opts.causaId) throw new Error("Documento fuera del expediente");
    const prior = await tx.pjudDocumentJob.findUnique({ where: { movimientoId: movement.id } });
    if ((opts.requireReceipt || opts.receiptLeaseToken) && !prior) return { id: null, created: false };
    if (prior?.status === "saved") return { id: prior.documentoId, created: false };
    if (movement.documentoRef?.startsWith("doc:")) return { id: movement.documentoRef.slice(4), created: false };
    if (opts.receiptLeaseToken && (!prior || prior.leaseToken !== opts.receiptLeaseToken || prior.status !== "running" || !prior.leaseExpiresAt || prior.leaseExpiresAt <= new Date())) return { id: null, created: false };
    if (!opts.receiptLeaseToken && prior?.status === "running") return { id: null, created: false };
    if (process.env.PJUD_DOC_DOWNLOADS?.trim() === "0") return { id: null, created: false };
    if (prior) {
      const cause = await tx.causa.findUniqueOrThrow({ where: { id: opts.causaId }, select: { pjudDocumentDownloadsEnabled: true, pjudMonitoreoActivo: true, pjudDocumentDownloadOwnerId: true } });
      if (!cause.pjudDocumentDownloadsEnabled || !cause.pjudMonitoreoActivo) return { id: null, created: false };
      if (!prior.actorId || prior.actorId !== cause.pjudDocumentDownloadOwnerId) return { id: null, created: false };
      if (prior.sourceRefHash !== pjudDocumentRefHash(opts.causaId, movement.id, movement.documentoRef || "")) return { id: null, created: false };
      if (prior.actorId) {
        const actor = await tx.user.findUniqueOrThrow({ where: { id: prior.actorId }, select: { id: true, role: true, capabilityGrants: true, capabilityRevokes: true } });
        await assertCausaCapability(opts.causaId, actor, "causa.write", tx);
      }
    }
    const doc = await tx.documento.create({ data: { nombre: filename, tipo: opts.esReceptor ? "notificacion" : "escrito", mimeType: mime, storageKey: key, causaId: opts.causaId, ruta: "PJUD", extractionStatus: "pending" } });
    await tx.causaMovimiento.update({ where: { id: movement.id }, data: { documentoRef: `doc:${doc.id}` } });
    if (prior) await tx.pjudDocumentJob.update({ where: { id: prior.id }, data: { status: "saved", documentoId: doc.id, sourceSha256, lastError: null, lastErrorCode: null, leaseToken: null, leaseExpiresAt: null } });
    return { id: doc.id, created: true };
  });
  if (result.id && result.created) (opts.enqueue || enqueueDocumentProcessing)({ id: result.id, name: filename, bytes: buf });
  return result.id;
}

/**
 * Download remote PDF/document URLs referenced on movimientos and store as Documento.
 * Strictly sequential (never parallel) with delay between each outbound request.
 * Note: OJV often requires session cookies — prefer scrape-time documentoBytes.
 */
export async function backupMovimientoDocuments(
  causaId: string,
  opts?: {
    max?: number;
    delayMs?: number;
    /** Manual import bypasses backup preferences, but never the download kill switch. */
    force?: boolean;
    onProgress?: (info: {
      index: number;
      total: number;
      label: string;
      saved: boolean;
    }) => void;
  }
) {
  if (process.env.PJUD_DOC_DOWNLOADS?.trim() === "0" || (!opts?.force && !pdfBackupEnabled())) {
    return { enabled: false, saved: 0, skipped: 0, attempted: 0 };
  }

  const max = opts?.max ?? pjudDocDownloadMaxPerRun();
  const delayMs = opts?.delayMs ?? pjudDocDownloadDelayMs();

  const pending = await listPendingPjudDocumentMovimientos(causaId, max);

  let saved = 0;
  let skipped = 0;
  let attempted = 0;

  for (let i = 0; i < pending.length; i += 1) {
    const mov = pending[i];
    const ref = mov.documentoRef?.trim();
    if (!isBackupableDocumentoRef(ref)) {
      skipped += 1;
      continue;
    }

    if (attempted > 0 && delayMs > 0) {
      await sleep(delayMs);
    }
    attempted += 1;
    const label =
      mov.folio?.trim()
        ? `Folio ${mov.folio}`
        : mov.titulo.slice(0, 80) || mov.id;

    try {
      const parsed = new URL(ref!);
      const res = await fetchSafeOutbound(ref!, {
        allowHttp: process.env.NODE_ENV !== "production",
        signal: AbortSignal.timeout(45_000),
        headers: { Accept: "application/pdf,*/*" },
      });
      if (!res.ok) {
        skipped += 1;
        opts?.onProgress?.({ index: i + 1, total: pending.length, label, saved: false });
        continue;
      }
      const contentType =
        res.headers.get("content-type") || "application/octet-stream";
      const buf = await readPjudDocumentResponse(res);
      const id = await ingestPjudDocumentBuffer({
        causaId,
        movimientoId: mov.id,
        bytes: buf,
        filename:
          parsed.pathname.split("/").filter(Boolean).pop() ||
          `pjud-${mov.folio || mov.id}.pdf`,
        esReceptor: mov.esReceptor,
        mimeHint: contentType,
      });
      if (id) saved += 1;
      else skipped += 1;
      opts?.onProgress?.({
        index: i + 1,
        total: pending.length,
        label,
        saved: Boolean(id),
      });
    } catch {
      skipped += 1;
      opts?.onProgress?.({ index: i + 1, total: pending.length, label, saved: false });
    }
  }

  return { enabled: true, saved, skipped, attempted };
}

/** Avanza por todo el expediente; los documentos importados no consumen cupo. */
export async function listPendingPjudDocumentMovimientos(causaId: string, max: number) {
  const batchSize = Math.max(max * 2, 40);
  const pending = [];
  let cursor: string | undefined;
  while (pending.length < max) {
    const rows = await prisma.causaMovimiento.findMany({
      where: {
        causaId,
        OR: [
          { documentoRef: { startsWith: "https://", mode: "insensitive" } },
          { documentoRef: { startsWith: "http://", mode: "insensitive" } },
        ],
      },
      orderBy: [{ fecha: "desc" }, { id: "desc" }],
      take: batchSize,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    for (const row of rows) {
      if (isBackupableDocumentoRef(row.documentoRef)) pending.push(row);
      if (pending.length === max) break;
    }
    if (rows.length < batchSize) break;
    cursor = rows.at(-1)!.id;
  }
  return pending;
}

/** Reject oversized responses while streaming, before allocating an unbounded body. */
export async function readPjudDocumentResponse(response: Response, maximum = 20 * 1024 * 1024) {
  if (Number(response.headers.get("content-length") || 0) > maximum) { await response.body?.cancel(); throw new Error("El documento supera el tamaño permitido"); }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Documento vacío");
  let size = 0; const chunks: Uint8Array[] = [];
  try { for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > maximum) { await reader.cancel(); throw new Error("El documento supera el tamaño permitido"); } chunks.push(part.value); } }
  finally { reader.releaseLock(); }
  return Buffer.concat(chunks, size);
}
