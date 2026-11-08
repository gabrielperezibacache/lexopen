/** Real coordinator/process/Git/npm/HTTP flow; the Host and migration payload are synthetic. */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { stopChild } from "../desktop/host-runtime.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "lexopen web host integration-")));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const inheritedEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(LEXOPEN_|FIXTURE_)/.test(key) && !["DATABASE_URL", "PORT"].includes(key)));
const cleanEnv = { ...inheritedEnv, GIT_CONFIG_GLOBAL: os.devNull, GIT_CONFIG_NOSYSTEM: "1", GIT_TERMINAL_PROMPT: "0", npm_config_audit: "false", npm_config_fund: "false", npm_config_offline: "true" };
const write = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value); };
const json = (file, value) => write(file, `${JSON.stringify(value, null, 2)}\n`);
const readJson = file => { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; } };
function command(cwd, cmd, args) {
  const result = spawnSync(cmd, args, { cwd, env: cleanEnv, shell: process.platform === "win32" && cmd === npm, encoding: "utf8", timeout: 30_000 });
  assert.equal(result.status, 0, `${cmd} ${args.join(" ")} failed: ${result.error?.message || result.stderr}`);
  return result.stdout.trim();
}
const git = (cwd, args) => command(cwd, "git", args);
async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
async function until(get, description, timeout = 35_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const result = await get();
    if (result) return result;
    await delay(50);
  }
  throw new Error(`Timed out: ${description}`);
}
async function health(url) {
  try { const response = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(500), redirect: "error" }); return response.ok ? await response.json() : null; }
  catch { return null; }
}

// Only the payload is substituted. Coordination, owned locks, subprocess stop
// checks, actual TCP listeners, source updates, npm installs and backups are real.
function hostFixtureSource() {
  return `
export { stopChild, assertHostStopped, readPostgresPid, embeddedDatabasePort } from ${JSON.stringify(pathToFileURL(path.join(root, "desktop/host-runtime.mjs")).href)};
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import net from "node:net";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dataDir = process.env.LEXOPEN_DATA_DIR;
  const env = Object.fromEntries(fs.readFileSync(path.join(dataDir, ".env"), "utf8").trim().split(/\\r?\\n/).map(line => { const i = line.indexOf("="); return [line.slice(0, i), line.slice(i + 1)]; }));
  const port = Number(env.PORT), pgPort = Number(new URL(env.DATABASE_URL).port);
  const version = JSON.parse(fs.readFileSync("package.json", "utf8")).version;
  const append = event => fs.appendFileSync(path.join(dataDir, "events.jsonl"), JSON.stringify({ event, version, pid: process.pid }) + "\\n");
  append("migration");
  const body = { ok: true, version, buildId: fs.readFileSync(".next/BUILD_ID", "utf8").trim(), sourceRevision: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim() };
  if (env.FIXTURE_HEALTH_MISMATCH === "1" && version === "1.0.1") body.buildId = "stale-build";
  const pg = net.createServer(socket => socket.end());
  const server = http.createServer((req, res) => {
    if (req.url === "/api/health") { res.setHeader("content-type", "application/json"); res.end(JSON.stringify(body)); return; }
    if (req.url === "/__request_update" && req.method === "POST") {
      const requestId = randomUUID(), requestedAt = new Date().toISOString();
      const save = (name, value) => fs.writeFileSync(path.join(dataDir, name), JSON.stringify(value));
      save("self-update.lock", { requestId, pid: process.pid, at: requestedAt });
      save("self-update-status.json", { requestId, phase: "queued", ok: false, startedAt: requestedAt });
      save("self-update.request.json", { requestId, requestedAt, pid: process.pid });
      res.end(JSON.stringify({ requestId })); return;
    }
    res.statusCode = 404; res.end();
  });
  const stop = () => { append("stop"); server.close(() => pg.close(() => process.exit(0))); };
  process.on("message", message => { if (message.type === "lexopen:stop") stop(); });
  process.once("SIGTERM", stop);
  pg.listen(pgPort, "127.0.0.1", () => server.listen(port, "127.0.0.1", () => append("ready")));
}
`;
}
async function fixture(name, options = {}) {
  const base = path.join(tmp, name), origin = path.join(base, "origin"), checkout = path.join(base, "checkout"), dataDir = path.join(base, "data");
  fs.mkdirSync(origin, { recursive: true });
  for (const file of ["scripts/web-host.mjs", "scripts/web-self-update.mjs", "scripts/web-backup-scheduler.mjs", "desktop/config.cjs", "desktop/backup.cjs", "desktop/update-policy.cjs"]) write(path.join(origin, file), fs.readFileSync(path.join(root, file)));
  write(path.join(origin, "desktop/host-runtime.mjs"), hostFixtureSource());
  write(path.join(origin, ".gitignore"), "node_modules/\ndesktop/node_modules/\n.next/\n");
  const pkg = { name: "synthetic-update-host", version: "1.0.0", private: true, scripts: { "desktop:build": "node build.mjs" } };
  json(path.join(origin, "package.json"), pkg);
  json(path.join(origin, "package-lock.json"), { name: pkg.name, version: pkg.version, lockfileVersion: 3, packages: { "": pkg } });
  const desktopPkg = { name: "synthetic-update-desktop", version: "1.0.0", private: true, scripts: { postinstall: "node install-fixture.mjs" } };
  json(path.join(origin, "desktop/package.json"), desktopPkg);
  json(path.join(origin, "desktop/package-lock.json"), { name: desktopPkg.name, version: desktopPkg.version, lockfileVersion: 3, packages: { "": { ...desktopPkg, hasInstallScript: true } } });
  write(path.join(origin, "desktop/install-fixture.mjs"), `import fs from "node:fs"; fs.mkdirSync("node_modules/electron", { recursive: true }); fs.mkdirSync("node_modules/embedded-postgres", { recursive: true }); fs.writeFileSync("node_modules/embedded-postgres/package.json", "{}"); fs.writeFileSync("node_modules/electron/install.js", "process.exitCode = 0;\\n");`);
  write(path.join(origin, "build.mjs"), `import fs from "node:fs"; import path from "node:path"; const version = JSON.parse(fs.readFileSync("package.json", "utf8")).version; if (process.env.FIXTURE_FAIL_BUILD === "1") throw new Error("synthetic build failure"); fs.mkdirSync(".next/standalone", { recursive: true }); fs.writeFileSync(".next/BUILD_ID", "fixture-" + version); fs.writeFileSync(".next/standalone/server.js", "// synthetic server marker\\n"); if (process.env.LEXOPEN_DATA_DIR) fs.appendFileSync(path.join(process.env.LEXOPEN_DATA_DIR, "events.jsonl"), JSON.stringify({ event: "build", version }) + "\\n");`);
  git(origin, ["init", "--initial-branch=main"]);
  git(origin, ["config", "user.email", "fixture@example.invalid"]); git(origin, ["config", "user.name", "Fixture"]);
  git(origin, ["add", "."]); git(origin, ["commit", "-m", "fixture baseline"]);
  git(base, ["clone", origin, checkout]);
  const before = git(checkout, ["rev-parse", "HEAD"]);
  json(path.join(origin, "package.json"), { ...pkg, version: "1.0.1" });
  json(path.join(origin, "package-lock.json"), { name: pkg.name, version: "1.0.1", lockfileVersion: 3, packages: { "": { ...pkg, version: "1.0.1" } } });
  git(origin, ["add", "."]); git(origin, ["commit", "-m", "fixture update"]);
  const target = git(origin, ["rev-parse", "HEAD"]);
  command(checkout, process.execPath, ["build.mjs"]);
  command(checkout, npm, ["--prefix", "desktop", "ci"]);
  const port = await freePort(); let pgPort = await freePort();
  while (pgPort === port) pgPort = await freePort();
  write(path.join(dataDir, ".env"), `DATABASE_URL=postgresql://fixture:fixture@127.0.0.1:${pgPort}/fixture_e2e\nPORT=${port}\nSTORAGE_PATH=${path.join(dataDir, "storage")}\nSESSION_SECRET=synthetic-not-a-real-secret\n${options.failBuild ? "FIXTURE_FAIL_BUILD=1\n" : ""}${options.healthMismatch ? "FIXTURE_HEALTH_MISMATCH=1\n" : ""}`);
  write(path.join(dataDir, "pgdata/PG_VERSION"), "17\n");
  write(path.join(dataDir, "pgdata/preserved.txt"), "synthetic database bytes");
  write(path.join(dataDir, "storage/document.txt"), "synthetic preserved document");
  const coordinator = spawn(process.execPath, ["scripts/web-host.mjs"], { cwd: checkout, env: { ...cleanEnv, LEXOPEN_DATA_DIR: dataDir }, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  coordinator.stdout.on("data", chunk => { output += chunk; }); coordinator.stderr.on("data", chunk => { output += chunk; });
  const url = `http://127.0.0.1:${port}`;
  try { await until(() => health(url), "initial Host health"); }
  catch (error) { await stopChild(coordinator); throw new Error(`${error.message}\n${output}`); }
  return { checkout, dataDir, before, target, url, coordinator, output: () => output };
}
async function runScenario(name, options = {}) {
  const f = await fixture(name, options);
  try {
    const initial = await health(f.url);
    assert.equal(initial.version, "1.0.0"); assert.equal(initial.sourceRevision, f.before);
    if (options.dirty) write(path.join(f.checkout, "personal-notes.txt"), "local work must survive");
    const response = await fetch(`${f.url}/__request_update`, { method: "POST" });
    const { requestId } = await response.json();
    let status;
    try { status = await until(() => { const value = readJson(path.join(f.dataDir, "self-update-status.json")); return value?.requestId === requestId && ["done", "failed"].includes(value.phase) ? value : null; }, `${name} terminal receipt`); }
    catch (error) { throw new Error(`${error.message}\n${f.output()}`); }
    if (options.dirty) {
      assert.equal(status.phase, "failed"); assert.equal(status.codeApplied, false); assert.equal(status.recoveryRequired, false);
      await until(async () => (await health(f.url))?.sourceRevision === f.before, "unchanged Host resumes after failed preflight");
      assert.equal(git(f.checkout, ["rev-parse", "HEAD"]), f.before);
      assert.equal(fs.readFileSync(path.join(f.checkout, "personal-notes.txt"), "utf8"), "local work must survive");
      assert.equal(status.backupDirectory, null);
      await until(() => !fs.existsSync(path.join(f.dataDir, "self-update.lock")) && !fs.existsSync(path.join(f.dataDir, "self-update.request.json")), "preflight request cleanup");
      console.log(`web Host integration: ${name} passed (local work preserved and old Host resumed)`);
      return;
    }
    assert.equal(status.codeApplied, true); assert.equal(status.targetRevision, f.target);
    assert.equal(status.backupVerified.verifiedFiles > 0, true);
    assert.equal(fs.readFileSync(path.join(status.backupDirectory, "storage/document.txt"), "utf8"), "synthetic preserved document");
    assert.equal(fs.readFileSync(path.join(status.backupDirectory, "pgdata/preserved.txt"), "utf8"), "synthetic database bytes");
    assert.equal(fs.readFileSync(path.join(f.dataDir, "storage/document.txt"), "utf8"), "synthetic preserved document");
    assert.equal(git(f.checkout, ["status", "--porcelain=v1"]), "");
    assert.equal(git(f.checkout, ["rev-parse", "HEAD"]), f.target);
    const events = fs.readFileSync(path.join(f.dataDir, "events.jsonl"), "utf8").trim().split(/\r?\n/).map(line => JSON.parse(line));
    if (options.failBuild) {
      assert.equal(status.phase, "failed"); assert.equal(status.recoveryRequired, true);
      assert.equal(await health(f.url), null, "a failed build stays stopped and never starts migrations");
      assert.deepEqual(events.filter(event => event.event === "migration").map(event => event.version), ["1.0.0"]);
      // A service manager restarting the coordinator must not bypass recovery
      // and migrate against the new source with the previous server build.
      await stopChild(f.coordinator, { graceMs: 3_000, forceMs: 2_000 });
      const resumed = spawn(process.execPath, ["scripts/web-host.mjs"], { cwd: f.checkout, env: { ...cleanEnv, LEXOPEN_DATA_DIR: f.dataDir }, stdio: "ignore" });
      try {
        await until(() => resumed.exitCode !== null || fs.readFileSync(path.join(f.dataDir, "events.jsonl"), "utf8").includes('"version":"1.0.1"'), "restart respects required recovery");
        assert.equal(resumed.exitCode, 1, "a coordinator restart must refuse an incompletely built update");
        const after = fs.readFileSync(path.join(f.dataDir, "events.jsonl"), "utf8").trim().split(/\r?\n/).map(line => JSON.parse(line));
        assert.deepEqual(after.filter(event => event.event === "migration").map(event => event.version), ["1.0.0"]);
        assert.equal(await health(f.url), null);
      } finally { await stopChild(resumed, { graceMs: 3_000, forceMs: 2_000 }); }
    } else {
      const current = await health(f.url);
      assert.equal(current.version, "1.0.1"); assert.equal(current.sourceRevision, f.target);
      assert.deepEqual(events.filter(event => event.event === "migration").map(event => event.version), ["1.0.0", "1.0.1"]);
      assert.ok(events.findIndex(event => event.event === "build") < events.findIndex(event => event.event === "migration" && event.version === "1.0.1"), "new build precedes restart/migration");
      assert.equal(status.phase, options.healthMismatch ? "failed" : "done");
      assert.equal(status.ok, !options.healthMismatch); assert.equal(status.recoveryRequired, Boolean(options.healthMismatch));
      if (!options.healthMismatch) assert.equal(current.buildId, status.expectedBuildId);
    }
    await until(() => !fs.existsSync(path.join(f.dataDir, "self-update.lock")) && !fs.existsSync(path.join(f.dataDir, "self-update.request.json")), "owned request and lock cleanup");
    console.log(`web Host integration: ${name} passed (real Git, npm, backup, processes and HTTP)`);
  } finally { await stopChild(f.coordinator, { graceMs: 3_000, forceMs: 2_000 }); }
}

try {
  await runScenario("successful");
  await runScenario("dirty-checkout", { dirty: true });
  await runScenario("build-failure", { failBuild: true });
  await runScenario("restart-mismatch", { healthMismatch: true });
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
