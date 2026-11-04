import { ConnectorError } from "@/lib/personal-connectors/core";
import { endpointFor } from "./policy";
import type { ComputerFile, ComputerTurn } from "./types";
import type { PersonInput } from "./policy";

type Fetcher = typeof fetch;
export type KittyRecord = { id: string; name: string; provider: string; desktop: boolean; container: string; status: string; connectors: string[]; approvals: string; backup: string };
const safeId = (value: string) => { if (!/^[A-Za-z0-9_-]{1,100}$/.test(value)) throw new ConnectorError("gateway_identifier", "El gateway devolvió un identificador incompatible.", 502); return encodeURIComponent(value); };
export class KittiesGateway {
  private endpoint: string;
  constructor(endpoint: string, private readonly token: string, private readonly fetcher: Fetcher = fetch) { this.endpoint = endpointFor(endpoint); if (!token || token.length > 16000 || /[\r\n]/.test(token)) throw new ConnectorError("gateway_credentials", "Configure la autorización del gateway dedicado.", 503); }
  private async response(path: string, method = "GET", body?: unknown, max = 3 * 1024 * 1024) {
    let response: Response;
    try { response = await this.fetcher(`${this.endpoint}${path}`, { method, headers: { Authorization: `Bearer ${this.token}`, ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), redirect: "error", signal: AbortSignal.timeout(method === "POST" ? 45_000 : 12_000), cache: "no-store" }); }
    catch { throw new ConnectorError(method === "POST" ? "gateway_outcome_unknown" : "gateway_unreachable", method === "POST" ? "El gateway no confirmó la operación. No se repetirá automáticamente." : "No se pudo alcanzar el gateway local dedicado.", 503); }
    if (!response.ok) throw new ConnectorError(response.status === 401 ? "gateway_unauthorized" : "gateway_rejected", "El gateway rechazó la operación. Compruebe su instalación y autorización.", response.status === 401 ? 409 : 502);
    const reader = response.body?.getReader(); if (!reader) throw new ConnectorError("gateway_response", "El gateway devolvió una respuesta vacía.", 502);
    const chunks: Uint8Array[] = []; let size = 0;
    try { for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > max) { await reader.cancel(); throw new ConnectorError("gateway_response_limit", "La respuesta del gateway supera el límite admitido.", 502); } chunks.push(part.value); } } finally { reader.releaseLock(); }
    return { bytes: Buffer.concat(chunks, size), contentType: response.headers.get("content-type") || "" };
  }
  private async json(path: string, method = "GET", body?: unknown) {
    const response = await this.response(path, method, body);
    try { const data: unknown = JSON.parse(response.bytes.toString("utf8")); if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error(); return data as Record<string, unknown>; }
    catch { throw new ConnectorError("gateway_response", "El gateway no respondió con el contrato esperado.", 502); }
  }
  async readiness(provider: string, knownKittyNames: string[]) {
    const health = await this.json("/v1/health");
    if (health.ok !== true || health.containers !== true || typeof health.version !== "string" || !health.version || /demo|scripted/i.test(health.version)) throw new ConnectorError("desktop_not_ready", "Kitties debe ofrecer contenedores reales disponibles. No se admite el modo demostración.", 409);
    const data = await this.json("/v1/providers"), providers = Array.isArray(data.providers) ? data.providers : [];
    const selected = providers.find(item => item && typeof item === "object" && item.name === provider) as Record<string, unknown> | undefined;
    if (!selected || /demo|scripted/i.test(JSON.stringify(selected))) throw new ConnectorError("provider_not_ready", "Configure un proveedor real de IA dentro del gateway Kitties. ALTAZOR no transferirá sus credenciales.", 409);
    const fleet = await this.json("/v1/kitties");
    if (!Array.isArray(fleet.kitties) || fleet.kitties.some(item => !item || typeof item !== "object" || !knownKittyNames.includes(item.name) || String(item.container || "").startsWith("demo-"))) throw new ConnectorError("gateway_not_dedicated", "Este gateway contiene escritorios ajenos a este espacio. Use una instancia independiente y dedicada.", 409);
    return { version: health.version.slice(0, 120) };
  }
  async createKitty(name: string, provider: string) {
    const result = await this.json("/v1/kitties", "POST", { name, provider, desktop: true, start: true, connectors: ["-"], approvals: "ask", backup: "", limits: { max_seconds: 600, max_rounds: 12, max_tokens: 60000, attended: true }, soul: { persona: "ALTAZOR AI", language: "es", instructions: "Trabaja sólo con la tarea y los archivos elegidos por la persona en este espacio. No recibes credenciales de LexOpen ni acceso a sus expedientes. Solicita intervención humana para accesos o decisiones que la requieran. No inventes resultados ni confirmaciones." } });
    return this.validateKitty(result.kitty, name, provider);
  }
  private validateKitty(value: unknown, name: string, provider: string): KittyRecord {
    const k = value as Partial<KittyRecord> | null;
    if (!k || typeof k.id !== "string" || k.name !== name || k.provider !== provider || k.desktop !== true || typeof k.container !== "string" || !k.container || k.container.startsWith("demo-") || !Array.isArray(k.connectors) || k.connectors.length !== 1 || k.connectors[0] !== "-" || k.approvals !== "ask" || k.backup) throw new ConnectorError("kitty_contract", "Kitties no confirmó un escritorio real con los límites solicitados.", 502);
    safeId(k.id); return k as KittyRecord;
  }
  async kitty(id: string, name: string, provider: string) { const result = await this.json(`/v1/kitties/${safeId(id)}`); return this.validateKitty(result.kitty, name, provider); }
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
  async send(chatId: string, text: string, files: ComputerFile[]) { await this.json(`/v1/chats/${safeId(chatId)}/messages`, "POST", { text, files }); return { accepted: true }; }
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
