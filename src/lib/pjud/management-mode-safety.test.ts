import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import type { PjudCausaRef, PjudFetchResult } from "./types";
import { causaAccessWhere } from "@/lib/auth/causa-access";
import { can, canSome } from "@/lib/auth/permissions";
import { isAdmin, isStaff } from "@/lib/auth/rbac";
import { STAFF_ROLES } from "@/lib/auth/roles";

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
    "@/lib/auth/causa-access": { causaAccessWhere },
    "@/lib/auth/permissions": { can, canSome },
    "@/lib/auth/rbac": { isAdmin, isStaff },
    "@/lib/auth/roles": { STAFF_ROLES },
    "@/lib/db": { prisma: {
      organization: { findFirst: async () => ({ settings }) },
      user: { findUnique: async ({ where }: { where: { id: string } }) => causes.find(row => row.abogado.id === where.id)?.abogado || null },
      causa: { findMany: async ({ include, where }: { include?: unknown; where: { AND?: [{ id: { in: string[] } }] } }) => include ? causes : causes.filter(row => where.AND?.[0].id.in.includes(row.id)).map(row => ({ id: row.id })) },
      causaMovimiento: { findMany: async () => causes.map(row => movement(row.id)) },
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

async function digestRespectsCurrentRecipientAccess() {
  const users = [
    { id: "technical", role: "admin", capabilityGrants: "", capabilityRevokes: "" },
    { id: "partner", role: "socio", capabilityGrants: "", capabilityRevokes: "" },
    { id: "delegated", role: "abogado", capabilityGrants: "host.admin", capabilityRevokes: "" },
    { id: "revoked", role: "admin", capabilityGrants: "", capabilityRevokes: "causa.read" },
    { id: "external", role: "externo", capabilityGrants: "host.admin,causa.override_walls", capabilityRevokes: "" },
  ].map(user => ({ ...user, email: `${user.id}@example.test`, name: user.id }));
  const movement = (causaId: string) => ({ causaId, titulo: `Movement ${causaId}`, fecha: new Date(), tipo: "resolucion", esReceptor: false, relevante: true });
  const causes = [
    { id: "public", acceso: "estudio", abogadoId: null, abogado: null },
    { id: "private", acceso: "equipo", abogadoId: null, abogado: null },
    { id: "portal-assignment", acceso: "equipo", abogadoId: "external", abogado: users.find(user => user.id === "external") },
  ].map(cause => ({ ...cause, rit: `RIT-${cause.id}`, titulo: `Title ${cause.id}`, tribunal: "Fixture", pjudMonitoreoActivo: true, estado: "activa", miembros: [], movimientos: [movement(cause.id)] }));
  // Evaluate the Prisma predicate produced by the real shared access policy.
  const matches = (row: Record<string, unknown>, where: Record<string, unknown>): boolean => Object.entries(where).every(([key, expected]) => {
    if (key === "AND") return (expected as Record<string, unknown>[]).every(part => matches(row, part));
    if (key === "OR") return (expected as Record<string, unknown>[]).some(part => matches(row, part));
    const actual = row[key];
    if (expected && typeof expected === "object") {
      const rule = expected as Record<string, unknown>;
      if ("in" in rule) return (rule.in as unknown[]).includes(actual);
      if ("some" in rule) return (actual as Record<string, unknown>[]).some(item => matches(item, rule.some as Record<string, unknown>));
      if ("lte" in rule) return actual instanceof Date && actual <= (rule.lte as Date);
      if ("gt" in rule) return actual instanceof Date && actual > (rule.gt as Date);
    }
    return actual === expected;
  });
  const emails: { to: string; text: string; html: string }[] = [], notifications: { userId: string; title: string; body: string }[] = [];
  const lookups = new Map<string, number>();
  let revokeBeforeEmail = false, revokeAfterEmail = false;
  const { runPjudDigest } = loadModule<{ runPjudDigest: () => Promise<{ unassigned: number }> }>("./digest.ts", {
    "@/lib/auth/causa-access": { causaAccessWhere },
    "@/lib/auth/permissions": { can, canSome },
    "@/lib/auth/rbac": { isAdmin, isStaff },
    "@/lib/auth/roles": { STAFF_ROLES },
    "@/lib/causas/management-mode": { assertPjudManagementEnabled: async () => undefined, getCaseManagementMode: async () => "pjud_cl" },
    "@/lib/pjud/classify": { diasEntre: () => 0, semaforoPorDiasSinMovimiento: () => "verde" },
    "@/lib/integrations/google": { getGoogleConfig: async () => ({ accessToken: "fixture-only" }) },
    "@/lib/integrations/gmail": { sendGmailMessage: async (message: typeof emails[number]) => {
      emails.push(message);
      if (revokeAfterEmail && message.to === "delegated@example.test") users.find(user => user.id === "delegated")!.capabilityRevokes = "causa.read";
    } },
    "@/lib/notify/emit": { emitNotification: async (input: typeof notifications[number]) => { notifications.push(input); } },
    "@/lib/db": { prisma: {
      organization: { findFirst: async () => ({ settings: { id: "settings", pjudDigestLastAt: new Date(0) } }) },
      user: {
        findMany: async () => users,
        findUnique: async ({ where }: { where: { id: string } }) => {
          const count = (lookups.get(where.id) || 0) + 1; lookups.set(where.id, count);
          const user = users.find(item => item.id === where.id);
          if (revokeBeforeEmail && user?.id === "technical" && count === 2) user.capabilityRevokes = "causa.read";
          return user || null;
        },
      },
      causa: { findMany: async ({ include, where }: { include?: unknown; where: Record<string, unknown> }) => include ? causes : causes.filter(cause => matches(cause, where)).map(cause => ({ id: cause.id })) },
      causaMovimiento: { findMany: async () => causes.map(cause => movement(cause.id)) },
      firmSettings: { updateMany: async () => ({ count: 1 }) },
    } },
  });
  assert.equal((await runPjudDigest()).unassigned, 3, "portal assignments do not become staff recipients");
  assert.deepEqual(emails.map(mail => mail.to).sort(), ["delegated@example.test", "partner@example.test", "technical@example.test"]);
  for (const mail of emails) {
    assert.match(mail.text, /RIT-public/);
    if (mail.to !== "partner@example.test") {
      assert.doesNotMatch(mail.text + mail.html, /RIT-private|RIT-portal-assignment|Movement private|Movement portal-assignment/);
    } else assert.match(mail.text, /RIT-private/);
  }
  for (const notification of notifications) assert.doesNotMatch(notification.title + notification.body, /RIT-|Title |Movement /, "persisted aggregate notices contain no matter-specific content");
  emails.length = 0; notifications.length = 0; lookups.clear(); revokeBeforeEmail = true; revokeAfterEmail = true;
  await runPjudDigest();
  assert.equal(emails.some(mail => mail.to === "technical@example.test"), false, "revocation after aggregation prevents email");
  assert.equal(notifications.some(notice => notice.userId === "technical" || notice.userId === "delegated"), false, "access is checked again between external email and in-app delivery");
  assert.equal(notifications.some(notice => notice.userId === "partner"), true);
}

async function main() {
  await providerStopsBetweenChannels();
  await digestRetainsUndeliveredWindow();
  await digestRespectsCurrentRecipientAccess();
  console.log("PJUD mode safety: paused windows, recipient walls/revokes/portal isolation and per-channel reauthorization OK (no network/DB).");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
