import type { ConnectorCatalogEntry, ConnectorConnection } from "./types";
import { EASY_OAUTH_CONNECTOR, EASY_OAUTH_PROVIDERS, type EasyOAuthProvider } from "./easy-oauth-providers";

export type ConnectorAccessCheck = { ok: boolean; tested: boolean };
export type ConnectorAccessChecks = Readonly<Record<string, ConnectorAccessCheck | undefined>>;
export type ConnectorAvailability = {
  state: "unknown" | "unavailable" | "available" | "saved" | "sign_in" | "verified" | "failed" | "unsupported_test";
  label: string;
};

type OAuthState = "blocked" | "idle" | "pending" | "connected" | "failed" | "expired" | "reconnect_required" | "unavailable";
export type ConnectorOAuthProviderStatus = { provider: EasyOAuthProvider; available: boolean; state: OAuthState; connected: boolean; tested: boolean; hasStoredConnection: boolean };
export type ConnectorOAuthSnapshot = { workspaceId: string; causaId: string | null; providers: ConnectorOAuthProviderStatus[] };
const oauthStates: readonly string[] = ["blocked", "idle", "pending", "connected", "failed", "expired", "reconnect_required", "unavailable"];

/** Accept only the checked public status for this exact personal/case workspace. */
export function connectorOAuthSnapshot(value: unknown, workspaceId: string, causaId: string | null): ConnectorOAuthSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  if (data.workspaceId !== workspaceId || data.causaId !== causaId || !Array.isArray(data.providers) || data.providers.length > EASY_OAUTH_PROVIDERS.length) return null;
  const providers: ConnectorOAuthProviderStatus[] = [];
  for (const raw of data.providers) {
    if (!raw || typeof raw !== "object") return null;
    const item = raw as Record<string, unknown>, provider = EASY_OAUTH_PROVIDERS.find(provider => provider === item.provider);
    if (!provider || providers.some(item => item.provider === provider) || typeof item.state !== "string" || !oauthStates.includes(item.state) || typeof item.available !== "boolean" || typeof item.connected !== "boolean" || typeof item.tested !== "boolean" || typeof item.hasStoredConnection !== "boolean") return null;
    providers.push({ provider, state: item.state as OAuthState, available: item.available, connected: item.connected, tested: item.tested, hasStoredConnection: item.hasStoredConnection });
  }
  return { workspaceId, causaId, providers };
}

/** Guided sign-in uses live OAuth evidence, never the adapter's saved fields. */
export function connectorAccountAvailability(entry: ConnectorCatalogEntry, inventoryVerified: boolean, snapshot: ConnectorOAuthSnapshot | null): ConnectorAvailability {
  if (entry.blockedReason) return { state: "unavailable", label: entry.platform === "macos-host" ? "Requiere escritorio en macOS" : "No disponible" };
  if (!inventoryVerified) return { state: "unknown", label: "Estado sin comprobar" };
  if (!entry.available) return { state: "unavailable", label: "No disponible en este escritorio" };
  const current = snapshot?.providers.find(item => EASY_OAUTH_CONNECTOR[item.provider] === entry.id);
  if (!current) return { state: "unknown", label: "Estado sin comprobar" };
  if (!current.available || current.state === "blocked") return { state: "unavailable", label: "Servicio en preparación" };
  if (current.connected && current.tested && current.state === "connected") return { state: "verified", label: "Acceso comprobado" };
  if (current.state === "pending") return { state: "sign_in", label: "Ingreso pendiente" };
  if (["expired", "reconnect_required"].includes(current.state)) return { state: "sign_in", label: "Vuelve a conectar" };
  if (current.state === "failed") return { state: "failed", label: "Revisar conexión" };
  if (current.hasStoredConnection || current.state === "unavailable" || current.connected || current.state === "connected") return { state: "saved", label: "Conexión sin comprobar" };
  return { state: "available", label: "Iniciar sesión" };
}

/** A saved configuration and an OAuth session are not evidence of usable access.
 * Checks are deliberately supplied by the current view, never inferred from keys. */
export function connectorConnectionAvailability(connection: ConnectorConnection, inventoryVerified: boolean, check?: ConnectorAccessCheck): ConnectorAvailability {
  if (!inventoryVerified) return { state: "unknown", label: "Estado sin comprobar" };
  if (connection.needsSignIn) return { state: "sign_in", label: "Falta iniciar sesión" };
  if (!connection.configured) return { state: "saved", label: "Configuración incompleta" };
  if (check?.tested && check.ok) return { state: "verified", label: "Acceso comprobado" };
  if (check?.tested) return { state: "failed", label: "Revisar acceso" };
  if (check) return { state: "unsupported_test", label: "Sin prueba automática" };
  return { state: "saved", label: "Guardada · sin comprobar" };
}

export function connectorAvailability(entry: ConnectorCatalogEntry, connections: readonly ConnectorConnection[], inventoryVerified: boolean, checks: ConnectorAccessChecks = {}): ConnectorAvailability {
  if (entry.blockedReason) return { state: "unavailable", label: entry.platform === "macos-host" ? "Requiere escritorio en macOS" : "No disponible" };
  if (!inventoryVerified) return { state: "unknown", label: "Disponibilidad sin comprobar" };
  if (!entry.available) return { state: "unavailable", label: "No disponible en este escritorio" };
  const accounts = connections.filter(connection => connection.kind === entry.id);
  if (!accounts.length) return { state: "available", label: "Disponible para configurar" };
  if (accounts.length === 1) return connectorConnectionAvailability(accounts[0], true, checks[accounts[0].name]);
  const verified = accounts.filter(connection => connectorConnectionAvailability(connection, true, checks[connection.name]).state === "verified").length;
  return verified
    ? { state: "verified", label: `${verified} de ${accounts.length} accesos comprobados` }
    : { state: "saved", label: `${accounts.length} conexiones guardadas` };
}
