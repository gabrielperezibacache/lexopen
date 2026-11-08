import path from "node:path";
import { toMarkdownBytes, formatFromExtension } from "@firecrawl/anydoc";
import { extractPdfPages } from "@/lib/evidence/pdf-pages";

export const MAX_PROCESSING_BYTES = 25 * 1024 * 1024;

export type DocumentProcessingResult = {
  format: string | null;
  status: "completed" | "needs_ocr" | "unsupported" | "failed";
  markdown: string | null;
  metadata: Record<string, unknown>;
};

function errorCode(error: unknown) {
  if (error && typeof error === "object" && "code" in error) {
    return String((error as { code?: unknown }).code || "");
  }
  return "";
}

function isPdf(name: string, bytes: Buffer) {
  return (
    path.extname(name).toLowerCase() === ".pdf" ||
    bytes.subarray(0, 5).toString("ascii") === "%PDF-"
  );
}

export async function processDocumentBytes(
  name: string,
  bytes: Buffer
): Promise<DocumentProcessingResult> {
  if (bytes.byteLength > MAX_PROCESSING_BYTES) {
    return {
      format: path.extname(name).toLowerCase() || null,
      status: "failed",
      markdown: null,
      metadata: { errorCode: "resourceLimit", maxBytes: MAX_PROCESSING_BYTES },
    };
  }

  if (isPdf(name, bytes)) {
    try {
      const physical = await extractPdfPages(bytes);
      const markdown = physical.pages
        .filter((page) => page.text)
        .map((page) => `## Página ${page.pageNumber}\n\n${page.text}`)
        .join("\n\n") || null;
      const pending = physical.pages.filter((page) => page.status === "needs_ocr");
      const ocrProcessed = physical.pages.filter(
        (page) => page.method === "ocr" && page.status === "completed"
      );
      const ocrUnavailable = pending.length > 0 && ocrProcessed.length === 0 && pending.every(
        (page) => ["ocr_disabled", "tesseract_unavailable", "pdf_renderer_unavailable"].includes(page.reason || "")
      );
      const ocrStatus = !physical.partial ? "completed" : ocrUnavailable ? "unavailable" : "failed";
      return {
        format: "pdf",
        status: physical.partial ? "needs_ocr" : "completed",
        markdown,
        metadata: {
          pdfType: "PhysicalPageExtraction",
          pageCount: physical.pageCount,
          extractorVersion: physical.extractorVersion,
          sourceSha256: physical.sourceSha256,
          partial: physical.partial,
          pages: physical.pages.map(({ pageNumber, method, status, reason }) => ({
            pageNumber, method, status, ...(reason ? { reason } : {}),
          })),
          // OCR index arrays are consistently zero-based; displayed page numbers are physical, one-based ordinals.
          pagesNeedingOcr: pending.map((page) => page.pageNumber - 1),
          ocrStatus,
          ocrPagesProcessed: ocrProcessed.map((page) => page.pageNumber - 1),
          ocrPagesFailed: pending.map((page) => page.pageNumber - 1),
        },
      };
    } catch (error) {
      const code = errorCode(error) || "processing_error";
      // Let the durable queue retry temporary parser saturation.
      if (code === "pdf_busy") throw error;
      return {
        format: "pdf",
        status: code === "pdf_engine_unavailable" ? "needs_ocr" : "failed",
        markdown: null,
        metadata: {
          errorCode: code,
          ...(code === "pdf_engine_unavailable" ? { hint: "Configure las herramientas locales de Poppler para leer y verificar las páginas de este PDF." } : {}),
        },
      };
    }
  }

  const extension = path.extname(name).toLowerCase();
  const format = formatFromExtension(extension);
  try {
    const markdown = await toMarkdownBytes(bytes, format);
    return {
      format: format ? String(format) : extension || null,
      status: markdown.trim() ? "completed" : "unsupported",
      markdown: markdown.trim() || null,
      metadata: {},
    };
  } catch (error) {
    const code = errorCode(error);
    return {
      format: format ? String(format) : extension || null,
      status: code === "encrypted" || code === "unsupported" ? "unsupported" : "failed",
      markdown: null,
      metadata: { errorCode: code || "processing_error" },
    };
  }
}
