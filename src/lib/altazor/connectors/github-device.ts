import { ConnectorError } from "@/lib/personal-connectors/core";

const DEVICE_ENDPOINT = "https://github.com/login/device/code";
const TOKEN_ENDPOINT = "https://github.com/login/oauth/access_token";
const VERIFICATION_URI = "https://github.com/login/device" as const;
const DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";
const RESPONSE_LIMIT = 64 * 1024;

export type GithubDeviceAuthorization = {
  deviceCode: string; userCode: string; verificationUri: typeof VERIFICATION_URI;
  expiresIn: number; interval: number;
};
/** Server-only. Device codes and tokenResponse must never be logged or projected to the browser. */
export type GithubDevicePoll =
  | { state: "pending" }
  | { state: "slow_down" }
  | { state: "denied" }
  | { state: "expired" }
  | { state: "authorized"; tokenResponse: Record<string, unknown> };

function invalidInput() { return new ConnectorError("github_device_invalid", "No se pudo preparar el ingreso con código de GitHub.", 400); }
function invalidResponse() { return new ConnectorError("github_device_response", "GitHub no confirmó un ingreso válido. Vuelva a intentarlo.", 502); }
function unavailable() { return new ConnectorError("github_device_unavailable", "GitHub no está disponible en este momento. Vuelva a comprobar la conexión.", 503); }
function clientIdValid(value: string) { return typeof value === "string" && /^[A-Za-z0-9_.-]{1,200}$/.test(value); }
function deviceCodeValid(value: unknown): value is string { return typeof value === "string" && /^[A-Za-z0-9_.~-]{20,2048}$/.test(value); }

function providerError(code: unknown): never {
  if (code === "incorrect_client_credentials" || code === "invalid_client") throw new ConnectorError("oauth_client_credentials", "La conexión de GitHub necesita revisarse en Configuración.", 409);
  if (code === "device_flow_disabled" || code === "device_flow_not_enabled") throw new ConnectorError("github_device_unavailable", "Complete la preparación de esta conexión de GitHub en Configuración.", 409);
  if (code === "incorrect_device_code" || code === "bad_verification_code") throw new ConnectorError("oauth_code_rejected", "El código de ingreso ya no es válido. Inicie uno nuevo.", 409);
  throw unavailable();
}

async function devicePost(endpoint: typeof DEVICE_ENDPOINT | typeof TOKEN_ENDPOINT, body: URLSearchParams, fetcher: typeof fetch): Promise<Record<string, unknown>> {
  try {
    const response = await fetcher(endpoint, {
      method: "POST", redirect: "error", cache: "no-store", credentials: "omit", signal: AbortSignal.timeout(15_000),
      headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" }, body,
    });
    if (response.redirected || response.url && response.url !== endpoint || response.status >= 300 && response.status < 400) throw invalidResponse();
    if (response.status === 429 || response.status >= 500) { await response.body?.cancel().catch(() => {}); throw unavailable(); }
    if (response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") { await response.body?.cancel().catch(() => {}); throw invalidResponse(); }
    const declared = response.headers.get("content-length");
    if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > RESPONSE_LIMIT)) { await response.body?.cancel().catch(() => {}); throw invalidResponse(); }
    const reader = response.body?.getReader(); if (!reader) throw invalidResponse();
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      for (;;) {
        const chunk = await reader.read(); if (chunk.done) break;
        size += chunk.value.length;
        if (size > RESPONSE_LIMIT) { await reader.cancel().catch(() => {}); throw invalidResponse(); }
        chunks.push(chunk.value);
      }
    } finally { reader.releaseLock(); }
    let value: unknown;
    try { value = JSON.parse(Buffer.concat(chunks, size).toString("utf8")); } catch { throw invalidResponse(); }
    if (!value || typeof value !== "object" || Array.isArray(value)) throw invalidResponse();
    const result = value as Record<string, unknown>;
    if (!response.ok && result.error === undefined) throw unavailable();
    return result;
  } catch (error) {
    if (error instanceof ConnectorError && error.code === "github_device_response") throw invalidResponse();
    throw unavailable();
  }
}

/** Only requests an official manual authorization; never opens a URL or polls automatically. */
export async function requestGithubDevice(clientId: string, scopes: readonly string[], fetcher: typeof fetch = fetch): Promise<GithubDeviceAuthorization> {
  if (!clientIdValid(clientId) || !Array.isArray(scopes) || !scopes.length || scopes.length > 20 ||
      scopes.some(scope => typeof scope !== "string" || !/^[A-Za-z0-9_.:-]{1,120}$/.test(scope)) || new Set(scopes).size !== scopes.length || scopes.join(" ").length > 2048) throw invalidInput();
  const result = await devicePost(DEVICE_ENDPOINT, new URLSearchParams({ client_id: clientId, scope: scopes.join(" ") }), fetcher);
  if (result.error !== undefined) providerError(result.error);
  if (!deviceCodeValid(result.device_code) || typeof result.user_code !== "string" || !/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(result.user_code) ||
      result.verification_uri !== VERIFICATION_URI || typeof result.expires_in !== "number" || !Number.isInteger(result.expires_in) || result.expires_in < 60 || result.expires_in > 900 ||
      typeof result.interval !== "number" || !Number.isInteger(result.interval) || result.interval < 5 || result.interval > 60) throw invalidResponse();
  return { deviceCode: result.device_code, userCode: result.user_code, verificationUri: VERIFICATION_URI, expiresIn: result.expires_in, interval: result.interval };
}

/** One poll only. The caller owns expiry/rate scheduling and must validate granted scopes with readOAuthTokenResponse. */
export async function pollGithubDevice(clientId: string, deviceCode: string, fetcher: typeof fetch = fetch): Promise<GithubDevicePoll> {
  if (!clientIdValid(clientId) || !deviceCodeValid(deviceCode)) throw invalidInput();
  const result = await devicePost(TOKEN_ENDPOINT, new URLSearchParams({ client_id: clientId, device_code: deviceCode, grant_type: DEVICE_GRANT }), fetcher);
  if (result.error !== undefined) {
    if (result.access_token !== undefined) throw invalidResponse();
    switch (result.error) {
      case "authorization_pending": return { state: "pending" };
      case "slow_down": return { state: "slow_down" };
      case "access_denied": return { state: "denied" };
      case "expired_token": return { state: "expired" };
      default: providerError(result.error);
    }
  }
  if (typeof result.access_token !== "string" || !result.access_token) throw invalidResponse();
  // Unknown provider fields (including reflected descriptions) stay out of the result.
  const tokenResponse: Record<string, unknown> = {};
  for (const key of ["access_token", "token_type", "scope", "refresh_token", "expires_in", "refresh_token_expires_in"]) if (result[key] !== undefined) tokenResponse[key] = result[key];
  return { state: "authorized", tokenResponse };
}
