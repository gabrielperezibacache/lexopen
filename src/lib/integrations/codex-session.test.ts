import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { CodexSessionManager, beginCodexLogin, beginHostCodexLogin, cancelHostCodexLogin, closeHostCodexSessions, codexChildEnvironment, codexStatus, completeWithCodex, completeWithHostCodex, disconnectCodex, disconnectHostCodex, hostCodexModels, hostCodexStatus } from "./codex-session";

const fixture = path.resolve("src/lib/integrations/fixtures/codex-app-server.mjs");
const hash = (id: string) => createHash("sha256").update(id).digest("hex");
async function run(scenario: string, action: (manager: CodexSessionManager, base: string) => Promise<void>) {
  const base = await mkdtemp(path.join(tmpdir(), "lexopen-codex-session-test-"));
  const manager = new CodexSessionManager({ baseDir: base, executable: process.execPath, executableArgs: [fixture, `--scenario=${scenario}`], env: { NODE_ENV: "test", DATABASE_URL: "SECRET_DATABASE", OPENAI_API_KEY: "SECRET_KEY", CODEX_HOME: "UNRELATED_HOME", SESSION_SECRET: "SECRET_SESSION", NODE_OPTIONS: "--inspect" } });
  try { await action(manager, base); } finally { await manager.closeAll(); await new Promise(resolve => setTimeout(resolve, 40)); await rm(base, { recursive: true, force: true }); }
}
test("Codex child environment only receives runtime essentials and its own home", () => {
  const env = codexChildEnvironment("/private/example", { NODE_ENV: "test", PATH: "/usr/bin", DATABASE_URL: "secret", SESSION_SECRET: "secret", S3_SECRET_ACCESS_KEY: "secret", OPENAI_API_KEY: "secret", HTTP_PROXY: "secret", NODE_OPTIONS: "secret", CODEX_HOME: "other" });
  assert.equal(env.CODEX_HOME, "/private/example"); assert.equal(env.PATH, "/usr/bin"); assert.equal(env.NODE_ENV, "production");
  for (const key of ["DATABASE_URL", "SESSION_SECRET", "S3_SECRET_ACCESS_KEY", "OPENAI_API_KEY", "HTTP_PROXY", "NODE_OPTIONS"]) assert.equal(env[key], undefined);
});
test("Codex account connection is isolated by professional and never exposes tokens", async () => run("normal", async (manager, base) => {
  assert.equal((await manager.status("actor_a")).connected, false);
  const pending = await manager.beginLogin("actor_a"); assert.equal(pending.pendingLogin?.verificationUrl, "https://auth.openai.com/codex/device"); assert.equal(pending.status, "connecting");
  await new Promise(resolve => setTimeout(resolve, 130));
  const connected = await manager.status("actor_a"); assert.equal(connected.connected, true); assert.equal(connected.account?.email, "codex-demo@example.test");
  assert.equal(JSON.stringify(connected).includes("SHOULD_NEVER_LEAVE"), false);
  assert.equal((await manager.status("actor_b")).connected, false);
  assert.equal((await stat(path.join(base, hash("actor_a")))).mode & 0o777, 0o700);
  const childEnv = JSON.parse(await readFile(path.join(base, hash("actor_a"), "fake-environment.json"), "utf8"));
  assert.equal(childEnv.DATABASE_URL, undefined); assert.equal(childEnv.SESSION_SECRET, undefined); assert.equal(childEnv.OPENAI_API_KEY, undefined); assert.equal(childEnv.NODE_OPTIONS, undefined);
  assert.notEqual(childEnv.CODEX_HOME, "UNRELATED_HOME");
  await manager.disconnect("actor_a"); assert.equal((await manager.status("actor_a")).connected, false); assert.equal((await manager.status("actor_b")).connected, false);
}));
test("Codex login cancellation clears the one-time code and provider error", async () => run("normal", async manager => {
  await manager.beginLogin("actor_a"); const status = await manager.cancelLogin("actor_a"); assert.equal(status.pendingLogin, undefined); assert.equal(JSON.stringify(status).includes("SECRET_FROM_PROVIDER"), false);
}));
test("Codex duplicate login attempts don't create two active device codes", async () => run("normal", async manager => {
  const results = await Promise.allSettled([manager.beginLogin("actor_a"), manager.beginLogin("actor_a")]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(results.filter(result => result.status === "rejected").length, 1);
}));
test("Codex account replacement remains unavailable until device login completes", async () => run("connected", async manager => {
  assert.equal((await manager.status("actor_a")).connected, true);
  const pending = await manager.beginLogin("actor_a");
  assert.equal(pending.connected, false); assert.equal(pending.status, "connecting"); assert.ok(pending.pendingLogin);
  await assert.rejects(manager.models("actor_a"), /Conecte su cuenta/);
  await new Promise(resolve => setTimeout(resolve, 130));
  assert.equal((await manager.status("actor_a")).connected, true);
}));
test("Codex immediate login failure doesn't leave a stale pending code", async () => run("login-failed", async manager => {
  const status = await manager.beginLogin("actor_a"); assert.equal(status.connected, false); assert.equal(status.status, "error"); assert.equal(status.pendingLogin, undefined); assert.equal(JSON.stringify(status).includes("SECRET_FROM_PROVIDER"), false);
}));
test("Codex rejects arbitrary device-login origins", async () => run("bad-url", async manager => {
  await assert.rejects(manager.beginLogin("actor_a"), /dirección de conexión no admitida/);
}));
test("Codex completion restricts tools, filesystem and context and accepts only completed turns", async () => run("connected", async (manager, base) => {
  const result = await manager.complete("actor_a", [{ role: "system", content: "Devuelve una propuesta con las fuentes elegidas." }, { role: "user", content: "Texto propio ficticio" }], { model: "codex-test" });
  assert.deepEqual(result, { content: "Respuesta de prueba.", model: "codex-test", provider: "codex" });
  const trace = (await readFile(path.join(base, hash("actor_a"), "trace.jsonl"), "utf8")).trim().split("\n").map(line => JSON.parse(line));
  const thread = trace.find(row => row.method === "thread/start").params, turn = trace.find(row => row.method === "turn/start").params;
  assert.equal(trace.find(row => row.method === "initialize").params.capabilities.experimentalApi, true);
  assert.equal(thread.ephemeral, true); assert.equal(thread.approvalPolicy, "never"); assert.equal(thread.config["features.shell_tool"], false); assert.equal(thread.config["features.apps"], false); assert.equal(thread.config["features.plugins"], false); assert.equal(thread.config["skills.bundled.enabled"], false); assert.equal(thread.config.web_search, "disabled"); assert.deepEqual(thread.config.mcp_servers, {});
  assert.equal(thread.developerInstructions, "Devuelve una propuesta con las fuentes elegidas."); assert.equal(turn.input[0].text.includes('"role":"system"'), false);
  assert.match(thread.permissions, /^lexopen_text_[a-f0-9]{32}$/); assert.equal(turn.permissions, thread.permissions); assert.equal(thread.sandbox, undefined); assert.equal(turn.sandboxPolicy, undefined);
  const args: string[] = JSON.parse(await readFile(path.join(base, hash("actor_a"), "fake-arguments.json"), "utf8"));
  assert.ok(args.includes(`permissions.${thread.permissions}.filesystem={${JSON.stringify(thread.cwd)}="read"}`));
  assert.ok(args.includes(`permissions.${thread.permissions}.network.enabled=false`));
  assert.ok(args.includes(`default_permissions=${JSON.stringify(thread.permissions)}`));
  assert.notEqual(thread.cwd, process.cwd()); assert.equal(thread.cwd.startsWith(tmpdir()), true);
}));
test("Codex allocates a fresh permission profile per isolated session", async () => run("connected", async (manager, base) => {
  for (const actor of ["actor_a", "actor_b"]) await manager.complete(actor, [{ role: "user", content: "Dato ficticio" }], { model: "codex-test" });
  const profiles = await Promise.all(["actor_a", "actor_b"].map(async actor => {
    const lines = (await readFile(path.join(base, hash(actor), "trace.jsonl"), "utf8")).trim().split("\n").map(line => JSON.parse(line));
    return lines.find(row => row.method === "thread/start").params.permissions as string;
  }));
  assert.match(profiles[0], /^lexopen_text_[a-f0-9]{32}$/);
  assert.notEqual(profiles[0], profiles[1]);
}));
test("Codex permits explicitly disabled inherited MCP entries", async () => run("mcp-disabled", async manager => {
  const result = await manager.complete("actor_a", [{ role: "user", content: "Dato ficticio" }], { model: "codex-test" });
  assert.equal(result.content, "Respuesta de prueba.");
}));
test("Codex refuses inherited MCP before a thread and still permits disconnect", async () => run("mcp-present", async (manager, base) => {
  assert.equal((await manager.status("actor_a")).connected, true);
  await assert.rejects(manager.beginLogin("actor_a"), /servidores MCP/);
  await assert.rejects(manager.complete("actor_a", [{ role: "user", content: "Dato ficticio" }], { model: "codex-test" }), /servidores MCP/);
  const trace = (await readFile(path.join(base, hash("actor_a"), "trace.jsonl"), "utf8")).trim().split("\n").map(line => JSON.parse(line));
  assert.equal(trace.some(row => row.method === "thread/start" || row.method === "account/login/start"), false);
  assert.equal((await manager.disconnect("actor_a")).connected, false);
}));
test("Codex rechecks inherited MCP configuration before the turn", async () => run("mcp-late", async (manager, base) => {
  await assert.rejects(manager.complete("actor_a", [{ role: "user", content: "Dato ficticio" }], { model: "codex-test" }), /servidores MCP/);
  const trace = (await readFile(path.join(base, hash("actor_a"), "trace.jsonl"), "utf8")).trim().split("\n").map(line => JSON.parse(line));
  assert.equal(trace.filter(row => row.method === "thread/start").length, 1);
  assert.equal(trace.some(row => row.method === "turn/start"), false);
}));
test("Codex rejects server tool requests and unexpected tool activity", async () => {
  for (const scenario of ["tool", "tool-event"]) await run(scenario, async manager => { await assert.rejects(manager.complete("actor_a", [{ role: "user", content: "Hola" }], { model: "codex-test" }), /herramienta/); });
});
test("Codex incomplete turns never return partial text as success", async () => run("failed", async manager => {
  await assert.rejects(manager.complete("actor_a", [{ role: "user", content: "Hola" }], { model: "codex-test" }), /no terminó/);
}));
test("Codex deadline and one-operation-per-account bound pending work", async () => run("hang", async manager => {
  const pending = manager.complete("actor_a", [{ role: "user", content: "Hola" }], { model: "codex-test", timeoutMs: 1000 });
  // Give initialization and the account read a turn, before testing contention.
  await new Promise(resolve => setTimeout(resolve, 100));
  await assert.rejects(manager.complete("actor_a", [{ role: "user", content: "Otra" }], { model: "codex-test" }), /otra solicitud/);
  await assert.rejects(pending, /tardó demasiado/);
}));
test("Codex abort interrupts a turn without returning partial output", async () => run("hang", async manager => {
  const controller = new AbortController();
  const pending = manager.complete("actor_a", [{ role: "user", content: "Hola" }], { model: "codex-test", signal: controller.signal });
  const rejected = assert.rejects(pending, /cancelada/);
  setTimeout(() => controller.abort(), 80);
  await rejected;
}));
test("Codex missing executable is a disconnected UI state", async () => {
  const base = await mkdtemp(path.join(tmpdir(), "lexopen-codex-missing-test-"));
  const manager = new CodexSessionManager({ baseDir: base, executable: path.join(base, "not-installed") });
  try { const result = await manager.status("actor_a"); assert.equal(result.available, false); assert.equal(result.connected, false); assert.equal(result.status, "unavailable"); } finally { await manager.closeAll(); await rm(base, { recursive: true, force: true }); }
});
test("Codex refuses a symlink in a professional's private directory", async () => {
  const base = await mkdtemp(path.join(tmpdir(), "lexopen-codex-link-test-")), other = await mkdtemp(path.join(tmpdir(), "lexopen-codex-other-test-"));
  const manager = new CodexSessionManager({ baseDir: base });
  try { await symlink(other, path.join(base, hash("actor_a")), "dir"); const result = await manager.status("actor_a"); assert.equal(result.connected, false); assert.equal(result.status, "error"); assert.match(result.note || "", /carpeta privada/); }
  finally { await manager.closeAll(); await rm(base, { recursive: true, force: true }); await rm(other, { recursive: true, force: true }); }
});
test("Host Codex has its own private account, independent lifecycle and fresh context for every user", async () => {
  const base = await mkdtemp(path.join(tmpdir(), "lexopen-codex-host-test-"));
  const ambient = await mkdtemp(path.join(tmpdir(), "lexopen-codex-ambient-test-"));
  const executable = path.join(base, "fake-codex.mjs");
  await writeFile(executable, `#!${process.execPath}\nimport ${JSON.stringify(pathToFileURL(fixture).href)};\n`, { mode: 0o700 });
  await writeFile(path.join(ambient, "fake-auth.json"), JSON.stringify({ accessToken: "AMBIENT_CREDENTIAL_MUST_NOT_BE_USED" }));
  const previousEnv = { CODEX_DATA_DIR: process.env.CODEX_DATA_DIR, CODEX_BIN: process.env.CODEX_BIN, CODEX_HOME: process.env.CODEX_HOME };
  const globals = globalThis as typeof globalThis & { lexopenCodexSessions?: CodexSessionManager; lexopenHostCodexSessions?: CodexSessionManager };
  const previousHostManager = globals.lexopenHostCodexSessions;
  globals.lexopenHostCodexSessions = undefined;
  process.env.CODEX_DATA_DIR = base; process.env.CODEX_BIN = executable; process.env.CODEX_HOME = ambient;
  const actorId = "lexopen_host", hostHome = path.join(base, "host", hash(actorId)), personalHome = path.join(base, hash(actorId));
  try {
    assert.equal((await hostCodexStatus()).connected, false);
    assert.equal((await codexStatus(actorId)).connected, false);
    const pending = await beginHostCodexLogin(); assert.equal(pending.status, "connecting");
    assert.equal((await cancelHostCodexLogin()).pendingLogin, undefined);
    await beginHostCodexLogin(); await new Promise(resolve => setTimeout(resolve, 130));
    assert.equal((await hostCodexStatus()).connected, true);
    assert.equal((await codexStatus(actorId)).connected, false);
    const hostEnv = JSON.parse(await readFile(path.join(hostHome, "fake-environment.json"), "utf8"));
    assert.equal(hostEnv.CODEX_HOME, hostHome); assert.equal(hostEnv.HOME, hostHome);
    assert.equal((await stat(hostHome)).mode & 0o777, 0o700);
    assert.notEqual(hostHome, personalHome); assert.notEqual(hostEnv.CODEX_HOME, ambient);

    await beginCodexLogin(actorId); await new Promise(resolve => setTimeout(resolve, 130));
    await disconnectCodex(actorId);
    assert.equal((await hostCodexStatus()).connected, true);
    await beginCodexLogin(actorId); await new Promise(resolve => setTimeout(resolve, 130));
    await completeWithHostCodex([{ role: "user", content: "PRIVATE_USER_A" }], { model: "codex-test" });
    await completeWithHostCodex([{ role: "user", content: "PRIVATE_USER_B" }], { model: "codex-test" });
    const trace = (await readFile(path.join(hostHome, "trace.jsonl"), "utf8")).trim().split("\n").map(line => JSON.parse(line));
    const threads = trace.filter(row => row.method === "thread/start").map(row => row.params);
    const turns = trace.filter(row => row.method === "turn/start").map(row => row.params);
    assert.equal(threads.length, 2); assert.equal(threads.every(thread => thread.ephemeral === true), true);
    assert.notEqual(threads[0].cwd, threads[1].cwd);
    assert.equal(turns[0].input[0].text.includes("PRIVATE_USER_A"), true); assert.equal(turns[0].input[0].text.includes("PRIVATE_USER_B"), false);
    assert.equal(turns[1].input[0].text.includes("PRIVATE_USER_B"), true); assert.equal(turns[1].input[0].text.includes("PRIVATE_USER_A"), false);
    assert.deepEqual((await hostCodexModels()).map(model => model.id), ["codex-test"]);
    await closeHostCodexSessions();
    assert.equal((await hostCodexStatus()).connected, true);
    assert.equal((await codexStatus(actorId)).connected, true);
    await disconnectHostCodex();
    assert.equal((await hostCodexStatus()).connected, false);
    assert.equal((await codexStatus(actorId)).connected, true);
    await assert.rejects(completeWithHostCodex([{ role: "user", content: "No fallback" }], { model: "codex-test" }), /Conecte su cuenta/);
  } finally {
    await closeHostCodexSessions(); await globals.lexopenCodexSessions?.closeAll();
    globals.lexopenHostCodexSessions = previousHostManager;
    for (const [key, value] of Object.entries(previousEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await new Promise(resolve => setTimeout(resolve, 40));
    await rm(base, { recursive: true, force: true }); await rm(ambient, { recursive: true, force: true });
  }
});
test("Revoking Host Codex interrupts its active request", async () => run("hang", async manager => {
  const globals = globalThis as typeof globalThis & { lexopenHostCodexSessions?: CodexSessionManager };
  const previous = globals.lexopenHostCodexSessions;
  globals.lexopenHostCodexSessions = manager;
  try {
    const pending = completeWithHostCodex([{ role: "user", content: "Private pending work" }], { model: "codex-test" });
    const rejected = assert.rejects(pending, /cerró/);
    await new Promise(resolve => setTimeout(resolve, 100));
    await closeHostCodexSessions();
    await rejected;
  } finally { globals.lexopenHostCodexSessions = previous; }
}));
test("Host Codex binds every text send to the authorized sharing revision", async () => run("connected", async (manager, base) => {
  let enabled = false, revision = "host-1", reads = 0, revokeOn = 0;
  const globals = globalThis as typeof globalThis & {
    prisma?: unknown; lexopenHostCodexSessions?: CodexSessionManager;
  };
  const previousPrisma = globals.prisma, previousHost = globals.lexopenHostCodexSessions;
  globals.prisma = { integrationConfig: { findUnique: async ({ where }: { where: { provider: string } }) => {
    assert.equal(where.provider, "codex-host"); reads++;
    return { provider: "codex-host", enabled: enabled && reads !== revokeOn, configJson: JSON.stringify({ revision }) };
  } } };
  globals.lexopenHostCodexSessions = manager;
  const complete = () => completeWithHostCodex([{ role: "system", content: "Authorized system text" }, { role: "user", content: "MUST_NEVER_SEND_WITH_REVOKED_POLICY" }], { model: "codex-test", hostRevision: "host-1" });
  const trace = async () => (await readFile(path.join(base, hash("lexopen_host"), "trace.jsonl"), "utf8")).trim().split("\n").map(line => JSON.parse(line));
  try {
    await assert.rejects(complete(), /cambió o dejó/);
    enabled = true; revision = "host-2";
    await assert.rejects(complete(), /cambió o dejó/);
    revision = "host-1"; reads = 0; revokeOn = 2;
    await assert.rejects(complete(), /cambió o dejó/);
    assert.equal((await trace()).some(row => row.method === "thread/start"), false, "revocation before thread creation also protects system messages");
    reads = 0; revokeOn = 3;
    await assert.rejects(complete(), /cambió o dejó/);
    const revokedTrace = await trace();
    assert.equal(revokedTrace.filter(row => row.method === "thread/start").length, 1);
    assert.equal(revokedTrace.some(row => row.method === "turn/start"), false);
    assert.equal(JSON.stringify(revokedTrace).includes("MUST_NEVER_SEND_WITH_REVOKED_POLICY"), false);
    reads = 0; revokeOn = 0;
    assert.equal((await complete()).content, "Respuesta de prueba.");
    assert.equal(reads, 3, "check before opening, before system text and before user text");
  } finally { globals.prisma = previousPrisma; globals.lexopenHostCodexSessions = previousHost; }
}));
test("Host revocation also rejects a request that has not opened its session yet", async () => run("connected", async manager => {
  const globals = globalThis as typeof globalThis & { lexopenHostCodexSessions?: CodexSessionManager };
  const previous = globals.lexopenHostCodexSessions;
  globals.lexopenHostCodexSessions = manager;
  try {
    const rejected = assert.rejects(completeWithHostCodex([{ role: "user", content: "Do not send" }], { model: "codex-test" }), /cambió o dejó|cerró/);
    await closeHostCodexSessions();
    await rejected;
  } finally { globals.lexopenHostCodexSessions = previous; }
}));
test("Personal Codex rejects stale approvals before either text send", async () => {
  const base = await mkdtemp(path.join(tmpdir(), "lexopen-codex-personal-lease-test-"));
  const executable = path.join(base, "fake-codex.mjs"), actorId = "lease_actor";
  await writeFile(executable, `#!${process.execPath}\nprocess.argv.push("--scenario=connected");\nawait import(${JSON.stringify(pathToFileURL(fixture).href)});\n`, { mode: 0o700 });
  const previousEnv = { CODEX_DATA_DIR: process.env.CODEX_DATA_DIR, CODEX_BIN: process.env.CODEX_BIN };
  process.env.CODEX_DATA_DIR = base; process.env.CODEX_BIN = executable;
  const database = (await import("../db")).prisma as unknown as { integrationConfig: { findUnique: (query: { where: { provider: string } }) => Promise<{ provider: string; enabled: boolean; configJson: string }> } };
  const previousFind = database.integrationConfig.findUnique;
  let enabled = false, source = "personal", revision = "personal-1", reads = 0, revokeOn = 0;
  database.integrationConfig.findUnique = async ({ where }) => {
    assert.equal(where.provider, `codex:${actorId}`); reads++;
    return { provider: where.provider, enabled: enabled && reads !== revokeOn, configJson: JSON.stringify({ source, revision, model: "codex-test" }) };
  };
  const complete = () => completeWithCodex(actorId, [{ role: "system", content: "Approved system text" }, { role: "user", content: "PRIVATE_PERSONAL_TEXT" }], { model: "codex-test", personalRevision: "personal-1" });
  const trace = async () => (await readFile(path.join(base, hash(actorId), "trace.jsonl"), "utf8")).trim().split("\n").map(line => JSON.parse(line));
  try {
    await assert.rejects(complete(), /conexión personal de Codex cambió/);
    enabled = true; source = "host";
    await assert.rejects(complete(), /conexión personal de Codex cambió/);
    source = "personal"; revision = "personal-2";
    await assert.rejects(complete(), /conexión personal de Codex cambió/);
    revision = "personal-1"; reads = 0; revokeOn = 2;
    await assert.rejects(complete(), /conexión personal de Codex cambió/);
    assert.equal((await trace()).some(row => row.method === "thread/start"), false);
    reads = 0; revokeOn = 3;
    await assert.rejects(complete(), /conexión personal de Codex cambió/);
    const revokedTrace = await trace();
    assert.equal(revokedTrace.filter(row => row.method === "thread/start").length, 1);
    assert.equal(revokedTrace.some(row => row.method === "turn/start"), false);
    assert.equal(JSON.stringify(revokedTrace).includes("PRIVATE_PERSONAL_TEXT"), false);
    reads = 0; revokeOn = 0;
    assert.equal((await complete()).content, "Respuesta de prueba."); assert.equal(reads, 3);
  } finally {
    database.integrationConfig.findUnique = previousFind;
    await (globalThis as typeof globalThis & { lexopenCodexSessions?: CodexSessionManager }).lexopenCodexSessions?.closeAll();
    for (const [key, value] of Object.entries(previousEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await new Promise(resolve => setTimeout(resolve, 40)); await rm(base, { recursive: true, force: true });
  }
});
