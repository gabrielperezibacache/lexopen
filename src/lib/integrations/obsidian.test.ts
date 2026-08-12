import assert from "node:assert/strict";
import {
  encodeVaultPath,
  formatLocalDate,
  sanitizeFilename,
  stableObsidianKey,
  yamlEscape,
} from "./obsidian";

assert.equal(sanitizeFilename('Minuta: "audiencia"/final'), "Minuta- -audiencia-final");
assert.equal(sanitizeFilename("???"), "sin-titulo");
assert.equal(sanitizeFilename("  Acta final  "), "Acta final");

assert.equal(yamlEscape("simple"), "simple");
assert.equal(yamlEscape("a: b"), JSON.stringify("a: b"));
assert.equal(yamlEscape(""), '""');

assert.equal(
  encodeVaultPath("LexOpen/Causas/C-1-2026/Index.md"),
  "LexOpen/Causas/C-1-2026/Index.md"
);
assert.equal(
  encodeVaultPath("LexOpen/Causas/Foo Bar/Minutas/Acta #1.md"),
  "LexOpen/Causas/Foo%20Bar/Minutas/Acta%20%231.md"
);

assert.equal(
  stableObsidianKey("LexOpen/Causas/X/Index.md"),
  "obsidian/LexOpen/Causas/X/Index.md"
);
assert.equal(
  stableObsidianKey("\\LexOpen\\Causas\\X\\Index.md"),
  "obsidian/LexOpen/Causas/X/Index.md"
);

const d = new Date(2026, 6, 25, 15, 30);
assert.equal(formatLocalDate(d), "2026-07-25");

console.log("obsidian.test.ts OK");
