import assert from "node:assert/strict";
import { desktopToolchainVerified } from "./desktop-toolchain.mjs";

// The successful real desktop report from the tools-2 profile includes both readers.
const report = { ok: true, checks: [
  "docx", "libreoffice-pdf", "pdf-pages", "semantic-office-text", "semantic-pdf-text", "ocr-spa-eng",
  "xlsx", "epub", "bibliography", "local-search", "audio-16khz", "lexopen-wallpaper",
] };
assert.equal(desktopToolchainVerified(report), true);
assert.equal(desktopToolchainVerified({ ...report, checks: [...report.checks].reverse() }), true);
assert.equal(desktopToolchainVerified({ ...report, checks: [...report.checks, "future-real-check"] }), true);

// The old ten-check profile cannot qualify without semantic Office and PDF reads.
assert.equal(desktopToolchainVerified({ ...report, checks: report.checks.filter(check => !check.startsWith("semantic-")) }), false);
for (const required of report.checks) {
  assert.equal(desktopToolchainVerified({ ...report, checks: report.checks.filter(check => check !== required) }), false, required);
  // An unchanged count cannot hide a missing required test.
  assert.equal(desktopToolchainVerified({ ...report, checks: report.checks.map(check => check === required ? "unknown-check" : check) }), false, required);
}
for (const invalid of [null, [], true, {}, { checks: report.checks }, { ...report, ok: false },
  { ...report, ok: "true" }, { ...report, checks: null }, { ...report, checks: [...report.checks, 1] },
  { ...report, checks: [...report.checks, report.checks[0]] }]) {
  assert.equal(desktopToolchainVerified(invalid), false);
}
console.log("Desktop toolchain evidence PASS: all twelve real checks required, including semantic readers; counts cannot substitute missing checks.");
