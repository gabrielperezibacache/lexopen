/** CI output is fixed vocabulary; private gateway output must never be reflected. */
export function gatewayStartupCategory(logTail: string, spawnFailed = false) {
  if (spawnFailed) return "spawn_failed";
  const text = logTail.slice(-32 * 1024).toLowerCase();
  if (/updates\.gateway:/.test(text)) return "configuration_update_mode";
  if (/permission denied|operation not permitted|eacces/.test(text)) return "filesystem_permission";
  if (/address already in use|cannot assign requested address/.test(text)) return "listener_address";
  if (/docker.*(?:not installed|not found|does not answer|permission)|cannot connect to the docker daemon/.test(text)) return "docker_unavailable";
  if (/providers\.[a-z0-9-]+\.|provider .*not available/.test(text)) return "configuration_provider";
  if (/configuration is not valid yaml|unknown key|expected a (?:text value|configuration block|list)|read the configuration/.test(text)) return "configuration_schema";
  if (/no such file or directory|command not found|exec format error/.test(text)) return "executable_or_path";
  return "unknown_startup";
}

export function gatewayStartupSummary(input: { exitCode?: number | null; signalCode?: string | null; logTail: string; spawnFailed?: boolean }) {
  const exit = typeof input.exitCode === "number" && Number.isSafeInteger(input.exitCode) && input.exitCode >= 0 && input.exitCode <= 255 ? String(input.exitCode) : "pending";
  const signal = typeof input.signalCode === "string" && /^SIG[A-Z0-9]{1,10}$/.test(input.signalCode) ? input.signalCode : "none";
  return `exit=${exit}, signal=${signal}, category=${gatewayStartupCategory(input.logTail, input.spawnFailed)}`;
}
