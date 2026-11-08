import { existsSync } from "node:fs";
import path from "node:path";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
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

function configuredInteger(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value?.trim() || fallback);
  return Number.isSafeInteger(parsed) ? Math.max(min, Math.min(parsed, max)) : fallback;
}

export function ocrPageLimit() {
  return configuredInteger(process.env.OCR_MAX_PAGES, 20, 1, 100);
}

export function ocrCommandTimeout() {
  return configuredInteger(process.env.OCR_TIMEOUT_MS, 30_000, 5_000, 120_000);
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
    return "En macOS: brew install tesseract tesseract-lang poppler y reinicie el Host (npm run web:host).";
  }
  if (platform === "win32") {
    return "En Windows instale Tesseract OCR y Poppler, y fije OCR_TESSERACT_BIN y OCR_PDFTOPPM_BIN en el .env del Host.";
  }
  return "En Linux: sudo apt install tesseract-ocr tesseract-ocr-spa poppler-utils y reinicie el Host.";
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

export function getOcrCapability(): Promise<OcrCapability> {
  if (process.env.OCR_ENABLED === "0") {
    return Promise.resolve({ enabled: false, available: false, provider: "disabled" });
  }
  if (!capabilityPromise) capabilityPromise = detectOcrCapability();
  return capabilityPromise;
}

async function detectOcrCapability(): Promise<OcrCapability> {
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

  // Physical page extraction renders only the pages that need recognition.
  // An importable OCR binding alone does not guarantee a working renderer.
  const pdftoppm = await resolvePdftoppm();
  return {
    enabled: true,
    available: Boolean(pdftoppm),
    provider: pdftoppm ? "tesseract-cli" : "unavailable",
    version: found.version,
    bin: found.bin,
    ...(pdftoppm ? {} : { reason: "pdftoppm_missing", hint: ocrInstallHint() }),
  };
}
