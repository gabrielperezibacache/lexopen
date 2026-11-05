/** Explicit, isolated live validation of the real LexOpen sync pipeline. */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { assertDisposableDatabaseUrl } from "../src/lib/testing/disposable-db";
import type { MisCausasItem, PjudCausaRef, PjudFetchResult } from "../src/lib/pjud/types";

const PUBLIC_CASE = { rit: "C-876-2022", tribunal: "3º Juzgado Civil de Santiago" };
const phase = process.argv[2];
let currentStage = "guard";
function progress(stage: string, facts: Record<string, unknown> = {}) {
  currentStage = stage;
  console.log(JSON.stringify({ stage, ...facts }));
}

async function main() {
  assert.ok(phase === "public" || phase === "mis-causas", "Choose public or mis-causas");
  assert.equal(process.env.LEXOPEN_PJUD_LIVE_VALIDATION, "1", "Explicit live validation opt-in required");
  const database = assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL);
  assert.equal(process.env.DATABASE_URL, database, "Disposable database URLs must match");
  for (const flag of ["PJUD_ALLOW_DEMO", "HERMES_ALLOW_DEMO", "PJUD_CAPTCHA_AUTO_SOLVE", "PJUD_AUTO_CONFIRM_PROMPTS", "PJUD_DOC_DOWNLOADS", "PJUD_PDF_BACKUP"]) {
    assert.equal(process.env[flag], "0", `Validation requires ${flag}=0`);
  }
  assert.equal(process.env.PJUD_PUBLIC_SCRAPE, "1");
  assert.equal(process.env.PJUD_CAUSAS_CACHE_TTL_MS, "0", "Live runs must not reuse cached results");
  for (const flag of ["PJUD_SCRAPER_URL", "PJUD_API_URL", "CAPTCHA_SOLVER_PROVIDER", "CAPTCHA_SOLVER_API_KEY", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_ENDPOINT"]) assert.ok(!process.env[flag], `Unset ${flag} for isolated validation`);
  const dataDir = await fs.realpath(process.env.LEXOPEN_DATA_DIR || "");
  const storage = await fs.realpath(process.env.STORAGE_PATH || "");
  assert.ok(dataDir.startsWith("/private/tmp/") || dataDir.startsWith("/tmp/"), "Temporary data directory required");
  assert.ok(storage.startsWith(path.dirname(dataDir) + path.sep), "Storage must be in the same temporary test root");
  const rootStats = await fs.stat(path.dirname(dataDir));
  assert.equal(rootStats.mode & 0o077, 0, "Private temporary root required");
  const reportDir = path.join(dataDir, "reports");
  await fs.mkdir(reportDir, { recursive: true, mode: 0o700 });
  const databaseFingerprint = createHash("sha256").update(database).digest("hex");
  const { prisma } = await import("../src/lib/db");
  const { addCausaByRol } = await import("../src/lib/pjud/lookup");
  const { enqueueDueSyncJobs, processPendingSyncJobs } = await import("../src/lib/pjud/queue");
  const { syncMisCausas } = await import("../src/lib/pjud/claveunica");
  let session: Awaited<ReturnType<typeof import("../src/lib/pjud/manual-session")["createManualOjvSession"]>> | undefined;
  const cancellation = new AbortController();
  const stop = () => { cancellation.abort(); void session?.close(); };
  if (phase === "mis-causas") {
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  }
  try {
    if (phase === "public") {
      assert.equal(await prisma.causa.count(), 0, "A new empty test database is required");
      assert.equal(await prisma.pjudSyncJob.count(), 0);
      assert.equal(await prisma.organization.count(), 0, "A new database without organization settings is required");
      assert.equal(await prisma.user.count(), 0, "Existing accounts must not be used for validation");
      assert.equal(await prisma.firmSettings.count({ where: { OR: [{ claveUnicaRut: { not: null } }, { claveUnicaPasswordEnc: { not: null } }] } }), 0, "Credential vault must be empty before the provider starts");
      // This diagnostic has already verified a fresh, isolated database and an explicit live opt-in.
      await prisma.organization.create({ data: { settings: { create: { caseManagementMode: "pjud_cl" } } } });
      progress("public-register");
      const saved = await addCausaByRol({ ...PUBLIC_CASE, syncNow: false });
      const run = async () => {
        const jobs = await enqueueDueSyncJobs({ causaIds: [saved.causaId], trigger: "manual", limit: 1 });
        assert.equal(jobs.length, 1, "Expected one explicit job");
        const results = await processPendingSyncJobs({ jobIds: jobs.map(j => j.id), concurrency: 1, limit: 1 });
        assert.equal(results.length, 1);
        const result = results[0];
        assert.ok(result.status === "ok" && result.provider === "scrape" && !result.demo, "Real public sync did not complete");
        const storedJobs = await prisma.pjudSyncJob.findMany({ where: { id: { in: jobs.map(j => j.id) } }, select: { status: true, finishedAt: true } });
        assert.ok(storedJobs.every(j => j.status === "ok" && j.finishedAt));
        return result;
      };
      progress("public-first-live-sync");
      const first = await run();
      const firstCount = await prisma.causaMovimiento.count({ where: { causaId: saved.causaId } });
      assert.ok(firstCount > 0 && first.inserted > 0, "No real movements persisted");
      progress("public-repeat-live-sync", { persistedMovements: firstCount });
      const second = await run();
      const repeatedCount = await prisma.causaMovimiento.count({ where: { causaId: saved.causaId } });
      assert.ok(second.inserted === 0 && repeatedCount === firstCount, "Repeat introduced duplicate movements");
      assert.equal(await prisma.documento.count(), 0, "Document download must remain disabled");
      const report = { checkedAt: new Date().toISOString(), mode: "real-public-automatic-sync", databaseFingerprint, identity: PUBLIC_CASE, provider: first.provider, demo: false, firstPersistedMovements: firstCount, secondInserted: second.inserted, durableJobsCompleted: true, idempotent: true, pdfsDownloaded: false, studyDatabaseUsed: false };
      await fs.writeFile(path.join(reportDir, "public-live.json"), JSON.stringify(report, null, 2), { mode: 0o600 });
      progress("public-sync-verified", { persistedMovements: firstCount, repeatInserted: second.inserted });
    } else {
      const previous = JSON.parse(await fs.readFile(path.join(reportDir, "public-live.json"), "utf8"));
      assert.equal(previous.databaseFingerprint, databaseFingerprint, "Public validation must belong to this isolated database");
      assert.equal(await prisma.causa.count(), 1, "Private validation starts with only the public test case");
      assert.equal(await prisma.firmSettings.count({ where: { OR: [{ claveUnicaRut: { not: null } }, { claveUnicaPasswordEnc: { not: null } }] } }), 0, "A credential vault must not be present");
      const { createManualOjvSession } = await import("../src/lib/pjud/manual-session");
      progress("manual-session-opening");
      session = await createManualOjvSession({ optedIn: true, signal: cancellation.signal, loginTimeoutMs: 15 * 60_000 });
      progress("manual-login-ready");
      await session.waitForAuthentication();
      progress("manual-login-completed");
      let selected: MisCausasItem | undefined;
      let detailCalls = 0;
      const sessionSource = {
        listMisCausas: async () => {
          const items = await session!.listMisCausas({ materias: ["Corte Suprema"] });
          if (!selected) selected = items[0];
          assert.ok(selected, "No case available for the selected materia");
          const current = items.find(item => item.rit === selected!.rit && item.tribunal === selected!.tribunal);
          assert.ok(current, "Selected case no longer occurs in the new response");
          return [current];
        },
        fetchMovimientos: async (causa: PjudCausaRef): Promise<PjudFetchResult> => {
          detailCalls++;
          const result = await session!.fetchCausaDetail(causa, { materias: ["Corte Suprema"] });
          assert.ok(result.movimientos.every(m => m.fuente === "pjud" && !m.documentoBytes), "Unexpected source or document download");
          return { provider: "scrape", movimientos: result.movimientos, demo: false, note: result.note, sala: result.sala, resolvedTribunal: result.resolvedTribunal };
        },
      };
      progress("private-first-live-sync");
      const first = await syncMisCausas({ sessionSource, processJobsInline: true });
      assert.ok(first.items.length === 1 && first.enqueued === 1 && first.syncOk === 1 && first.syncFailed === 0, "Private sync did not complete");
      const causeId = first.items[0].causaId;
      const firstCount = await prisma.causaMovimiento.count({ where: { causaId: causeId } });
      assert.ok(firstCount > 0 && detailCalls === 1, "Live authenticated detail was not persisted");
      progress("private-repeat-live-sync");
      const second = await syncMisCausas({ sessionSource, processJobsInline: true });
      assert.ok(second.created === 0 && second.linked === 1 && second.syncOk === 1 && second.syncFailed === 0 && second.inserted === 0, "Private repeat was not idempotent");
      assert.ok(Number(detailCalls) === 2 && await prisma.causaMovimiento.count({ where: { causaId: causeId } }) === firstCount, "Private repeat did not fetch again or changed row count");
      assert.equal(await prisma.firmSettings.count({ where: { OR: [{ claveUnicaRut: { not: null } }, { claveUnicaPasswordEnc: { not: null } }] } }), 0);
      const finalStatus = await prisma.firmSettings.findMany({ select: { claveUnicaLastSyncStatus: true } });
      assert.ok(finalStatus.every(s => s.claveUnicaLastSyncStatus === "ok"));
      assert.equal(await prisma.documento.count(), 0, "Document download must remain disabled");
      const report = { checkedAt: new Date().toISOString(), mode: "real-authenticated-automatic-sync-after-manual-login", materia: "Corte Suprema", manualAuthentication: true, liveListAndDetailRead: true, claimImportQueuePersistenceVerified: true, freshDetailOnRepeat: true, idempotent: true, vaultUsed: false, credentialsSaved: false, pdfsDownloaded: false, privateIdentifiersPublished: false, exactPrivateCountsPublished: false, studyDatabaseUsed: false };
      await fs.writeFile(path.join(reportDir, "private-live.json"), JSON.stringify(report, null, 2), { mode: 0o600 });
      progress("private-sync-verified", { idempotent: true, privateCountsPublished: false });
    }
  } finally {
    await session?.close();
    await prisma.$disconnect();
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
  }
}

void main().catch(error => {
  // Playwright errors and assertions can contain private selectors or OIDC URLs.
  const errorCode = error && typeof error === "object" && "code" in error && typeof error.code === "string" && /^[a-z0-9-]{1,60}$/i.test(error.code) ? error.code : undefined;
  let diagnostic: { operation: string; originalErrorName: string; locations: string[] } | undefined;
  if (error && typeof error === "object" && "diagnostic" in error && error.diagnostic && typeof error.diagnostic === "object") {
    const detail = error.diagnostic as Record<string, unknown>;
    if ((detail.operation === "list" || detail.operation === "detail") &&
        typeof detail.originalErrorName === "string" && ["Error", "TypeError", "RangeError", "ReferenceError", "SyntaxError", "TimeoutError", "PjudScrapeError", "AbortError", "UnknownError"].includes(detail.originalErrorName) &&
        Array.isArray(detail.locations) && detail.locations.every(value => typeof value === "string" && /^src\/lib\/pjud\/(?:public-scrape|manual-session|ojv-dom)\.ts:\d{1,5}:\d{1,5}$/.test(value))) {
      diagnostic = { operation: detail.operation, originalErrorName: detail.originalErrorName, locations: detail.locations.slice(0, 4) };
    }
  }
  console.error(JSON.stringify({ stage: currentStage, status: "failed", errorName: error instanceof Error ? error.name : "UnknownError", errorCode, diagnostic }));
  process.exitCode = 1;
});
