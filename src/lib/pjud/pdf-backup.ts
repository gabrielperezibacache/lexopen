import { prisma } from "@/lib/db";
import { fetchSafeOutbound, isSafeOutboundHttpUrl } from "@/lib/net/safe-url";
import { newStorageKey, putObject } from "@/lib/storage";
import { enqueueDocumentProcessing } from "@/lib/document-processing-queue";

export function pdfBackupEnabled() {
  return process.env.PJUD_PDF_BACKUP === "1";
}

/** True when buffer looks like a PDF (%PDF). */
export function looksLikePdf(buf: Buffer) {
  if (buf.byteLength < 5) return false;
  return buf.subarray(0, 5).toString("utf8") === "%PDF-";
}

export function isBackupableDocumentoRef(ref: string | null | undefined) {
  if (!ref?.trim()) return false;
  const value = ref.trim();
  if (value.startsWith("doc:") || value.startsWith("lexopen:")) return false;
  if (!/^https?:\/\//i.test(value)) return false;
  // OJV and public hosts only — block SSRF to private/metadata.
  return isSafeOutboundHttpUrl(value, {
    allowHttp: process.env.NODE_ENV !== "production",
  });
}

/**
 * Download remote PDF/document URLs referenced on movimientos and store as Documento.
 * Uses absolute http(s) documentoRef values from scrape/sidecar.
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
      // Never follow redirects — validated URL must be the final hop (SSRF).
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
      if (buf.byteLength < 100 || buf.byteLength > 20 * 1024 * 1024) {
        skipped += 1;
        continue;
      }
      // Reject HTML login walls / CAPTCHA pages masquerading as downloads.
      if (
        !looksLikePdf(buf) &&
        !/pdf|octet-stream|msword|officedocument/i.test(contentType)
      ) {
        skipped += 1;
        continue;
      }
      if (
        /text\/html/i.test(contentType) ||
        /^\s*<(!DOCTYPE|html|head|body)/i.test(buf.subarray(0, 200).toString("utf8"))
      ) {
        skipped += 1;
        continue;
      }

      const filename =
        parsed.pathname.split("/").filter(Boolean).pop() ||
        `pjud-${mov.folio || mov.id}.pdf`;
      const key = newStorageKey(`pjud/${causaId}`, filename);
      const mime = looksLikePdf(buf) ? "application/pdf" : contentType;
      await putObject({ key, body: buf, contentType: mime });
      const doc = await prisma.documento.create({
        data: {
          nombre: filename,
          tipo: mov.esReceptor ? "notificacion" : "escrito",
          mimeType: mime,
          storageKey: key,
          causaId,
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
        where: { id: mov.id },
        data: { documentoRef: `doc:${doc.id}` },
      });
      saved += 1;
    } catch {
      skipped += 1;
    }
  }

  return { enabled: true, saved, skipped };
}
