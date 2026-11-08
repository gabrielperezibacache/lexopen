/** One pinned hardening recipe, shared by CI and manual gateway builds.
 * It never builds, installs, starts, configures or updates a gateway service. */
import { execFile } from "node:child_process";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { PINNED_COMMIT } from "./harden-connectors.mjs";

const scripts = dirname(fileURLToPath(import.meta.url));
const executeFile = promisify(execFile);
const base = ["internal/chat/approve.go", "internal/chat/chat.go", "internal/approvals/approvals.go", "internal/gateway/gateway.go", "internal/connector/connector.go"];
const stage = (name, formatAfter = []) => Object.freeze({ name, script: `harden-${name}.mjs`, test: `harden-${name}.test.mjs`, formatAfter: Object.freeze(formatAfter) });
export const GATEWAY_HARDENING_STAGES = Object.freeze([
  ...["connectors", "async-messages", "read-files", "vision-context", "native-connector-schema", "connector-file-focus", "native-file-actions", "readable-file-results", "compact-file-results"].map(name => stage(name)),
  stage("persistent-oauth", base),
  stage("staged-file-actions", [...base, "internal/oauth/oauth.go", "internal/connector/lexopen_staged_file_receipt.go", "internal/approvals/lexopen_staged_file_store.go", "internal/approvals/lexopen_staged_file_store_test.go", "internal/chat/lexopen_staged_file_actions.go", "internal/chat/lexopen_staged_file_inspect.go", "internal/chat/lexopen_staged_file_actions_test.go", "internal/gateway/lexopen_staged_file_actions.go", "internal/gateway/lexopen_staged_file_actions_test.go"]),
  stage("cloud-file-connectors", ["internal/oauth/lexopen_cloud_file.go", "internal/oauth/lexopen_cloud_file_test.go", "internal/chat/lexopen_cloud_file.go", "internal/chat/lexopen_cloud_file_test.go", "internal/connector/lexopen_cloud_file.go", "internal/connector/lexopen_cloud_file_test.go", "internal/gateway/lexopen_cloud_file_test.go"]),
  stage("computer-use-policy", ["internal/chat/chat.go", "internal/chat/actions.go", "internal/chat/approve.go", "internal/approvals/approvals.go", "internal/gateway/gateway.go", "internal/gateway/approvals.go", "internal/chat/lexopen_computer_use_test.go", "internal/chat/lexopen_computer_use.go", "internal/desktop/lexopen_computer_use_test.go", "internal/desktop/lexopen_computer_use.go", "internal/approvals/lexopen_computer_use_test.go", "internal/approvals/lexopen_computer_use.go", "internal/gateway/lexopen_computer_use_test.go", "internal/gateway/lexopen_computer_use.go"]),
  stage("oauth-alias-create", ["internal/orchestrator/lexopen_persistent_oauth.go", "internal/gateway/gateway.go", "internal/orchestrator/lexopen_oauth_alias_create_test.go", "internal/gateway/lexopen_oauth_alias_create_test.go"]),
  stage("connected-file-focus", ["internal/chat/lexopen_connector_file_focus.go", "internal/chat/lexopen_cloud_file.go", "internal/chat/lexopen_native_file_actions.go", "internal/chat/chat.go", "internal/gateway/gateway.go", "internal/chat/lexopen_connected_file_focus.go", "internal/chat/lexopen_connected_file_focus_test.go", "internal/gateway/lexopen_connected_file_focus_test.go"]),
  stage("cloud-metadata", ["internal/connector/lexopen_cloud_file.go", "internal/gateway/gateway.go", "internal/connector/lexopen_cloud_metadata.go", "internal/connector/lexopen_cloud_metadata_test.go", "internal/gateway/lexopen_cloud_metadata_test.go"]),
  stage("github-persistent-oauth", ["internal/gateway/lexopen_persistent_oauth.go", "internal/gateway/gateway.go", "internal/oauth/oauth.go", "internal/oauth/lexopen_persistent.go", "internal/orchestrator/lexopen_persistent_oauth.go", "internal/oauth/lexopen_github_persistent.go", "internal/oauth/lexopen_github_persistent_test.go", "internal/gateway/lexopen_github_persistent_test.go", "internal/orchestrator/lexopen_github_persistent_test.go"]),
]);

async function regular(file) {
  const entry = await lstat(file);
  if (!entry.isFile() || entry.isSymbolicLink()) throw new Error("La receta requiere archivos regulares de la revisión fijada.");
}

export async function prepareGatewaySource(directory, { execute = executeFile, env = process.env, gofmt = env.LEXOPEN_GOFMT || "gofmt" } = {}) {
  const root = await realpath(directory);
  await regular(join(root, ".lexopen-source-commit"));
  if ((await readFile(join(root, ".lexopen-source-commit"), "utf8")).trim() !== PINNED_COMMIT || (await readdir(root)).some(name => name === ".git" || name.startsWith(".lexopen-") && name !== ".lexopen-source-commit")) throw new Error("Usa un archivo nuevo y limpio de la revisión pública fijada; no una instalación ni una copia ya reforzada.");
  // Complete preflight and script tests before the first source mutation.
  for (const item of GATEWAY_HARDENING_STAGES) { await regular(join(scripts, item.script)); await regular(join(scripts, item.test)); }
  const options = { cwd: scripts, env, timeout: 60_000, maxBuffer: 1024 * 1024, windowsHide: true, shell: false };
  async function run(binary, args, label, cwd = scripts) {
    try { await execute(binary, args, { ...options, cwd }); }
    catch { throw new Error(`No se completó ${label}. Conserva esta copia para revisar el error y prepara otra copia limpia; no se reintentó ni se instaló el servicio.`); }
  }
  for (const item of GATEWAY_HARDENING_STAGES) await run(process.execPath, [join(scripts, item.test)], `la prueba ${item.name}`);
  for (const item of GATEWAY_HARDENING_STAGES) {
    await run(process.execPath, [join(scripts, item.script), root], `el refuerzo ${item.name}`);
    if (item.formatAfter.length) await run(gofmt, ["-w", ...item.formatAfter], `el formato posterior a ${item.name}`, root);
  }
  return { source: PINNED_COMMIT, recipe: "gateway.15", hardeners: GATEWAY_HARDENING_STAGES.length, scriptTests: GATEWAY_HARDENING_STAGES.length, formattingPasses: GATEWAY_HARDENING_STAGES.filter(item => item.formatAfter.length).length, compiled: false, installed: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length !== 3) throw new Error("Usage: node scripts/altazor/prepare-gateway-source.mjs <fresh-pinned-source-directory>");
  prepareGatewaySource(process.argv[2]).then(result => console.log(JSON.stringify(result))).catch(error => { console.error(error.message); process.exitCode = 1; });
}
