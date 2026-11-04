import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const option = name => { const index = process.argv.indexOf(name); return index > 1 ? process.argv[index + 1] : undefined; };
assert(option("--app"), "--app must identify a newly built application directory");
const appOut = path.resolve(option("--app"));
const platform = option("--platform") || process.platform;
const arch = option("--arch") || process.arch;
assert.equal(platform, process.platform, "Packaged smoke must run on the target platform");
assert.equal(arch, process.arch, "Packaged smoke must run on the target architecture");
const application = platform === "darwin" ? (appOut.endsWith(".app") ? appOut : path.join(appOut, "LexOpen.app")) : appOut;
const resources = platform === "darwin" ? path.join(application, "Contents", "Resources") : path.join(application, "resources");
const executable = platform === "darwin" ? path.join(application, "Contents", "MacOS", "lexopen") : path.join(application, platform === "win32" ? "lexopen.exe" : "lexopen");
const runner = path.join(resources, "app-standalone", "scripts", "host-smoke-runner.mjs");
await fs.access(executable); await fs.access(runner);
const freePort = () => new Promise((resolve, reject) => { const server = net.createServer(); server.once("error", reject); server.listen(0, "127.0.0.1", () => { const port = server.address().port; server.close(error => error ? reject(error) : resolve(port)); }); });
const port = await freePort(); let pgPort = await freePort(); while (pgPort === port) pgPort = await freePort();
const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "lexopen-desktop-smoke-datos & revisión-"));
await fs.chmod(dataDir, 0o700);
const nonce = crypto.randomBytes(24).toString("hex");
await fs.writeFile(path.join(dataDir, ".lexopen-smoke-owned"), JSON.stringify({ nonce }), { mode: 0o600 });
const env = Object.fromEntries(["HOME", "USERPROFILE", "SystemRoot", "WINDIR", "COMSPEC", "TEMP", "TMP", "TMPDIR", "LANG", "LC_ALL", "DISPLAY", "XAUTHORITY"].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
Object.assign(env, {
  PATH: platform === "win32" ? `${process.env.SystemRoot || "C:\\Windows"}\\System32` : "/usr/bin:/bin:/usr/sbin:/sbin",
  ELECTRON_RUN_AS_NODE: "1", LEXOPEN_PACKAGED: "1", NODE_ENV: "production", LEXOPEN_DATA_DIR: dataDir,
  CHECKPOINT_DISABLE: "1", PRISMA_HIDE_UPDATE_MESSAGE: "1",
  LEXOPEN_APP_ROOT: path.join(resources, "app-standalone"), LEXOPEN_PRISMA_ROOT: path.join(resources, "prisma"),
  LEXOPEN_DESKTOP: "1", LEXOPEN_DESKTOP_MODE: "host", LEXOPEN_PG_PORT: String(pgPort), PORT: String(port),
  PJUD_PUBLIC_SCRAPE: "0", PJUD_CLAVEUNICA_SCRAPE: "0", PJUD_MANUAL_SESSION: "0", PJUD_DOC_DOWNLOADS: "0", PJUD_PDF_BACKUP: "0", PJUD_AUTO_CONFIRM_PROMPTS: "0", PJUD_CAPTCHA_AUTO_SOLVE: "0",
  MAIL_SYNC_INTERVAL_MINUTES: "0", PJUD_SYNC_INTERVAL_MINUTES: "0", PJUD_MIS_CAUSAS_SYNC_INTERVAL_MINUTES: "0", PJUD_DIGEST_INTERVAL_MINUTES: "0", PLAZOS_ALERTAS_INTERVAL_MINUTES: "0", UF_SYNC_INTERVAL_MINUTES: "0", NOTIFY_WORKER_INTERVAL_SECONDS: "0", LEXOPEN_BACKUP_INTERVAL_HOURS: "0",
  CODEX_DATA_DIR: path.join(dataDir, "disabled-codex"), CODEX_BIN: path.join(dataDir, "not-installed"),
});
let child;
let timedOut = false;
let report = null;
let output = "";
const assertPortClosed = async port => {
  for (let attempt = 0; attempt < 50; attempt++) {
    const state = await new Promise(resolve => {
      const socket = net.connect({ host: "127.0.0.1", port });
      socket.setTimeout(300);
      socket.once("connect", () => { socket.destroy(); resolve("open"); });
      socket.once("error", error => { socket.destroy(); resolve(error.code === "ECONNREFUSED" ? "closed" : "unknown"); });
      socket.once("timeout", () => { socket.destroy(); resolve("unknown"); });
    });
    if (state === "closed") return;
    if (state === "unknown") throw new Error("Cannot confirm temporary service shutdown");
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("Temporary service remains active; data directory preserved");
};
try {
  const result = await new Promise((resolve, reject) => {
    child = spawn(executable, [runner, "--data", dataDir, "--nonce", nonce, "--resources", resources, "--port", String(port), "--pg-port", String(pgPort)], { cwd: dataDir, env, shell: false, detached: platform !== "win32", stdio: ["ignore", "pipe", "pipe"] });
    const collect = chunk => { output = (output + chunk.toString()).slice(-60000); };
    child.stdout.on("data", collect); child.stderr.on("data", collect);
    let forceTimer;
    const timer = setTimeout(() => {
      timedOut = true;
      if (platform === "win32") spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore", shell: false });
      else { try { process.kill(-child.pid, "SIGTERM"); } catch {} }
      forceTimer = setTimeout(() => { if (platform !== "win32") { try { process.kill(-child.pid, "SIGKILL"); } catch {} } }, 15000);
      forceTimer.unref();
    }, 300000);
    timer.unref();
    child.once("error", error => { clearTimeout(timer); clearTimeout(forceTimer); reject(error); });
    child.once("exit", (code, signal) => { clearTimeout(timer); clearTimeout(forceTimer); resolve({ code, signal }); });
  });
  const line = output.split(/\r?\n/).findLast(value => value.startsWith("LEXOPEN_DESKTOP_SMOKE "));
  if (line) report = JSON.parse(line.slice("LEXOPEN_DESKTOP_SMOKE ".length));
  if (timedOut || result.code !== 0 || !report) {
    // Never print data-dir .env, bootstrap tokens or raw server logs.
    throw new Error(`Packaged Host smoke failed (${timedOut ? "timeout" : result.code ?? result.signal}); no completion report.`);
  }
  assert.equal(report.platform, platform); assert.equal(report.arch, arch);
} finally {
  if (child?.pid && child.exitCode === null && child.signalCode === null) {
    await new Promise(resolve => {
      const timeout = setTimeout(resolve, 15000);
      child.once("exit", () => { clearTimeout(timeout); resolve(); });
      child.kill("SIGTERM");
    });
    assert(child.exitCode !== null || child.signalCode !== null, "Temporary Host must stop before cleanup");
  }
  const marker = JSON.parse(await fs.readFile(path.join(dataDir, ".lexopen-smoke-owned"), "utf8"));
  assert.equal(marker.nonce, nonce);
  await assertPortClosed(port); await assertPortClosed(pgPort);
  await assert.rejects(fs.lstat(path.join(dataDir, "pgdata", "postmaster.pid")), error => error.code === "ENOENT", "Temporary PostgreSQL must stop before its directory is removed");
  await fs.rm(dataDir, { recursive: true, force: true });
}
const file = path.resolve("desktop/dist", `lexopen-smoke-${platform}-${arch}.json`);
await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report));
