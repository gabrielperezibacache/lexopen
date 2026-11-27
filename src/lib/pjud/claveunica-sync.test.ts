import assert from "node:assert/strict";
import { prisma } from "@/lib/db";
import { encryptSecret } from "@/lib/pjud/secret";
import { clearClaveUnicaSyncMessages, syncMisCausas } from "@/lib/pjud/claveunica";
import type { MisCausasItem } from "@/lib/pjud/types";

const restorers: Array<() => void> = [];
function overrideMethod(target: object, key: string, replacement: unknown) {
  const methods = target as Record<string, unknown>;
  const previous = methods[key];
  methods[key] = replacement;
  restorers.push(() => { methods[key] = previous; });
}
function restoreMethods() { restorers.splice(0).reverse().forEach((restore) => restore()); }

async function main() {
  const envNames = ["PJUD_CLAVEUNICA_SCRAPE", "PJUD_PUBLIC_SCRAPE", "PJUD_SCRAPER_URL", "PJUD_SCRAPER_ALLOW_PRIVATE", "PJUD_SECRETS_KEY", "PJUD_DOC_DOWNLOADS"] as const;
  const previousEnv = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));
  process.env.PJUD_CLAVEUNICA_SCRAPE = "1";
  process.env.PJUD_PUBLIC_SCRAPE = "1";
  process.env.PJUD_SCRAPER_URL = "http://127.0.0.1:8787";
  process.env.PJUD_SCRAPER_ALLOW_PRIVATE = "1";
  process.env.PJUD_SECRETS_KEY = "fictional-test-key-claveunica";
  const encrypted = encryptSecret("fictional-password");
  let credentialReads = 0;
  let fetches = 0;
  let causes: MisCausasItem[] = [];
  let created = 0;
  const createdPayloads: Array<Record<string, unknown>> = [];
  const causeUpdates: Array<{ where: { id: string }; data: Record<string, unknown> }> = [];
  let capabilityChecks = 0;
  let failCreateAt = 0;
  let replaceClaim = false;
  let failQueue = false;
  let jobCreateCount = 0;
  let failJobCreateAt = 0;
  const createdJobs: Array<{ id: string; causaId: string; trigger: string; status: string }> = [];
  let claimBeforeClear = false;
  let caseManagementMode = "pjud_cl", pauseAt: "health" | "mis-causas" | null = null;
  const whereCalls: unknown[] = [];
  let existingCausa: { id: string; pjudOrigin: string | null; pjudMonitoreoActivo: boolean; pjudDocumentDownloadsEnabled: boolean; pjudDocumentDownloadOwnerId: string | null } | null = null;
  const queueBatches: string[][] = [];
  const drainedJobSelections: string[][] = [];
  const fixture = () => ({
    id: "fixture-settings",
    claveUnicaEnabled: true,
    claveUnicaRut: "11111111-1",
    get claveUnicaPasswordEnc() { credentialReads += 1; return encrypted; },
    claveUnicaLastSyncAt: null as Date | null,
    claveUnicaLastSyncStatus: null as string | null,
    claveUnicaLastSyncNote: null as string | null,
  });
  let settings = fixture();
  const item = (rit: string): MisCausasItem => ({ rit, tribunal: "1º Juzgado Civil de Santiago", ruc: "fixture-ruc" });
  overrideMethod(prisma.organization, "findMany", async () => [{ id: "fixture-org", settings }]);
  overrideMethod(prisma.firmSettings, "findFirst", async () => ({ caseManagementMode }));
  overrideMethod(prisma.firmSettings, "updateMany", async ({ where, data }: {
    where: { OR?: unknown; claveUnicaLastSyncAt?: Date | null; claveUnicaLastSyncStatus?: string | null };
    data: Partial<typeof settings>;
  }) => {
    if (claimBeforeClear && data.claveUnicaLastSyncNote === null) {
      settings.claveUnicaLastSyncAt = new Date("2099-01-01T00:00:00Z");
      settings.claveUnicaLastSyncStatus = "running";
      settings.claveUnicaLastSyncNote = "Claim iniciado mientras se limpiaba";
    }
    if (where.OR) {
      if (settings.claveUnicaLastSyncStatus === "running") return { count: 0 };
    } else if (settings.claveUnicaLastSyncStatus !== where.claveUnicaLastSyncStatus ||
      settings.claveUnicaLastSyncAt?.getTime() !== where.claveUnicaLastSyncAt?.getTime()) {
      return { count: 0 };
    }
    Object.assign(settings, data);
    return { count: 1 };
  });
  overrideMethod(prisma.causa, "findFirst", async ({ where }: { where: unknown }) => {
    whereCalls.push(where);
    return existingCausa;
  });
  overrideMethod(prisma.user, "findUnique", async () => ({ id: "fixture-actor", role: "admin", capabilityGrants: null, capabilityRevokes: null }));
  overrideMethod(prisma.causa, "findUnique", async ({ where }: { where: { id: string } }) => {
    capabilityChecks++;
    return { id: where.id, acceso: "estudio", abogadoId: null, miembros: [] };
  });
  overrideMethod(prisma.causa, "update", async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
    causeUpdates.push({ where, data });
    return { id: where.id, ...data };
  });
  overrideMethod(prisma.causa, "create", async ({ data }: { data: Record<string, unknown> }) => {
    createdPayloads.push(data);
    created += 1;
    if (replaceClaim) {
      settings.claveUnicaLastSyncAt = new Date("2099-01-01T00:00:00Z");
      settings.claveUnicaLastSyncStatus = "running";
      settings.claveUnicaLastSyncNote = "Un proceso nuevo está trabajando";
    }
    if (created === failCreateAt) throw new Error("fixture-database-failure");
    return { id: `fixture-causa-${created}` };
  });
  overrideMethod(prisma.causa, "findMany", async ({ where }: { where: { id: { in: string[] } } }) => {
    queueBatches.push(where.id.in);
    return where.id.in.map((id) => ({ id }));
  });
  overrideMethod(prisma, "$queryRaw", async (query: { sql: string; values: unknown[] }) => {
    assert.match(query.sql, /UPDATE "PjudSyncJob"/);
    if (failQueue) throw new Error("fixture-queue-failure");
    // The fixture has no expired reservations. Batch cleanup binds the exact IDs it observed.
    const failed = createdJobs.filter(job => job.status === "pending" && query.values.includes(job.id));
    for (const job of failed) job.status = "failed";
    return [{ count: failed.length }];
  });
  overrideMethod(prisma.pjudSyncJob, "updateMany", async () => ({ count: 0 }));
  overrideMethod(prisma.pjudSyncJob, "findMany", async ({ where }: { where: { status?: string; id?: { in?: string[] } } }) => {
    if (where.status === "pending" && Array.isArray(where.id?.in)) drainedJobSelections.push(where.id.in);
    return [];
  });
  overrideMethod(prisma.pjudSyncJob, "create", async ({ data }: { data: { causaId: string; trigger: string; status: string } }) => {
    if (++jobCreateCount === failJobCreateAt) throw new Error("fixture-second-job-create-failure");
    const job = { id: `fixture-job-${data.causaId}`, ...data };
    createdJobs.push(job);
    return job;
  });
  overrideMethod(globalThis, "fetch", async (input: string | URL | Request) => {
    fetches += 1;
    const url = String(input);
    if (pauseAt && url.endsWith(`/${pauseAt}`)) {
      caseManagementMode = "manual";
      if (pauseAt === "mis-causas") throw new Error("fixture-sidecar-interrupted");
    }
    if (url.endsWith("/health")) return Response.json({ scrapeReady: true });
    if (url.endsWith("/mis-causas")) return Response.json({ causas: causes });
    throw new Error("Unexpected external access in fixture test");
  });
  const reset = () => {
    settings = fixture(); created = 0; failCreateAt = 0; replaceClaim = false;
    createdPayloads.length = 0; causeUpdates.length = 0; capabilityChecks = 0;
    existingCausa = null;
    failQueue = false; claimBeforeClear = false; fetches = 0; credentialReads = 0; whereCalls.length = 0; queueBatches.length = 0; drainedJobSelections.length = 0;
    jobCreateCount = 0; failJobCreateAt = 0; createdJobs.length = 0;
    causes = [item("C-1-2026")];
    caseManagementMode = "pjud_cl"; pauseAt = null;
    process.env.PJUD_CLAVEUNICA_SCRAPE = "1";
    process.env.PJUD_PUBLIC_SCRAPE = "1";
    delete process.env.PJUD_DOC_DOWNLOADS;
  };
  try {
    const sessionSource = {
      listMisCausas: async () => causes,
      fetchMovimientos: async () => { throw new Error("fixture-unused-detail"); },
    };
    reset();
    await assert.rejects(syncMisCausas({ sessionSource }), /mientras la sesión está abierta/);
    assert.equal(settings.claveUnicaLastSyncStatus, null, "invalid session lifetime must fail before acquiring claim");
    await assert.rejects(syncMisCausas({ sessionSource: JSON.parse('{"listMisCausas":[],"fetchMovimientos":{}}') }), /interna y ejecutable/);
    assert.equal(credentialReads, 0);

    reset();
    const sessionImport = await syncMisCausas({ sessionSource, syncMovimientos: false });
    assert.equal(sessionImport.created, 1);
    assert.equal(credentialReads, 0, "session source must never read vault credentials");
    assert.equal(fetches, 0, "session source must not contact the credential sidecar");
    assert.deepEqual(sessionImport.enqueuedJobIds, []);

    reset();
    const automaticDocuments = await syncMisCausas({ actorId: "fixture-actor", downloadDocuments: true, syncMovimientos: false });
    assert.equal(automaticDocuments.created, 1);
    assert.equal(createdPayloads[0].pjudDocumentDownloadsEnabled, false, "a new row is not enabled before its actor's cause.write capability is verified");
    assert.deepEqual(causeUpdates[0], { where: { id: "fixture-causa-1" }, data: { pjudDocumentDownloadsEnabled: true, pjudDocumentDownloadOwnerId: "fixture-actor" } });
    assert.equal(capabilityChecks, 1);

    reset();
    existingCausa = { id: "fixture-existing-causa", pjudOrigin: "claveunica", pjudMonitoreoActivo: true, pjudDocumentDownloadsEnabled: false, pjudDocumentDownloadOwnerId: null };
    const linkedDocuments = await syncMisCausas({ actorId: "fixture-actor", downloadDocuments: true, syncMovimientos: false });
    assert.equal(linkedDocuments.linked, 1);
    assert.equal(created, 0);
    assert.equal(causeUpdates[0]?.data.pjudDocumentDownloadsEnabled, true, "an authorized existing cause gains document downloads when it has no owner yet");
    assert.equal(causeUpdates[0]?.data.pjudDocumentDownloadOwnerId, "fixture-actor");
    assert.equal(capabilityChecks, 1);

    reset();
    process.env.PJUD_DOC_DOWNLOADS = "0";
    await syncMisCausas({ actorId: "fixture-actor", downloadDocuments: true, syncMovimientos: false });
    assert.equal(createdPayloads[0].pjudDocumentDownloadsEnabled, false, "the host kill switch wins over the request checkbox");
    assert.equal(causeUpdates.length, 0);
    assert.equal(capabilityChecks, 0, "a disabled download request does not grant document ownership");

    reset(); causes.push(item("C-2-2026")); failJobCreateAt = 2;
    await assert.rejects(syncMisCausas({ sessionSource, processJobsInline: true }), /second-job-create-failure/);
    assert.equal(createdJobs.length, 1);
    assert.equal(createdJobs[0].trigger, "manual-session", "the first insert must already carry the session reservation");
    assert.equal(createdJobs[0].status, "failed", "a partially created batch must clean each ID observed before rejection");
    assert.equal(fetches, 0);
    assert.equal(credentialReads, 0);

    reset();
    process.env.PJUD_PUBLIC_SCRAPE = "0";
    await assert.rejects(syncMisCausas({ sessionSource, syncMovimientos: false }), /deshabilitada/);
    assert.equal(created, 0, "public kill switch also protects session import");
    assert.equal(fetches, 0);

    reset();
    process.env.PJUD_CLAVEUNICA_SCRAPE = "0";
    await assert.rejects(syncMisCausas({ syncMovimientos: false }), /deshabilitada/);
    assert.equal(credentialReads, 0, "kill switch must precede reading encrypted credentials");
    assert.equal(fetches, 0, "kill switch must block sidecar as well as direct scrape");
    assert.equal(settings.claveUnicaLastSyncStatus, "failed");

    reset(); failCreateAt = 1;
    await assert.rejects(syncMisCausas({ syncMovimientos: false }), /fixture-database-failure/);
    assert.equal(settings.claveUnicaLastSyncStatus, "failed");
    assert.doesNotMatch(settings.claveUnicaLastSyncNote!, /fixture-database-failure/);

    reset(); causes.push(item("C-2-2026")); failCreateAt = 2;
    await assert.rejects(syncMisCausas({ syncMovimientos: false }), /fixture-database-failure/);
    assert.equal(settings.claveUnicaLastSyncStatus, "partial");
    assert.match(settings.claveUnicaLastSyncNote!, /Se conservaron 1/);
    assert.deepEqual(whereCalls[0], { OR: [
      { rit: { equals: "C-1-2026", mode: "insensitive" }, tribunal: { equals: item("").tribunal, mode: "insensitive" } },
      { ruc: { equals: "fixture-ruc", mode: "insensitive" }, tribunal: { equals: item("").tribunal, mode: "insensitive" } },
    ] });

    reset(); failQueue = true;
    await assert.rejects(syncMisCausas(), /fixture-queue-failure/);
    assert.equal(settings.claveUnicaLastSyncStatus, "partial");
    assert.match(settings.claveUnicaLastSyncNote!, /actualización de movimientos/);

    reset(); replaceClaim = true; failCreateAt = 1;
    await assert.rejects(syncMisCausas({ syncMovimientos: false }), /fixture-database-failure/);
    assert.equal(settings.claveUnicaLastSyncStatus, "running");
    assert.equal(settings.claveUnicaLastSyncNote, "Un proceso nuevo está trabajando");

    reset(); replaceClaim = true;
    await assert.rejects(syncMisCausas({ syncMovimientos: false }), /reemplazada/);
    assert.equal(settings.claveUnicaLastSyncNote, "Un proceso nuevo está trabajando");

    reset();
    await assert.rejects(syncMisCausas({ claim: { settingsId: settings.id, claimedAt: new Date(0) } }), /reemplazada/);
    assert.equal(fetches, 0, "stale background claim must not send credentials");

    reset(); causes = [{ ...item("C-1-2026"), tribunal: "Por identificar" }];
    const result = await syncMisCausas({ syncMovimientos: false });
    assert.equal(result.created, 1);
    assert.equal(whereCalls.length, 0, "missing tribunal must not match a global RUC or RIT");
    assert.equal(settings.claveUnicaLastSyncStatus, "ok");

    reset();
    causes = Array.from({ length: 101 }, (_, i) => ({ ...item(`C-${i + 1}-2026`), estado: "Terminada" }));
    const large = await syncMisCausas();
    assert.equal(large.enqueued, 101, "terminated cases beyond the first 100 must enter durable queue too");
    assert.deepEqual(queueBatches.map((batch) => batch.length), [100, 1]);

    reset();
    causes = Array.from({ length: 87 }, (_, i) => item(`C-${i + 1}-2026`));
    const waited = await syncMisCausas({ processJobsInline: true });
    assert.equal(waited.enqueued, 87);
    assert.deepEqual(drainedJobSelections.map((batch) => batch.length), [40, 40, 7]);
    assert.deepEqual(drainedJobSelections.flat(), createdJobs.map((job) => job.id));
    assert.equal(drainedJobSelections.flat().includes("unrelated-pending-job"), false,
      "inline wait drains only IDs enqueued by this synchronization");

    reset();
    settings.claveUnicaLastSyncStatus = "failed";
    settings.claveUnicaLastSyncNote = "Aviso antiguo";
    const cleared = await clearClaveUnicaSyncMessages();
    assert.equal(cleared.lastSyncNote, null);
    assert.equal(cleared.lastSyncStatus, null);

    reset();
    settings.claveUnicaLastSyncStatus = "failed";
    settings.claveUnicaLastSyncAt = new Date("2026-01-01T00:00:00Z");
    settings.claveUnicaLastSyncNote = "Aviso antiguo";
    claimBeforeClear = true;
    const interleaved = await clearClaveUnicaSyncMessages();
    assert.equal(interleaved.lastSyncStatus, "running", "clearing an old error must not overwrite a newer claim");
    assert.equal(interleaved.lastSyncNote, "Claim iniciado mientras se limpiaba");
    await assert.rejects(clearClaveUnicaSyncMessages(), /sincronización en curso/);
    assert.equal(settings.claveUnicaLastSyncNote, "Claim iniciado mientras se limpiaba");
    for (const boundary of ["health", "mis-causas"] as const) {
      reset(); pauseAt = boundary;
      await assert.rejects(syncMisCausas({ syncMovimientos: false }), error => (error as { status?: number }).status === 409);
      assert.equal(fetches, boundary === "health" ? 1 : 2, "a later login channel must not start after manual mode is selected");
      assert.equal(created, 0);
    }
  } finally {
    restoreMethods();
    for (const name of envNames) {
      if (previousEnv[name] === undefined) delete process.env[name];
      else process.env[name] = previousEnv[name];
    }
  }
  console.log("pjud/claveunica-sync.test.ts OK (fixtures only, no network/database)");
}

main().catch((error) => { console.error(error); process.exit(1); });
