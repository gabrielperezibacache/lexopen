/** Windows CI only: exercise the product against new, owned PostgreSQL fixtures. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const script = fileURLToPath(import.meta.url), desktop = path.resolve(path.dirname(script), "..");
const ownedMarker = ".lexopen-native-pg-probe-owned";
const modes = ["product", "direct-vendor", "direct-inherited", "direct-c"];
const paths = { ascii: "ascii", unicode: "datos & revisión" };
const contained = (root, file) => { const relative = path.relative(root, file); return relative && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative); };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export function requireProbeEnvironment(env = process.env, platform = process.platform, arch = process.arch) {
  if (env.CI !== "true" || env.GITHUB_ACTIONS !== "true" || platform !== "win32" || arch !== "x64") throw new Error("Native PostgreSQL probe requires Windows x64 GitHub Actions");
}
export function classifyPgDiagnostic(text = "", exitCode = null) {
  const status = Number.isInteger(exitCode) ? exitCode >>> 0 : null;
  if (status === 0xc0000142) return "WINDOWS_DLL_INITIALIZATION_FAILED";
  if (status === 0xc0000135) return "WINDOWS_DLL_NOT_FOUND";
  if (status === 0xc0000005) return "WINDOWS_ACCESS_VIOLATION";
  if (/execution of postgresql by a user with administrative permissions is not permitted|must be started under an unprivileged user id/i.test(text)) return "ADMINISTRATIVE_PERMISSIONS";
  if (/invalid.*locale|locale.*(?:invalid|not supported|not recognized)|could not (?:set|find).*locale/i.test(text)) return "LOCALE_UNSUPPORTED";
  if (/systemroot|windir|environment variable/i.test(text)) return "WINDOWS_ENVIRONMENT";
  if (/\.dll.*(?:not found|missing)|(?:not found|missing).*\.dll/i.test(text)) return "WINDOWS_DLL_NOT_FOUND";
  if (/not a valid win32|exec format|bad cpu/i.test(text)) return "NATIVE_FORMAT";
  if (/address already in use|could not bind/i.test(text)) return "PORT_IN_USE";
  if (/permission denied|access is denied|access denied/i.test(text)) return "ACCESS_DENIED";
  if (/database system is ready to accept connections/i.test(text)) return "READY";
  if (/success[.!]|you can now start/i.test(text)) return "INITIALIZED";
  return text.trim() ? "UNCLASSIFIED" : "NO_DIAGNOSTIC";
}
export function redactPgDiagnostic(text, { password, roots = [] } = {}) {
  let value = String(text).replace(/\x1b\[[0-9;]*m/g, "").replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
  if (password) value = value.split(password).join("<fixture-password>");
  for (const root of [...roots].sort((a, b) => b.length - a.length)) {
    for (const variant of new Set([root, root.replaceAll("\\", "/"), root.replaceAll("/", "\\")])) {
      value = value.replace(new RegExp(variant.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "<probe-path>");
    }
  }
  return value.replace(/(postgres(?:ql)?:\/\/)[^@\s]+@/gi, "$1<redacted>@").replace(/((?:password|token|secret)\s*[=:]\s*)[^\s,;]+/gi, "$1<redacted>").slice(-1200);
}
export function pgProbeResult(result, output, redaction) {
  return { ...result, ...(!result.ok ? { diagnosticTail: redactPgDiagnostic(output, redaction) } : {}) };
}
function osEnvironment(source = process.env) {
  const env = {};
  const allowed = /^(?:SystemRoot|SystemDrive|WINDIR|PATH|PATHEXT|COMSPEC|TEMP|TMP|TMPDIR|USERPROFILE|HOMEDRIVE|HOMEPATH|APPDATA|LOCALAPPDATA|ALLUSERSPROFILE|ProgramFiles|ProgramFiles\(x86\)|CommonProgramFiles|CommonProgramFiles\(x86\)|PROCESSOR_ARCHITECTURE|NUMBER_OF_PROCESSORS)$/i;
  for (const [key, value] of Object.entries(source)) if (allowed.test(key)) env[key] = value;
  return env;
}
export function directPgSettings(mode, inheritedOsEnv) {
  if (!modes.includes(mode) || mode === "product") throw new Error("Invalid direct PostgreSQL probe mode");
  const locale = mode === "direct-c" ? "C" : "en_US.UTF-8";
  return { env: { ...(mode === "direct-vendor" ? {} : inheritedOsEnv), LC_MESSAGES: locale }, initFlags: mode === "direct-c" ? ["--locale=C", "--lc-messages=C", "--encoding=UTF8"] : ["--lc-messages=en_US.UTF-8"] };
}
function terminateOwnedTree(child) {
  const systemRoot = process.env.SystemRoot || process.env.SYSTEMROOT || process.env.WINDIR || process.env.windir;
  if (!child.pid || !systemRoot || !path.isAbsolute(systemRoot)) { child.kill(); return; }
  const killer = spawn(path.join(systemRoot, "System32", "taskkill.exe"), ["/PID", String(child.pid), "/T", "/F"], { env: osEnvironment(), shell: false, windowsHide: true, stdio: "ignore" });
  killer.once("error", () => child.kill());
}
function execute(command, args, { env, timeout = 20_000 } = {}) {
  return new Promise(resolve => {
    let output = "", timedOut = false;
    const child = spawn(command, args, { env, shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    const collect = chunk => { output = (output + chunk.toString("utf8")).slice(-65_536); };
    child.stdout.on("data", collect); child.stderr.on("data", collect);
    const timer = setTimeout(() => { timedOut = true; terminateOwnedTree(child); }, timeout);
    child.once("error", error => { clearTimeout(timer); resolve({ exitCode: null, diagnostic: error.code || "SPAWN_ERROR", output, timedOut }); });
    child.once("close", code => { clearTimeout(timer); resolve({ exitCode: code, diagnostic: classifyPgDiagnostic(output, code), output, timedOut }); });
  });
}
async function availablePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer(); server.once("error", reject);
    server.listen({ host: "127.0.0.1", port: 0, exclusive: true }, () => { const port = server.address().port; server.close(error => error ? reject(error) : resolve(port)); });
  });
}
async function portOpen(port) {
  return await new Promise(resolve => {
    const socket = net.connect({ host: "127.0.0.1", port });
    const done = value => { socket.destroy(); resolve(value); };
    socket.once("connect", () => done(true)); socket.once("error", () => done(false)); socket.setTimeout(500, () => done(false));
  });
}
function assertOwned(root, nonce, originalTemp) {
  const stat = fs.lstatSync(root), real = fs.realpathSync(root);
  if (stat.isSymbolicLink() || !stat.isDirectory() || !path.basename(root).startsWith("lexopen-native-pg-probe-") || !contained(fs.realpathSync(originalTemp), real)) throw new Error("PostgreSQL probe ownership guard failed");
  if (JSON.parse(fs.readFileSync(path.join(root, ownedMarker), "utf8")).nonce !== nonce) throw new Error("PostgreSQL probe ownership marker mismatch");
}
function fixturePidAlive(directory) {
  const file = path.join(directory, "postmaster.pid");
  if (!fs.existsSync(file)) return false;
  const first = fs.readFileSync(file, "utf8").split(/\r?\n/, 1)[0];
  if (!/^\d+$/.test(first) || Number(first) < 1) return true;
  try { process.kill(Number(first), 0); return true; } catch (error) { return error?.code !== "ESRCH"; }
}
async function stopOwnedCluster(binary, directory, env, root) {
  if (fs.existsSync(directory) && (fs.lstatSync(directory).isSymbolicLink() || !contained(fs.realpathSync(root), fs.realpathSync(directory)))) throw new Error("PostgreSQL probe cluster escaped its owned root");
  if (!fs.existsSync(path.join(directory, "postmaster.pid"))) return true;
  const result = await execute(binary, ["-D", directory, "stop", "-m", "fast", "-w", "-t", "8"], { env, timeout: 10_000 });
  return result.exitCode === 0;
}
async function worker({ root, nonce, originalTemp, mode, pathCase, port }) {
  requireProbeEnvironment(); assertOwned(root, nonce, originalTemp);
  if (!modes.includes(mode) || !Object.hasOwn(paths, pathCase) || !Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid PostgreSQL probe worker input");
  const password = process.env.LEXOPEN_PG_PROBE_PASSWORD;
  if (!/^[a-f0-9]{64}$/.test(password || "")) throw new Error("Missing fictitious probe password");
  const directory = path.join(root, `${mode}-${pathCase}`, paths[pathCase]), data = path.join(directory, "pgdata");
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  let phase = "initialise", postgres, output = "", exitCode = null, diagnostic = "NO_DIAGNOSTIC", ok = false, timedOut = false;
  const binary = await import("@embedded-postgres/windows-x64"), env = osEnvironment();
  try {
    if (mode === "product") {
      const { startEmbeddedPostgres } = await import(pathToFileURL(path.join(desktop, "host-runtime.mjs")).href);
      phase = "product-start";
      await startEmbeddedPostgres(directory, port, `postgresql://lexopen:${password}@127.0.0.1:${port}/lexopen`);
    } else {
      const settings = directPgSettings(mode, env), pwfile = path.join(directory, "fixture-password");
      fs.writeFileSync(pwfile, `${password}\n`, { mode: 0o600 });
      const init = await execute(binary.initdb, [`--pgdata=${data}`, "--auth=password", "--username=lexopen", `--pwfile=${pwfile}`, ...settings.initFlags], { env: settings.env });
      fs.rmSync(pwfile, { force: true }); output = init.output; exitCode = init.exitCode; diagnostic = init.diagnostic; timedOut = init.timedOut;
      if (init.timedOut || init.exitCode !== 0) throw new Error("DIRECT_INIT_FAILED");
      phase = "direct-start";
      output = ""; exitCode = null; diagnostic = "NO_DIAGNOSTIC";
      postgres = spawn(binary.postgres, ["-D", data, "-p", String(port), "-h", "127.0.0.1"], { env: settings.env, shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
      const collect = chunk => { output = (output + chunk.toString("utf8")).slice(-65_536); };
      postgres.stdout.on("data", collect); postgres.stderr.on("data", collect);
      postgres.on("error", error => { diagnostic = error.code || "SPAWN_ERROR"; });
      postgres.on("exit", code => { exitCode = code; diagnostic = classifyPgDiagnostic(output, code); });
      const deadline = Date.now() + 12_000;
      while (!await portOpen(port)) { if (postgres.exitCode !== null || postgres.signalCode || Date.now() > deadline) throw new Error("DIRECT_START_FAILED"); await sleep(100); }
    }
    phase = "connect";
    const { default: pg } = await import("pg");
    const client = new pg.Client({ host: "127.0.0.1", port, user: "lexopen", password, database: "postgres", connectionTimeoutMillis: 4000 });
    try { await client.connect(); await client.query("SELECT 1"); } finally { await client.end(); }
    ok = true; phase = "complete"; diagnostic = "READY";
  } catch (error) {
    if (mode === "product") diagnostic = typeof error?.code === "string" && /^PG_(?:INIT|START)_[A-Z_]+$/.test(error.code) ? error.code : "PRODUCT_UNCLASSIFIED";
    else if (!output && diagnostic === "NO_DIAGNOSTIC") diagnostic = "DIRECT_UNCLASSIFIED";
  } finally {
    // pg.stop may wait forever if the vendor process already emitted exit.
    // Native stop is confined to the exact newly-created fixture cluster.
    await stopOwnedCluster(binary.pg_ctl, data, env, root);
    if (postgres && postgres.exitCode === null && !postgres.signalCode) postgres.kill();
  }
  const result = pgProbeResult({ mode, pathCase, ok, phase, exitCode, diagnostic, timedOut }, output, { password, roots: [root, path.dirname(desktop), originalTemp] });
  process.stdout.write(`LEXOPEN_PG_PROBE_WORKER ${JSON.stringify(result)}\n`);
  process.exit(ok ? 0 : 1);
}
async function probeCase({ root, nonce, originalTemp, mode, pathCase, binary }) {
  assertOwned(root, nonce, originalTemp);
  const port = await availablePort(), password = crypto.randomBytes(32).toString("hex");
  const directory = path.join(root, `${mode}-${pathCase}`, paths[pathCase]), temp = path.join(directory, "temp");
  fs.mkdirSync(temp, { recursive: true, mode: 0o700 });
  const env = { ...osEnvironment(), CI: "true", GITHUB_ACTIONS: "true", TEMP: temp, TMP: temp, TMPDIR: temp, LEXOPEN_PG_PROBE_PASSWORD: password };
  let text = "", timedOut = false;
  const child = spawn(process.execPath, [script, "--worker", JSON.stringify({ root, nonce, originalTemp, mode, pathCase, port })], { env, shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  const collect = chunk => { text = (text + chunk.toString("utf8")).slice(-131_072); };
  child.stdout.on("data", collect); child.stderr.on("data", collect);
  const deadline = setTimeout(() => { timedOut = true; terminateOwnedTree(child); }, 40_000);
  const code = await new Promise(resolve => { child.once("error", () => resolve(null)); child.once("close", resolve); }); clearTimeout(deadline);
  assertOwned(root, nonce, originalTemp);
  await stopOwnedCluster(binary.pg_ctl, path.join(directory, "pgdata"), osEnvironment(), root);
  const closed = !await portOpen(port);
  const pidStopped = !fixturePidAlive(path.join(directory, "pgdata"));
  const line = text.split(/\r?\n/).findLast(value => value.startsWith("LEXOPEN_PG_PROBE_WORKER "));
  let result;
  try { result = JSON.parse(line.slice("LEXOPEN_PG_PROBE_WORKER ".length)); } catch { result = { mode, pathCase, ok: false, phase: "worker", exitCode: code, diagnostic: timedOut ? "WORKER_TIMEOUT" : "WORKER_NO_REPORT" }; }
  if (result.diagnosticTail) result.diagnosticTail = redactPgDiagnostic(result.diagnosticTail, { password, roots: [root, path.dirname(desktop), originalTemp] });
  result.timedOut = Boolean(result.timedOut || timedOut);
  result.cleanupPortClosed = closed; result.cleanupPidStopped = pidStopped; result.ok = result.ok && code === 0 && closed && pidStopped && !result.timedOut;
  console.log(`LEXOPEN_NATIVE_PG_PROBE ${JSON.stringify(result)}`);
  return result;
}
export async function main() {
  requireProbeEnvironment();
  if (process.argv[2] === "--worker") return await worker(JSON.parse(process.argv[3] || "{}"));
  if (process.argv.length > 2) throw new Error("Native PostgreSQL probe takes no arguments");
  const originalTemp = fs.realpathSync(os.tmpdir()), root = fs.mkdtempSync(path.join(originalTemp, "lexopen-native-pg-probe-")), nonce = crypto.randomUUID();
  fs.chmodSync(root, 0o700); fs.writeFileSync(path.join(root, ownedMarker), JSON.stringify({ nonce }), { mode: 0o600 });
  const results = []; let casesCompleted = false;
  try {
    const binary = await import("@embedded-postgres/windows-x64");
    for (const pathCase of Object.keys(paths)) {
      const result = await probeCase({ root, nonce, originalTemp, mode: "product", pathCase, binary }); results.push(result);
      if (!result.ok) for (const mode of modes.slice(1)) results.push(await probeCase({ root, nonce, originalTemp, mode, pathCase, binary }));
    }
    casesCompleted = true;
  } finally {
    assertOwned(root, nonce, originalTemp);
    const cleanupSafe = casesCompleted && results.every(result => result.cleanupPortClosed && result.cleanupPidStopped && !result.timedOut);
    if (cleanupSafe) fs.rmSync(root, { recursive: true, force: true });
    console.log(`LEXOPEN_NATIVE_PG_PROBE_SUMMARY ${JSON.stringify({ productPassed: results.filter(result => result.mode === "product").length === 2 && results.filter(result => result.mode === "product").every(result => result.ok), temporaryArtifactsRemoved: cleanupSafe && !fs.existsSync(root) })}`);
  }
  if (results.filter(result => result.mode === "product").length !== 2 || results.some(result => result.mode === "product" && !result.ok)) process.exitCode = 1;
}
if (process.argv[1] && path.resolve(process.argv[1]) === script) main().catch(() => { console.error("LEXOPEN_NATIVE_PG_PROBE_FAILURE CI_PROBE_GUARD_OR_INTERNAL_FAILURE"); process.exitCode = 1; });
