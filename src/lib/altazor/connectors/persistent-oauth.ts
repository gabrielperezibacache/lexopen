import { ConnectorError } from "@/lib/personal-connectors/core";
import { validEasyOAuthScopes } from "./oauth-access";

/** Server-only transfer to the dedicated gateway. Never return this object. */
export type PersistentEasyOAuthConfiguration = {
  kind: "google-workspace" | "dropbox" | "microsoft-365";
  clientId: string; clientSecret: string; accessToken: string; refreshToken: string;
  expiresAt: string; scopes: string[]; account?: string; publicClient?: boolean;
};
export function validatePersistentEasyOAuth(value: PersistentEasyOAuthConfiguration) {
  const provider = value.kind === "google-workspace" ? "google" : value.kind === "dropbox" ? "dropbox" : value.kind === "microsoft-365" ? "microsoft" : null;
  const fields = [[value.clientId, 1000], [value.accessToken, 16000], [value.refreshToken, 16000]] as const;
  const publicClient = value.publicClient === true;
  const secretInvalid = publicClient ? provider === "google" || value.clientSecret !== "" : typeof value.clientSecret !== "string" || !value.clientSecret.trim() || value.clientSecret.length > 4000 || /[\x00-\x1f\x7f]/.test(value.clientSecret);
  if (!provider || secretInvalid || provider === "microsoft" && (!publicClient || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value.clientId)) || value.publicClient !== undefined && typeof value.publicClient !== "boolean" || fields.some(([text, max]) => typeof text !== "string" || !text.trim() || text.length > max || /[\x00-\x1f\x7f]/.test(text)) || !validEasyOAuthScopes(provider, value.scopes)) throw new ConnectorError("oauth_persistence_invalid", "El servicio no confirmó una autorización persistente de lectura válida.", 409);
  const expiry = Date.parse(value.expiresAt);
  if (!Number.isFinite(expiry) || expiry <= Date.now() || expiry > Date.now() + 366 * 86400_000 || value.account !== undefined && (typeof value.account !== "string" || !value.account || value.account.length > 200 || /[\x00-\x1f\x7f]/.test(value.account))) throw new ConnectorError("oauth_persistence_invalid", "El servicio no confirmó una vigencia válida para guardar la conexión.", 409);
  return value;
}
