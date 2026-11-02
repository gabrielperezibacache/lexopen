import { z } from "zod";
import { httpError } from "@/lib/auth/access";
import type { AudioSegment } from "./types";

export const AUDIO_MAX_BYTES = 25 * 1024 * 1024;
export const TRANSCRIPT_MAX_CHARS = 160_000;
export const AUDIO_FORMATS = ".mp3,.wav,.m4a,.mp4,.ogg,.webm,.flac";
export type AudioUpload = { requestId: string; title: string; name: string; bytes: Buffer };
export const audioRevisionSchema = z.object({ revision: z.number().int().positive() }).strict();
const segmentSchema = z.object({ startMs: z.number().finite().nonnegative(), endMs: z.number().finite().positive(), text: z.string().trim().min(1).max(16_000), speaker: z.string().trim().min(1).max(100).optional() }).strict();
export const audioEditSchema = z.object({ revision: z.number().int().positive(), transcriptText: z.string().trim().min(1).max(TRANSCRIPT_MAX_CHARS), segments: z.array(segmentSchema).max(5000).optional(), reviewed: z.boolean().default(false) }).strict();

/** The entire multipart stream is capped before the platform allocates its fields. */
export async function readAudioUpload(request: Request): Promise<AudioUpload> {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.startsWith("multipart/form-data;")) throw httpError("Adjunte una grabación desde el formulario", 415);
  const max = AUDIO_MAX_BYTES + 64 * 1024;
  if (Number(request.headers.get("content-length") || 0) > max) { await request.body?.cancel(); throw httpError("La grabación supera 25 MiB", 413); }
  const reader = request.body?.getReader(); if (!reader) throw httpError("Seleccione una grabación", 400);
  const chunks: Uint8Array[] = []; let total = 0;
  try { for (;;) { const part = await reader.read(); if (part.done) break; total += part.value.length; if (total > max) { await reader.cancel(); throw httpError("La grabación supera 25 MiB", 413); } chunks.push(part.value); } } finally { reader.releaseLock(); }
  let form: FormData;
  try { form = await new Request(request.url, { method: "POST", headers: { "content-type": contentType }, body: Buffer.concat(chunks, total) }).formData(); }
  catch { throw httpError("No se pudo leer el archivo; vuelva a seleccionarlo", 400); }
  const allowed = new Set(["file", "requestId", "title"]);
  for (const [key] of form) if (!allowed.has(key) || form.getAll(key).length !== 1) throw httpError("Campos de grabación inválidos o repetidos", 400);
  const file = form.get("file");
  if (!(file instanceof File) || !file.size || file.size > AUDIO_MAX_BYTES || !file.name || file.name.length > 240) throw httpError("Seleccione un audio de hasta 25 MiB con nombre válido", 413);
  return {
    requestId: z.string().trim().min(8).max(100).parse(form.get("requestId")),
    title: z.string().trim().min(1).max(240).parse(form.get("title") || file.name.replace(/\.[^.]+$/, "")),
    name: file.name.replace(/[\r\n\0]/g, "_"), bytes: Buffer.from(await file.arrayBuffer()),
  };
}

/** Container signatures must agree with the extension; a renamed document is never playable inline. */
export function identifyAudio(name: string, bytes: Buffer): { mimeType: string; durationMs: number | null } {
  if (!bytes.length || bytes.length > AUDIO_MAX_BYTES) throw httpError("La grabación debe pesar entre 1 byte y 25 MiB", 413);
  const ext = name.split(".").at(-1)?.toLowerCase(); let mimeType = ""; let durationMs: number | null = null;
  if (ext === "wav" && bytes.length >= 44 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WAVE") {
    let offset = 12, byteRate = 0, dataBytes = 0;
    while (offset + 8 <= bytes.length) { const kind = bytes.toString("ascii", offset, offset + 4), size = bytes.readUInt32LE(offset + 4); if (size > bytes.length - offset - 8) break; if (kind === "fmt " && size >= 16) byteRate = bytes.readUInt32LE(offset + 16); if (kind === "data") dataBytes += size; offset += 8 + size + size % 2; }
    if (byteRate > 0 && dataBytes > 0) { mimeType = "audio/wav"; durationMs = Math.round(dataBytes / byteRate * 1000); }
  } else if (ext === "mp3" && bytes.length >= 10 && (bytes.toString("ascii", 0, 3) === "ID3" || bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0 && (bytes[1]! & 0x18) !== 0x08 && (bytes[1]! & 0x06) !== 0 && (bytes[2]! & 0xf0) !== 0xf0 && (bytes[2]! & 0x0c) !== 0x0c)) mimeType = "audio/mpeg";
  else if ((ext === "m4a" || ext === "mp4") && bytes.length >= 16 && bytes.toString("ascii", 4, 8) === "ftyp" && bytes.readUInt32BE(0) >= 16 && bytes.readUInt32BE(0) <= bytes.length && /M4A |M4B |isom|iso[2-9]|mp4[12]|avc1|qt  /.test(bytes.toString("ascii", 8, Math.min(bytes.readUInt32BE(0), 128)))) mimeType = "audio/mp4";
  else if (ext === "ogg" && bytes.length >= 27 && bytes.toString("ascii", 0, 4) === "OggS" && bytes[4] === 0) mimeType = "audio/ogg";
  else if (ext === "webm" && bytes.length >= 16 && bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) && bytes.subarray(4, 4096).includes(Buffer.from("webm"))) mimeType = "audio/webm";
  else if (ext === "flac" && bytes.length >= 42 && bytes.toString("ascii", 0, 4) === "fLaC" && (bytes[4]! & 0x7f) === 0 && bytes.readUIntBE(5, 3) === 34) mimeType = "audio/flac";
  if (!mimeType) throw httpError("El archivo no corresponde a un contenedor MP3, WAV, M4A, MP4, OGG, WEBM o FLAC reconocido", 415);
  return { mimeType, durationMs };
}

export function validateSegments(raw: unknown, durationMs: number | null = null): AudioSegment[] {
  const segments = z.array(segmentSchema).max(5000).parse(raw); let lastEnd = 0;
  for (const segment of segments) {
    if (segment.startMs < lastEnd || segment.endMs <= segment.startMs || segment.endMs > 24 * 60 * 60 * 1000 || durationMs !== null && segment.endMs > durationMs + 500) throw httpError("Las marcas de tiempo deben estar ordenadas y dentro de la duración de la grabación", 422);
    lastEnd = segment.endMs;
  }
  return segments;
}

export function byteRange(raw: string | null, size: number): { start: number; end: number } | null {
  if (!raw) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(raw); if (!match || !match[1] && !match[2]) throw httpError("Rango de audio inválido", 416);
  const from = match[1] ? Number(match[1]) : null, to = match[2] ? Number(match[2]) : null;
  const start = from === null ? Math.max(0, size - (to || 0)) : from, end = from === null ? size - 1 : Math.min(size - 1, to ?? size - 1);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start || from === null && to === 0) throw httpError("Rango de audio fuera del archivo", 416);
  return { start, end };
}
