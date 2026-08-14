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
 * Uses absolute http(s) documentoRef values from scrape/sidecar.
 * Note: OJV often requires session cookies — prefer scrape-time documentoBytes.
 */
export async function backupMovimientoDocuments(causaId: string) {
  if (!pdfBackupEnabled()) {
    return { enabled: false, saved: 0, skipped: 0 };
  }

  const movimientos = await prisma.causaMovimiento.findMany({
    where: {
      causaId,
      documentoRef: { not: null },
    },
    orderBy: { fecha: "desc" },
    take: 30,
  });

  let saved = 0;
  let skipped = 0;

  for (const mov of movimientos) {
    const ref = mov.documentoRef?.trim();
    if (!isBackupableDocumentoRef(ref)) {
      skipped += 1;
      continue;
    }

    try {
      const parsed = new URL(ref!);
      const res = await fetchSafeOutbound(ref!, {
        allowHttp: process.env.NODE_ENV !== "production",
        signal: AbortSignal.timeout(45_000),
        headers: { Accept: "application/pdf,*/*" },
      });
      if (!res.ok) {
        skipped += 1;
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
    } catch {
      skipped += 1;
    }
  }

  return { enabled: true, saved, skipped };
}
