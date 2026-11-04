import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  extraOcrPathDirs,
  ocrInstallHint,
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

assert.match(ocrInstallHint("darwin"), /brew install tesseract tesseract-lang/);
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
