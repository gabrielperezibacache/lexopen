import { z } from "zod";
import { httpError } from "@/lib/auth/access";
import { identifyAudio } from "./ingest";
export const LIVE_AUDIO_LIMITS = { clipBytes: 4 * 1024 * 1024, sessionBytes: 256 * 1024 * 1024, clips: 360, sessions: 20, page: 30, textChars: 16_000, clipSeconds: 15 } as const;
export const liveAudioRequestId = z.string().min(10).max(100).regex(/^[a-zA-Z0-9-]+$/);
export const liveAudioStartSchema = z.object({ requestId: liveAudioRequestId, title: z.string().trim().min(3).max(160) }).strict();
export const liveAudioCommandSchema = z.object({ requestId: liveAudioRequestId }).strict();
export const liveAudioQuerySchema = z.object({ sessionId: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/).optional(), before: z.coerce.number().int().min(1).max(360).optional() }).strict();
export type LiveAudioUpload = { requestId: string; sequence: number; name: string; bytes: Buffer };
export function validateLiveAudioUpload(input: LiveAudioUpload) {
  liveAudioRequestId.parse(input.requestId); z.number().int().min(0).max(LIVE_AUDIO_LIMITS.clips - 1).parse(input.sequence);
  z.string().min(1).max(240).regex(/^[^\r\n\0]+$/).parse(input.name);
  if (!input.bytes.length || input.bytes.length > LIVE_AUDIO_LIMITS.clipBytes) throw httpError("Cada tramo admite hasta 4 MiB", 413);
  const format = identifyAudio(input.name, input.bytes);
  if (format.durationMs !== null && (format.durationMs < 100 || format.durationMs > 30_000)) throw httpError("Cada tramo debe durar entre 100 ms y 30 segundos", 422);
  return format;
}
export async function readLiveAudioUpload(request: Request): Promise<LiveAudioUpload> {
  const contentType = request.headers.get("content-type") || "", max = LIVE_AUDIO_LIMITS.clipBytes + 64 * 1024;
  if (!contentType.startsWith("multipart/form-data;")) throw httpError("Adjunte un tramo de audio desde la captura", 415);
  if (Number(request.headers.get("content-length") || 0) > max) { await request.body?.cancel(); throw httpError("Cada tramo admite hasta 4 MiB", 413); }
  const reader = request.body?.getReader(); if (!reader) throw httpError("El tramo de audio está vacío", 400);
  const chunks: Uint8Array[] = []; let total = 0;
  try { for (;;) { const part = await reader.read(); if (part.done) break; total += part.value.length; if (total > max) { await reader.cancel(); throw httpError("Cada tramo admite hasta 4 MiB", 413); } chunks.push(part.value); } } finally { reader.releaseLock(); }
  let form: FormData; try { form = await new Request(request.url, { method: "POST", headers: { "content-type": contentType }, body: Buffer.concat(chunks, total) }).formData(); } catch { throw httpError("No se pudo leer el tramo de audio", 400); }
  const allowed = new Set(["file", "requestId", "sequence"]);
  for (const [key] of form) if (!allowed.has(key) || form.getAll(key).length !== 1) throw httpError("Campos de tramo inválidos o repetidos", 400);
  for (const key of allowed) if (form.getAll(key).length !== 1) throw httpError("Faltan campos del tramo de audio", 400);
  const file = form.get("file"); if (!(file instanceof File) || !file.size || file.size > LIVE_AUDIO_LIMITS.clipBytes) throw httpError("Cada tramo admite hasta 4 MiB", 413);
  const sequence = z.string().regex(/^(0|[1-9]\d{0,2})$/).transform(Number).pipe(z.number().int().min(0).max(359)).parse(form.get("sequence"));
  const input = { requestId: liveAudioRequestId.parse(form.get("requestId")), sequence, name: file.name, bytes: Buffer.from(await file.arrayBuffer()) };
  validateLiveAudioUpload(input); return input;
}
