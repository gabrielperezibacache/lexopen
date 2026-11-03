import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const defaults = {
  ...process.env,
  LEXOPEN_PJUD_LIVE_VALIDATION: "1",
  DATABASE_URL: "postgresql://fixture:DO_NOT_PRINT@127.0.0.1:1/lexopen_test",
  E2E_DATABASE_URL: "postgresql://fixture:DO_NOT_PRINT@127.0.0.1:1/lexopen_test",
  PJUD_ALLOW_DEMO: "0", HERMES_ALLOW_DEMO: "0", PJUD_CAPTCHA_AUTO_SOLVE: "0",
  PJUD_AUTO_CONFIRM_PROMPTS: "0", PJUD_DOC_DOWNLOADS: "0", PJUD_PDF_BACKUP: "0",
  PJUD_PUBLIC_SCRAPE: "1", PJUD_CAUSAS_CACHE_TTL_MS: "0",
  PJUD_SCRAPER_URL: "", PJUD_API_URL: "", CAPTCHA_SOLVER_PROVIDER: "", CAPTCHA_SOLVER_API_KEY: "",
  S3_BUCKET: "", S3_ACCESS_KEY_ID: "", S3_SECRET_ACCESS_KEY: "", S3_ENDPOINT: "",
};
for (const override of [
  { LEXOPEN_PJUD_LIVE_VALIDATION: "" },
  { E2E_DATABASE_URL: "postgresql://fixture:DO_NOT_PRINT@example.invalid/production" },
  { DATABASE_URL: "postgresql://fixture:DO_NOT_PRINT@127.0.0.1:1/other_test" },
  { PJUD_CAPTCHA_AUTO_SOLVE: "1" },
  { PJUD_AUTO_CONFIRM_PROMPTS: "1" },
  { PJUD_DOC_DOWNLOADS: "1" },
  { PJUD_API_URL: "https://example.invalid/DO_NOT_PRINT" },
  { S3_BUCKET: "DO_NOT_PRINT" },
]) {
  const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/pjud-live-sync-validation.ts", "public"], {
    cwd: process.cwd(), env: { ...defaults, ...override }, encoding: "utf8", timeout: 5_000,
  });
  assert.equal(result.status, 1, "Unsafe validation settings must fail before the pipeline starts");
  assert.match(result.stderr, /"stage":"guard"/);
  assert.doesNotMatch(result.stdout + result.stderr, /DO_NOT_PRINT|public-register|manual-login-ready/);
}
console.log("Live sync validation guard: explicit opt-in, isolated database, no external fallback or auto-confirmation; secrets redacted.");
