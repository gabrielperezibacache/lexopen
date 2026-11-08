import type { ConnectorCatalogEntry, ConnectorConnection } from "./types";

export type ConnectorAccessCheck = { ok: boolean; tested: boolean };
export type ConnectorAccessChecks = Readonly<Record<string, ConnectorAccessCheck | undefined>>;
export type ConnectorAvailability = {
  state: "unknown" | "unavailable" | "available" | "saved" | "sign_in" | "verified" | "failed" | "unsupported_test";
  label: string;
};

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
