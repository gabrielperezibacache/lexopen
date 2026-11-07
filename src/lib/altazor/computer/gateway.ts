import { ConnectorError } from "@/lib/personal-connectors/core";
import { endpointFor } from "./policy";
import type { ComputerFile, ComputerTurn } from "./types";
import type { PersonInput } from "./policy";
import { CONNECTOR_GATE, connectorKind } from "../connectors/catalog";
import { assertGatewayOAuthAllowed, connectorConfigBody, connectorNameSchema, normalizeConnectorNames, projectConnectorSettings, validateConnectorConfiguration } from "../connectors/policy";
import type { ConnectorApproval, ConnectorConfiguration } from "../connectors/types";
import { assertEasyConnectorRead } from "../connectors/desktop-read-policy";

type Fetcher = typeof fetch;
export type KittyRecord = { id: string; name: string; provider: string; desktop: boolean; container: string; status: string; connectors: string[]; approvals: string; backup: string };
const safeId = (value: string) => { if (!/^[A-Za-z0-9_-]{1,100}$/.test(value)) throw new ConnectorError("gateway_identifier", "El gateway devolvió un identificador incompatible.", 502); return encodeURIComponent(value); };
export class KittiesGateway {
  private endpoint: string;
  constructor(endpoint: string, private readonly token: string, private readonly fetcher: Fetcher = fetch) { this.endpoint = endpointFor(endpoint); if (!token || token.length > 16000 || /[\r\n]/.test(token)) throw new ConnectorError("gateway_credentials", "Configure la autorización del gateway dedicado.", 503); }
  private async response(path: string, method = "GET", body?: unknown, max = 3 * 1024 * 1024) {
    let response: Response;
    try { response = await this.fetcher(`${this.endpoint}${path}`, { method, headers: { Authorization: `Bearer ${this.token}`, ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), redirect: "error", signal: AbortSignal.timeout(method === "POST" ? 45_000 : 12_000), cache: "no-store" }); }
    catch { throw new ConnectorError(method !== "GET" ? "gateway_outcome_unknown" : "gateway_unreachable", method !== "GET" ? "El gateway no confirmó la operación. No se repetirá automáticamente." : "No se pudo alcanzar el gateway local dedicado.", 503); }
    if (!response.ok) throw new ConnectorError(response.status === 401 ? "gateway_unauthorized" : "gateway_rejected", "El gateway rechazó la operación. Compruebe su instalación y autorización.", response.status === 401 ? 409 : 502);
    const reader = response.body?.getReader(); if (!reader) throw new ConnectorError("gateway_response", "El gateway devolvió una respuesta vacía.", 502);
    const chunks: Uint8Array[] = []; let size = 0;
    try { for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > max) { await reader.cancel(); throw new ConnectorError("gateway_response_limit", "La respuesta del gateway supera el límite admitido.", 502); } chunks.push(part.value); } } finally { reader.releaseLock(); }
    return { bytes: Buffer.concat(chunks, size), contentType: response.headers.get("content-type") || "", status: response.status };
  }
  private async json(path: string, method = "GET", body?: unknown) {
    const response = await this.response(path, method, body);
    try { const data: unknown = JSON.parse(response.bytes.toString("utf8")); if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error(); return data as Record<string, unknown>; }
    catch { throw new ConnectorError("gateway_response", "El gateway no respondió con el contrato esperado.", 502); }
  }
  async readiness(provider: string, knownKittyNames: string[], requireConnectorGate = false) {
    const health = await this.json("/v1/health");
    if (health.ok !== true || health.containers !== true || typeof health.version !== "string" || !health.version || /demo|scripted/i.test(health.version)) throw new ConnectorError("desktop_not_ready", "El gateway debe ofrecer contenedores reales disponibles. No se admite el modo demostración.", 409);
    if (requireConnectorGate && health.lexopen_connector_gate !== CONNECTOR_GATE) throw new ConnectorError("connector_gate_required", "Actualice el gateway con el refuerzo de permisos de LexOpen antes de habilitar conexiones.", 409);
    const data = await this.json("/v1/providers"), providers = Array.isArray(data.providers) ? data.providers : [];
    const selected = providers.find(item => item && typeof item === "object" && item.name === provider) as Record<string, unknown> | undefined;
    if (!selected || /demo|scripted/i.test(JSON.stringify(selected))) throw new ConnectorError("provider_not_ready", "Configure un proveedor real de IA en el gateway del escritorio. ALTAZOR no transferirá sus credenciales.", 409);
    const fleet = await this.json("/v1/kitties");
    if (!Array.isArray(fleet.kitties) || fleet.kitties.some(item => !item || typeof item !== "object" || !knownKittyNames.includes(item.name) || String(item.container || "").startsWith("demo-"))) throw new ConnectorError("gateway_not_dedicated", "Este gateway contiene escritorios ajenos a este espacio. Use una instancia independiente y dedicada.", 409);
    return { version: health.version.slice(0, 120), connectorGate: health.lexopen_connector_gate === CONNECTOR_GATE };
  }
  async createKitty(name: string, provider: string, connectors: readonly string[] = ["-"], start = true) {
    const selected = normalizeConnectorNames(connectors);
    if (selected[0] !== "-") await this.requireConnectorGate();
    if (selected.some(name => /^altazor-(?:google|github)-[a-f0-9]{16}$/.test(name))) await this.requireFileReads();
    const result = await this.json("/v1/kitties", "POST", { name, provider, desktop: true, start, connectors: selected, approvals: "ask", backup: "", limits: { max_seconds: 600, max_rounds: 12, max_tokens: 60000, attended: true }, soul: { persona: "ALTAZOR AI", language: "es", instructions: "Trabaja sólo con la tarea y los archivos elegidos por la persona en este espacio. No recibes credenciales de LexOpen ni acceso a sus expedientes. Solicita intervención humana para accesos o decisiones que la requieran. No inventes resultados ni confirmaciones." } });
    return this.validateKitty(result.kitty, name, provider, selected);
  }
  private validateKitty(value: unknown, name: string, provider: string, connectors: readonly string[] = ["-"]): KittyRecord {
    const k = value as Partial<KittyRecord> | null;
    const selected = normalizeConnectorNames(connectors);
    if (!k || typeof k.id !== "string" || k.name !== name || k.provider !== provider || k.desktop !== true || typeof k.container !== "string" || !k.container || k.container.startsWith("demo-") || !Array.isArray(k.connectors) || JSON.stringify([...k.connectors].sort()) !== JSON.stringify(selected) || k.approvals !== "ask" || k.backup) throw new ConnectorError("kitty_contract", "El gateway no confirmó un escritorio real con los límites solicitados.", 502);
    safeId(k.id); return k as KittyRecord;
  }
  async kitty(id: string, name: string, provider: string, connectors: readonly string[] = ["-"]) { const result = await this.json(`/v1/kitties/${safeId(id)}`); const kitty = this.validateKitty(result.kitty, name, provider, connectors); if (id !== name && kitty.id !== id) throw new ConnectorError("kitty_contract", "El gateway devolvió otro escritorio.", 502); return kitty; }
  async requireConnectorGate() { const health = await this.json("/v1/health"); if (health.ok !== true || health.lexopen_connector_gate !== CONNECTOR_GATE) throw new ConnectorError("connector_gate_required", "El gateway necesita el refuerzo de permisos de LexOpen para usar conexiones.", 409); }
  async requireFileReads() { const health = await this.json("/v1/health"); if (health.ok !== true || health.lexopen_file_reads !== "v1") throw new ConnectorError("file_reads_required", "Actualice el escritorio de Altazor para trabajar con archivos completos de Google Drive y GitHub.", 409); }
  async connectorSettings() {
    const health = await this.json("/v1/health"), hardened = health.lexopen_connector_gate === CONNECTOR_GATE;
    return projectConnectorSettings(await this.json("/v1/settings"), hardened && ["darwin", "linux", "windows"].includes(String(health.lexopen_connector_platform)) ? String(health.lexopen_connector_platform) : "unknown", hardened && health.lexopen_dropbox_read_gate === true);
  }
  async setConnector(name: string, value: ConnectorConfiguration) {
    connectorNameSchema.parse(name); const input = validateConnectorConfiguration(value);
    return projectConnectorSettings(await this.json(`/v1/settings/connectors/${safeId(name)}${input.signIn ? "?sign_in=1" : ""}`, "PUT", connectorConfigBody(input)));
  }
  async removeConnector(name: string) { connectorNameSchema.parse(name); return projectConnectorSettings(await this.json(`/v1/settings/connectors/${safeId(name)}`, "DELETE")); }
  async testConnector(name: string) {
    connectorNameSchema.parse(name); const result = await this.json(`/v1/settings/connectors/${safeId(name)}/test`, "POST", {});
    if (typeof result.ok !== "boolean" || typeof result.tested !== "boolean") throw new ConnectorError("connector_test_contract", "No se pudo verificar la conexión.", 502);
    return { ok: result.ok, tested: result.tested };
  }
  async connectorOAuth(name: string) {
    connectorNameSchema.parse(name);
    const settings = await this.json("/v1/settings"), projected = projectConnectorSettings(settings), connection = projected.connections.find(row => row.name === name);
    assertGatewayOAuthAllowed(connection?.kind);
    const kind = connection && connectorKind(connection.kind);
    if (!kind?.oauth) throw new ConnectorError("connector_oauth", "Esta conexión no ofrece inicio de sesión OAuth.", 409);
    const raw = (settings.connectors as Record<string, unknown>[]).find(row => row.name === name);
    const fields = raw?.settings && typeof raw.settings === "object" ? raw.settings as Record<string, unknown> : {};
    const result = await this.json(`/v1/oauth/${safeId(name)}/start`, "POST", {});
    let url: URL, redirect: URL;
    try { url = new URL(String(result.url)); redirect = new URL(String(result.redirect)); } catch { throw new ConnectorError("connector_oauth_contract", "El gateway no confirmó un ingreso oficial.", 502); }
    const hosts: Record<string, string[]> = { google: ["accounts.google.com"], microsoft: ["login.microsoftonline.com"], slack: ["slack.com"], github: ["github.com"], spotify: ["accounts.spotify.com"], tidal: ["login.tidal.com"], notion: ["api.notion.com"], todoist: ["todoist.com"], linear: ["linear.app"], airtable: ["airtable.com"], figma: ["www.figma.com"], atlassian: ["auth.atlassian.com"], x: ["x.com"], linkedin: ["www.linkedin.com"], facebook: ["www.facebook.com"] };
    let allowed = hosts[kind.oauth]?.includes(url.hostname) === true;
    if (["mastodon", "gitlab", "home-assistant"].includes(kind.oauth)) {
      try { allowed = url.origin === new URL(String(fields.url || raw?.url || (kind.oauth === "gitlab" ? "https://gitlab.com" : ""))).origin; } catch { allowed = false; }
    }
    if (kind.oauth === "zendesk") allowed = typeof fields.subdomain === "string" && /^[a-z0-9-]{1,80}$/.test(fields.subdomain) && url.hostname === `${fields.subdomain}.zendesk.com`;
    const expectedRedirect = new URL("/v1/oauth/callback", this.endpoint);
    if (!allowed || ["client_secret", "access_token", "refresh_token", "password", "code_verifier"].some(key => url.searchParams.has(key)) || url.username || url.password || url.hash || url.href.length > 12000 || !["https:", ...(kind.oauth === "home-assistant" ? ["http:"] : [])].includes(url.protocol) || redirect.href !== expectedRedirect.href || url.searchParams.get("redirect_uri") !== expectedRedirect.href || !url.searchParams.get("state")) throw new ConnectorError("connector_oauth_contract", "El ingreso no coincide con el servicio y el gateway dedicados.", 502);
    return { url: url.href, redirect: redirect.href };
  }
  async setApprovalRule(kittyId: string, connector: string) {
    connectorNameSchema.parse(connector);
    const result = await this.json("/v1/approvals/rules", "POST", { kitty: kittyId, connector, action: "*", mode: "ask" });
    const rule = result.rule as Record<string, unknown> | undefined;
    if (!rule || rule.kitty !== kittyId || rule.connector !== connector || rule.action !== "*" || rule.mode !== "ask") throw new ConnectorError("connector_rule_contract", "El gateway no confirmó la autorización por uso.", 502);
  }
  async startKitty(id: string) { await this.json(`/v1/kitties/${safeId(id)}/start`, "POST", {}); }
  async setKittyConnectors(id: string, name: string, provider: string, connectors: readonly string[]) {
    const selected = normalizeConnectorNames(connectors);
    if (selected[0] !== "-") { await this.requireConnectorGate(); for (const connector of selected) await this.setApprovalRule(id, connector); }
    const result = await this.json(`/v1/kitties/${safeId(id)}`, "PATCH", { connectors: selected, approvals: "ask" });
    return this.validateKitty(result.kitty, name, provider, selected);
  }
  async pendingApprovals(kittyId: string, chatId: string, connectors: readonly string[]): Promise<ConnectorApproval[]> {
    await this.requireConnectorGate(); const result = await this.json("/v1/approvals?status=pending");
    if (!Array.isArray(result.approvals) || result.approvals.length > 200) throw new ConnectorError("connector_approvals_contract", "No se pudo leer las autorizaciones pendientes.", 502);
    return result.approvals.filter(row => row && row.kitty === kittyId && row.chat === chatId && row.status === "pending" && connectors.includes(row.connector)).map(row => {
      const kind = connectorKind(String(row.kind));
      if (!kind || typeof row.id !== "string" || typeof row.action !== "string" || !row.args || typeof row.args !== "object" || Array.isArray(row.args)) throw new ConnectorError("connector_approvals_contract", "La autorización no corresponde a una conexión verificada.", 502);
      safeId(row.id);
      return { id: row.id, kittyId, chatId, connector: String(row.connector), kind: kind.id, action: row.action.slice(0, 100), summary: typeof row.summary === "string" ? row.summary.slice(0, 1000) : "", ...safeApprovalArgs(row.args), at: typeof row.at === "string" ? row.at.slice(0, 80) : "", status: "pending" as const };
    });
  }
  async decideApproval(id: string, kittyId: string, chatId: string, connectors: readonly string[], approve: boolean) {
    const pending = await this.pendingApprovals(kittyId, chatId, connectors);
    const selected = pending.find(row => row.id === id);
    if (!selected) throw new ConnectorError("connector_approval_missing", "La autorización ya cambió o no pertenece a esta sesión.", 409);
    if (approve) assertEasyConnectorRead(selected);
    if (approve && selected.kind === "dropbox" && !(connectorKind("dropbox")?.actions as readonly string[]).includes(selected.action)) throw new ConnectorError("connector_action_unavailable", "Dropbox sólo permite listar, buscar y leer archivos.", 409);
    if (approve && !selected.reviewable) throw new ConnectorError("connector_approval_incomplete", "El detalle contiene datos ocultos o excede el límite de revisión. Rechácelo y revise la operación directamente en la aplicación.", 409);
    const easyRead = selected.kind === "github" && /^altazor-github-[a-f0-9]{16}$/.test(selected.connector) || selected.kind === "google-workspace" && /^altazor-google-[a-f0-9]{16}$/.test(selected.connector);
    if (approve && easyRead) await this.requireAsyncMessages();
    const result = await this.json(`/v1/approvals/${safeId(id)}/${approve ? "approve" : "reject"}`, "POST", approve ? { always: false } : { reason: "La persona rechazó esta operación en LexOpen.", always: false });
    const approval = result.approval as Record<string, unknown> | undefined;
    if (!approval || approval.id !== id || approval.kitty !== kittyId || approval.chat !== chatId || approval.status !== (approve ? "approved" : "rejected") || approval.always === true) throw new ConnectorError("connector_approval_unknown", "El gateway no confirmó la decisión. No se repetirá automáticamente.", 502);
    return { id, status: String(approval.status), failed: Boolean(approval.error), canContinue: approve && easyRead && !approval.error };
  }
  async createChat(kitty: KittyRecord) {
    const result = await this.json("/v1/chats", "POST", { title: "ALTAZOR AI · espacio privado", members: [kitty.name] });
    return this.validateChat(result.chat, kitty.id).id;
  }
  private validateChat(value: unknown, kittyId: string, allowNullTurns = false, expectedId?: string) {
    const chat = value as { id?: unknown; members?: unknown; turns?: unknown } | null;
    if (!chat || typeof chat.id !== "string" || expectedId !== undefined && chat.id !== expectedId || !Array.isArray(chat.members) || chat.members.length !== 1 || chat.members[0] !== kittyId || !(Array.isArray(chat.turns) || allowNullTurns && chat.turns === null)) throw new ConnectorError("chat_contract", "El chat del gateway no coincide con este escritorio privado.", 502);
    // The pinned upstream GET copies an empty Turn slice into nil, serialized as null.
    safeId(chat.id); return { id: chat.id, members: chat.members, turns: chat.turns === null ? [] : chat.turns } as { id: string; members: string[]; turns: Record<string, unknown>[] };
  }
  async chat(id: string, kittyId: string): Promise<{ working: boolean; turns: ComputerTurn[] }> {
    const result = await this.json(`/v1/chats/${safeId(id)}`), chat = this.validateChat(result.chat, kittyId, true, id);
    return { working: chat.turns.some(turn => turn.working === true), turns: chat.turns.slice(-80).map((turn, index) => ({ index: Math.max(0, chat.turns.length - 80) + index, from: turn.from === "user" ? "user" : turn.from === "system" ? "system" : "assistant", text: typeof turn.text === "string" ? turn.text.slice(0, 24000) : "", working: turn.working === true, needsHelp: turn.needs_help === true, steps: Array.isArray(turn.steps) ? turn.steps.slice(-60).map(step => ({ action: typeof step.action === "string" ? step.action.slice(0, 80) : "acción", at: typeof step.at === "string" ? step.at.slice(0, 60) : "" })) : [] })) };
  }
  async requireAsyncMessages() {
    const health = await this.json("/v1/health");
    if (health.ok !== true || health.lexopen_async_messages !== "v1") throw new ConnectorError("async_messages_required", "Actualice el escritorio para enviar encargos que puedan supervisarse y detenerse desde el inicio.", 409);
  }
  async send(chatId: string, text: string, files: ComputerFile[], requestId: string) {
    // This is the persisted action ID, not a fresh ID on each network attempt.
    // Never fall back to the synchronous endpoint or resend an ambiguous request.
    safeId(chatId); safeId(requestId);
    await this.requireAsyncMessages();
    const response = await this.response(`/v1/chats/${safeId(chatId)}/messages/async`, "POST", { text, files, request_id: requestId });
    let receipt: Record<string, unknown>;
    try { receipt = JSON.parse(response.bytes.toString("utf8")); }
    catch { throw new ConnectorError("gateway_receipt_unknown", "El escritorio no confirmó la recepción del encargo. Compruebe su actividad antes de continuar; no se reenviará automáticamente.", 502); }
    if (response.status !== 202 || !response.contentType.startsWith("application/json") || !receipt || typeof receipt !== "object" || Array.isArray(receipt) || receipt.request_id !== requestId || receipt.chat_id !== chatId || receipt.status !== "accepted") throw new ConnectorError("gateway_receipt_unknown", "El escritorio no confirmó la recepción del encargo. Compruebe su actividad antes de continuar; no se reenviará automáticamente.", 502);
    return { accepted: true, requestId };
  }
  async cancel(chatId: string) { const result = await this.json(`/v1/chats/${safeId(chatId)}/cancel`, "POST", {}); return { cancelled: result.cancelled === true }; }
  async control(kittyId: string, hold: boolean) { const result = await this.json(`/v1/kitties/${safeId(kittyId)}/control`, "POST", { hold }); if (typeof result.held !== "boolean") throw new ConnectorError("control_contract", "El gateway no confirmó el control manual.", 502); return { held: result.held }; }
  async input(kittyId: string, input: PersonInput) { await this.json(`/v1/kitties/${safeId(kittyId)}/input`, "POST", input); return { accepted: true }; }
  async stop(kittyId: string) { await this.json(`/v1/kitties/${safeId(kittyId)}/stop`, "POST", {}); return { stopped: true }; }
  async screenshot(kittyId: string) {
    const result = await this.response(`/v1/kitties/${safeId(kittyId)}/screenshot`, "GET", undefined, 8 * 1024 * 1024), bytes = result.bytes;
    if (!result.contentType.startsWith("image/png") || bytes.length < 33 || bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" || bytes.readUInt32BE(16) > 10000 || bytes.readUInt32BE(20) > 10000) throw new ConnectorError("screenshot_invalid", "El gateway no entregó una captura PNG válida.", 502);
    return bytes;
  }
}

function safeApprovalArgs(value: Record<string, unknown>) {
  let reviewable = Buffer.byteLength(JSON.stringify(value), "utf8") <= 64 * 1024;
  const walk = (item: unknown, depth = 0): unknown => {
    if (depth > 12) { reviewable = false; return "…"; }
    if (typeof item === "string") { if (item.length > 32000) reviewable = false; return item.slice(0, 32000); }
    if (typeof item === "number" || typeof item === "boolean" || item === null) return item;
    if (Array.isArray(item)) { if (item.length > 200) reviewable = false; return item.slice(0, 200).map(entry => walk(entry, depth + 1)); }
    if (item && typeof item === "object") { const entries = Object.entries(item); if (entries.length > 200) reviewable = false; return Object.fromEntries(entries.slice(0, 200).map(([key, entry]) => { const sensitive = /token|secret|password|authorization|cookie/i.test(key); if (sensitive || key.length > 100) reviewable = false; return [key.slice(0, 100), sensitive ? "••••" : walk(entry, depth + 1)]; })); }
    return null;
  };
  const args = walk(value) as Record<string, unknown>;
  return { args, reviewable };
}
