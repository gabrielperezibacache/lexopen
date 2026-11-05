import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import type { PjudCausaRef, PjudFetchResult } from "./types";

const nativeRequire = createRequire(import.meta.url);
/** Execute the actual module with controlled boundaries, never a browser, DB or network. */
function loadModule<T>(name: string, imports: Record<string, unknown>, env: Record<string, string> = {}): T {
  const source = readFileSync(new URL(name, import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText;
  const loadedModule = { exports: {} };
  runInNewContext(output, {
    module: loadedModule, exports: loadedModule.exports, process: { env }, Date, URL, URLSearchParams, Buffer, AbortSignal,
    fetch: () => { throw new Error("Unexpected network in management-mode fixture"); },
    require: (id: string) => {
      if (Object.hasOwn(imports, id)) return imports[id];
      if (id === "zod") return nativeRequire(id);
      throw new Error(`Uncontrolled dependency: ${id}`);
    },
  }, { filename: name });
  return loadedModule.exports as T;
}

async function providerStopsBetweenChannels() {
  let active = true, stopAfter = "", sidecar = true;
  const calls: string[] = [];
  const phase = (name: string) => { calls.push(name); if (stopAfter === name) active = false; };
  const assertActive = async () => { if (!active) throw new Error("management-paused"); };
  const { fetchPjudMovimientos } = loadModule<{
    fetchPjudMovimientos: (causa: PjudCausaRef, controls: { assertActive: typeof assertActive }) => Promise<PjudFetchResult>;
  }>("./provider.ts", {
    "@/lib/minutas": { parseLocalDateInput: () => new Date() },
    "@/lib/net/safe-url": { isPrivateOrLocalHostname: () => false },
    "@/lib/pjud/classify": { classifyMovimiento: () => ({}) },
    "@/lib/pjud/types": { fingerprint: () => "fixture" },
    "@/lib/pjud/cuadernos-coverage": { normalizeCuadernosCoverage: (value: unknown) => value },
    "@/lib/pjud/cuadernos-limits": { PJUD_MAX_CAUSA_MOVIMIENTOS: 100, PJUD_MAX_TRANSPORT_BYTES: 10000 },
    "@/lib/pjud/public-scrape": {
      publicScrapeReady: () => true,
      scrapeCausaByRol: async () => { phase("public"); throw new Error("fixture-empty-public"); },
    },
    "@/lib/pjud/scraper-sidecar": {
      scraperSidecarConfigured: () => sidecar,
      probeScraperSidecarHealth: async () => { phase("health"); return { reachable: true }; },
      fetchFromScraperSidecar: async () => { phase("sidecar"); return null; },
    },
    "@/lib/pjud/claveunica": {
      tryScrapeCausaDetailAuthenticated: async () => { phase("authenticated"); return null; },
    },
  }, { NODE_ENV: "production", PJUD_ALLOW_DEMO: "0", PJUD_API_URL: "https://partner.example.test" });
  const causa = { id: "fixture", rit: "C-1-2026", ruc: null, tribunal: "Tribunal ficticio", titulo: "Ficticia", caratula: null };
  for (const [stop, expected] of [
    ["initial", []], ["health", ["health"]], ["sidecar", ["health", "sidecar"]],
    ["authenticated", ["authenticated"]], ["public", ["authenticated", "public"]],
  ] as const) {
    active = stop !== "initial"; stopAfter = stop; sidecar = !["authenticated", "public"].includes(stop); calls.length = 0;
    await assert.rejects(fetchPjudMovimientos(causa, { assertActive }), /management-paused/);
    assert.deepEqual(calls, expected, `no later transport may start after ${stop}`);
  }
}

async function digestRetainsUndeliveredWindow() {
  let active = true, pauseAfterNotification = true, pauseDuringEmail = false, emailEnabled = false, raceAtCommit = false;
  const since = new Date("2026-11-04T08:00:00Z");
  const settings = { id: "fixture-settings", pjudDigestLastAt: since, pjudDigestLastStatus: "previous" };
  const deliveries = new Set<string>(), emails: string[] = [];
  let commits = 0;
  const movement = (causaId: string) => ({ causaId, titulo: "Resolución ficticia", fecha: new Date(), tipo: "resolucion", esReceptor: false, relevante: true });
  const causes = ["first", "second"].map(id => ({
    id, rit: `C-${id}-2026`, titulo: "Ficticia", tribunal: "Tribunal ficticio", movimientos: [movement(id)],
    abogado: { id, email: `${id}@example.test`, name: id, role: "abogado" },
  }));
  const { runPjudDigest } = loadModule<{ runPjudDigest: () => Promise<{ paused: boolean; since: string }> }>("./digest.ts", {
    "@/lib/causas/management-mode": {
      assertPjudManagementEnabled: async () => { if (!active) throw new Error("management-paused"); },
      getCaseManagementMode: async () => active ? "pjud_cl" : "manual",
    },
    "@/lib/pjud/classify": { diasEntre: () => 0, semaforoPorDiasSinMovimiento: () => "verde" },
    "@/lib/integrations/google": { getGoogleConfig: async () => ({ accessToken: emailEnabled ? "fixture-only" : undefined }) },
    "@/lib/integrations/gmail": { sendGmailMessage: async ({ to }: { to: string }) => { emails.push(to); if (pauseDuringEmail) active = false; } },
    "@/lib/notify/emit": { emitNotification: async ({ dedupeKey }: { dedupeKey: string }) => {
      deliveries.add(dedupeKey); if (pauseAfterNotification) active = false;
    } },
    "@/lib/db": { prisma: {
      organization: { findFirst: async () => ({ settings }) },
      causa: { findMany: async () => causes }, causaMovimiento: { findMany: async () => causes.map(row => movement(row.id)) },
      firmSettings: { updateMany: async ({ where, data }: { where: { caseManagementMode: string }; data: Partial<typeof settings> }) => {
        assert.equal(where.caseManagementMode, "pjud_cl");
        if (raceAtCommit) active = false;
        if (!active) return { count: 0 };
        commits++; Object.assign(settings, data); return { count: 1 };
      } },
    } },
  });
  const first = await runPjudDigest();
  assert.equal(first.paused, true); assert.equal(deliveries.size, 1); assert.equal(commits, 0);
  assert.equal(settings.pjudDigestLastAt, since); assert.equal(settings.pjudDigestLastStatus, "previous");
  active = true; pauseAfterNotification = false;
  const resumed = await runPjudDigest();
  assert.equal(resumed.paused, false); assert.equal(resumed.since, since.toISOString());
  assert.equal(deliveries.size, 2, "existing recipient dedupe is retained; the skipped recipient receives the same window");
  assert.equal(commits, 1);
  const completedAt = settings.pjudDigestLastAt;
  emailEnabled = true; pauseDuringEmail = true;
  assert.equal((await runPjudDigest()).paused, true);
  assert.equal(emails.length, 1, "no second recipient is contacted after a change during Gmail delivery");
  assert.equal(settings.pjudDigestLastAt, completedAt); assert.equal(commits, 1);
  active = true; emailEnabled = false; pauseDuringEmail = false; raceAtCommit = true;
  assert.equal((await runPjudDigest()).paused, true);
  assert.equal(settings.pjudDigestLastAt, completedAt); assert.equal(commits, 1, "the final settings write checks the current modality too");
}

async function main() {
  await providerStopsBetweenChannels();
  await digestRetainsUndeliveredWindow();
  console.log("PJUD mode safety: transport phases stop and interrupted digests retain the undelivered window (no network/DB).");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
