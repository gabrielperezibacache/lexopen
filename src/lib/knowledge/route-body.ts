import type { z } from "zod";
import { httpError } from "@/lib/auth/access";

/** Bound both declared and streamed JSON bodies, including chunked requests. */
export async function parseKnowledgeBody<T>(request: Request, schema: z.ZodType<T>, max = 256 * 1024): Promise<T> {
  if (!Number.isSafeInteger(max) || max < 1 || max > 256 * 1024) throw new RangeError("Límite JSON inválido");
  const limitMessage = `La solicitud de conocimiento supera el límite de ${max === 256 * 1024 ? "256 KiB" : `${max} bytes`}`;
  if (Number(request.headers.get("content-length") || 0) > max) { await request.body?.cancel(); throw httpError(limitMessage, 413); }
  const reader = request.body?.getReader();
  if (!reader) throw httpError("Se requiere una solicitud JSON", 400);
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > max) { await reader.cancel(); throw httpError(limitMessage, 413); } chunks.push(part.value); }
  } finally { reader.releaseLock(); }
  let raw: unknown;
  try { raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, size))); }
  catch { throw httpError("La solicitud JSON no pudo leerse", 400); }
  return schema.parse(raw);
}
