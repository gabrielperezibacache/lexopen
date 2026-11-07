import { z } from "zod";
import { ConnectorError } from "@/lib/personal-connectors/core";
import { CONNECTOR_CATALOG, connectorKind } from "./catalog";
import type { ConnectorKindId } from "./catalog";
import type { ConnectorCatalogEntry, ConnectorConfiguration, ConnectorConnection } from "./types";

export const connectorNameSchema = z.string().regex(/^[a-z][a-z0-9-]{0,79}$/);
export const connectorConfigurationSchema = z.object({ kind: z.string().max(80), settings: z.record(z.string(), z.string().max(6000)), signIn: z.boolean().optional(), clear: z.array(z.string().max(80)).max(30).optional() }).strict();
export function assertGatewayOAuthAllowed(kind: ConnectorKindId | undefined) {
  if (kind === "dropbox") throw new ConnectorError("dropbox_guided_oauth_required", "Use Conectar Dropbox para autorizar el acceso de sólo lectura.", 409);
}
const badContract = () => new ConnectorError("connector_contract", "El gateway no confirmó el contrato de conexiones de esta versión.", 502);
const plain = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
const clean = (value: unknown, max: number) => typeof value === "string" ? value.replace(/[\x00-\x1f\x7f]/g, "").slice(0, max) : "";

export function normalizeConnectorNames(names: readonly string[] = ["-"]) {
  if (names.length === 1 && names[0] === "-") return ["-"];
  if (!names.length || names.length > 48 || new Set(names).size !== names.length || names.some(name => !connectorNameSchema.safeParse(name).success)) throw new ConnectorError("connector_selection", "Seleccione conexiones explícitas; una lista vacía no está permitida.");
  return [...names].sort();
}
export function validateConnectorConfiguration(value: unknown): ConnectorConfiguration {
  const parsed = connectorConfigurationSchema.safeParse(value);
  if (!parsed.success) throw new ConnectorError("connector_config", "Revise los campos y el tamaño de la configuración.");
  const kind = connectorKind(parsed.data.kind);
  if (!kind) throw new ConnectorError("connector_kind", "Seleccione una conexión del catálogo verificado.");
  if ("blockedReason" in kind) throw new ConnectorError("connector_host_program", kind.blockedReason, 409);
  if (parsed.data.signIn) assertGatewayOAuthAllowed(kind.id);
  const allowed: readonly string[] = kind.fieldNames;
  if (Object.keys(parsed.data.settings).length > 30 || Object.entries(parsed.data.settings).some(([name, text]) => !allowed.includes(name) || /[\x00]/.test(text)) || parsed.data.clear?.some(name => name !== "sign_in" && !allowed.includes(name)) || Buffer.byteLength(JSON.stringify(parsed.data.settings), "utf8") > 24 * 1024) throw new ConnectorError("connector_fields", "La configuración contiene campos no admitidos o supera 24 KiB.");
  return { ...parsed.data, kind: kind.id };
}
export function projectConnectorSettings(raw: Record<string, unknown>, gatewayPlatform = "unknown", dropboxReadOnly = false) {
  if (!Array.isArray(raw.connector_catalog) || !Array.isArray(raw.connectors) || raw.connector_catalog.length > 80 || raw.connectors.length > 100) throw badContract();
  const runtimeCatalog = raw.connector_catalog;
  const oauthReady = new Set(Array.isArray(raw.oauth_ready) ? raw.oauth_ready.filter((value): value is string => typeof value === "string") : []);
  const catalog: ConnectorCatalogEntry[] = CONNECTOR_CATALOG.map(kind => {
    const runtime = runtimeCatalog.find((item: unknown) => plain(item) && item.name === kind.id);
    const fields = plain(runtime) && Array.isArray(runtime.fields) ? runtime.fields : [];
    const blockedReason = kind.platform === "macos-host" && gatewayPlatform !== "darwin" ? "Esta conexión necesita un gateway nativo en macOS; no está disponible en este entorno." : kind.id === "dropbox" && !dropboxReadOnly ? "Actualice el escritorio de Altazor para conectar Dropbox con permisos de lectura." : undefined;
    return { ...kind, available: Boolean(runtime) && !blockedReason, oauthReady: Boolean(kind.oauth && oauthReady.has(kind.oauth)), ...(blockedReason ? { blockedReason } : {}), fields: fields.filter((item: unknown) => plain(item) && (kind.fieldNames as readonly string[]).includes(String(item.name))).slice(0, 30).map((item: Record<string, unknown>) => ({ name: String(item.name), label: clean(item.label, 120) || String(item.name), ...(clean(item.help, 500) ? { help: clean(item.help, 500) } : {}), secret: item.secret === true, required: item.required === true, ...(["token", "oauth1", "webhook"].includes(String(item.key)) ? { key: String(item.key) } : {}) })) };
  });
  const connections: ConnectorConnection[] = raw.connectors.map((value: unknown) => {
    if (!plain(value) || !connectorNameSchema.safeParse(value.name).success || typeof value.kind !== "string") throw badContract();
    const kind = connectorKind(value.kind);
    if (!kind) throw badContract();
    const secretFields = Array.isArray(value.secrets_set) ? value.secrets_set.filter((name: unknown): name is string => typeof name === "string" && (kind.fieldNames as readonly string[]).includes(name)).slice(0, 30) : [];
    const needsSignIn = value.needs_sign_in === true;
    const ownAppConfigured = plain(value.settings) && typeof value.settings.client_id === "string" && Boolean(value.settings.client_id.trim());
    return { name: String(value.name), kind: kind.id, signedIn: value.signed_in === true, needsSignIn, configured: !needsSignIn, ownAppConfigured, secretFields, auth: ["sign-in", "keys", "token", "webhook"].includes(String(value.auth)) ? String(value.auth) : null, usedBy: Array.isArray(value.used_by) ? value.used_by.filter((name: unknown): name is string => typeof name === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(name)).slice(0, 100) : [] };
  });
  if (new Set(connections.map(row => row.name)).size !== connections.length) throw badContract();
  return { catalog, connections };
}

export function connectorConfigBody(input: ConnectorConfiguration) {
  // Only the server sends these values to the dedicated gateway. Never project this body.
  return { kind: input.kind, settings: input.settings, ...(input.clear ? { clear: input.clear } : {}) };
}
