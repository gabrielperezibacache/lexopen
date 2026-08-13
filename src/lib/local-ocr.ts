import { existsSync, promises as fs } from "node:fs";
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
  bin?: string;
  hint?: string;
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

function envPathKey(
  env: Record<string, string | undefined>,
  platform = process.platform
) {
  return platform === "win32" && !env.PATH && env.Path ? "Path" : "PATH";
}

export function extraOcrPathDirs(platform = process.platform) {
  if (platform === "darwin") return ["/opt/homebrew/bin", "/usr/local/bin"];
  if (platform === "win32") {
    return [
      "C:\\Program Files\\Tesseract-OCR",
      "C:\\Program Files (x86)\\Tesseract-OCR",
    ];
  }
  return [];
}

/** Homebrew / Program Files often missing from GUI, launchd and Electron PATH. */
export function prependOcrPath(
  env: Record<string, string | undefined> = process.env,
  platform = process.platform,
  dirs = extraOcrPathDirs(platform).filter((dir) => existsSync(dir))
) {
  const pathKey = envPathKey(env, platform);
  const sep = platform === "win32" ? ";" : ":";
  const parts = String(env[pathKey] || "")
    .split(sep)
    .filter(Boolean);
  const seen = new Set(parts.map((part) => part.toLowerCase()));
  for (const dir of [...dirs].reverse()) {
    if (!dir || seen.has(dir.toLowerCase())) continue;
    parts.unshift(dir);
    seen.add(dir.toLowerCase());
  }
  env[pathKey] = parts.join(sep);
  if (platform === "win32") env.PATH = env[pathKey];
  return env[pathKey] || "";
}

export function tesseractBinCandidates(
  env: Record<string, string | undefined> = process.env,
  platform = process.platform
) {
  const configured = env.OCR_TESSERACT_BIN?.trim();
  const fromDirs = extraOcrPathDirs(platform).map((dir) =>
    platform === "win32" ? path.join(dir, "tesseract.exe") : path.join(dir, "tesseract")
  );
  return [
    configured,
    "tesseract",
    ...fromDirs,
    platform === "win32" ? null : "/usr/bin/tesseract",
  ].filter((value, index, all): value is string =>
    Boolean(value) && all.indexOf(value) === index
  );
}

export function pdftoppmBinCandidates(
  env: Record<string, string | undefined> = process.env,
  platform = process.platform
) {
  const configured = env.OCR_PDFTOPPM_BIN?.trim();
  const fromDirs = extraOcrPathDirs(platform).map((dir) =>
    path.join(dir, platform === "win32" ? "pdftoppm.exe" : "pdftoppm")
  );
  return [
    configured,
    "pdftoppm",
    ...fromDirs,
    platform === "win32" ? null : "/usr/bin/pdftoppm",
  ].filter((value, index, all): value is string =>
    Boolean(value) && all.indexOf(value) === index
  );
}

export function ocrInstallHint(platform = process.platform) {
  if (platform === "darwin") {
    return "En macOS: brew install tesseract tesseract-lang y reinicie el Host (npm run web:host).";
  }
  if (platform === "win32") {
    return "En Windows instale Tesseract OCR y Poppler, y fije OCR_TESSERACT_BIN y OCR_PDFTOPPM_BIN en el .env del Host.";
  }
  return "En Linux: sudo apt install tesseract-ocr tesseract-ocr-spa y reinicie el Host.";
}

function guessTessdataDir(tesseractBin: string) {
  const dir = path.dirname(tesseractBin);
  return [
    path.join(path.dirname(dir), "share", "tessdata"),
    path.join(dir, "tessdata"),
  ].find((candidate) => existsSync(candidate));
}

function exposeTesseractOnPath(tesseractBin: string) {
  if (tesseractBin && tesseractBin !== "tesseract") {
    prependOcrPath(process.env, process.platform, [path.dirname(tesseractBin)]);
  }
  if (!process.env.TESSDATA_PREFIX) {
    const tessdata = guessTessdataDir(tesseractBin);
    if (tessdata) process.env.TESSDATA_PREFIX = tessdata;
  }
}

async function probeBin(bin: string, args: string[]) {
  if (path.isAbsolute(bin) && !existsSync(bin)) {
    return { ok: false as const, stdout: "", stderr: "" };
  }
  try {
    const result = await execFile(bin, args, {
      timeout: 3_000,
      maxBuffer: 128 * 1024,
      windowsHide: true,
      encoding: "utf8",
    });
    return {
      ok: true as const,
      stdout: String(result.stdout || ""),
      stderr: String(result.stderr || ""),
    };
  } catch {
    return { ok: false as const, stdout: "", stderr: "" };
  }
}

async function resolveTesseract() {
  prependOcrPath();
  for (const bin of tesseractBinCandidates()) {
    const probed = await probeBin(bin, ["--version"]);
    if (!probed.ok) continue;
    exposeTesseractOnPath(bin);
    const version =
      (probed.stdout || probed.stderr).split(/\r?\n/, 1)[0] || undefined;
    return { bin, version };
  }
  return null;
}

async function resolvePdftoppm() {
  prependOcrPath();
  for (const bin of pdftoppmBinCandidates()) {
    const probed = await probeBin(bin, ["-v"]);
    if (probed.ok) return bin;
  }
  return null;
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

  const found = await resolveTesseract();
  if (!found) {
    return {
      enabled: true,
      available: false,
      provider: "unavailable",
      reason: "tesseract_missing",
      hint: ocrInstallHint(),
    };
  }

  try {
    await import("@d0paminedriven/pdfdown-ocr");
    return {
      enabled: true,
      available: true,
      provider: "pdfdown-ocr",
      version: found.version,
      bin: found.bin,
    };
  } catch {
    const pdftoppm = await resolvePdftoppm();
    if (pdftoppm) {
      return {
        enabled: true,
        available: true,
        provider: "tesseract-cli",
        version: found.version,
        bin: found.bin,
      };
    }
    return {
      enabled: true,
      available: false,
      provider: "unavailable",
      version: found.version,
      bin: found.bin,
      reason: "ocr_binding_and_pdftoppm_missing",
      hint: ocrInstallHint(),
    };
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

  const found = await resolveTesseract();
  if (!found) {
    return {
      status: "unavailable",
      markdown: null,
      pagesProcessed: [],
      pagesFailed: selected.pages,
      reason: "tesseract_missing",
    };
  }

  const bundledOcr = await tryPdfDownOcr(bytes, selected);
  if (bundledOcr) return bundledOcr;

  const pdftoppm = (await resolvePdftoppm()) || process.env.OCR_PDFTOPPM_BIN || "pdftoppm";
  const tesseract = found.bin;
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lexopen-ocr-"));
  const pdfPath = path.join(root, "document.pdf");
  const renderPrefix = path.join(root, "page");
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
