import { spawn } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import { chmod, lstat, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { assertPlainDocx } from "./docx";
export { assertPlainDocx } from "./docx";

export const RUNTIME_VERSION = "lexopen-documents-1";
export const RUNTIME_LIMITS = { seconds: 40, memoryMb: 256, cpus: 1, pids: 64, artifactBytes: 2_000_000, inputBytes: 250_000 } as const;
export type DockerConfig = { enabled: boolean; imageId: string; host: string; executable: string };
export type RuntimeArtifact = { name: string; mimeType: string; sha256: string; data: Buffer };
export type RecipeInput = { version: 1; title: string; body: string; sources: { marker: string; title: string; quote: string; href: string; versionId: string; sourceSha256: string }[] };
export type CommandRunner = (args: string[], options: { signal?: AbortSignal; timeoutMs: number; config: DockerConfig }) => Promise<string>;
type DockerFailureCode = "docker_timeout" | "docker_cancelled" | "docker_output_limit" | "docker_cli_unavailable" | "docker_command_failed";
type PreflightPhase = "image_inspect" | "daemon_info";
export type RuntimePreflightOptions = { timeoutMs?: number; maxAttempts?: number; signal?: AbortSignal };
export type RuntimePreflightDiagnostic = { phase: PreflightPhase; attempt: number; elapsedMs: number; code: string; exitCode?: number; osError?: string };
export type RuntimeCapabilities = { available: boolean; reason: string; version: string; formats: string[]; isolation: string; reasonCode?: string; phase?: "configuration" | PreflightPhase | "ready"; attempts?: number; elapsedMs?: number; checks?: RuntimePreflightDiagnostic[] };
function dockerFailure(code: DockerFailureCode, message: string, details: { exitCode?: number; osError?: string } = {}) { return Object.assign(new Error(message), { code, ...details }); }
const digest = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
export function dockerConfig(env: NodeJS.ProcessEnv = process.env): DockerConfig {
  return { enabled: env.LEXOPEN_WORKBENCH_ENABLED === "1", imageId: env.LEXOPEN_WORKBENCH_IMAGE_ID || "", host: env.LEXOPEN_WORKBENCH_DOCKER_HOST || "unix:///var/run/docker.sock", executable: env.LEXOPEN_WORKBENCH_DOCKER_BIN || "docker" };
}
function validConfig(config: DockerConfig) {
  if (!config.enabled) return { reasonCode: "runtime_disabled", reason: "La Mesa está desactivada. El administrador debe preparar el ejecutor local." };
  if (!/^sha256:[a-f0-9]{64}$/.test(config.imageId)) return { reasonCode: "image_unpinned", reason: "Falta fijar el identificador de la imagen local de documentos." };
  if (!/^unix:\/\/\/[^\r\n\0,]+$/.test(config.host) && config.host !== "npipe:////./pipe/docker_engine") return { reasonCode: "docker_host_not_local", reason: "El ejecutor requiere un Docker local por socket; no admite servidores remotos." };
  return null;
}
export const runDockerCommand: CommandRunner = async (args, options) => {
  options.signal?.throwIfAborted();
  return new Promise<string>((resolve, reject) => {
    const env: NodeJS.ProcessEnv = { NODE_ENV: "production" };
    for (const key of ["PATH", "LANG", "SYSTEMROOT", "SystemRoot", "WINDIR"]) if (process.env[key]) env[key] = process.env[key];
    const child = spawn(options.config.executable, ["--host", options.config.host, ...args], { env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let output = "", settled = false;
    const finish = (error?: Error) => { if (settled) return; settled = true; clearTimeout(timer); options.signal?.removeEventListener("abort", abort); if (error) reject(error); else resolve(output.trim()); };
    const stop = (code: DockerFailureCode, message: string) => { child.kill("SIGKILL"); finish(dockerFailure(code, message)); };
    const abort = () => stop("docker_cancelled", "La ejecución se detuvo");
    const timer = setTimeout(() => stop("docker_timeout", "Docker local agotó el tiempo de respuesta"), options.timeoutMs);
    options.signal?.addEventListener("abort", abort, { once: true });
    child.stdout.on("data", data => { output += data.toString(); if (output.length > 32_000) stop("docker_output_limit", "La respuesta de Docker local supera el límite"); });
    // Never forward stderr: Docker may include local paths and infrastructure details.
    child.stderr.on("data", () => {});
    child.on("error", (error: NodeJS.ErrnoException) => finish(dockerFailure("docker_cli_unavailable", "Docker local no está disponible", { osError: ["ENOENT", "EACCES", "EPERM", "ENOEXEC"].includes(error.code || "") ? error.code : undefined })));
    child.on("close", code => finish(code === 0 ? undefined : dockerFailure("docker_command_failed", "El ejecutor local no pudo completar la operación", { exitCode: Number.isInteger(code) && code! >= 0 && code! <= 255 ? code! : undefined })));
    if (options.signal?.aborted) abort();
  });
};
export async function runtimeCapabilities(config = dockerConfig(), command: CommandRunner = runDockerCommand, options: RuntimePreflightOptions = {}): Promise<RuntimeCapabilities> {
  const timeoutMs = options.timeoutMs ?? 5_000, maxAttempts = options.maxAttempts ?? 1;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 15_000 || !Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 3) throw new RangeError("Límites de comprobación Docker inválidos");
  const started = Date.now(), checks: RuntimePreflightDiagnostic[] = [];
  const common = { version: RUNTIME_VERSION, formats: ["markdown", "docx"], isolation: "docker-local-network-none" };
  const problem = validConfig(config);
  if (problem) return { ...common, available: false, ...problem, phase: "configuration", attempts: 0, elapsedMs: Date.now() - started, checks };
  for (const phase of ["image_inspect", "daemon_info"] as const) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const checkStarted = Date.now();
      let code = "ok", exitCode: number | undefined, osError: string | undefined;
      try {
        options.signal?.throwIfAborted();
        const result = await command(phase === "image_inspect" ? ["image", "inspect", "--format", "{{.Id}}", config.imageId] : ["info", "--format", "{{.OSType}}"], { config, timeoutMs, signal: options.signal });
        if (phase === "image_inspect" && result !== config.imageId) code = "image_id_mismatch";
        if (phase === "daemon_info" && result !== "linux") code = "docker_os_not_linux";
      } catch (error) {
        const detail = error as { code?: string; exitCode?: number; osError?: string };
        code = options.signal?.aborted ? "docker_cancelled" : ["docker_timeout", "docker_cancelled", "docker_output_limit", "docker_cli_unavailable", "docker_command_failed"].includes(detail?.code || "") ? detail.code! : "docker_command_failed";
        if (Number.isInteger(detail?.exitCode) && detail.exitCode! >= 0 && detail.exitCode! <= 255) exitCode = detail.exitCode;
        if (["ENOENT", "EACCES", "EPERM", "ENOEXEC"].includes(detail?.osError || "")) osError = detail.osError;
      }
      checks.push({ phase, attempt, elapsedMs: Date.now() - checkStarted, code, ...(exitCode === undefined ? {} : { exitCode }), ...(osError ? { osError } : {}) });
      if (code === "ok") break;
      if (attempt < maxAttempts && ["docker_timeout", "docker_command_failed"].includes(code)) continue;
      return { ...common, available: false, reason: "No se encontró Docker Linux o la imagen fijada. Revise la preparación del ejecutor local.", reasonCode: code, phase, attempts: checks.length, elapsedMs: Date.now() - started, checks };
    }
  }
  return { ...common, available: true, reason: "Ejecutor local preparado para Markdown y DOCX. Cada trabajo usa un contenedor sin red.", reasonCode: "ready", phase: "ready", attempts: checks.length, elapsedMs: Date.now() - started, checks };
}
export function containerArgs(config: DockerConfig, name: string, input: string, output: string) {
  if (validConfig(config) || !/^lexopen-workbench-[a-f0-9-]{36}$/.test(name) || [input, output].some(value => !path.isAbsolute(value) || /[,\r\n\0]/.test(value))) throw new Error("Configuración de ejecución inválida");
  return ["run", "--rm", "--pull", "never", "--name", name, "--network", "none", "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--user", "65532:65532", "--cpus", "1", "--memory", "256m", "--memory-swap", "256m", "--pids-limit", "64", "--ulimit", "fsize=2097152:2097152", "--ulimit", "nofile=64:64", "--stop-timeout", "1", "--tmpfs", "/tmp:rw,nosuid,nodev,noexec,size=16m", "--mount", `type=bind,src=${input},dst=/input,readonly`, "--mount", `type=bind,src=${output},dst=/output`, config.imageId];
}
export async function executeDocumentRecipe(input: RecipeInput, signal: AbortSignal, options: { config?: DockerConfig; command?: CommandRunner; preflight?: RuntimePreflightOptions } = {}): Promise<RuntimeArtifact[]> {
  const config = options.config || dockerConfig(), command = options.command || runDockerCommand;
  const capability = await runtimeCapabilities(config, command, { ...options.preflight, signal });
  if (!capability.available) throw Object.assign(new Error("El ejecutor Docker local no está preparado"), { code: capability.reasonCode, phase: capability.phase, checks: capability.checks });
  signal.throwIfAborted();
  const json = JSON.stringify(input);
  if (Buffer.byteLength(json) > RUNTIME_LIMITS.inputBytes) throw new Error("La selección supera el tamaño de esta receta");
  const root = await mkdtemp(path.join(tmpdir(), "lexopen-workbench-")), name = `lexopen-workbench-${randomUUID()}`;
  const inputs = path.join(root, "input"), output = path.join(root, "output");
  try {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(inputs, { mode: 0o755 }); await mkdir(output, { mode: 0o777 }); await chmod(output, 0o777);
    await writeFile(path.join(inputs, "input.json"), json, { mode: 0o444 });
    await command(containerArgs(config, name, inputs, output), { config, signal, timeoutMs: RUNTIME_LIMITS.seconds * 1_000 });
    signal.throwIfAborted();
    const expected = ["borrador.md", "borrador.docx"];
    if ((await readdir(output)).sort().join(",") !== [...expected].sort().join(",")) throw new Error("La receta devolvió archivos no admitidos");
    const artifacts: RuntimeArtifact[] = [];
    for (const file of expected) {
      const full = path.join(output, file), stat = await lstat(full);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size < 1 || stat.size > RUNTIME_LIMITS.artifactBytes) throw new Error("Archivo de salida inválido");
      const data = await readFile(full);
      if (file.endsWith(".docx")) assertPlainDocx(data);
      else if (data.includes(0) || Buffer.from(data.toString("utf8"), "utf8").compare(data) !== 0) throw new Error("Texto de salida inválido");
      artifacts.push({ name: file, mimeType: file.endsWith(".docx") ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "text/markdown; charset=utf-8", sha256: digest(data), data });
    }
    return artifacts;
  } finally {
    // A separate bounded request stops the container even after cancellation killed the client.
    await command(["rm", "--force", name], { config, timeoutMs: 5_000 }).catch(() => {});
    await rm(root, { recursive: true, force: true });
  }
}
