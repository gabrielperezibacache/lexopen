import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { writeAuditStrict } from "@/lib/audit";
import { httpError } from "@/lib/auth/access";
import { can } from "@/lib/auth/permissions";
import { isStaff } from "@/lib/auth/rbac";
import type { CausaAccessUser } from "@/lib/auth/causa-access";
import { getAssistantFirmPolicy } from "@/lib/assistant/firm-policy";
import { fetchSafeOutbound, isLoopbackHostname, isSafeOutboundHttpUrl } from "@/lib/net/safe-url";
import { decryptSecret, encryptSecret } from "@/lib/pjud/secret";
import { TRANSCRIPT_MAX_CHARS, validateSegments } from "./ingest";
import type { AudioSegment, TranscriptionConfigView } from "./types";

export const transcriptionConfigSchema = z.object({ enabled: z.boolean(), preset: z.enum(["openai", "local"]), apiUrl: z.string().trim().min(1).max(512), model: z.string().trim().min(1).max(120).regex(/^[a-zA-Z0-9_.:/-]+$/, "Nombre de modelo inválido"), responseFormat: z.enum(["json", "verbose_json"]), apiKey: z.string().trim().max(500).nullable().optional() }).strict();
type ProviderConfig = { enabled: boolean; preset: "openai" | "local"; apiUrl: string; model: string; responseFormat: "json" | "verbose_json"; apiKey?: string };
const defaults: ProviderConfig = { enabled: false, preset: "local", apiUrl: "http://localhost:8080/v1", model: "whisper-1", responseFormat: "verbose_json" };

function providerUrl(value: string, preset: ProviderConfig["preset"]) {
  let url: URL;
  try { url = new URL(value); } catch { throw httpError("Indique una dirección válida para el transcriptor", 400); }
  if (url.username || url.password || url.search || url.hash || /%2f|%5c|%00/i.test(url.pathname) || !isSafeOutboundHttpUrl(value, { allowLoopback: preset === "local", allowHttp: preset === "local" })) throw httpError("Use HTTPS público o un transcriptor local en localhost", 400);
  if (preset === "local" && !isLoopbackHostname(url.hostname)) throw httpError("El transcriptor local debe estar en localhost", 400);
  if (preset === "openai" && (url.origin !== "https://api.openai.com" || url.pathname.replace(/\/+$/, "") !== "/v1")) throw httpError("El proveedor OpenAI usa https://api.openai.com/v1", 400);
  if (url.pathname.endsWith("/audio/transcriptions")) throw httpError("Indique la dirección base; LexOpen añade /audio/transcriptions", 400);
  return url.toString().replace(/\/+$/, "");
}
async function configFor(client: PrismaClient = prisma): Promise<ProviderConfig> {
  const row = await client.integrationConfig.findUnique({ where: { provider: "transcription" } });
  if (!row) return defaults;
  let raw: unknown; try { raw = JSON.parse(row.configJson); } catch { throw httpError("La configuración del transcriptor está dañada; vuelva a guardarla", 503); }
  const config = transcriptionConfigSchema.extend({ apiKey: z.string().max(1000).nullable().optional() }).parse({ ...(raw && typeof raw === "object" ? raw : {}), enabled: row.enabled });
  const apiKey = config.apiKey ? decryptSecret(config.apiKey) : undefined;
  if (config.apiKey && !apiKey) throw httpError("No se pudo descifrar la clave del transcriptor; vuelva a guardarla", 503);
  return { ...config, apiUrl: providerUrl(config.apiUrl, config.preset), apiKey };
}
async function adminFor(user: CausaAccessUser, client: Pick<PrismaClient, "user">) {
  const actor = await client.user.findUnique({ where: { id: user.id } });
  if (!actor || !isStaff(actor.role) || !can(actor, "host.admin")) throw httpError("Solo la administración puede configurar transcripciones", 403);
  return actor;
}
function publicConfig(config: ProviderConfig, localOnly: boolean): TranscriptionConfigView {
  return { enabled: config.enabled, preset: config.preset, apiUrl: config.apiUrl, model: config.model, responseFormat: config.responseFormat, hasApiKey: Boolean(config.apiKey), localOnly };
}
export async function readTranscriptionConfig(user: CausaAccessUser, client: PrismaClient = prisma) {
  await adminFor(user, client); const [config, policy] = await Promise.all([configFor(client), getAssistantFirmPolicy()]);
  return { config: publicConfig(config, policy.assistantLlmMode === "local_only") };
}
export async function saveTranscriptionConfig(raw: unknown, user: CausaAccessUser, client: PrismaClient = prisma) {
  const input = transcriptionConfigSchema.parse(raw), apiUrl = providerUrl(input.apiUrl, input.preset);
  return client.$transaction(async tx => {
    const actor = await adminFor(user, tx), prior = await tx.integrationConfig.findUnique({ where: { provider: "transcription" } });
    let oldKey: string | undefined;
    if (prior && input.apiKey === undefined) { try { const stored = JSON.parse(prior.configJson) as { apiKey?: string }; oldKey = stored.apiKey; } catch { /* Saving valid settings repairs malformed configuration. */ } }
    const apiKey = input.apiKey === undefined ? oldKey : input.apiKey ? encryptSecret(input.apiKey) : undefined;
    const config = { preset: input.preset, apiUrl, model: input.model, responseFormat: input.responseFormat, apiKey };
    await tx.integrationConfig.upsert({ where: { provider: "transcription" }, create: { provider: "transcription", enabled: input.enabled, configJson: JSON.stringify(config) }, update: { enabled: input.enabled, configJson: JSON.stringify(config) } });
    await writeAuditStrict({ actorId: actor.id, action: "audio.transcription.configure", entityType: "IntegrationConfig", entityId: "transcription", after: { enabled: input.enabled, preset: input.preset, model: input.model, hasApiKey: Boolean(apiKey) } }, tx);
    const policy = await tx.firmSettings.findFirst({ select: { assistantLlmMode: true } });
    return { config: publicConfig({ ...input, apiUrl, apiKey: apiKey ? "present" : undefined }, policy?.assistantLlmMode === "local_only") };
  });
}

async function boundedResponse(response: Response) {
  const max = 2 * 1024 * 1024, reader = response.body?.getReader(); if (!reader) throw httpError("El transcriptor devolvió una respuesta vacía", 502);
  const chunks: Uint8Array[] = []; let total = 0;
  try {
    if (Number(response.headers.get("content-length") || 0) > max) { await reader.cancel(); throw httpError("La respuesta del transcriptor supera 2 MiB", 502); }
    for (;;) { const part = await reader.read(); if (part.done) break; total += part.value.length; if (total > max) { await reader.cancel(); throw httpError("La respuesta del transcriptor supera 2 MiB", 502); } chunks.push(part.value); }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, total))) as unknown; }
  catch { throw httpError("El transcriptor no devolvió un resultado JSON válido", 502); }
}
export function parseTranscription(raw: unknown, knownDurationMs: number | null) {
  const result = z.object({ text: z.string().trim().min(1).max(TRANSCRIPT_MAX_CHARS), duration: z.number().finite().positive().max(24 * 60 * 60).optional(), segments: z.array(z.object({ start: z.number().finite().nonnegative(), end: z.number().finite().positive(), text: z.string().trim().min(1).max(16_000) })).max(5000).optional() }).parse(raw);
  const providerDuration = result.duration === undefined ? null : Math.round(result.duration * 1000);
  if (knownDurationMs !== null && providerDuration !== null && Math.abs(providerDuration - knownDurationMs) > Math.max(1000, knownDurationMs * 0.01)) throw httpError("La duración informada por el transcriptor no coincide con la grabación", 502);
  const durationMs = knownDurationMs ?? providerDuration;
  const segments: AudioSegment[] = validateSegments((result.segments || []).map(segment => ({ startMs: Math.round(segment.start * 1000), endMs: Math.round(segment.end * 1000), text: segment.text })), durationMs);
  // A provider cannot associate unrelated timed text with the returned transcript.
  const normalize = (text: string) => text.replace(/\s+/g, " ").trim();
  if (segments.length && normalize(segments.map(s => s.text).join(" ")) !== normalize(result.text)) throw httpError("Los segmentos temporales no coinciden con el texto transcrito", 502);
  return { text: result.text, segments, durationMs };
}
export async function transcribeAudioBytes(input: { bytes: Buffer; name: string; mimeType: string; durationMs: number | null; beforeEgress: () => Promise<void> }, client: PrismaClient = prisma) {
  const config = await configFor(client);
  if (!config.enabled) throw httpError("Configure y active un transcriptor en Configuración → Audios, o importe una transcripción TXT manual", 409);
  const policy = await getAssistantFirmPolicy(), local = isLoopbackHostname(new URL(config.apiUrl).hostname);
  if (policy.assistantLlmMode === "local_only" && !local) throw httpError("El estudio permite solo IA local; no se envió audio a un proveedor remoto", 403);
  if (config.preset === "openai" && !config.apiKey) throw httpError("Falta la clave del transcriptor OpenAI", 409);
  // A second policy/actor check immediately precedes byte egress.
  await input.beforeEgress();
  const currentPolicy = await getAssistantFirmPolicy();
  if (currentPolicy.assistantLlmMode === "local_only" && !local) throw httpError("El estudio permite solo IA local; no se envió audio a un proveedor remoto", 403);
  const body = new FormData(); body.set("file", new File([new Uint8Array(input.bytes)], input.name, { type: input.mimeType })); body.set("model", config.model);
  // Format is an explicit configuration choice; JSON without timings remains unaligned.
  body.set("response_format", config.responseFormat);
  const headers: Record<string, string> = { Accept: "application/json" }; if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;
  let response: Response;
  try { response = await fetchSafeOutbound(`${config.apiUrl}/audio/transcriptions`, { method: "POST", body, headers, allowLoopback: local, allowHttp: local, signal: AbortSignal.timeout(90_000) }); }
  catch { throw httpError("No se pudo conectar con el transcriptor. Revise su configuración o importe un TXT manual", 502); }
  if (!response.ok) { await response.body?.cancel(); throw httpError(`El transcriptor rechazó el audio (HTTP ${response.status}). Revise formato, modelo y cuota`, 502); }
  try { return { ...parseTranscription(await boundedResponse(response), input.durationMs), provider: config.preset === "local" ? "local-whisper-compatible" : "openai", model: config.model }; }
  catch (error) { if (error && typeof error === "object" && "status" in error) throw error; throw httpError("El transcriptor devolvió texto o marcas temporales inválidas", 502); }
}
