import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const OCR_TEXT_MAX_BYTES = 10 * 1024 * 1024;

export type OcrPdfResult = {
  status: "completed" | "unavailable" | "failed";
  markdown: string | null;
  pagesProcessed: number[];
  pagesFailed: number[];
  reason?: string;
};

function commandError(error: unknown) {
  if (error && typeof error === "object" && "code" in error) {
    return String((error as { code?: unknown }).code || "");
  }
  return "";
}

function configuredPages(pageCount: number, pages: number[]) {
  const requested = pages.length
    ? pages
    : Array.from({ length: pageCount }, (_, index) => index);
  const maxPages = Math.max(
    1,
    Math.min(Number(process.env.OCR_MAX_PAGES || 20), 100)
  );
  return {
    pages: requested.filter((page) => page >= 0 && page < pageCount).slice(0, maxPages),
    truncated: requested.length > maxPages,
  };
}

export async function ocrPdfPages(
  bytes: Buffer,
  pageCount: number,
  pages: number[]
): Promise<OcrPdfResult> {
  if (process.env.OCR_ENABLED === "0") {
    return {
      status: "unavailable",
      markdown: null,
      pagesProcessed: [],
      pagesFailed: pages,
      reason: "disabled",
    };
  }

  const selected = configuredPages(pageCount, pages);
  if (selected.pages.length === 0) {
    return {
      status: "failed",
      markdown: null,
      pagesProcessed: [],
      pagesFailed: [],
      reason: "no_pages",
    };
  }

  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lexopen-ocr-"));
  const pdfPath = path.join(root, "document.pdf");
  const renderPrefix = path.join(root, "page");
  const tesseract = process.env.OCR_TESSERACT_BIN || "tesseract";
  const pdftoppm = process.env.OCR_PDFTOPPM_BIN || "pdftoppm";
  const language = process.env.OCR_LANGUAGE || "spa+eng";
  const timeout = Math.max(
    5_000,
    Math.min(Number(process.env.OCR_TIMEOUT_MS || 30_000), 120_000)
  );
  const pagesProcessed: number[] = [];
  const pagesFailed: number[] = [];
  const markdown: string[] = [];

  try {
    await fs.writeFile(pdfPath, bytes);
    for (const page of selected.pages) {
      const imagePath = `${renderPrefix}-${page + 1}.png`;
      try {
        await execFile(
          pdftoppm,
          [
            "-f",
            String(page + 1),
            "-l",
            String(page + 1),
            "-png",
            "-r",
            "200",
            "-singlefile",
            pdfPath,
            `${renderPrefix}-${page + 1}`,
          ],
          { timeout, maxBuffer: 2 * 1024 * 1024, windowsHide: true }
        );
        const result = await execFile(
          tesseract,
          [imagePath, "stdout", "-l", language, "--psm", "3"],
          {
            timeout,
            maxBuffer: OCR_TEXT_MAX_BYTES,
            windowsHide: true,
            encoding: "utf8",
          }
        );
        const text = String(result.stdout || "").trim();
        if (!text) {
          pagesFailed.push(page);
          continue;
        }
        pagesProcessed.push(page);
        markdown.push(`## Página ${page + 1}\n\n${text}`);
      } catch (error) {
        pagesFailed.push(page);
        const code = commandError(error);
        if (code === "ENOENT") {
          return {
            status: "unavailable",
            markdown: null,
            pagesProcessed,
            pagesFailed: selected.pages,
            reason: "tesseract_or_pdftoppm_missing",
          };
        }
      }
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }

  return {
    status: pagesProcessed.length
      ? pagesFailed.length || selected.truncated
        ? "failed"
        : "completed"
      : "failed",
    markdown: markdown.length ? markdown.join("\n\n") : null,
    pagesProcessed,
    pagesFailed,
    reason: selected.truncated ? "page_limit" : undefined,
  };
}
