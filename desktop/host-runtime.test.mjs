import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import {
  applyHostFailClosedEnv,
  ensureHostToolPath,
  extraHostToolPathDirs,
  ensureStandaloneStaticAssets,
  ensureStandalonePlaywright,
  repoNodePath,
  loadEnvFile,
  preferEnvFileKeys,
  setupPendingMessage,
  validateHostPorts,
  previewAppVersion,
  readHostBuildIdentity,
  embeddedDatabasePort,
  toolUsesShell,
  startHost,
  withPrivatePostgresTemp,
  stopChild,
  assertHostStopped,
} from "./host-runtime.mjs";

assert.doesNotThrow(() => validateHostPorts(3000, 54329));
assert.throws(() => validateHostPorts(3000, 3000), /debe ser distinto/);
assert.throws(() => validateHostPorts(80, 54329), /Puerto inválido/);
assert.throws(() => validateHostPorts(3000, 70000), /Puerto inválido/);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lexopen-loadenv-"));
const envFile = path.join(tmp, ".env");
fs.writeFileSync(
  envFile,
  "LLM_ALLOW_DEMO=1\nFROM_FILE=yes\nALREADY=file-value\n",
  "utf8"
);
const env = { ALREADY: "parent-wins" };
loadEnvFile(envFile, env);
assert.equal(env.ALREADY, "parent-wins");
assert.equal(env.FROM_FILE, "yes");
assert.equal(env.LLM_ALLOW_DEMO, "1");

// Parent/CI shell pollution must not survive into production Host Next.
const polluted = {
  LEXOPEN_RELAX_CSRF: "1",
  LEXOPEN_OPEN_ACCESS: "1",
  LEXOPEN_ALLOW_PLAINTEXT_PASSWORDS: "1",
  HERMES_ALLOW_DEMO: "1",
  LLM_ALLOW_DEMO: "1",
  PJUD_ALLOW_DEMO: "1",
  LEXOPEN_DEMO_SWITCHER: "1",
};
applyHostFailClosedEnv(polluted);
assert.equal(polluted.LEXOPEN_RELAX_CSRF, "0");
assert.equal(polluted.LEXOPEN_OPEN_ACCESS, "0");
assert.equal(polluted.LEXOPEN_ALLOW_PLAINTEXT_PASSWORDS, "0");
assert.equal(polluted.HERMES_ALLOW_DEMO, "0");
assert.equal(polluted.LLM_ALLOW_DEMO, "0");
assert.equal(polluted.PJUD_ALLOW_DEMO, "0");
assert.equal(polluted.LEXOPEN_DEMO_SWITCHER, "0");

const keepDemos = {
  HERMES_ALLOW_DEMO: "1",
  LEXOPEN_KEEP_HERMES_DEMO: "1",
  LEXOPEN_RELAX_CSRF: "1",
};
applyHostFailClosedEnv(keepDemos);
assert.equal(keepDemos.HERMES_ALLOW_DEMO, "1");
assert.equal(keepDemos.LEXOPEN_RELAX_CSRF, "0");

// Shell DATABASE_URL (e.g. CI e2e) must not win over the Host data-dir .env.
const identityFile = path.join(tmp, "identity.env");
fs.writeFileSync(
  identityFile,
  "DATABASE_URL=postgresql://lexopen:host@127.0.0.1:54329/lexopen\nSESSION_SECRET=host-secret-value-ok\nPORT=3011\n",
  "utf8"
);
const identityEnv = {
  DATABASE_URL: "postgresql://lexopen:lexopen@127.0.0.1:5432/lexopen_e2e",
  SESSION_SECRET: "shell-secret",
  PORT: "3000",
};
preferEnvFileKeys(identityFile, undefined, identityEnv);
assert.equal(
  identityEnv.DATABASE_URL,
  "postgresql://lexopen:host@127.0.0.1:54329/lexopen"
);
assert.equal(identityEnv.SESSION_SECRET, "host-secret-value-ok");
assert.equal(identityEnv.PORT, "3011");

const electronMsg = setupPendingMessage({ isElectron: true, port: 3000 });
assert.match(electronMsg, /Desktop/);
assert.doesNotMatch(electronMsg, /[a-f0-9]{32}/);
const webMsg = setupPendingMessage({ isElectron: false, port: 3010 });
assert.match(webMsg, /127\.0\.0\.1:3010\/setup/);
assert.match(webMsg, /LEXOPEN_BOOTSTRAP_TOKEN/);
assert.doesNotMatch(webMsg, /token=[a-f0-9]/);

const missingStatic = path.join(tmp, "server.js");
fs.writeFileSync(missingStatic, "", "utf8");
assert.throws(
  () => ensureStandaloneStaticAssets(missingStatic, tmp),
  /desktop:build/
);

const cloneRoot = fs.mkdtempSync(path.join(os.tmpdir(), "lexopen-standalone-"));
const standaloneDir = path.join(cloneRoot, ".next", "standalone");
fs.mkdirSync(standaloneDir, { recursive: true });
const cloneEntry = path.join(standaloneDir, "server.js");
fs.writeFileSync(cloneEntry, "", "utf8");
const srcStatic = path.join(cloneRoot, ".next", "static");
fs.mkdirSync(srcStatic, { recursive: true });
fs.writeFileSync(path.join(srcStatic, "app.css"), "body{color:navy}");
const srcPublic = path.join(cloneRoot, "public");
fs.mkdirSync(srcPublic, { recursive: true });
fs.writeFileSync(path.join(srcPublic, "favicon.ico"), "ico");

const destStatic = ensureStandaloneStaticAssets(cloneEntry, cloneRoot);
assert.equal(destStatic, path.join(standaloneDir, ".next", "static"));
assert.equal(
  fs.readFileSync(path.join(destStatic, "app.css"), "utf8"),
  "body{color:navy}"
);
assert.equal(
  fs.readFileSync(path.join(standaloneDir, "public", "favicon.ico"), "utf8"),
  "ico"
);

const pwSrc = path.join(cloneRoot, "node_modules", "playwright");
const pwCoreSrc = path.join(cloneRoot, "node_modules", "playwright-core");
fs.mkdirSync(path.join(pwSrc, "lib"), { recursive: true });
fs.mkdirSync(pwCoreSrc, { recursive: true });
fs.writeFileSync(path.join(pwSrc, "index.js"), "module.exports = { chromium: true };");
fs.writeFileSync(path.join(pwSrc, "package.json"), '{"name":"playwright","version":"1.0.0"}');
fs.writeFileSync(path.join(pwCoreSrc, "index.js"), "module.exports = {};");
fs.writeFileSync(
  path.join(pwCoreSrc, "package.json"),
  '{"name":"playwright-core","version":"1.0.0"}'
);
assert.equal(ensureStandalonePlaywright(cloneEntry, cloneRoot), 2);
assert.equal(
  fs.readFileSync(
    path.join(standaloneDir, "node_modules", "playwright", "index.js"),
    "utf8"
  ),
  "module.exports = { chromium: true };"
);
assert.ok(
  fs.existsSync(path.join(standaloneDir, "node_modules", "playwright-core", "index.js"))
);
const nodePath = repoNodePath(cloneRoot, "");
assert.equal(nodePath, path.join(cloneRoot, "node_modules"));
assert.match(repoNodePath(cloneRoot, "/tmp/other"), /node_modules/);

assert.ok(extraHostToolPathDirs("darwin").includes("/opt/homebrew/bin"));
const slimPath = { PATH: "/usr/bin:/bin" };
ensureHostToolPath(slimPath, "linux");
assert.equal(slimPath.PATH, "/usr/bin:/bin");
const macPath = { PATH: "/usr/bin:/bin" };
ensureHostToolPath(macPath, "darwin");
assert.match(macPath.PATH, /\/usr\/bin/);

assert.equal(toolUsesShell("C:\\Aplicaciones & revisión\\lexopen.exe", "win32"), false);
assert.equal(toolUsesShell("npx", "win32"), true);
assert.equal(toolUsesShell("npx", "darwin"), false);
assert.equal(embeddedDatabasePort("postgresql://lexopen:fixture@127.0.0.1:55449/lexopen"), 55449);
assert.throws(() => embeddedDatabasePort("postgresql://lexopen:fixture@remote.invalid:5432/lexopen"), /local/);
const originalTemporary = [process.env.TMPDIR, process.env.TMP, process.env.TEMP], originalMask = process.umask();
let initializationDirectory;
await assert.rejects(withPrivatePostgresTemp(tmp, async () => {
  initializationDirectory = os.tmpdir();
  assert(initializationDirectory.startsWith(fs.realpathSync(tmp) + path.sep));
  if (process.platform !== "win32") assert.equal(fs.statSync(initializationDirectory).mode & 0o777, 0o700);
  assert.equal(process.env.TMPDIR, initializationDirectory); assert.equal(process.env.TMP, initializationDirectory); assert.equal(process.env.TEMP, initializationDirectory);
  const fixturePassword = path.join(initializationDirectory, "pg-password-fixture");
  fs.writeFileSync(fixturePassword, "FICTITIOUS_DATABASE_PASSWORD");
  if (process.platform !== "win32") assert.equal(fs.statSync(fixturePassword).mode & 0o777, 0o600);
  throw new Error("fixture initdb failed before the dependency could remove its password file");
}));
assert.equal(fs.existsSync(initializationDirectory), false, "a failed init must remove only its own temporary password directory");
assert.deepEqual([process.env.TMPDIR, process.env.TMP, process.env.TEMP], originalTemporary); assert.equal(process.umask(), originalMask);
assert.equal(await withPrivatePostgresTemp(tmp, async () => 42), 42, "a failed initialization must release its temporary environment scope");

const identityRoot = fs.mkdtempSync(path.join(os.tmpdir(), "lexopen-build-identity-"));
fs.mkdirSync(path.join(identityRoot, ".next"));
fs.writeFileSync(path.join(identityRoot, ".next", "BUILD_ID"), "fixture-build");
fs.writeFileSync(path.join(identityRoot, "lexopen-release.json"), JSON.stringify({ buildId: "fixture-build", sourceRevision: "a".repeat(40) }));
assert.deepEqual(readHostBuildIdentity(identityRoot), { buildId: "fixture-build", sourceRevision: "a".repeat(40) });
fs.writeFileSync(path.join(identityRoot, ".next", "BUILD_ID"), "other-build");
assert.throws(() => readHostBuildIdentity(identityRoot), /compilación/);
fs.rmSync(identityRoot, { recursive: true });

const pristine = path.join(tmp, "not-created");
assert.equal(previewAppVersion("2.0.0", pristine).firstRun, true);
assert.equal(fs.existsSync(pristine), false, "version preview must never create or write the Host data directory");
const originalEnvironment = { ...process.env };
try {
  for (const failure of ["migration", "health", null, "stop"]) {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lexopen-startup-version-"));
    const state = { lastAppVersion: "1.0.0", lastAppliedAt: "fixture-original" };
    fs.writeFileSync(path.join(dataDir, "app-state.json"), JSON.stringify(state));
    process.env.LEXOPEN_APP_VERSION = "2.0.0"; process.env.LEXOPEN_PACKAGED = "0";
    let databaseStops = 0, serverStops = 0;
    const lifecycle = {
      buildIdentity: { buildId: "fixture-build", sourceRevision: "a".repeat(40) },
      assertPortAvailable: async () => undefined,
      startEmbeddedPostgres: async () => ({ stop: async () => { databaseStops++; if (failure === "stop") throw new Error("fixture PostgreSQL stop failed"); } }),
      migrate: async () => { if (failure === "migration") throw new Error("fixture migration failure"); },
      maybeSeed: async () => undefined,
      startNextServer: () => ({ fixture: true }),
      waitForHealth: async (_url, identity) => {
        assert.equal(identity.buildId, "fixture-build");
        assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dataDir, "app-state.json"), "utf8")), state, "health must precede the durable version commit");
        return { ok: failure !== "health", needsSetup: false };
      },
      stopChild: async child => { if (child) serverStops++; },
      assertHostStopped: async () => undefined,
      startSchedulers: async () => ({ stop() {} }),
    };
    if (failure === "migration" || failure === "health") {
      await assert.rejects(startHost({ dataDir, port: 3149, pgPort: 55449 }, lifecycle));
      assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dataDir, "app-state.json"), "utf8")), state, "failed migration/health must never mark a new version applied");
      assert.equal(databaseStops, 1); assert.equal(serverStops, failure === "health" ? 1 : 0);
    } else {
      const handle = await startHost({ dataDir, port: 3149, pgPort: 55449 }, lifecycle);
      assert.equal(JSON.parse(fs.readFileSync(path.join(dataDir, "app-state.json"), "utf8")).lastAppVersion, "2.0.0");
      assert.equal(handle.buildId, "fixture-build");
      if (failure === "stop") await assert.rejects(handle.stop(), /parada completa/);
      else await handle.stop();
      assert.equal(databaseStops, 1); assert.equal(serverStops, 1);
    }
    fs.rmSync(dataDir, { recursive: true });
    for (const key of Object.keys(process.env)) if (!(key in originalEnvironment)) delete process.env[key];
    Object.assign(process.env, originalEnvironment);
  }
} finally {
  for (const key of Object.keys(process.env)) if (!(key in originalEnvironment)) delete process.env[key];
  Object.assign(process.env, originalEnvironment);
}
fs.rmSync(tmp, { recursive: true }); fs.rmSync(cloneRoot, { recursive: true });

const signals = [], delayed = new EventEmitter(); Object.assign(delayed, { exitCode: null, signalCode: null, killed: false, pid: 12345 });
let confirmed = false;
const stopDelayed = stopChild(delayed, { graceMs: 10, forceMs: 50, signalProcess: (child, signal) => { signals.push(signal); child.killed = true; if (signal === "SIGKILL") setTimeout(() => { child.signalCode = "SIGKILL"; child.emit("exit", null, "SIGKILL"); }, 5); } }).then(() => { confirmed = true; });
await new Promise(resolve => setTimeout(resolve, 2)); assert.equal(confirmed, false, "a sent signal/killed flag is not an observed process exit");
await stopDelayed; assert.deepEqual(signals, ["SIGTERM", "SIGKILL"]);
const stubborn = new EventEmitter(); Object.assign(stubborn, { exitCode: null, signalCode: null, killed: true, pid: 12345 });
await assert.rejects(stopChild(stubborn, { graceMs: 5, forceMs: 5, signalProcess: () => {} }), /no confirmó su salida/);
const stopFixture = fs.mkdtempSync(path.join(os.tmpdir(), "lexopen-stop-proof-"));
try {
  fs.mkdirSync(path.join(stopFixture, "pgdata")); fs.writeFileSync(path.join(stopFixture, "pgdata", "postmaster.pid"), "987654");
  await assert.rejects(assertHostStopped({ dataDir: stopFixture, port: 3149, pgPort: 55449 }, { processAlive: () => true, portListening: async () => false }), /PostgreSQL sigue activo/);
  await assert.rejects(assertHostStopped({ dataDir: stopFixture, port: 3149, pgPort: 55449 }, { processAlive: () => false, portListening: async port => port === 55449 }), /sigue escuchando/);
  await assertHostStopped({ dataDir: stopFixture, port: 3149, pgPort: 55449 }, { processAlive: () => false, portListening: async () => false });
} finally { fs.rmSync(stopFixture, { recursive: true }); }

console.log("desktop/host-runtime.test.mjs OK");
