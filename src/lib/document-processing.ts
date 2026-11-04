import path from "node:path";
import { toMarkdownBytes, formatFromExtension } from "@firecrawl/anydoc";
import { ocrPdfPages } from "@/lib/local-ocr";
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
      let classifyPdfAsync: typeof import("@firecrawl/pdf-inspector").classifyPdfAsync;
      try { ({ classifyPdfAsync } = await import("@firecrawl/pdf-inspector")); }
      catch { throw Object.assign(new Error("PDF classifier unavailable"), { code: "pdf_classifier_unavailable" }); }
      const classification = await classifyPdfAsync(bytes);
      const requiresOcr =
        classification.pdfType === "Scanned" ||
        classification.pdfType === "ImageBased" ||
        classification.pagesNeedingOcr.length > 0;
      let markdown: string | null = null;
      if (!requiresOcr || classification.pdfType === "Mixed") {
        try {
          markdown = (await toMarkdownBytes(bytes)).trim() || null;
        } catch {
          markdown = null;
        }
      }
      if (!requiresOcr) {
        return {
          format: "pdf",
          status: markdown ? "completed" : "unsupported",
          markdown,
          metadata: {
            pdfType: classification.pdfType,
            pageCount: classification.pageCount,
            pagesNeedingOcr: classification.pagesNeedingOcr,
            confidence: classification.confidence,
          },
        };
      }

      const ocr = await ocrPdfPages(
        bytes,
        classification.pageCount,
        classification.pagesNeedingOcr
      );
      const combined = [markdown, ocr.markdown]
        .filter((value): value is string => Boolean(value))
        .join("\n\n---\n\n");
      return {
        format: "pdf",
        status: ocr.status === "completed" ? "completed" : "needs_ocr",
        markdown: combined || null,
        metadata: {
          pdfType: classification.pdfType,
          pageCount: classification.pageCount,
          pagesNeedingOcr: classification.pagesNeedingOcr,
          confidence: classification.confidence,
          ocrStatus: ocr.status,
          ocrReason: ocr.reason,
          ocrPagesProcessed: ocr.pagesProcessed,
          ocrPagesFailed: ocr.pagesFailed,
        },
      };
    } catch (error) {
      const code = errorCode(error);
      if (code === "pdf_classifier_unavailable") {
        // Some native targets have no published inspector binding. Physical page
        // extraction can use the configured local Poppler tools instead.
        try {
          const physical = await extractPdfPages(bytes);
          const markdown = physical.pages.filter(page => page.text).map(page => `## Página ${page.pageNumber}\n\n${page.text}`).join("\n\n") || null;
          return { format: "pdf", status: physical.partial ? "needs_ocr" : markdown ? "completed" : "unsupported", markdown, metadata: { pdfType: "PhysicalPageExtraction", pageCount: physical.pageCount, pagesNeedingOcr: physical.pages.filter(page => page.status === "needs_ocr").map(page => page.pageNumber - 1), extractorVersion: physical.extractorVersion, partial: physical.partial } };
        } catch (fallbackError) {
          const fallbackCode = errorCode(fallbackError) || "pdf_engine_unavailable";
          return { format: "pdf", status: fallbackCode === "pdf_engine_unavailable" ? "needs_ocr" : "failed", markdown: null, metadata: { errorCode: fallbackCode, ...(fallbackCode === "pdf_engine_unavailable" ? { hint: "Configure las herramientas locales de Poppler para leer y verificar las páginas de este PDF." } : {}) } };
        }
      }
      return {
        format: "pdf",
        status: code === "unsupported" ? "needs_ocr" : "failed",
        markdown: null,
        metadata: { errorCode: code || "processing_error" },
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
