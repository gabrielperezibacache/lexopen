import { createHash } from "node:crypto";

export const MICROSOFT_CONNECTOR_KIND = "microsoft-365";
export const MICROSOFT_OAUTH_PROVIDER = "microsoft";
export const MICROSOFT_AUTHORIZE_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
export const MICROSOFT_TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
export const MICROSOFT_FILE_SCOPES = ["offline_access", "User.Read", "Files.Read"] as const;
const callbackPath = "/api/altazor/connectors/oauth/callback";
const invalid = () => new Error("La autorización pública de Microsoft no es válida.");
const safe = (value: string, maximum: number) => typeof value === "string" && value.length > 0 && value.length <= maximum && !/[\x00-\x20\x7f]/.test(value);
function client(value: string) { if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value)) throw invalid(); return value; }

/** The native registration uses localhost; the original app may bind to 127.0.0.1. */
export function microsoftNativeCallback(appOrigin: string) {
  const app = new URL(appOrigin);
  if (app.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(app.hostname) || app.username || app.password || app.pathname !== "/" || app.search || app.hash) throw invalid();
  return `http://localhost${app.port ? `:${app.port}` : ""}${callbackPath}`;
}
function callback(value: string) {
  const url = new URL(value);
  if (!safe(value, 1000) || url.protocol !== "http:" || url.hostname !== "localhost" || url.username || url.password || url.pathname !== callbackPath || url.search || url.hash) throw invalid();
  return url.href;
}

/** Graph may qualify its scopes with the resource URL; offline_access is not an API grant. */
export function normalizeMicrosoftFileScopes(value: unknown): string[] {
  const parts = typeof value === "string" ? value.trim().split(/\s+/) : Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  for (const part of parts) {
    if (typeof part !== "string" || !safe(part, 200)) throw invalid();
    const scope = part.replace(/^https:\/\/graph\.microsoft\.com\//i, "").toLowerCase();
    if (!["offline_access", "user.read", "files.read"].includes(scope) || seen.has(scope)) throw invalid();
    seen.add(scope);
  }
  if (!seen.has("user.read") || !seen.has("files.read")) throw invalid();
  return ["Files.Read", "User.Read"];
}

export function microsoftPublicAuthorization(input: { clientId: string; redirectUri: string; state: string; verifier: string }) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(input.state) || !/^[A-Za-z0-9._~-]{43,128}$/.test(input.verifier)) throw invalid();
  const params = new URLSearchParams({ client_id: client(input.clientId), response_type: "code", response_mode: "query", redirect_uri: callback(input.redirectUri), scope: MICROSOFT_FILE_SCOPES.join(" "), state: input.state, code_challenge: createHash("sha256").update(input.verifier).digest("base64url"), code_challenge_method: "S256" });
  return `${MICROSOFT_AUTHORIZE_URL}?${params}`;
}

export function microsoftPublicCodeBody(input: { clientId: string; redirectUri: string; code: string; verifier: string }) {
  if (!safe(input.code, 8000) || !/^[A-Za-z0-9._~-]{43,128}$/.test(input.verifier)) throw invalid();
  return new URLSearchParams({ grant_type: "authorization_code", client_id: client(input.clientId), redirect_uri: callback(input.redirectUri), code: input.code, code_verifier: input.verifier });
}

export function microsoftPublicRefreshBody(input: { clientId: string; refreshToken: string }) {
  if (!safe(input.refreshToken, 16000)) throw invalid();
  return new URLSearchParams({ grant_type: "refresh_token", client_id: client(input.clientId), refresh_token: input.refreshToken, scope: "User.Read Files.Read" });
}
