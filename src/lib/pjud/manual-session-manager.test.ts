/** Host manager fixtures: no database, OJV requests, browser launch or credentials. */
import assert from "node:assert/strict";
import { ManualOjvSessionManager, ManualOjvUiError, manualOjvRuntimeEnabled, type ManualOjvOwner } from "@/lib/pjud/manual-session-manager";
import type { ManualOjvSession } from "@/lib/pjud/manual-session";
import type { MisCausasItem, PjudCuadernosCoverage } from "@/lib/pjud/types";
import type { syncMisCausas } from "@/lib/pjud/claveunica";
import { withManualPjudInteraction } from "@/lib/pjud/manual-interaction-policy";
import { pjudCaptchaAutoSolveAllowed, pjudDocumentDownloadsAllowed } from "@/lib/pjud/public-scrape";

const owner: ManualOjvOwner = { actorId: "fixture-a", fingerprint: "PRIVATE_COOKIE_HASH_A", sessionVersion: 1, authExpiresAt: Date.now() + 60_000 };
const other: ManualOjvOwner = { ...owner, actorId: "fixture-b", fingerprint: "PRIVATE_COOKIE_HASH_B" };
const fixtures: MisCausasItem[] = [1, 2].map(i => ({ rit: `C-${i}-2026`, tribunal: "1º Juzgado Civil de Santiago", caratula: `Fictitious case ${i}`, estado: "Tramitación" }));
const coverage: PjudCuadernosCoverage = { status: "complete", total: 2, read: 2, items: [{ key: "1", label: "Principal", status: "ok", count: 1 }, { key: "2", label: "Incidente", status: "ok", count: 0 }] };
const statusError = (status: number) => (error: unknown) => error instanceof ManualOjvUiError && error.status === status;
const pause = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));
async function until(check: () => boolean) { const end = Date.now() + 2_000; while (!check()) { assert(Date.now() < end, "fixture deadline"); await pause(5); } }

function fixture() {
  let closed = false, authenticated = true, factoryCalls = 0, closeCalls = 0, listCalls = 0, detailCalls = 0, syncCalls = 0, focusCalls = 0, allowed = true;
  let current = fixtures.map(row => ({ ...row }));
  const browser: ManualOjvSession = {
    status: () => ({ phase: closed ? "closed" : authenticated ? "authenticated" : "waiting-login", authenticated: !closed && authenticated, channel: "chromium", createdAt: new Date().toISOString(), authenticatedAt: new Date().toISOString(), pageUrl: "https://oficinajudicialvirtual.pjud.cl/indexN.php" }),
    waitForAuthentication: async () => { authenticated = true; return browser.status(); },
    showOfficialWindow: async () => { focusCalls++; },
    listMisCausas: async () => { listCalls++; return current.map(row => ({ ...row })); },
    fetchCausaDetail: async () => { detailCalls++; return { movimientos: [], sala: null, note: "Fictitious detail", portalUrl: "https://oficinajudicialvirtual.pjud.cl/indexN.php", cuadernos: coverage }; },
    close: async () => { closed = true; closeCalls++; },
  };
  const sync: typeof syncMisCausas = async options => {
    syncCalls++;
    assert.equal(options?.actorId, owner.actorId);
    assert.equal(options?.processJobsInline, true);
    const source = options!.sessionSource!;
    assert.equal(source.downloadDocuments, false);
    await source.assertActive?.();
    const items = await source.listMisCausas();
    const rows = [];
    for (const [index, item] of items.entries()) {
      await source.assertActive?.();
      const causaId = `fixture-cause-${index}`;
      const result = await source.fetchMovimientos({ ...item, id: causaId, ruc: null, titulo: item.rit, caratula: item.caratula || null });
      assert.equal(result.demo, false);
      assert.equal(result.provider, "scrape");
      rows.push({ ...item, causaId });
    }
    return { listed: rows.length, created: rows.length, linked: 0, enqueued: rows.length, enqueuedJobIds: ["fixture-job"], syncOk: rows.length, syncFailed: 0, syncPartial: 0, inserted: rows.length, items: rows, syncResults: rows.map(row => ({ causaId: row.causaId, status: "ok", inserted: 1, cuadernosCoverage: coverage })) };
  };
  const deps = {
    createSession: async options => { factoryCalls++; assert.equal(options.manualInteraction, true); assert.equal(options.operationTimeoutMs, 240_000); assert(options.signal); return browser; },
    sync,
    authorize: async () => { if (!allowed) throw new ManualOjvUiError("Fictitious revoked authorization", 403); },
    runtimeAllowed: () => true,
    monitorMs: 10,
  } satisfies Partial<ConstructorParameters<typeof ManualOjvSessionManager>[0]>;
  return { browser, deps, current: (value: MisCausasItem[]) => { current = value; }, expireAuthentication: () => { authenticated = false; }, revoke: () => { allowed = false; }, factoryCalls: () => factoryCalls, closeCalls: () => closeCalls, listCalls: () => listCalls, detailCalls: () => detailCalls, syncCalls: () => syncCalls, focusCalls: () => focusCalls };
}

async function main() {
  const runtime = { PJUD_MANUAL_SESSION: "1", PJUD_PUBLIC_SCRAPE: "1" };
  assert.equal(manualOjvRuntimeEnabled(runtime, "darwin"), true);
  assert.equal(manualOjvRuntimeEnabled(runtime, "linux"), false, "a headless Linux Host cannot offer a visible login window");
  assert.equal(manualOjvRuntimeEnabled({ ...runtime, DISPLAY: ":fixture" }, "linux"), true);
  assert.equal(manualOjvRuntimeEnabled({ PJUD_PUBLIC_SCRAPE: "1", LEXOPEN_WEB_HOST: "1" }, "darwin"), false, "web hosting alone is not consent to open a browser");
  assert.equal(manualOjvRuntimeEnabled({ ...runtime, PJUD_CLAVEUNICA_SCRAPE: "0" }, "darwin"), false);

  const previous = [process.env.PJUD_CAPTCHA_AUTO_SOLVE, process.env.PJUD_DOC_DOWNLOADS];
  process.env.PJUD_CAPTCHA_AUTO_SOLVE = "1"; process.env.PJUD_DOC_DOWNLOADS = "1";
  try {
    await Promise.all([
      withManualPjudInteraction(async () => { await pause(10); assert.equal(pjudCaptchaAutoSolveAllowed(), false); assert.equal(pjudDocumentDownloadsAllowed(), false); }),
      (async () => { await pause(5); assert.equal(pjudCaptchaAutoSolveAllowed(), true); assert.equal(pjudDocumentDownloadsAllowed(), true); })(),
    ]);
  } finally {
    for (const [index, key] of ["PJUD_CAPTCHA_AUTO_SOLVE", "PJUD_DOC_DOWNLOADS"].entries()) {
      if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index];
    }
  }

  const f = fixture(), manager = new ManualOjvSessionManager(f.deps);
  try {
    const starts = await Promise.all([manager.start(owner), manager.start(owner)]);
    const start = starts[0]; assert.equal(starts[1].session.id, start.session.id);
    assert.equal(start.session.phase, "opening");
    await Promise.all(starts.map(action => action.run())); await start.run();
    assert.equal(f.factoryCalls(), 1, "concurrent start requests must coalesce into one window");
    assert.equal((await manager.status(owner))?.phase, "ready");
    assert.doesNotMatch(JSON.stringify(await manager.status(owner)), /PRIVATE_COOKIE|fingerprint|pageUrl|password/);
    await assert.rejects(manager.status(other, start.session.id), statusError(404));
    await assert.rejects(manager.focus(other, start.session.id), statusError(404));
    await assert.rejects(manager.focus({ ...owner, fingerprint: "different-authentication" }, start.session.id), statusError(404));
    assert.equal(f.focusCalls(), 0, "another owner must never activate this session's window");
    await assert.rejects(manager.start(other), statusError(409));
    const both = await Promise.allSettled([manager.list(owner, start.session.id, ["Civil"]), manager.list(owner, start.session.id, ["Civil"])]);
    assert.equal(both.filter(result => result.status === "fulfilled").length, 1, "only one operation can reserve a shared page");
    const listing = both.find(result => result.status === "fulfilled")! as PromiseFulfilledResult<Awaited<ReturnType<typeof manager.list>>>;
    await assert.rejects(manager.focus(owner, start.session.id), statusError(409));
    await listing.value.run();
    const listed = (await manager.status(owner))!;
    assert(listed.listedAt); assert.equal(listed.candidates.length, 2);
    const originalId = listed.candidates[0].id;
    assert.deepEqual(await manager.focus(owner, start.session.id), listed, "focus preserves candidates, result, phase and expiration");
    assert.equal(f.focusCalls(), 1);
    listed.candidates[0].rit = "MUTATED";
    assert.equal((await manager.status(owner))!.candidates[0].rit, fixtures[0].rit, "HTTP views must not mutate the server allowlist");
    await assert.rejects(manager.import(owner, start.session.id, ["unseen-client-id"]), statusError(400));
    await assert.rejects(manager.import(owner, start.session.id, [originalId, originalId]), statusError(400));
    assert.equal(f.syncCalls(), 0);
    const imported = await manager.import(owner, start.session.id, [originalId]);
    await assert.rejects(manager.focus(owner, start.session.id), statusError(409));
    assert.equal(f.focusCalls(), 1, "listing and import reservations block focus");
    await imported.run();
    const done = (await manager.status(owner))!;
    assert.equal(done.phase, "completed"); assert.equal(done.result?.created, 1); assert.deepEqual(done.result?.items[0].cuadernosCoverage, coverage);
    assert.equal(f.detailCalls(), 1); assert.equal(f.listCalls(), 2, "import must refresh the OJV list rather than trust an old candidate");
    assert.equal(f.closeCalls(), 0, "a completed batch keeps the authenticated window for the next batch until close/expiry");
    const next = await manager.import(owner, start.session.id, [done.candidates[1].id]); await next.run();
    assert.equal(f.detailCalls(), 2, "a second batch uses the same owned session");
    f.expireAuthentication();
    const resumed = await manager.start(owner);
    assert.equal(resumed.session.phase, "waiting-login"); assert.equal(resumed.session.candidates.length, 0, "a new OJV identification must not reuse a previous account's list");
    await resumed.run(); assert.equal((await manager.status(owner))?.phase, "ready"); assert.equal(f.closeCalls(), 0);
    const relist = await manager.list(owner, start.session.id, ["Civil"]); await relist.run();
    await assert.rejects(manager.import(owner, start.session.id, [originalId]), statusError(400));
    const nextIds = (await manager.status(owner))!.candidates;
    f.current([]);
    const stale = await manager.import(owner, start.session.id, [nextIds[0].id]); await stale.run();
    assert.equal((await manager.status(owner))!.phase, "error"); assert.equal(f.detailCalls(), 2, "a candidate removed by the fresh server response must not be imported");
    f.revoke(); await until(() => f.closeCalls() > 0);
    await assert.rejects(manager.status(owner), statusError(403));
  } finally { await manager.dispose(); }

  const changed = fixture(), changedManager = new ManualOjvSessionManager(changed.deps);
  try {
    const start = await changedManager.start(owner); await start.run();
    assert.equal(await changedManager.status({ ...owner, fingerprint: "different-authentication" }), null);
    assert.equal(changed.closeCalls(), 0, "a stale authentication's read-only poll cannot close another connection");
    const replacement = await changedManager.start({ ...owner, fingerprint: "different-authentication" });
    assert.equal(replacement.session.phase, "opening");
    assert(changed.closeCalls() > 0, "a deliberate new login for the same actor closes the previous browser instead of inheriting it");
  } finally { await changedManager.dispose(); }

  const expiring = fixture(), short = new ManualOjvSessionManager({ ...expiring.deps, lifetimeMs: 80 });
  try {
    const start = await short.start(owner); await start.run(); await until(() => expiring.closeCalls() > 0);
    assert.equal(await short.status(owner), null, "expired candidates and result metadata are removed");
  } finally { await short.dispose(); }

  const opening = fixture(); let release!: (value: ManualOjvSession) => void;
  const delayed = new ManualOjvSessionManager({ ...opening.deps, createSession: () => new Promise(resolve => { release = resolve; }) });
  try {
    const start = await delayed.start(owner); const run = start.run(); await until(() => Boolean(release));
    await delayed.close(owner, start.session.id); release(opening.browser); await run;
    assert.equal(opening.closeCalls(), 1, "a browser that completes launch after cancellation must also close");
  } finally { await delayed.dispose(); }

  const waiting = fixture(); waiting.expireAuthentication(); let releaseAuthentication!: () => void;
  waiting.browser.waitForAuthentication = () => new Promise(resolve => { releaseAuthentication = () => resolve({ ...waiting.browser.status(), phase: "authenticated", authenticated: true }); });
  const waitingManager = new ManualOjvSessionManager(waiting.deps);
  try {
    const start = await waitingManager.start(owner); const running = start.run(); await until(() => Boolean(releaseAuthentication));
    const before = await waitingManager.status(owner);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const shown = await Promise.race([waitingManager.focus(owner, start.session.id), new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error("focus was blocked by authentication")), 1_000); })]);
      assert.deepEqual(shown, before, "showing a pending login neither authenticates nor extends its lifetime");
    } finally { if (timeout) clearTimeout(timeout); }
    assert.equal(waiting.focusCalls(), 1); assert.equal(waiting.factoryCalls(), 1);
    releaseAuthentication(); await running;
  } finally { await waitingManager.dispose(); }

  const legacy = fixture(); delete legacy.browser.showOfficialWindow;
  const legacyManager = new ManualOjvSessionManager(legacy.deps);
  try {
    const start = await legacyManager.start(owner); await start.run();
    const before = await legacyManager.status(owner);
    await assert.rejects(legacyManager.focus(owner, start.session.id), error => error instanceof ManualOjvUiError && error.status === 503 && /Vuelva a abrir LexOpen/.test(error.message));
    assert.deepEqual(await legacyManager.status(owner), before, "an old session remains intact after an unsupported focus request");
    assert.equal(legacy.closeCalls(), 0);
  } finally { await legacyManager.dispose(); }

  const focusFailure = fixture(); focusFailure.browser.showOfficialWindow = async () => { throw new Error("PRIVATE_UNSAFE_BROWSER_URL_AND_TOKEN"); };
  const failureManager = new ManualOjvSessionManager(focusFailure.deps);
  try {
    const start = await failureManager.start(owner); await start.run();
    await assert.rejects(failureManager.focus(owner, start.session.id), error => error instanceof ManualOjvUiError && error.status === 409 && !/PRIVATE/.test(error.message));
    assert.equal(focusFailure.closeCalls(), 0, "a focus failure must not discard a usable login");
    focusFailure.revoke();
    await assert.rejects(failureManager.focus(owner, start.session.id), statusError(403));
  } finally { await failureManager.dispose(); }
  console.log("Manual OJV manager: owner isolation, fresh allowlists, serial operations, repeat batches, revocation, expiry, cancellation and per-operation policy passed (fixtures only).");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
