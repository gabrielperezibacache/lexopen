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

const operations = new Set(["none", "health", "providers", "fleet", "kitty_create", "kitty_read", "chat_create", "chat_read", "message", "cancel", "control", "input", "stop", "screenshot", "other"]);
export function gatewayRequestCategory(method: string, path: string) {
  if (method === "GET" && path === "/v1/health") return "health";
  if (method === "GET" && path === "/v1/providers") return "providers";
  if (path === "/v1/kitties") return method === "POST" ? "kitty_create" : "fleet";
  if (path === "/v1/chats" && method === "POST") return "chat_create";
  if (/^\/v1\/kitties\/[A-Za-z0-9_-]+$/.test(path) && method === "GET") return "kitty_read";
  if (/^\/v1\/chats\/[A-Za-z0-9_-]+$/.test(path) && method === "GET") return "chat_read";
  const action = /^\/v1\/(?:chats|kitties)\/[A-Za-z0-9_-]+\/(messages|cancel|control|input|stop|screenshot)$/.exec(path)?.[1];
  return action === "messages" ? "message" : action && operations.has(action) ? action : "other";
}
export function runtimeFailureSummary(error: unknown, gatewayHttpStatus: number | null, operation: string) {
  const value = error && typeof error === "object" ? error as { name?: unknown; code?: unknown; status?: unknown } : {};
  const code = value.code === "ERR_ASSERTION" || typeof value.code === "string" && /^P\d{4}$/.test(value.code) ? value.code : value.name === "ConnectorError" && typeof value.code === "string" && /^[a-z_]{1,60}$/.test(value.code) ? value.code : "unknown";
  const numeric = (input: unknown) => typeof input === "number" && Number.isInteger(input) && input >= 100 && input <= 599 ? input : "none";
  return `category=${code}, status=${numeric(value.status)}, http=${numeric(gatewayHttpStatus)}, operation=${operations.has(operation) ? operation : "other"}`;
}
