#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(root, "scripts", "pjud-host.mjs");

assert.equal(fs.existsSync(script), true);

const check = spawnSync(process.execPath, ["--check", script], {
  encoding: "utf8",
});
assert.equal(check.status, 0, check.stderr || "syntax check failed");

// --check-only without CAPTCHA should exit 1
const missing = spawnSync(process.execPath, [script, "--check-only"], {
  cwd: root,
  env: {
    ...process.env,
    CAPTCHA_SOLVER_PROVIDER: "",
    CAPTCHA_SOLVER_API_KEY: "",
  },
  encoding: "utf8",
});
assert.notEqual(missing.status, 0);
assert.match(missing.stderr || missing.stdout || "", /CAPTCHA_SOLVER/);

// nopecha without key should pass (free tier)
const nopecha = spawnSync(process.execPath, [script, "--check-only"], {
  cwd: root,
  env: {
    ...process.env,
    CAPTCHA_SOLVER_PROVIDER: "nopecha",
    CAPTCHA_SOLVER_API_KEY: "",
    PJUD_SCRAPER_KEY: "test-scraper-key",
  },
  encoding: "utf8",
});
assert.equal(nopecha.status, 0, nopecha.stderr || nopecha.stdout);
assert.match(nopecha.stdout || "", /check-only OK/);

// --check-only with CAPTCHA configured should pass
const ok = spawnSync(process.execPath, [script, "--check-only"], {
  cwd: root,
  env: {
    ...process.env,
    CAPTCHA_SOLVER_PROVIDER: "2captcha",
    CAPTCHA_SOLVER_API_KEY: "test-key-not-real",
    PJUD_SCRAPER_KEY: "test-scraper-key",
  },
  encoding: "utf8",
});
assert.equal(ok.status, 0, ok.stderr || ok.stdout);
assert.match(ok.stdout || "", /check-only OK/);

console.log("scripts/pjud-host.test.mjs OK");
