import { prisma } from "@/lib/db";
import { newStorageKey, putObject } from "@/lib/storage";

export function pdfBackupEnabled() {
  return process.env.PJUD_PDF_BACKUP === "1";
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
    if (!ref) {
      skipped += 1;
      continue;
    }
    if (ref.startsWith("doc:") || ref.startsWith("lexopen:")) {
      skipped += 1;
      continue;
    }
    if (!/^https?:\/\//i.test(ref)) {
      skipped += 1;
      continue;
    }

    try {
      const parsed = new URL(ref);
      if (parsed.protocol !== "https:" && process.env.NODE_ENV === "production") {
        skipped += 1;
        continue;
      }
      const res = await fetch(ref, {
        redirect: "follow",
        signal: AbortSignal.timeout(45_000),
        headers: { Accept: "application/pdf,*/*" },
      });
      if (!res.ok) {
        skipped += 1;
        continue;
      }
      const contentType = res.headers.get("content-type") || "application/octet-stream";
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.byteLength < 100 || buf.byteLength > 20 * 1024 * 1024) {
        skipped += 1;
        continue;
      }
      const filename =
        parsed.pathname.split("/").filter(Boolean).pop() ||
        `pjud-${mov.folio || mov.id}.pdf`;
      const key = newStorageKey(`pjud/${causaId}`, filename);
      await putObject({ key, body: buf, contentType });
      const doc = await prisma.documento.create({
        data: {
          nombre: filename,
          tipo: mov.esReceptor ? "notificacion" : "escrito",
          mimeType: contentType,
          storageKey: key,
          causaId,
          extractionStatus: "pending",
        },
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
