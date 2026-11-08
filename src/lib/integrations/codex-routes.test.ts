import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { build } from "esbuild";
import { ZodError } from "zod";

const require = createRequire(import.meta.url);
const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
type Source = "personal" | "host";
type Preference = { enabled: boolean; model: string; source: Source; revision: string };
type Handler = (request?: Request) => Promise<Response>;
const connection = (connected = true) => ({ available: true, connected, status: connected ? "connected" : "disconnected", account: { email: "host-private@example.invalid" }, pendingLogin: { userCode: "PRIVATE-DEVICE-CODE", verificationUrl: "https://example.invalid/device" } });

async function harness(admin = false) {
  const calls: string[] = [], audits: { afterJson: string }[] = [];
  const fixture = {
    actorId: "user-a", staff: true, capability: true, admin: true, csrf: true, limited: false, remote: true,
    personal: connection(), host: connection(), sharing: { enabled: false, revision: "host-0" },
    preference: { enabled: true, model: "personal-model", source: "personal", revision: "personal-0" } as Preference,
    failConnect: false, transactionPolicy: false,
    beforeHostStatus: undefined as (() => Promise<void>) | undefined,
    beforeHostConnect: undefined as (() => Promise<void>) | undefined,
    beforePersonalSave: undefined as (() => Promise<void>) | undefined,
    beforeHostComplete: undefined as (() => Promise<void>) | undefined,
  };
  let revision = 0;
  const error = (message: string, status: number) => Object.assign(new Error(message), { status });
  const sessions = {
    codexStatus: async (actorId: string) => { assert.equal(actorId, fixture.actorId); calls.push("personal.status"); return fixture.personal; },
    hostCodexStatus: async () => { calls.push("host.status"); const snapshot = fixture.host; await fixture.beforeHostStatus?.(); return snapshot; },
    codexModels: async (actorId: string) => { assert.equal(actorId, fixture.actorId); calls.push("personal.models"); return [{ id: "personal-model" }]; },
    hostCodexModels: async () => { calls.push("host.models"); if (!fixture.host.connected) throw error("Host desconectado", 409); return [{ id: "host-model" }]; },
    beginCodexLogin: async (actorId: string) => { assert.equal(actorId, fixture.actorId); calls.push("personal.connect"); },
    cancelCodexLogin: async (actorId: string) => { assert.equal(actorId, fixture.actorId); calls.push("personal.cancel"); },
    disconnectCodex: async (actorId: string) => { assert.equal(actorId, fixture.actorId); calls.push("personal.disconnect"); fixture.personal = connection(false); },
    beginHostCodexLogin: async () => { calls.push("host.connect"); await fixture.beforeHostConnect?.(); if (fixture.failConnect) throw error("CLI no disponible", 503); },
    cancelHostCodexLogin: async () => { calls.push("host.cancel"); },
    closeHostCodexSessions: async () => { calls.push("host.close"); },
    disconnectHostCodex: async () => { calls.push("host.disconnect"); fixture.host = connection(false); },
    completeWithCodex: async (actorId: string, messages: unknown[], options: { model: string; signal?: AbortSignal }) => {
      assert.equal(actorId, fixture.actorId); assert.equal(options.model, "personal-model"); assert.equal(messages.length, 1); assert.ok(options.signal);
      calls.push("personal.complete"); return { content: "PRIVATE TEST OUTPUT", model: options.model };
    },
    completeWithHostCodex: async (messages: unknown[], options: { model: string; signal?: AbortSignal; hostRevision?: string }) => {
      assert.equal(options.model, "host-model"); assert.equal(messages.length, 1); assert.ok(options.signal);
      assert.equal(options.hostRevision, admin ? undefined : fixture.sharing.revision, "only end users require the captured sharing revision");
      calls.push("host.complete"); await fixture.beforeHostComplete?.(); return { content: "PRIVATE TEST OUTPUT", model: options.model };
    },
  };
  const auditEvent = { create: async ({ data }: { data: { afterJson: string } }) => { calls.push("audit"); audits.push(data); } };
  const tx = { auditEvent };
  const modules: Record<string, unknown> = {
    "next/server": { NextResponse: Response },
    "@/lib/api": {
      assertCsrf: () => { calls.push("csrf"); if (!fixture.csrf) throw error("CSRF", 403); },
      requireStaff: async () => { calls.push("staff"); if (!fixture.staff) throw error("Prohibido", 403); return { id: fixture.actorId }; },
      requireRole: async (role: string) => { assert.equal(role, "admin"); calls.push("admin"); if (!fixture.admin) throw error("Prohibido", 403); return { id: fixture.actorId }; },
      handleRouteError: (reason: unknown) => Response.json({ error: reason instanceof Error ? reason.message : "Error" }, { status: (reason as { status?: number }).status ?? (reason instanceof ZodError ? 400 : 500) }),
    },
    "@/lib/auth/access": { httpError: error },
    "@/lib/books/access": { actorFor: async (actor: { id: string }) => { calls.push("capability"); if (!fixture.capability) throw error("Permiso revocado", 403); return actor; } },
    "@/lib/auth/rate-limit": { rateLimitAsync: async () => ({ ok: !fixture.limited }) },
    "@/lib/assistant/firm-policy": { getAssistantFirmPolicy: async () => ({ assistantLlmMode: fixture.remote ? "remote_allowed" : "local_only" }) },
    "@/lib/db": { prisma: { auditEvent, $transaction: async (operation: (client: typeof tx) => Promise<void>) => { calls.push("transaction.begin"); await operation(tx); calls.push("transaction.commit"); } } },
    "@/lib/integrations/codex-session": sessions,
    "@/lib/integrations/codex-preference": {
      hostCodexPolicy: async () => fixture.sharing,
      personalCodexPreference: async (actorId: string) => { assert.equal(actorId, fixture.actorId); return fixture.preference; },
      savePersonalCodexPreference: async (actorId: string, value: Omit<Preference, "revision">) => { assert.equal(actorId, fixture.actorId); calls.push("personal.save"); fixture.preference = { ...value, revision: `personal-${++revision}` }; await fixture.beforePersonalSave?.(); },
      rotatePersonalCodexRevision: async (actorId: string) => { assert.equal(actorId, fixture.actorId); calls.push("personal.rotate"); fixture.preference = { ...fixture.preference, revision: `personal-${++revision}` }; },
      saveHostCodexPolicy: async (enabled: boolean, client: unknown, expectedRevision?: string) => {
        if (expectedRevision !== undefined && expectedRevision !== fixture.sharing.revision) throw error("La conexión cambió; actualice antes de compartir", 409);
        calls.push(`sharing.${enabled}`); fixture.transactionPolicy = client === tx; fixture.sharing = { enabled, revision: `host-${++revision}` };
      },
    },
  };
  // Execute the actual handlers and streamed body parser. All account, database,
  // session and authorization boundaries are fixtures; no CLI or network runs.
  const bundle = await build({
    entryPoints: [path.join(sourceRoot, `app/api/${admin ? "admin" : "integrations"}/codex/route.ts`)],
    bundle: true, write: false, format: "cjs", platform: "node", packages: "external",
    plugins: [{ name: "fixture-boundaries", setup(builder) {
      builder.onResolve({ filter: /^@\// }, ({ path: importPath }) => importPath === "@/lib/knowledge/route-body" ? { path: path.join(sourceRoot, "lib/knowledge/route-body.ts") } : { path: importPath, external: true });
    } }],
  });
  const loaded = { exports: {} as Record<string, Handler> };
  runInNewContext(bundle.outputFiles[0].text, { module: loaded, exports: loaded.exports, require: (id: string) => modules[id] ?? require(id), Buffer, TextDecoder, console });
  const post = async (body: unknown) => loaded.exports.POST(new Request("http://lexopen.invalid/api/codex", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
  return { fixture, calls, audits, get: loaded.exports.GET, post };
}

async function main() {
  const user = await harness();
  const stateResponse = await user.get();
  const state = await stateResponse.json();
  assert.deepEqual(state.host, { enabled: false, available: false, connected: false });
  assert.equal(state.host.account, undefined); assert.equal(state.host.pendingLogin, undefined);
  assert.ok(!user.calls.includes("host.status"), "disabled sharing never starts or inspects the Host session");
  assert.match(stateResponse.headers.get("cache-control")!, /no-store/);
  assert.equal(stateResponse.headers.get("vary"), "Cookie");
  user.fixture.sharing.enabled = true;
  assert.deepEqual((await (await user.get()).json()).host, { enabled: true, available: true, connected: true }, "even enabled Host sharing exposes only three booleans");
  user.fixture.sharing.enabled = false;

  user.fixture.capability = false; user.calls.length = 0;
  assert.equal((await user.get()).status, 403); assert.ok(!user.calls.includes("host.status"));
  user.fixture.capability = true; user.fixture.csrf = false; user.calls.length = 0;
  assert.equal((await user.post({ action: "disconnect" })).status, 403); assert.deepEqual(user.calls, ["csrf"]);
  user.fixture.csrf = true; user.fixture.limited = true;
  assert.equal((await user.post({ action: "connect" })).status, 429);
  user.fixture.limited = false;
  assert.equal((await user.post({ action: "connect", source: "host" })).status, 400, "personal account actions cannot target Host");
  assert.equal((await user.post({ action: "models", source: "unknown" })).status, 400);

  user.calls.length = 0;
  assert.equal((await user.post({ action: "models" })).status, 200);
  assert.ok(user.calls.includes("personal.models")); assert.ok(!user.calls.includes("host.models"));
  for (const body of [{ action: "models", source: "host" }, { action: "test", source: "host", model: "host-model" }, { action: "save", source: "host", model: "host-model", enabled: true }]) {
    user.calls.length = 0; assert.equal((await user.post(body)).status, 403);
    assert.ok(!user.calls.includes("host.models")); assert.ok(!user.calls.includes("host.complete"));
  }
  user.fixture.sharing.enabled = true; user.fixture.host = connection(false);
  assert.equal((await user.post({ action: "models", source: "host" })).status, 409);
  user.fixture.host = connection(); user.calls.length = 0;
  assert.equal((await user.post({ action: "test", source: "host", model: "personal-model" })).status, 400);
  assert.ok(!user.calls.includes("personal.complete")); assert.ok(!user.calls.includes("host.complete"));
  assert.equal((await user.post({ action: "test", source: "host", model: "host-model" })).status, 200);
  assert.ok(user.calls.includes("host.complete")); assert.ok(!user.calls.includes("personal.complete"));
  assert.equal((await user.post({ action: "save", source: "host", model: "host-model", enabled: true })).status, 200);
  assert.equal(user.fixture.preference.source, "host");

  const hostPreference = { ...user.fixture.preference }; user.calls.length = 0;
  assert.equal((await user.post({ action: "disconnect" })).status, 200);
  assert.deepEqual({ ...user.fixture.preference, revision: hostPreference.revision }, hostPreference, "disconnecting personal leaves Host selected and enabled");
  assert.notEqual(user.fixture.preference.revision, hostPreference.revision);
  assert.ok(user.calls.indexOf("personal.rotate") < user.calls.indexOf("personal.disconnect"));
  assert.ok(!user.calls.includes("host.disconnect"));
  user.fixture.preference = { enabled: true, source: "personal", model: "personal-model", revision: "old" }; user.calls.length = 0;
  assert.equal((await user.post({ action: "disconnect" })).status, 200);
  assert.equal(user.fixture.preference.enabled, false);
  assert.ok(user.calls.indexOf("personal.save") < user.calls.indexOf("personal.disconnect"));
  user.fixture.preference = { enabled: true, source: "personal", model: "personal-model", revision: "before-login" }; user.calls.length = 0;
  assert.equal((await user.post({ action: "connect" })).status, 200);
  assert.equal(user.fixture.preference.enabled, false, "new personal login needs explicit activation after it finishes");
  assert.ok(user.calls.indexOf("personal.save") < user.calls.indexOf("personal.connect"));
  user.fixture.preference = { enabled: true, source: "host", model: "host-model", revision: "before-personal-login" }; user.calls.length = 0;
  assert.equal((await user.post({ action: "connect" })).status, 200);
  assert.equal(user.fixture.preference.enabled, true); assert.equal(user.fixture.preference.source, "host");
  assert.ok(user.calls.indexOf("personal.rotate") < user.calls.indexOf("personal.connect"));
  user.calls.length = 0; assert.equal((await user.post({ action: "cancel" })).status, 200);
  assert.ok(user.calls.indexOf("personal.rotate") < user.calls.indexOf("personal.cancel"));

  user.fixture.remote = false;
  for (const body of [{ action: "connect" }, { action: "models", source: "host" }, { action: "test", model: "personal-model" }, { action: "save", source: "host", model: "host-model", enabled: true }]) {
    assert.equal((await user.post(body)).status, 403);
  }
  user.fixture.sharing.enabled = false; user.fixture.host = connection(false);
  assert.equal((await user.post({ action: "save", source: "host", model: "host-model", enabled: false })).status, 200);
  assert.equal(user.fixture.preference.source, "host"); assert.equal(user.fixture.preference.enabled, false);
  assert.equal((await user.post({ action: "cancel" })).status, 200);
  assert.equal((await user.post({ action: "disconnect" })).status, 200);

  user.fixture.remote = true; user.fixture.personal = connection();
  user.fixture.preference = { enabled: true, source: "personal", model: "personal-model", revision: "before-concurrent-login" };
  let releasePersonalSave!: () => void, markPersonalSave!: () => void;
  const personalSaving = new Promise<void>(resolve => { markPersonalSave = resolve; });
  const blockedPersonalSave = new Promise<void>(resolve => { releasePersonalSave = resolve; });
  user.fixture.beforePersonalSave = async () => { user.fixture.beforePersonalSave = undefined; markPersonalSave(); await blockedPersonalSave; };
  user.calls.length = 0;
  const personalLogin = user.post({ action: "connect" });
  await personalSaving;
  assert.ok(!user.calls.includes("personal.connect"));
  for (const body of [{ action: "save", enabled: true, model: "personal-model" }, { action: "disconnect" }, { action: "cancel" }, { action: "models" }, { action: "test", model: "personal-model" }]) assert.equal((await user.post(body)).status, 409);
  user.fixture.actorId = "user-b";
  assert.equal((await user.post({ action: "models" })).status, 200, "personal lifecycle guard is scoped to its actor");
  user.fixture.actorId = "user-a";
  releasePersonalSave();
  assert.equal((await personalLogin).status, 200);
  assert.equal(user.fixture.preference.enabled, false);
  assert.equal((await user.post({ action: "save", enabled: true, model: "personal-model" })).status, 200, "completed personal login releases the guard");

  const admin = await harness(true);
  admin.fixture.admin = false;
  assert.equal((await admin.get()).status, 403);
  assert.equal((await admin.post({ action: "save", enabled: true })).status, 403);
  assert.ok(!admin.calls.includes("host.status"));
  admin.fixture.admin = true;
  const adminState = await (await admin.get()).json();
  assert.equal(adminState.connectionHost.account.email, "host-private@example.invalid");
  assert.equal(adminState.policy.enabled, false);
  admin.fixture.host = connection(false);
  assert.equal((await admin.post({ action: "save", enabled: true })).status, 409);
  admin.fixture.host = connection();
  assert.equal((await admin.post({ action: "save", enabled: true })).status, 200);
  assert.equal(admin.fixture.sharing.enabled, true); assert.equal(admin.fixture.transactionPolicy, true);
  const preferenceBeforeAdminTest = { ...admin.fixture.preference };
  assert.equal((await admin.post({ action: "test", model: "host-model" })).status, 200);
  assert.deepEqual(admin.fixture.preference, preferenceBeforeAdminTest, "admin test never chooses a model for other users");
  assert.equal((await admin.post({ action: "save", enabled: true, model: "host-model" })).status, 400);
  admin.fixture.failConnect = true; admin.calls.length = 0;
  assert.equal((await admin.post({ action: "connect" })).status, 503);
  assert.equal(admin.fixture.sharing.enabled, false);
  assert.ok(admin.calls.indexOf("transaction.commit") < admin.calls.indexOf("host.connect"), "sharing revocation commits before touching Host auth");
  assert.ok(admin.calls.indexOf("transaction.commit") < admin.calls.indexOf("host.close"));
  assert.ok(admin.calls.indexOf("host.close") < admin.calls.indexOf("host.connect"));
  admin.fixture.failConnect = false; admin.fixture.sharing.enabled = true; admin.calls.length = 0;
  assert.equal((await admin.post({ action: "disconnect" })).status, 200);
  assert.equal(admin.fixture.sharing.enabled, false);
  assert.ok(admin.calls.indexOf("transaction.commit") < admin.calls.indexOf("host.disconnect"));
  assert.ok(admin.calls.indexOf("host.close") < admin.calls.indexOf("host.disconnect"));
  assert.ok(!admin.calls.includes("personal.disconnect"));
  admin.fixture.remote = false;
  for (const body of [{ action: "connect" }, { action: "models" }, { action: "test", model: "host-model" }, { action: "save", enabled: true }]) assert.equal((await admin.post(body)).status, 403);
  for (const body of [{ action: "cancel" }, { action: "disconnect" }, { action: "save", enabled: false }]) assert.equal((await admin.post(body)).status, 200);

  admin.fixture.remote = true; admin.fixture.host = connection();
  let releaseStatus!: () => void, markChecking!: () => void;
  const checking = new Promise<void>(resolve => { markChecking = resolve; });
  const blockedStatus = new Promise<void>(resolve => { releaseStatus = resolve; });
  admin.fixture.beforeHostStatus = async () => { admin.fixture.beforeHostStatus = undefined; markChecking(); await blockedStatus; };
  const enabling = admin.post({ action: "save", enabled: true });
  await checking;
  assert.equal((await admin.post({ action: "disconnect" })).status, 409, "sharing decision excludes concurrent account changes");
  // A different worker can still revoke in the database; the persisted CAS
  // must reject this decision even when its connection snapshot was valid.
  admin.fixture.sharing = { enabled: false, revision: "external-revocation" };
  admin.fixture.host = connection(false);
  releaseStatus();
  assert.equal((await enabling).status, 409, "stale connected snapshot cannot re-enable sharing across a concurrent lifecycle change");
  assert.equal(admin.fixture.sharing.enabled, false);
  assert.equal((await admin.post({ action: "cancel" })).status, 200, "failed mutation releases the guard");

  let releaseConnect!: () => void, markConnecting!: () => void;
  const connecting = new Promise<void>(resolve => { markConnecting = resolve; });
  const blockedConnect = new Promise<void>(resolve => { releaseConnect = resolve; });
  admin.fixture.beforeHostConnect = async () => { markConnecting(); await blockedConnect; };
  const login = admin.post({ action: "connect" });
  await connecting;
  for (const body of [{ action: "save", enabled: true }, { action: "disconnect" }, { action: "cancel" }, { action: "models" }, { action: "test", model: "host-model" }]) assert.equal((await admin.post(body)).status, 409);
  assert.equal(admin.fixture.sharing.enabled, false, "a pending login cannot be shared by a concurrent request");
  releaseConnect();
  assert.equal((await login).status, 200);
  assert.equal((await admin.post({ action: "save", enabled: false })).status, 200, "successful mutation releases the guard");

  admin.fixture.host = connection();
  let releaseTest!: () => void, markTesting!: () => void;
  const testing = new Promise<void>(resolve => { markTesting = resolve; });
  const blockedTest = new Promise<void>(resolve => { releaseTest = resolve; });
  admin.fixture.beforeHostComplete = async () => { markTesting(); await blockedTest; };
  const hostTest = admin.post({ action: "test", model: "host-model" });
  await testing;
  assert.equal((await admin.post({ action: "save", enabled: false })).status, 200, "a test must never hold the lifecycle guard and block revocation");
  releaseTest();
  assert.equal((await hostTest).status, 200);

  for (const audit of [...user.audits, ...admin.audits]) {
    assert.ok(!JSON.stringify(audit).includes("PRIVATE")); assert.ok(!JSON.stringify(audit).includes("example.invalid"));
  }
  console.log("Codex API routes: capabilities, Host privacy, policy, source isolation, revocation and audits passed (zero network).");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
