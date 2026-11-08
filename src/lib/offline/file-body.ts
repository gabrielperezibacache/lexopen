import { httpError } from "@/lib/auth/access";
import { fileSyncSchema, MAX_OFFLINE_FILE_REQUEST_BYTES } from "./file-schemas";
/** Stream bound includes chunked requests; no multipart buffering or plain-text upload staging. */
export async function parseOfflineFileBody(req: Request) {
  const max = MAX_OFFLINE_FILE_REQUEST_BYTES;
  if (Number(req.headers.get("content-length") || 0) > max) { await req.body?.cancel(); throw httpError("La carga supera 12 MiB; la copia local se conserva", 413); }
  const reader = req.body?.getReader(); if (!reader) throw httpError("Se requiere contenido JSON", 400);
  const chunks: Uint8Array[] = []; let size = 0;
  try { for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > max) { await reader.cancel(); throw httpError("La carga supera 12 MiB; la copia local se conserva", 413); } chunks.push(part.value); } } finally { reader.releaseLock(); }
  let raw: unknown; try { raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, size))); } catch { throw httpError("La carga JSON no pudo leerse", 400); }
  return fileSyncSchema.parse(raw);
}
