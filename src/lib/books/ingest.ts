import { z } from "zod";
import { httpError } from "@/lib/auth/access";
import { BOOK_COLORS, BOOK_STYLES } from "./types";
import { BOOK_MAX_BYTES } from "./formats";
import { bookSourceTypeSchema, judicialMetadataSchema, judicialMetadataPatchSchema, JUDICIAL_JSON_MAX_BYTES, normalizeJudicialMetadata } from "./judicial";
export const bookMetadataSchema = z.object({ title: z.string().trim().min(1).max(240), author: z.string().trim().max(180).default(""), year: z.string().trim().max(40).default(""), edition: z.string().trim().max(100).default(""), publisher: z.string().trim().max(160).default(""), identifier: z.string().trim().max(100).default(""), coverColor: z.enum(BOOK_COLORS).default("oxblood"), coverStyle: z.enum(BOOK_STYLES).default("leather"), spineLabel: z.string().trim().max(100).default(""), shelf: z.string().trim().min(1).max(100).default("General"), favorite: z.boolean().default(false) });
export const bookPatchSchema = bookMetadataSchema.partial().extend({ sourceType: bookSourceTypeSchema.optional(), judicial: judicialMetadataPatchSchema.nullable().optional(), revision: z.number().int().positive() }).strict();
export const bookRevisionSchema = z.object({ revision: z.number().int().positive() }).strict();
export type BookUpload = z.infer<typeof bookMetadataSchema> & { requestId: string; name: string; bytes: Buffer; convertToText?: boolean; preserveOriginal?: boolean; sourceType?: z.infer<typeof bookSourceTypeSchema>; judicial?: z.infer<typeof judicialMetadataSchema> | null };
/** Bounds streamed multipart bytes before the platform multipart decoder allocates fields. */
export async function readBookUpload(req: Request): Promise<BookUpload> {
  const contentType = req.headers.get("content-type") || "";
  if (!contentType.startsWith("multipart/form-data;")) throw httpError("Adjunte un archivo mediante el formulario de importación", 415);
  const max = BOOK_MAX_BYTES + 64 * 1024;
  if (Number(req.headers.get("content-length") || 0) > max) { await req.body?.cancel(); throw httpError("La importación supera 25 MiB", 413); }
  const reader = req.body?.getReader(); if (!reader) throw httpError("Seleccione un archivo", 400);
  const chunks: Uint8Array[] = []; let size = 0;
  try { for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > max) { await reader.cancel(); throw httpError("La importación supera 25 MiB", 413); } chunks.push(part.value); } } finally { reader.releaseLock(); }
  let form: FormData;
  try { form = await new Request(req.url, { method: "POST", headers: { "content-type": contentType }, body: Buffer.concat(chunks, size) }).formData(); }
  catch { throw httpError("No se pudo leer el archivo. Vuelva a seleccionarlo", 400); }
  const allowed = new Set(["file", "requestId", "convertToText", "preserveOriginal", "sourceType", "judicialJson", ...Object.keys(bookMetadataSchema.shape)]);
  for (const [key] of form) if (!allowed.has(key) || form.getAll(key).length !== 1) throw httpError("Campos de importación inválidos o repetidos", 400);
  const file = form.get("file"); if (!(file instanceof File) || !file.size || file.size > BOOK_MAX_BYTES || !file.name || file.name.length > 240) throw httpError("Seleccione un archivo de hasta 25 MiB con nombre válido", 413);
  const requestId = z.string().trim().min(8).max(100).parse(form.get("requestId"));
  const raw: Record<string, unknown> = {};
  for (const key of Object.keys(bookMetadataSchema.shape)) { const value = form.get(key); if (value !== null) { if (typeof value !== "string" || value.length > 1000) throw httpError("Metadatos de importación inválidos", 400); raw[key] = key === "favorite" ? value === "true" : value; } }
  if (!raw.title) raw.title = file.name.replace(/\.[^.]+$/, "");
  const sourceType = bookSourceTypeSchema.parse(form.get("sourceType") ?? "book"), judicialRaw = form.get("judicialJson");
  let judicialInput: unknown;
  if (judicialRaw !== null) {
    if (typeof judicialRaw !== "string" || Buffer.byteLength(judicialRaw, "utf8") > JUDICIAL_JSON_MAX_BYTES) throw httpError("Los datos judiciales superan 16 KiB", 413);
    try { judicialInput = JSON.parse(judicialRaw); } catch { throw httpError("Los datos judiciales no tienen un formato JSON válido", 400); }
  }
  const judicial = normalizeJudicialMetadata(sourceType, judicialInput);
  const options: { convertToText?: boolean; preserveOriginal?: boolean } = {};
  for (const key of ["convertToText", "preserveOriginal"] as const) { const value = form.get(key); if (value !== null) options[key] = z.enum(["true", "false"]).parse(value) === "true"; }
  return { ...bookMetadataSchema.parse(raw), sourceType, judicial, ...options, requestId, name: file.name.replace(/[\r\n\0]/g, "_"), bytes: Buffer.from(await file.arrayBuffer()) };
}
