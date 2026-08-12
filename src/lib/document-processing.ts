import path from "node:path";
import { toMarkdownBytes, formatFromExtension } from "@firecrawl/anydoc";
import { classifyPdfAsync } from "@firecrawl/pdf-inspector";

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
      const classification = await classifyPdfAsync(bytes);
      if (classification.pdfType === "Scanned" || classification.pdfType === "ImageBased") {
        return {
          format: "pdf",
          status: "needs_ocr",
          markdown: null,
          metadata: {
            pdfType: classification.pdfType,
            pageCount: classification.pageCount,
            pagesNeedingOcr: classification.pagesNeedingOcr,
            confidence: classification.confidence,
          },
        };
      }

      const markdown = await toMarkdownBytes(bytes);
      return {
        format: "pdf",
        status: classification.pagesNeedingOcr.length ? "needs_ocr" : "completed",
        markdown: markdown.trim() || null,
        metadata: {
          pdfType: classification.pdfType,
          pageCount: classification.pageCount,
          pagesNeedingOcr: classification.pagesNeedingOcr,
          confidence: classification.confidence,
        },
      };
    } catch (error) {
      const code = errorCode(error);
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
