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
  loadBundledOAuthProfile,
  preferEnvFileKeys,
  setupPendingMessage,
  validateHostPorts,
  previewAppVersion,
  readHostBuildIdentity,
  embeddedDatabasePort,
  toolUsesShell,
  startHost,
  startEmbeddedPostgres,
  classifyPostgresDiagnostic,
  createWindowsPostgresController,
  windowsPostgresEnvironment,
  executePostgresControl,
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
  "DATABASE_URL=postgresql://lexopen:host@127.0.0.1:54329/lexopen\nSESSION_SECRET=host-secret-value-ok\nPORT=3011\nAPP_URL=http://127.0.0.1:3011\nALTAZOR_GOOGLE_CLIENT_ID=host-google-client\nALTAZOR_GOOGLE_CLIENT_SECRET=host-google-fixture\nALTAZOR_GITHUB_CLIENT_ID=host-github-client\nALTAZOR_GITHUB_CLIENT_SECRET=host-github-fixture\n",
  "utf8"
);
const identityEnv = {
  DATABASE_URL: "postgresql://lexopen:lexopen@127.0.0.1:5432/lexopen_e2e",
  SESSION_SECRET: "shell-secret",
  PORT: "3000",
  APP_URL: "https://unrelated.invalid",
  ALTAZOR_GOOGLE_CLIENT_ID: "shell-google-client",
  ALTAZOR_GOOGLE_CLIENT_SECRET: "shell-google-fixture",
  ALTAZOR_GITHUB_CLIENT_ID: "shell-github-client",
  ALTAZOR_GITHUB_CLIENT_SECRET: "shell-github-fixture",
};
preferEnvFileKeys(identityFile, undefined, identityEnv);
assert.equal(
  identityEnv.DATABASE_URL,
  "postgresql://lexopen:host@127.0.0.1:54329/lexopen"
);
assert.equal(identityEnv.SESSION_SECRET, "host-secret-value-ok");
assert.equal(identityEnv.PORT, "3011");
assert.equal(identityEnv.APP_URL, "http://127.0.0.1:3011");
for (const provider of ["GOOGLE", "GITHUB"]) {
  assert.equal(identityEnv[`ALTAZOR_${provider}_CLIENT_ID`], `host-${provider.toLowerCase()}-client`);
  assert.equal(identityEnv[`ALTAZOR_${provider}_CLIENT_SECRET`], `host-${provider.toLowerCase()}-fixture`);
}

// A public release identity fills an empty Host without replacing saved setup.
const publicOAuth = { schemaVersion: 1, github: { type: "device", client_id: "fixturePublicClient123" } };
const publicOAuthResources = path.join(tmp, "public-oauth-resources");
fs.mkdirSync(publicOAuthResources);
fs.writeFileSync(path.join(publicOAuthResources, "oauth-clients.json"), JSON.stringify(publicOAuth));
const publicOAuthEnvironment = { ALTAZOR_GOOGLE_CLIENT_SECRET: "keep-operator-fixture" };
assert.deepEqual(loadBundledOAuthProfile(publicOAuthResources, publicOAuthEnvironment), publicOAuth);
assert.equal(publicOAuthEnvironment.ALTAZOR_DISTRIBUTED_OAUTH, JSON.stringify(publicOAuth));
assert.equal(publicOAuthEnvironment.ALTAZOR_GOOGLE_CLIENT_SECRET, "keep-operator-fixture");
const savedOAuthIdentity = path.join(tmp, "saved-public-profile.env");
fs.writeFileSync(savedOAuthIdentity, "ALTAZOR_DISTRIBUTED_OAUTH=" + JSON.stringify(publicOAuth) + "\n");
const savedPublicEnvironment = { ALTAZOR_DISTRIBUTED_OAUTH: "invalid-parent-fixture" };
preferEnvFileKeys(savedOAuthIdentity, undefined, savedPublicEnvironment);
assert.deepEqual(loadBundledOAuthProfile(publicOAuthResources, savedPublicEnvironment), publicOAuth);
assert.equal(loadBundledOAuthProfile(null, {}), null);
assert.equal(loadBundledOAuthProfile(path.join(tmp, "no-public-profile"), {}), null);

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

for (const [value, expected] of [
  ["initdb: error: invalid locale name en_US.UTF-8", "INVALID_LOCALE"],
  ["FATAL: access is denied", "ACCESS_DENIED"],
  [Object.assign(new Error("fixture"), { code: "EACCES" }), "ACCESS_DENIED"],
  ["VCRUNTIME140.dll missing", "DLL_MISSING"],
  ["The specified module could not be found", "DLL_MISSING"],
  [Object.assign(new Error("fixture"), { code: "ERR_MODULE_NOT_FOUND" }), "BINARY_LOOKUP"],
  ["Cannot find package @embedded-postgres/windows-x64", "BINARY_LOOKUP"],
  ["database locale is en_US.UTF-8", "UNKNOWN"],
  [undefined, "UNKNOWN"],
]) assert.equal(classifyPostgresDiagnostic(value), expected);

// Neither onLog nor onError forwards raw dependency text to the console.
const diagnosticFixture = fs.mkdtempSync(path.join(os.tmpdir(), "lexopen-pg-diagnostic-"));
const privateFixture = "FICTITIOUS_SECRET:/private/fixture-only-data";
const consoleOutput = [], originalLog = console.log, originalWarn = console.warn, originalError = console.error;
try {
  console.log = console.warn = console.error = (...args) => { consoleOutput.push(args.join(" ")); };
  class FakePostgres {
    constructor(options) { this.options = options; }
    async initialise() { this.options.onLog(privateFixture); this.options.onError(new Error(privateFixture)); }
    async start() { this.options.onLog(privateFixture); }
    async createDatabase() {}
  }
  await startEmbeddedPostgres(diagnosticFixture, 55449, "postgresql://lexopen:fixture@127.0.0.1:55449/lexopen", { EmbeddedPostgres: FakePostgres });
  assert.deepEqual(consoleOutput, [], "PostgreSQL output must only update in-memory diagnostic enums");
} finally {
  console.log = originalLog; console.warn = originalWarn; console.error = originalError;
  fs.rmSync(diagnosticFixture, { recursive: true, force: true });
}

const winOsEnv = { SystemRoot: "C:\\Windows", ComSpec: "C:\\Windows\\System32\\cmd.exe", TEMP: "C:\\Temp", PATH: "C:\\external-tools", DATABASE_URL: privateFixture, PGPASSWORD: privateFixture, OPENAI_API_KEY: privateFixture, NODE_OPTIONS: privateFixture };
const winChildEnv = windowsPostgresEnvironment("C:\\LexOpen & revisión\\bin", winOsEnv);
assert.equal(winChildEnv.COMSPEC, winOsEnv.ComSpec);
assert.equal(winChildEnv.LC_MESSAGES, "en_US.UTF-8");
assert.equal(winChildEnv.PATH, "C:\\LexOpen & revisión\\bin;C:\\Windows\\System32;C:\\Windows");
assert(!JSON.stringify(winChildEnv).includes(privateFixture));
assert(!winChildEnv.PATH.includes("external-tools"));

// A live descendant must not hold a controller's completion open via pipes.
const inheritedHandleFixture = fs.mkdtempSync(path.join(os.tmpdir(), "lexopen-control-pipes-"));
const releaseDescendant = path.join(inheritedHandleFixture, "release"), descendantDone = path.join(inheritedHandleFixture, "done");
const descendantSource = `const fs=require('node:fs');setInterval(()=>{if(fs.existsSync(${JSON.stringify(releaseDescendant)})){fs.writeFileSync(${JSON.stringify(descendantDone)},'done');process.exit(0)}},20);setTimeout(()=>process.exit(0),5000);`;
const parentSource = `const {spawn}=require('node:child_process');const child=spawn(process.execPath,['-e',${JSON.stringify(descendantSource)}],{stdio:'inherit',detached:true});child.unref();`;
try {
  await executePostgresControl(process.execPath, ["-e", parentSource], { env: process.env, timeout: 2000 });
  assert.equal(fs.existsSync(descendantDone), false, "completion must follow parent EXIT while its descendant is still waiting");
} finally {
  fs.writeFileSync(releaseDescendant, "release");
  for (let attempt = 0; attempt < 150 && !fs.existsSync(descendantDone); attempt++) await new Promise(resolve => setTimeout(resolve, 20));
  fs.rmSync(inheritedHandleFixture, { recursive: true, force: true });
}
const controllerProcess = new EventEmitter();
let killed = false, exitObserved = false;
controllerProcess.kill = () => { killed = true; setTimeout(() => { exitObserved = true; controllerProcess.emit("exit", null, "SIGTERM"); }, 5); };
await assert.rejects(executePostgresControl("fixture", [], { timeout: 5 }, { killGraceMs: 50, spawnProcess: (_binary, _args, options) => {
  assert.equal(options.stdio, "ignore"); assert.equal(options.shell, false); return controllerProcess;
} }), error => error.code === "ETIMEDOUT" && exitObserved);
assert.equal(killed, true);
const unconfirmedProcess = new EventEmitter(); unconfirmedProcess.kill = () => {};
await assert.rejects(executePostgresControl("fixture", [], { timeout: 5 }, { killGraceMs: 5, spawnProcess: () => unconfirmedProcess }), error => error.code === "ETIMEDOUT" && error.controllerExitUnconfirmed === true);

function windowsControllerFixture() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lexopen-pgctl-á & revisión-"));
  const databaseDir = path.join(dataDir, "pgdata"), pgCtl = path.join(dataDir, "bin & á", "pg_ctl.exe"), calls = [];
  fs.mkdirSync(databaseDir); fs.mkdirSync(path.dirname(pgCtl)); fs.writeFileSync(pgCtl, "fictitious executable, never run");
  let live = false;
  const behavior = { failStart: false, failStop: false, stopLeavesLive: false };
  const execute = async (binary, args, options) => {
    calls.push({ binary, args, options });
    assert.equal(binary, pgCtl); assert.equal(options.shell, false); assert.equal(options.windowsHide, true);
    assert(!JSON.stringify(options.env).includes(privateFixture));
    assert.equal(args[args.indexOf("-D") + 1], databaseDir);
    assert(["start", "stop"].includes(args[0]), "never invoke a shell or taskkill");
    if (args[0] === "start") {
      live = true; fs.writeFileSync(path.join(databaseDir, "postmaster.pid"), "987654\n");
      assert.equal(args[args.indexOf("-o") + 1], "-p 55449 -h 127.0.0.1");
      assert.equal(args[args.indexOf("-l") + 1], path.join(dataDir, "postgres-server.log"));
      if (behavior.failStart) throw Object.assign(new Error(privateFixture), { stderr: `Access is denied ${privateFixture}` });
    } else {
      if (behavior.failStop) throw new Error(privateFixture);
      if (!behavior.stopLeavesLive) { live = false; fs.rmSync(path.join(databaseDir, "postmaster.pid"), { force: true }); }
    }
    return { stdout: "", stderr: "" };
  };
  const probes = { processAlive: () => live, portListening: async () => live };
  const controller = createWindowsPostgresController({ dataDir, pgPort: 55449, pgCtl, execute, probes, env: winOsEnv });
  return { dataDir, pgCtl, execute, probes, behavior, calls, controller, cleanup: () => fs.rmSync(dataDir, { recursive: true, force: true }) };
}

const winNormal = windowsControllerFixture();
try {
  await winNormal.controller.stop(); assert.equal(winNormal.calls.length, 0);
  await Promise.all([winNormal.controller.start(), winNormal.controller.start()]); assert.equal(winNormal.calls.length, 1);
  assert.equal(winNormal.calls[0].args[winNormal.calls[0].args.indexOf("-t") + 1], "30");
  if (process.platform !== "win32") assert.equal(fs.statSync(path.join(winNormal.dataDir, "postgres-server.log")).mode & 0o777, 0o600);
  await Promise.all([winNormal.controller.stop(), winNormal.controller.stop()]); assert.equal(winNormal.calls.length, 2);
  assert.deepEqual(winNormal.calls[1].args.slice(-5), ["-m", "fast", "-w", "-t", "20"]);
  await winNormal.controller.start(); await winNormal.controller.stop(); assert.equal(winNormal.calls.length, 4);
} finally { winNormal.cleanup(); }

const winPartial = windowsControllerFixture();
try {
  winPartial.behavior.failStart = true;
  await assert.rejects(winPartial.controller.start(), error => error.code === "PG_START_ACCESS_DENIED" && !String(error).includes(privateFixture));
  assert.deepEqual(winPartial.calls.map(call => call.args[0]), ["start", "stop"], "failed startup must clean a daemon left by pg_ctl");
  winPartial.behavior.failStart = false;
  await winPartial.controller.start();
  winPartial.behavior.failStop = true;
  await assert.rejects(winPartial.controller.stop(), error => error.code === "PG_STOP_UNKNOWN");
  const callsAfterStopFailure = winPartial.calls.length;
  await assert.rejects(winPartial.controller.start(), error => error.code === "PG_START_UNKNOWN");
  assert.equal(winPartial.calls.length, callsAfterStopFailure, "failed stop cannot be reported as running or allow a new start");
  winPartial.behavior.failStop = false; await winPartial.controller.stop();
} finally { winPartial.cleanup(); }

const winFalseStop = windowsControllerFixture();
try {
  await winFalseStop.controller.start(); winFalseStop.behavior.stopLeavesLive = true;
  await assert.rejects(winFalseStop.controller.stop(), error => error.code === "PG_STOP_UNKNOWN");
  winFalseStop.behavior.stopLeavesLive = false; await winFalseStop.controller.stop();
} finally { winFalseStop.cleanup(); }

const winAbsent = windowsControllerFixture();
try {
  let attempts = 0;
  const absent = createWindowsPostgresController({ dataDir: winAbsent.dataDir, pgPort: 55449, pgCtl: winAbsent.pgCtl, probes: winAbsent.probes, execute: async () => { attempts++; throw Object.assign(new Error(privateFixture), { code: "ENOENT" }); } });
  await assert.rejects(absent.start(), error => error.code === "PG_START_BINARY_LOOKUP" && !error.cleanupFailed);
  await assert.rejects(absent.start(), error => error.code === "PG_START_BINARY_LOOKUP");
  assert.equal(attempts, 2, "a proven absent daemon must allow an explicit retry");
} finally { winAbsent.cleanup(); }

const winVendor = windowsControllerFixture();
try {
  let initialized = 0, created = 0;
  class FakeWindowsPostgres {
    async initialise() { initialized++; }
    async start() { throw new Error("must use official pg_ctl rather than direct postgres"); }
    async stop() { throw new Error("must use official pg_ctl rather than taskkill"); }
    async createDatabase(name) { assert.equal(name, "lexopen"); created++; }
    getPgClient() { return "vendor client preserved"; }
  }
  const pg = await startEmbeddedPostgres(winVendor.dataDir, 55449, "postgresql://lexopen:fixture@127.0.0.1:55449/lexopen", { EmbeddedPostgres: FakeWindowsPostgres, platform: "win32", pgCtl: winVendor.pgCtl, executePgCtl: winVendor.execute, pgCtlProbes: winVendor.probes, pgCtlEnv: winOsEnv });
  assert.equal(initialized, 1); assert.equal(created, 1); assert.equal(pg.getPgClient(), "vendor client preserved");
  await pg.stop();
} finally { winVendor.cleanup(); }
assert.throws(() => createWindowsPostgresController({ dataDir: "relative", pgPort: "55449 & command", pgCtl: "relative" }), error => error.code === "PG_START_BINARY_LOOKUP");

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
  const failureCodes = { "pg-init": "PG_INIT_INVALID_LOCALE", "pg-start": "PG_START_DLL_MISSING", "pg-undefined": "PG_START_UNKNOWN", migration: "MIGRATION", "next-start": "NEXT_START", "next-async": "NEXT_START", health: "HEALTH", "health-undefined": "HEALTH" };
  for (const failure of [...Object.keys(failureCodes), null, "stop"]) {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lexopen-startup-version-"));
    const state = { lastAppVersion: "1.0.0", lastAppliedAt: "fixture-original" };
    fs.writeFileSync(path.join(dataDir, "app-state.json"), JSON.stringify(state));
    process.env.LEXOPEN_APP_VERSION = "2.0.0"; process.env.LEXOPEN_PACKAGED = "0";
    let databaseStops = 0, serverStops = 0;
    const lifecycle = {
      buildIdentity: { buildId: "fixture-build", sourceRevision: "a".repeat(40) },
      assertPortAvailable: async () => undefined,
      startEmbeddedPostgres: async (directory, pgPort, databaseUrl) => {
        if (failure === "pg-undefined") return Promise.reject(undefined);
        if (failure === "pg-init" || failure === "pg-start") {
          class FakePostgres {
            constructor(options) { this.options = options; }
            async initialise() {
              if (failure === "pg-init") { this.options.onLog(`invalid locale name ${privateFixture}`); return Promise.reject(undefined); }
            }
            async start() { this.options.onError(`VCRUNTIME140.dll missing ${privateFixture}`); return Promise.reject(undefined); }
          }
          return startEmbeddedPostgres(directory, pgPort, databaseUrl, { EmbeddedPostgres: FakePostgres });
        }
        return { stop: async () => { databaseStops++; if (failure === "stop") throw new Error("fixture PostgreSQL stop failed"); } };
      },
      migrate: async () => { if (failure === "migration") return Promise.reject(undefined); },
      maybeSeed: async () => undefined,
      startNextServer: () => {
        if (failure === "next-start") throw new Error(privateFixture);
        if (failure === "next-async") {
          const started = new EventEmitter();
          queueMicrotask(() => started.emit("error", new Error(privateFixture)));
          return started;
        }
        return { fixture: true };
      },
      waitForHealth: async (_url, identity) => {
        assert.equal(identity.buildId, "fixture-build");
        assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dataDir, "app-state.json"), "utf8")), state, "health must precede the durable version commit");
        if (failure === "health-undefined") return Promise.reject(undefined);
        return { ok: failure !== "health", needsSetup: false };
      },
      stopChild: async child => { if (child) serverStops++; },
      assertHostStopped: async () => undefined,
      startSchedulers: async () => ({ stop() {} }),
    };
    if (failureCodes[failure]) {
      await assert.rejects(startHost({ dataDir, port: 3149, pgPort: 55449 }, lifecycle), error => {
        assert.equal(error.code, failureCodes[failure], "the exact safe stage must reach the caller, even for undefined rejections");
        assert(!`${error}\n${JSON.stringify(error)}`.includes(privateFixture));
        assert.equal(error.cause, undefined, "raw dependency errors must never be retained in a cause chain");
        return true;
      });
      assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dataDir, "app-state.json"), "utf8")), state, "failed migration/health must never mark a new version applied");
      assert.equal(databaseStops, failure.startsWith("pg-") ? 0 : 1); assert.equal(serverStops, failure.startsWith("health") || failure === "next-async" ? 1 : 0);
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
