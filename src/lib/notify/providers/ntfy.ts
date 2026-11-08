import { isSafeOutboundHttpUrl, fetchSafeOutbound } from "@/lib/net/safe-url";
import type { SendResult } from "./types";

export type NtfyConfig = { baseUrl: string; topic: string; replyTopic: string; token: string };
export type NtfyReply = { id: string; time: number; message: string };
type Http = typeof fetchSafeOutbound;

export function ntfyBaseUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/" || !isSafeOutboundHttpUrl(url.href)) throw Error("Usa la dirección HTTPS pública del servidor ntfy, sin rutas ni credenciales.");
  return url.origin;
}
export function validNtfyTopic(value: string) { return /^[A-Za-z0-9_-]{16,160}$/.test(value); }

export async function boundedProviderText(response: Response, max = 256 * 1024) {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > max) throw Error("La respuesta del proveedor superó el tamaño permitido.");
      chunks.push(next.value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  return Buffer.concat(chunks).toString("utf8");
}

function endpoint(config: NtfyConfig, topic: string) {
  if (!validNtfyTopic(topic) || !config.token || /[\r\n]/.test(config.token)) throw Error("Configura los temas privados y el token de ntfy.");
  return `${ntfyBaseUrl(config.baseUrl)}/${topic}`;
}

/** https://docs.ntfy.sh/publish/ — JSON publishing, token only in Authorization. */
export async function publishNtfy(config: NtfyConfig, message: { title: string; body: string; href?: string }, http: Http = fetchSafeOutbound): Promise<SendResult> {
  try {
    const topicUrl = endpoint(config, config.topic);
    const response = await http(`${new URL(topicUrl).origin}/`, {
      method: "POST", headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ topic: config.topic, title: message.title.slice(0, 100), message: message.body.slice(0, 1800), priority: 4, tags: ["speech_balloon"], ...(message.href ? { click: message.href } : {}) }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) return { ok: false, retryable: response.status === 429 || response.status >= 500, uncertain: response.status >= 500, error: `ntfy respondió HTTP ${response.status}.` };
    const value = JSON.parse(await boundedProviderText(response, 32 * 1024)) as { id?: unknown };
    return { ok: true, providerMessageId: typeof value.id === "string" ? value.id.slice(0, 128) : undefined };
  } catch { return { ok: false, retryable: false, uncertain: true, error: "No se pudo confirmar la entrega de ntfy. Comprueba la solicitud antes de reenviarla." }; }
}

/** A bounded authenticated poll; reading never executes or resumes work. */
export async function pollNtfy(config: NtfyConfig, since: Date, http: Http = fetchSafeOutbound): Promise<NtfyReply[]> {
  const url = new URL(`${endpoint(config, config.replyTopic)}/json`);
  url.searchParams.set("poll", "1");
  url.searchParams.set("since", String(Math.floor(since.getTime() / 1000)));
  const response = await http(url.href, { headers: { Authorization: `Bearer ${config.token}` }, signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw Error(`No se pudieron consultar las respuestas de ntfy (HTTP ${response.status}).`);
  const text = await boundedProviderText(response);
  const out: NtfyReply[] = [];
  for (const line of text.split("\n").slice(0, 250)) {
    if (!line.trim()) continue;
    let value: Record<string, unknown>;
    try { value = JSON.parse(line); } catch { continue; }
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    if (value.event !== "message" || value.topic !== config.replyTopic || typeof value.id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value.id) || typeof value.time !== "number" || !Number.isFinite(value.time) || typeof value.message !== "string" || value.message.length > 4500) continue;
    out.push({ id: value.id, time: value.time, message: value.message });
  }
  return out;
}
