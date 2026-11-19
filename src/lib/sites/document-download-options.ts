import { prisma } from "@/lib/db";
import { hasInlineDocumentOriginal } from "@/lib/security/download";

export type DocumentDownloadOptions = { original: boolean; text: "markdown" | "plain" | null };

/** Pass only IDs from the authorized page. Return metadata, never document bodies or storage keys. */
export async function documentDownloadOptions(ids: string[]) {
  const result = new Map<string, DocumentDownloadOptions & { hasText: boolean }>();
  if (!ids.length) return result;
  const rows = await prisma.$queryRaw<{
    id: string; nombre: string; mimeType: string | null; stored: boolean; hasContent: boolean;
    pdfHeader: boolean; hasText: boolean; hasMarkdown: boolean;
  }[]>`SELECT id, nombre, "mimeType", coalesce("storageKey", '') <> '' AS stored,
      contenido IS NOT NULL AS "hasContent", coalesce(left(contenido, 5) = '%PDF-', false) AS "pdfHeader",
      length(trim(coalesce(contenido, ''))) > 0 AS "hasText",
      length(trim(coalesce("extractedMarkdown", ''))) > 0 AS "hasMarkdown"
    FROM "Documento" WHERE id = ANY(${ids})`;
  for (const row of rows) {
    const inline = hasInlineDocumentOriginal(row, row.hasContent, row.pdfHeader);
    const text = row.hasMarkdown ? "markdown" : row.hasText && !inline ? "plain" : null;
    result.set(row.id, { original: row.stored || inline, text, hasText: row.hasText || row.hasMarkdown });
  }
  return result;
}
