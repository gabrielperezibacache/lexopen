import { prisma } from "@/lib/db";
import { fetchSafeOutbound, isSafeOutboundHttpUrl } from "@/lib/net/safe-url";
import { newStorageKey, putObject } from "@/lib/storage";
import { enqueueDocumentProcessing } from "@/lib/document-processing-queue";

/**
 * PDF backup: explicit PJUD_PDF_BACKUP=1|0, else on when public scrape is enabled
 * (docs are required for download + AI review of OJV anexos).
 */
export function pdfBackupEnabled() {
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

  const filename = (opts.filename || `pjud-${opts.movimientoId}.pdf`)
    .replace(/[^\w.\-()+ ]+/g, "_")
    .slice(0, 180);
  const key = newStorageKey(`pjud/${opts.causaId}`, filename);
  await putObject({ key, body: buf, contentType: mime });
  const doc = await prisma.documento.create({
    data: {
      nombre: filename,
      tipo: opts.esReceptor ? "notificacion" : "escrito",
      mimeType: mime,
      storageKey: key,
      causaId: opts.causaId,
      ruta: "PJUD",
      extractionStatus: "pending",
    },
  });
  enqueueDocumentProcessing({
    id: doc.id,
    name: doc.nombre,
    bytes: buf,
  });
  await prisma.causaMovimiento.update({
    where: { id: opts.movimientoId },
    data: { documentoRef: `doc:${doc.id}` },
  });
  return doc.id;
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
    /** Manual import from ficha/timeline — always persist into LexOpen Documentos. */
    force?: boolean;
    onProgress?: (info: {
      index: number;
      total: number;
      label: string;
      saved: boolean;
    }) => void;
  }
) {
  if (!opts?.force && !pdfBackupEnabled()) {
    return { enabled: false, saved: 0, skipped: 0, attempted: 0 };
  }

  const max = opts?.max ?? pjudDocDownloadMaxPerRun();
  const delayMs = opts?.delayMs ?? pjudDocDownloadDelayMs();

  const movimientos = await prisma.causaMovimiento.findMany({
    where: {
      causaId,
      documentoRef: { not: null },
    },
    orderBy: { fecha: "desc" },
    take: Math.max(max * 2, 40),
  });

  const pending = movimientos.filter((mov) =>
    isBackupableDocumentoRef(mov.documentoRef)
  ).slice(0, max);

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
      const buf = Buffer.from(await res.arrayBuffer());
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
