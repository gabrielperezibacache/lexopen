import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const OCR_TEXT_MAX_BYTES = 10 * 1024 * 1024;
let capabilityPromise: Promise<OcrCapability> | null = null;

export type OcrCapability = {
  enabled: boolean;
  available: boolean;
  provider: "pdfdown-ocr" | "tesseract-cli" | "disabled" | "unavailable";
  version?: string;
  reason?: string;
};

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

export function getOcrCapability() {
  if (!capabilityPromise) {
    capabilityPromise = detectOcrCapability();
  }
  return capabilityPromise;
}

async function detectOcrCapability(): Promise<OcrCapability> {
  if (process.env.OCR_ENABLED === "0") {
    return { enabled: false, available: false, provider: "disabled" };
  }

  const tesseract = process.env.OCR_TESSERACT_BIN || "tesseract";
  let version: string | undefined;
  try {
    const result = await execFile(tesseract, ["--version"], {
      timeout: 3_000,
      maxBuffer: 128 * 1024,
      windowsHide: true,
      encoding: "utf8",
    });
    version = String(result.stdout || "").split(/\r?\n/, 1)[0] || undefined;
  } catch (error) {
    return {
      enabled: true,
      available: false,
      provider: "unavailable",
      reason:
        commandError(error) === "ENOENT"
          ? "tesseract_missing"
          : "tesseract_unavailable",
    };
  }

  try {
    await import("@d0paminedriven/pdfdown-ocr");
    return { enabled: true, available: true, provider: "pdfdown-ocr", version };
  } catch {
    const pdftoppm = process.env.OCR_PDFTOPPM_BIN || "pdftoppm";
    try {
      await execFile(pdftoppm, ["-v"], {
        timeout: 3_000,
        maxBuffer: 128 * 1024,
        windowsHide: true,
      });
      return { enabled: true, available: true, provider: "tesseract-cli", version };
    } catch {
      return {
        enabled: true,
        available: false,
        provider: "unavailable",
        version,
        reason: "ocr_binding_and_pdftoppm_missing",
      };
    }
  }
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

async function tryPdfDownOcr(
  bytes: Buffer,
  selected: { pages: number[]; truncated: boolean }
): Promise<OcrPdfResult | null> {
  let extractTextWithOcrPerPageAsync: (
    input: Buffer,
    options: { lang: string; minTextLength: number; maxThreads: number }
  ) => Promise<Array<{ page: number; text: string; source: string }>>;
  try {
    ({ extractTextWithOcrPerPageAsync } = await import(
      "@d0paminedriven/pdfdown-ocr"
    ));
  } catch {
    return null;
  }

  try {
    const allPages = await extractTextWithOcrPerPageAsync(bytes, {
      lang: process.env.OCR_LANGUAGE || "spa+eng",
      minTextLength: 10,
      maxThreads: Math.max(
        1,
        Math.min(Number(process.env.OCR_MAX_THREADS || 2), 8)
      ),
    });
    const selectedSet = new Set(
      selected.pages.flatMap((page) => [page, page + 1])
    );
    const pages = allPages.filter(
      (page) => selectedSet.has(page.page) || page.source === "Ocr"
    );
    const pagesProcessed = pages
      .filter((page) => page.text.trim())
      .map((page) => page.page);
    const pagesFailed = pages
      .filter((page) => !page.text.trim())
      .map((page) => page.page);
    const markdown = pages
      .filter((page) => page.text.trim())
      .map((page) => `## Página ${page.page}\n\n${page.text.trim()}`)
      .join("\n\n");
    return {
      status: pagesProcessed.length
        ? pagesFailed.length || selected.truncated
          ? "failed"
          : "completed"
        : "failed",
      markdown: markdown || null,
      pagesProcessed,
      pagesFailed,
      reason: selected.truncated ? "page_limit" : undefined,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (
      commandError(error) === "ENOENT" ||
      message.includes("tesseract") ||
      message.includes("tessdata")
    ) {
      return {
        status: "unavailable",
        markdown: null,
        pagesProcessed: [],
        pagesFailed: selected.pages,
        reason: "tesseract_missing",
      };
    }
    return null;
  }
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

  const bundledOcr = await tryPdfDownOcr(bytes, selected);
  if (bundledOcr) return bundledOcr;

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
