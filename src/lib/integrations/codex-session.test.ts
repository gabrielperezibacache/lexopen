import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { CodexSessionManager, codexChildEnvironment } from "./codex-session";

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
  assert.equal(thread.permissions, "lexopen_text"); assert.equal(turn.permissions, "lexopen_text"); assert.equal(thread.sandbox, undefined); assert.equal(turn.sandboxPolicy, undefined);
  const args: string[] = JSON.parse(await readFile(path.join(base, hash("actor_a"), "fake-arguments.json"), "utf8"));
  assert.ok(args.includes(`permissions.lexopen_text.filesystem={${JSON.stringify(thread.cwd)}="read"}`));
  assert.ok(args.includes("permissions.lexopen_text.network.enabled=false"));
  assert.ok(args.includes('default_permissions="lexopen_text"'));
  assert.notEqual(thread.cwd, process.cwd()); assert.equal(thread.cwd.startsWith(tmpdir()), true);
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
