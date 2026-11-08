import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  extraOcrPathDirs,
  ocrCommandTimeout,
  ocrInstallHint,
  ocrPageLimit,
  pdftoppmBinCandidates,
  prependOcrPath,
  tesseractBinCandidates,
} from "@/lib/local-ocr";

// The native binding supports macOS/Linux only. Requiring it on every platform
// prevents npm ci from reaching the existing Windows CLI fallback.
const manifest = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
assert.equal(manifest.dependencies["@d0paminedriven/pdfdown-ocr"], undefined);
assert.equal(typeof manifest.optionalDependencies["@d0paminedriven/pdfdown-ocr"], "string");
const lock = JSON.parse(readFileSync(new URL("../../package-lock.json", import.meta.url), "utf8"));
assert.equal(lock.packages["node_modules/@d0paminedriven/pdfdown-ocr"].optional, true);

const previousMaxPages = process.env.OCR_MAX_PAGES;
const previousTimeout = process.env.OCR_TIMEOUT_MS;
try {
  for (const invalid of ["NaN", "infinity", "1.5"]) {
    process.env.OCR_MAX_PAGES = invalid;
    process.env.OCR_TIMEOUT_MS = invalid;
    assert.equal(ocrPageLimit(), 20);
    assert.equal(ocrCommandTimeout(), 30_000);
  }
  process.env.OCR_MAX_PAGES = "200";
  assert.equal(ocrPageLimit(), 100);
  process.env.OCR_MAX_PAGES = "0";
  assert.equal(ocrPageLimit(), 1);
  process.env.OCR_MAX_PAGES = " 3 ";
  assert.equal(ocrPageLimit(), 3);
  process.env.OCR_TIMEOUT_MS = "1";
  assert.equal(ocrCommandTimeout(), 5_000);
  process.env.OCR_TIMEOUT_MS = "999999";
  assert.equal(ocrCommandTimeout(), 120_000);
} finally {
  if (previousMaxPages === undefined) delete process.env.OCR_MAX_PAGES;
  else process.env.OCR_MAX_PAGES = previousMaxPages;
  if (previousTimeout === undefined) delete process.env.OCR_TIMEOUT_MS;
  else process.env.OCR_TIMEOUT_MS = previousTimeout;
}

assert.ok(extraOcrPathDirs("darwin").includes("/opt/homebrew/bin"));
assert.ok(extraOcrPathDirs("darwin").includes("/usr/local/bin"));
assert.equal(extraOcrPathDirs("linux").length, 0);
assert.ok(
  extraOcrPathDirs("win32").some((dir) => dir.includes("Tesseract-OCR"))
);

const darwinBins = tesseractBinCandidates({}, "darwin");
assert.ok(darwinBins.includes("tesseract"));
assert.ok(darwinBins.includes("/opt/homebrew/bin/tesseract"));
assert.equal(tesseractBinCandidates({ OCR_TESSERACT_BIN: "/custom/tesseract" }, "darwin")[0], "/custom/tesseract");

const linuxPpm = pdftoppmBinCandidates({}, "linux");
assert.ok(linuxPpm.includes("pdftoppm"));
assert.ok(linuxPpm.includes("/usr/bin/pdftoppm"));

assert.match(ocrInstallHint("darwin"), /brew install tesseract tesseract-lang poppler/);
assert.match(ocrInstallHint("linux"), /tesseract-ocr-spa/);
assert.match(ocrInstallHint("win32"), /OCR_TESSERACT_BIN/);

const env: Record<string, string | undefined> = {
  PATH: "/usr/bin:/bin",
};
prependOcrPath(env, "darwin", ["/opt/homebrew/bin", "/usr/bin"]);
assert.match(env.PATH || "", /^\/opt\/homebrew\/bin:/);
assert.ok((env.PATH || "").includes("/usr/bin"));
assert.equal(
  (env.PATH || "").split(":").filter((part) => part === "/usr/bin").length,
  1
);

console.log("local-ocr.test.ts OK");
