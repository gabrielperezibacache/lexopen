/** Source Host updates: clean fast-forward, verified backup, pinned dependencies and restart receipt. */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { assertHostStopped, embeddedDatabasePort } from "../desktop/host-runtime.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const { defaultDataDir, parseEnvFile, validateExistingDataDirectory, replaceFileAtomic } = require("../desktop/config.cjs");
const { createDataBackup, validateBackupDirectory, defaultBackupDirectory } = require("../desktop/backup.cjs");
const { verifyBackupContents, assertUpdateVersion, updatePreferences } = require("../desktop/update-policy.cjs");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

export function resolveDataDir(env = process.env) { return path.resolve(env.LEXOPEN_DATA_DIR?.trim() || defaultDataDir()); }
export function statusPath(dataDir) { return path.join(dataDir, "self-update-status.json"); }
export function requestPath(dataDir) { return path.join(dataDir, "self-update.request.json"); }
export function lockPath(dataDir) { return path.join(dataDir, "self-update.lock"); }
export function readEnvFile(file) { return fs.existsSync(file) ? parseEnvFile(fs.readFileSync(file, "utf8")).map : {}; }
export function hostCommandEnv(dataDir, env = process.env) {
  return { ...env, ...readEnvFile(path.join(dataDir, ".env")), LEXOPEN_DATA_DIR: dataDir };
}
export function isUnreachableDatabaseError(message) { return /P1001|Can't reach database server/i.test(String(message || "")); }

/** A running backup may finish with the Host already stopped when its scheduler is stopped. */
export async function stopHostForSelfUpdate({ backupScheduler, getChild, stopHost, assertStopped }) {
  if (backupScheduler) await backupScheduler.stop();
  if (getChild()) await stopHost();
  else await assertStopped();
}

const readJson = file => { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; } };
const writeJson = (file, value) => replaceFileAtomic(file, `${JSON.stringify(value, null, 2)}\n`);
const alive = pid => { if (!Number.isSafeInteger(pid) || pid < 1) return false; try { process.kill(pid, 0); return true; } catch (error) { return error.code === "EPERM"; } };

/** A service-manager restart must not migrate partially installed source. */
export function assertSelfUpdateStartupSafe({ dataDir, rootDir = root }) {
  if (!fs.existsSync(statusPath(dataDir))) return;
  const receipt = readJson(statusPath(dataDir));
  const phases = ["idle", "queued", "preflight", "pulling", "backing_up", "applying", "installing", "migrating", "building", "restarting", "awaiting_restart", "done", "failed"];
  if (!receipt || typeof receipt !== "object" || !phases.includes(receipt.phase)) {
    throw new Error("No se pudo comprobar el recibo de actualización. Revise el respaldo y la guía de recuperación antes de iniciar el Host.");
  }
  if (receipt.recoveryRequired || ["applying", "installing", "migrating", "building", "restarting"].includes(receipt.phase) || receipt.codeApplied && !["done", "awaiting_restart"].includes(receipt.phase)) {
    throw new Error("La actualización anterior requiere recuperación supervisada. No se iniciaron el Host ni sus migraciones; conserve el respaldo y consulte la guía de recuperación.");
  }
  if (receipt.phase !== "awaiting_restart") return;
  let exact = false;
  try {
    const revision = spawnSync("git", ["rev-parse", "HEAD"], { cwd: rootDir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], shell: false });
    const worktree = spawnSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], { cwd: rootDir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], shell: false });
    const version = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf8")).version;
    const buildId = fs.readFileSync(path.join(rootDir, ".next", "BUILD_ID"), "utf8").trim();
    exact = revision.status === 0 && worktree.status === 0 && !worktree.stdout.trim() && /^[a-f0-9]{40,64}$/.test(receipt.targetRevision || "") && revision.stdout.trim() === receipt.targetRevision && typeof receipt.toVersion === "string" && version === receipt.toVersion && /^[\w.-]{1,200}$/.test(receipt.expectedBuildId || "") && buildId === receipt.expectedBuildId;
  } catch { /* Missing source/build identity is not permission to migrate. */ }
  if (!exact) throw new Error("El código y la compilación preparados no coinciden con el recibo de actualización. No se iniciaron migraciones; conserve el respaldo y revise la recuperación.");
}

export function claimUpdateLock(dataDir, requestId) {
  if (!/^[a-zA-Z0-9-]{8,100}$/.test(requestId || "")) throw new Error("La solicitud de actualización no tiene identidad válida.");
  fs.mkdirSync(dataDir, { recursive: true });
  const file = lockPath(dataDir), existing = readJson(file);
  if (fs.existsSync(file)) {
    if (!existing || existing.requestId !== requestId || (existing.claimedAt || existing.pid !== process.pid) && alive(existing.pid)) throw new Error("Otra actualización conserva el bloqueo. No se modificó su solicitud.");
    writeJson(file, { ...existing, pid: process.pid, claimedAt: new Date().toISOString() });
  } else {
    const fd = fs.openSync(file, "wx", 0o600);
    try { fs.writeFileSync(fd, JSON.stringify({ requestId, pid: process.pid, at: new Date().toISOString(), claimedAt: new Date().toISOString() })); }
    finally { fs.closeSync(fd); }
  }
}

export function releaseUpdateLock(dataDir, requestId) {
  const lock = readJson(lockPath(dataDir));
  if (!lock || lock.requestId !== requestId || lock.pid !== process.pid) return false;
  fs.unlinkSync(lockPath(dataDir));
  const request = readJson(requestPath(dataDir));
  if (request?.requestId === requestId) fs.unlinkSync(requestPath(dataDir));
  return true;
}

export function updaterUsesShell(command, platform = process.platform) {
  const name = (platform === "win32" ? path.win32 : path).basename(command);
  return platform === "win32" && /^(npm|npx)(?:\.cmd)?$/i.test(name);
}
function run(cmd, args, label, { env, cwd = root } = {}) {
  const result = spawnSync(cmd, args, { cwd, env: env || process.env, shell: updaterUsesShell(cmd), encoding: "utf8", maxBuffer: 20 * 1024 * 1024, timeout: 20 * 60_000 });
  if (result.error || result.status !== 0) {
    // Dependency and Git output can contain remote URLs or private configuration.
    // Record the failed step and exit code, never dump command output into the UI.
    throw new Error(`${label} falló${result.error?.code ? ` (${result.error.code})` : ` (código ${result.status})`}. Consulte el diagnóstico local sin compartir secretos.`);
  }
  return result;
}

export function migrateDuringSelfUpdate({ dataDir, runCommand = run, env = hostCommandEnv(dataDir) } = {}) {
  if (!env.DATABASE_URL) throw new Error("No hay DATABASE_URL en el data dir; no se usará la configuración del clon.");
  try { runCommand(npm, ["run", "db:migrate"], "db:migrate", { env }); return { skipped: false }; }
  catch (error) { if (isUnreachableDatabaseError(error.message)) return { skipped: true, reason: "unreachable" }; throw error; }
}

/** No code rollback or database downgrade is attempted. The previous SHA and backup are recovery evidence. */
export async function applySelfUpdate({ dataDir = resolveDataDir(), branch = "main", onPhase, rootDir = root, runCommand = run, requestId = randomUUID(), hostStopped = false, channel, assertStopped = assertHostStopped } = {}) {
  if (!hostStopped) throw new Error("Detenga el Host mediante su coordinador antes de actualizar y respaldar.");
  if (!/^[a-zA-Z0-9][a-zA-Z0-9/._-]{0,100}$/.test(branch) || branch.includes("..")) throw new Error("Rama de actualización inválida.");
  claimUpdateLock(dataDir, requestId);
  const startedAt = new Date().toISOString();
  let record = { requestId, executorPid: process.pid, phase: "preflight", ok: false, startedAt, updatedAt: startedAt, fromRevision: null, targetRevision: null, fromVersion: null, toVersion: null, expectedBuildId: null, backupDirectory: null, migrationState: "not_started", codeApplied: false, recoveryRequired: false, rollbackImplemented: false };
  const setStatus = (phase, extra = {}) => { record = { ...record, ...extra, phase, ok: false, updatedAt: new Date().toISOString() }; writeJson(statusPath(dataDir), record); onPhase?.(phase, extra); };
  const command = (cmd, args, label) => runCommand(cmd, args, label, { cwd: rootDir, env: hostCommandEnv(dataDir) });
  const git = (args, label) => String(command("git", args, label).stdout || "").trim();
  const assertClean = () => { if (git(["status", "--porcelain=v1", "--untracked-files=all"], "Comprobar cambios locales")) throw new Error("Hay cambios o archivos locales sin registrar. Guárdelos y revíselos antes de actualizar; LexOpen no los descarta ni los guarda por su cuenta."); };
  try {
    if (git(["rev-parse", "--show-toplevel"], "Comprobar clon") !== fs.realpathSync(rootDir)) throw new Error("La actualización requiere el directorio raíz de un clon Git.");
    assertClean();
    if (git(["branch", "--show-current"], "Comprobar rama") !== branch) throw new Error("El clon no está en la rama de actualización elegida. No se cambió de rama automáticamente.");
    record.fromRevision = git(["rev-parse", "HEAD"], "Identificar código actual");
    record.fromVersion = String(JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf8")).version);
    validateExistingDataDirectory(dataDir, { installRoots: [rootDir] });
    const hostEnv = hostCommandEnv(dataDir);
    if (!hostEnv.DATABASE_URL) throw new Error("No se pudo comprobar la base local antes del respaldo.");
    await assertStopped({ dataDir, port: Number(hostEnv.PORT || 3000), pgPort: embeddedDatabasePort(hostEnv.DATABASE_URL) });
    setStatus("pulling", { message: "Comprobando el código disponible sin descartar cambios locales…" });
    git(["fetch", "origin", branch], "Descargar referencia");
    const targetRevision = git(["rev-parse", "FETCH_HEAD"], "Identificar código de destino");
    if (!/^[a-f0-9]{40,64}$/.test(targetRevision)) throw new Error("No se pudo fijar la revisión de destino.");
    command("git", ["merge-base", "--is-ancestor", record.fromRevision, targetRevision], "Comprobar avance compatible");
    const targetPackage = JSON.parse(git(["show", `${targetRevision}:package.json`], "Leer versión de destino"));
    const config = readJson(path.join(dataDir, "desktop-config.json")) || {};
    const selectedChannel = updatePreferences({ updateChannel: channel || hostCommandEnv(dataDir).LEXOPEN_UPDATE_CHANNEL || config.updateChannel }).channel;
    assertUpdateVersion(record.fromVersion, String(targetPackage.version), selectedChannel, { allowEqual: true });
    setStatus("backing_up", { targetRevision, toVersion: String(targetPackage.version), message: "Creando y comprobando un respaldo consistente antes de aplicar cambios…" });
    const backupDirectory = path.join(defaultBackupDirectory(dataDir), `pre-update-${requestId}`);
    await assertStopped({ dataDir, port: Number(hostEnv.PORT || 3000), pgPort: embeddedDatabasePort(hostEnv.DATABASE_URL) });
    await createDataBackup(dataDir, backupDirectory, { appVersion: record.fromVersion, backupMode: "pre-update" });
    await validateBackupDirectory(backupDirectory);
    const verified = await verifyBackupContents(dataDir, backupDirectory);
    setStatus("applying", { backupDirectory, backupVerified: verified, message: "Aplicando únicamente el avance de código comprobado…" });
    assertClean();
    if (git(["rev-parse", "HEAD"], "Revalidar código") !== record.fromRevision) throw new Error("El código cambió durante la preparación. No se aplicó otra revisión.");
    git(["merge", "--ff-only", targetRevision], "Aplicar revisión fijada");
    record.codeApplied = true;
    setStatus("installing", { message: "Instalando las versiones fijadas de la aplicación y del runtime de escritorio…" });
    command(npm, ["ci"], "Dependencias de aplicación");
    command(npm, ["--prefix", "desktop", "ci"], "Dependencias de escritorio");
    command(process.execPath, [path.join(rootDir, "desktop", "node_modules", "electron", "install.js")], "Runtime Electron");
    setStatus("building", { message: "Compilando el servidor antes de aplicar migraciones…" });
    command(npm, ["run", "desktop:build"], "Compilar servidor");
    const expectedBuildId = fs.readFileSync(path.join(rootDir, ".next", "BUILD_ID"), "utf8").trim();
    if (!expectedBuildId || expectedBuildId.length > 200) throw new Error("La compilación no produjo una identidad verificable.");
    setStatus("awaiting_restart", { expectedBuildId, migrationState: "deferred_to_restart", message: "Código preparado. Falta reiniciar, aplicar migraciones y comprobar esta compilación; la actualización aún no se considera terminada." });
    return record;
  } catch (error) {
    setStatus("failed", { error: error.message, message: "La actualización no terminó. Se conservaron los datos; revise la fase fallida antes de reiniciar o restaurar.", recoveryRequired: record.codeApplied, recovery: record.codeApplied ? "No hay reversión automática de código ni base. Conserve el respaldo y las revisiones registradas para una recuperación supervisada." : "No se aplicó la revisión de destino." });
    throw error;
  }
}

export function finalizeSelfUpdate(dataDir, requestId, health) {
  const previous = readJson(statusPath(dataDir));
  if (!previous || previous.requestId !== requestId || previous.phase !== "awaiting_restart") return false;
  const exact = health?.ok === true && health.version === previous.toVersion && health.buildId === previous.expectedBuildId && health.sourceRevision === previous.targetRevision;
  writeJson(statusPath(dataDir), { ...previous, phase: exact ? "done" : "failed", ok: exact, updatedAt: new Date().toISOString(), completedAt: exact ? new Date().toISOString() : null, migrationState: exact ? "applied_and_checked" : "unknown_after_restart", recoveryRequired: !exact, message: exact ? "Actualización aplicada y compilación comprobada. Ya puede volver al trabajo." : "El Host reiniciado no confirmó la revisión y compilación esperadas. No se declaró éxito ni se revirtió la base automáticamente." });
  return exact;
}

export function canRestartPreparedUpdate(status, requestId, executorPid = process.pid) {
  return status?.requestId === requestId && status.executorPid === executorPid && (!status.codeApplied || status.phase === "awaiting_restart");
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help")) { console.log("Use el coordinador npm run web:host. Para preparación manual con Host detenido: --apply --host-stopped [--branch main]. Nunca declara éxito antes del reinicio comprobado."); return; }
  if (!args.includes("--apply") || !args.includes("--host-stopped")) throw new Error("Use el coordinador del Host o detenga el servicio y confirme --apply --host-stopped. No se ejecutan actualizaciones sobre un Host activo.");
  const branchIndex = args.indexOf("--branch"), dataDir = resolveDataDir(), requestId = randomUUID();
  try {
    await applySelfUpdate({ dataDir, branch: branchIndex >= 0 ? args[branchIndex + 1] : "main", requestId, hostStopped: true, onPhase: phase => console.log(`[self-update] ${phase}`) });
    console.log("Código preparado; reinicie el Host y verifique su estado. Aún no se declara actualización terminada.");
  } finally { releaseUpdateLock(dataDir, requestId); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error("[self-update]", error.message); process.exitCode = 1; });
