import { createHash, randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { pjudDocumentRefHash } from "./document-identity";
import { assertCausaCapability, documentReadWhere } from "@/lib/auth/causa-access";
import { prisma } from "@/lib/db";
import { fetchSafeOutbound, isSafeOutboundHttpUrl } from "@/lib/net/safe-url";
import { discardCaseUploadAttempt, putObject } from "@/lib/storage";
import { enqueueDocumentProcessing } from "@/lib/document-processing-queue";
import { assertPjudManagementEnabled, getCaseManagementMode } from "@/lib/causas/management-mode";
import { findCaseIntakeOriginal } from "@/lib/causas/document-intake";
import { serializable } from "@/lib/command-execution";

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

export type PjudDownloadedFileMeta = { filename: string; mimeType: string };

/** Infer a usable Office/PDF extension from the response signature and official source. */
export function inferPjudDownloadedFileMeta(
  bytes: Buffer,
  contentType: string | null | undefined,
  ref: string | null | undefined,
  fallbackBase: string,
): PjudDownloadedFileMeta | null {
  const mime = (contentType || "").split(";")[0]!.trim().toLowerCase();
  const path = (() => {
    try { return new URL(ref || "").pathname; } catch { return ref || ""; }
  })();
  let originalName = path.split(/[\\/]/).filter(Boolean).pop() || "";
  try { originalName = decodeURIComponent(originalName); } catch { /* Keep the encoded name if malformed. */ }
  const originalExtension = /\.([a-z0-9]+)$/i.exec(originalName)?.[1]?.toLowerCase() || "";
  let extension = "";
  let mimeType = "";
  if (looksLikePdf(bytes)) {
    extension = "pdf";
    mimeType = "application/pdf";
  } else if (bytes.length >= 5 && bytes.subarray(0, 5).toString("ascii").toLowerCase() === "{\\rtf") {
    extension = "rtf";
    mimeType = "application/rtf";
  } else if (bytes.length >= 4 && bytes.subarray(0, 4).equals(Buffer.from("504b0304", "hex")) &&
    (/officedocument\.wordprocessingml\.document/i.test(mime) || originalExtension === "docx")) {
    extension = "docx";
    mimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  } else if (bytes.length >= 4 && bytes.subarray(0, 4).equals(Buffer.from("d0cf11e0", "hex")) &&
    (/application\/msword/i.test(mime) || originalExtension === "doc")) {
    extension = "doc";
    mimeType = "application/msword";
  }
  if (!extension) return null;
  const coherentExtensions = new Set(["pdf", "docx", "doc", "rtf"]);
  if (coherentExtensions.has(originalExtension) && originalExtension === extension) {
    return { filename: originalName.replace(/[^\w.\-()+ ]+/g, "_").slice(0, 180), mimeType };
  }
  const base = fallbackBase.replace(/\.[a-z0-9]+$/i, "").replace(/[^\w.\-()+ ]+/g, "_").slice(0, 160) || "pjud-documento";
  return { filename: base + "." + extension, mimeType };
}

/** Reject login/error pages and verify the binary signature for each supported file type. */
export function validPjudDownloadedContent(bytes: Buffer, contentType: string, ref: string, maximum: number) {
  if (bytes.length < 100 || bytes.length > maximum || /^\s*</.test(bytes.subarray(0, 40).toString("utf8"))) return false;
  const pdf = looksLikePdf(bytes);
  const mime = contentType.toLowerCase();
  let path = "";
  try { path = new URL(ref).pathname.toLowerCase(); } catch { return false; }
  if (path.endsWith(".pdf") || /application\/pdf/i.test(mime)) return pdf;
  if (pdf) return true;
  const ole = bytes.length >= 4 && bytes.subarray(0, 4).equals(Buffer.from("d0cf11e0", "hex"));
  const docxZip = bytes.length >= 4 && bytes.subarray(0, 4).equals(Buffer.from("504b0304", "hex")) && /officedocument\.wordprocessingml\.document|application\/msword/i.test(mime);
  const rtf = bytes.subarray(0, 5).toString("ascii").toLowerCase() === "{\\rtf";
  const legacyDocPath = /\.doc$/i.test(path);
  return docxZip || rtf || (ole && (/msword|octet-stream/i.test(mime) || legacyDocPath));
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
  if (value.length > 4000 || value.includes("#")) return false;
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
    const parsed = new URL(value);
    return !parsed.hash && isAllowedPjudDocumentoHost(parsed.hostname);
  } catch {
    return false;
  }
}

async function authorizeDownloadActor(causaId: string, actorId: string, client: Prisma.TransactionClient = prisma) {
  const actor = await client.user.findUniqueOrThrow({
    where: { id: actorId },
    select: { id: true, role: true, capabilityGrants: true, capabilityRevokes: true },
  });
  await assertCausaCapability(causaId, actor, "causa.write", client);
  return actor;
}

/**
 * Persist PDF/DOC bytes captured during scrape into Documento + link movimiento.
 */
export async function ingestPjudDocumentBuffer(opts: {
  causaId: string;
  movimientoId: string;
  bytes: Buffer;
  filename?: string | null;
  documentRef?: string | null;
  esReceptor?: boolean;
  mimeHint?: string | null;
  actorId?: string;
  expectedSourceRefHash?: string;
  receiptLeaseToken?: string;
  requireReceipt?: boolean;
  /** Fence a manual batch inside the same transaction that links the original. */
  manualBatch?: {
    guard: (tx: Prisma.TransactionClient) => Promise<void>;
    saved: (tx: Prisma.TransactionClient) => Promise<void>;
  };
  enqueue?: typeof enqueueDocumentProcessing;
}) {
  const buf = opts.bytes;
  if (buf.byteLength < 100 || buf.byteLength > 20 * 1024 * 1024) {
    return null;
  }
  if (process.env.PJUD_DOC_DOWNLOADS?.trim() === "0" || await getCaseManagementMode() !== "pjud_cl") return null;
  if (
    /^\s*<(!DOCTYPE|html|head|body)/i.test(buf.subarray(0, 200).toString("utf8"))
  ) {
    return null;
  }
  const meta = inferPjudDownloadedFileMeta(
    buf,
    opts.mimeHint,
    opts.filename && /\.(?:pdf|docx|doc|rtf)$/i.test(opts.filename) ? opts.filename : opts.documentRef || opts.filename,
    "pjud-" + opts.movimientoId,
  );
  if (!meta) return null;
  const mime = meta.mimeType;
  if (
    !looksLikePdf(buf) &&
    !/msword|officedocument|rtf/i.test(mime)
  ) {
    return null;
  }

  const filename = meta.filename;
  const sourceSha256 = createHash("sha256").update(buf).digest("hex");
  const key = `pjud/intake-attempt/${randomUUID()}`;
  let staged: ReturnType<typeof putObject> | undefined;
  const result = await serializable(async tx => {
    await opts.manualBatch?.guard(tx);
    await assertPjudManagementEnabled(tx);
    await tx.$queryRaw`SELECT id FROM "Causa" WHERE id = ${opts.causaId} FOR UPDATE`;
    const movement = await tx.causaMovimiento.findUniqueOrThrow({ where: { id: opts.movimientoId } });
    if (movement.causaId !== opts.causaId) throw new Error("Documento fuera del expediente");
    const prior = await tx.pjudDocumentJob.findUnique({ where: { movimientoId: movement.id } });
    if (prior && prior.causaId !== opts.causaId) throw new Error("Documento fuera del expediente");
    if ((opts.requireReceipt || opts.receiptLeaseToken) && !prior) return { id: null, created: false };
    let actor = opts.actorId ? await authorizeDownloadActor(opts.causaId, opts.actorId, tx) : null;
    if (opts.requireReceipt && actor && actor.id !== prior?.actorId) return { id: null, created: false };
    if (prior?.status === "saved" || movement.documentoRef?.startsWith("doc:")) {
      const id = prior?.status === "saved" ? prior.documentoId : movement.documentoRef!.slice(4);
      const doc = id && await tx.documento.findFirst({
        where: { AND: [{ id, causaId: opts.causaId }, ...(actor ? [documentReadWhere(actor)] : [])] },
        select: { id: true },
      });
      return { id: doc ? doc.id : null, created: false };
    }
    if (opts.receiptLeaseToken && (!prior || prior.leaseToken !== opts.receiptLeaseToken || prior.status !== "running" || !prior.leaseExpiresAt || prior.leaseExpiresAt <= new Date())) return { id: null, created: false };
    if (!opts.receiptLeaseToken && prior?.status === "running") return { id: null, created: false };
    if (process.env.PJUD_DOC_DOWNLOADS?.trim() === "0") return { id: null, created: false };
    const sourceRefHash = pjudDocumentRefHash(opts.causaId, movement.id, movement.documentoRef || "");
    if (opts.expectedSourceRefHash && opts.expectedSourceRefHash !== sourceRefHash) return { id: null, created: false };
    if (prior) {
      const cause = await tx.causa.findUniqueOrThrow({ where: { id: opts.causaId }, select: { pjudDocumentDownloadsEnabled: true, pjudMonitoreoActivo: true, pjudDocumentDownloadOwnerId: true } });
      if (!cause.pjudDocumentDownloadsEnabled || !cause.pjudMonitoreoActivo) return { id: null, created: false };
      if (!prior.actorId || prior.actorId !== cause.pjudDocumentDownloadOwnerId) return { id: null, created: false };
      if (prior.sourceRefHash !== sourceRefHash) return { id: null, created: false };
      const owner = actor?.id === prior.actorId ? actor : await authorizeDownloadActor(opts.causaId, prior.actorId, tx);
      actor ??= owner;
    }
    const intakeKey = { causaId: opts.causaId, source: "ojv", sourceKey: movement.id };
    // Manual downloads can predate the durable queue. The intake still protects a removed original.
    if (await tx.caseDocumentIntake.findUnique({ where: { causaId_source_sourceKey: intakeKey }, select: { id: true } })) {
      return { id: null, created: false };
    }
    const reusable = actor && await findCaseIntakeOriginal(tx, actor, {
      causaId: opts.causaId, clienteId: null, confidencial: false, privilegio: false,
    }, { sourceSha256, sizeBytes: buf.byteLength });
    if (!reusable) {
      staged ??= putObject({ key, body: buf, contentType: mime });
      await staged;
    }
    const doc = reusable || await tx.documento.create({ data: { nombre: filename, tipo: opts.esReceptor ? "notificacion" : "escrito", mimeType: mime, storageKey: key, causaId: opts.causaId, ruta: "PJUD", extractionStatus: "pending" } });
    await tx.caseDocumentIntake.create({ data: {
      ...intakeKey, documentoId: doc.id, documentVersion: doc.version, sourceSha256, sourceName: filename,
      storageKey: doc.storageKey, actorId: actor?.id,
    } });
    await tx.causaMovimiento.update({ where: { id: movement.id }, data: { documentoRef: `doc:${doc.id}` } });
    if (prior) await tx.pjudDocumentJob.update({ where: { id: prior.id }, data: { status: "saved", documentoId: doc.id, sourceSha256, lastError: null, lastErrorCode: null, leaseToken: null, leaseExpiresAt: null } });
    await opts.manualBatch?.saved(tx);
    return { id: doc.id, created: !reusable };
  }).catch(async error => {
    if (staged) {
      // Serialize with the original transaction in case the Host lost the commit acknowledgement.
      // If storage or Postgres cannot confirm ownership, retain the bytes.
      await prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM "Causa" WHERE id = ${opts.causaId} FOR UPDATE`;
        const receipt = await tx.caseDocumentIntake.findFirst({ where: { storageKey: key }, select: { id: true } });
        if (!receipt) await discardCaseUploadAttempt(key);
      }).catch(() => undefined);
    }
    throw error;
  });
  if (!result.created && staged) await discardCaseUploadAttempt(key).catch(() => undefined);
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
    actorId?: string;
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
  if (await getCaseManagementMode() !== "pjud_cl") return { enabled: false, saved: 0, skipped: 0, attempted: 0 };

  const max = opts?.max ?? pjudDocDownloadMaxPerRun();
  const delayMs = opts?.delayMs ?? pjudDocDownloadDelayMs();

  const pending = await listPendingPjudDocumentMovimientos(causaId, max);

  let saved = 0;
  let skipped = 0;
  let attempted = 0;

  for (let i = 0; i < pending.length; i += 1) {
    if (await getCaseManagementMode() !== "pjud_cl") break;
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
      await assertPjudManagementEnabled();
      if (opts?.actorId) await authorizeDownloadActor(causaId, opts.actorId);
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
        documentRef: ref,
        esReceptor: mov.esReceptor,
        mimeHint: contentType,
        actorId: opts?.actorId,
        expectedSourceRefHash: pjudDocumentRefHash(causaId, mov.id, ref!),
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
export async function listPendingPjudDocumentMovimientos(causaId: string, max: number, excludeIds: string[] = []) {
  const batchSize = Math.max(max * 2, 40);
  const pending = [];
  let cursor: string | undefined;
  while (pending.length < max) {
    const rows = await prisma.causaMovimiento.findMany({
      where: {
        causaId,
        ...(excludeIds.length ? { id: { notIn: excludeIds } } : {}),
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
