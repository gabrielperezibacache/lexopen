import { randomUUID } from "node:crypto";
import { type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { httpError } from "@/lib/auth/access";
import type { CausaAccessUser } from "@/lib/auth/causa-access";
import { extractBook, BOOK_FORMATS } from "@/lib/books/formats";
import { sha256 } from "@/lib/evidence/fragments";
import { canonicalJson } from "@/lib/command-execution";
import { PDF_PAGE_EXTRACTOR_VERSION } from "@/lib/evidence/pdf-pages";
import { altazorTransaction, conversationFor } from "./access";
import { altazorRequestId } from "./schemas";
import { ALTAZOR_LIMITS, type AltazorClient } from "./types";

const attachmentSelect = { id: true, sourceName: true, mimeType: true, byteSize: true, sourceSha256: true, textSha256: true, extractorVersion: true, status: true, errorCode: true, createdAt: true } as const;
export type AttachmentUpload = { requestId: string; name: string; bytes: Buffer };
/** Bound streamed multipart bytes before FormData allocates any uploaded field. */
export async function readAltazorUpload(request: Request): Promise<AttachmentUpload> {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.startsWith("multipart/form-data;")) throw httpError("Adjunte un archivo mediante el formulario", 415);
  const max = ALTAZOR_LIMITS.attachmentBytes + 64 * 1024;
  if (Number(request.headers.get("content-length") || 0) > max) { await request.body?.cancel(); throw httpError("El adjunto supera 25 MiB", 413); }
  const reader = request.body?.getReader(); if (!reader) throw httpError("Seleccione un archivo", 400);
  const chunks: Uint8Array[] = []; let size = 0;
  try { for (;;) { request.signal.throwIfAborted(); const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > max) { await reader.cancel(); throw httpError("El adjunto supera 25 MiB", 413); } chunks.push(part.value); } } finally { reader.releaseLock(); }
  let form: FormData;
  try { form = await new Request(request.url, { method: "POST", headers: { "content-type": contentType }, body: Buffer.concat(chunks, size) }).formData(); } catch { throw httpError("No se pudo leer el adjunto", 400); }
  for (const [key] of form) if (!["file", "requestId"].includes(key) || form.getAll(key).length !== 1) throw httpError("Campos de adjunto inválidos o repetidos", 400);
  const file = form.get("file");
  if (!(file instanceof File) || !file.size || file.size > ALTAZOR_LIMITS.attachmentBytes || file.name.length > 240) throw httpError("Seleccione un archivo de hasta 25 MiB", 413);
  return { requestId: altazorRequestId.parse(form.get("requestId")), name: file.name.replace(/[\r\n\0]/g, "_"), bytes: Buffer.from(await file.arrayBuffer()) };
}
export async function listAltazorAttachments(id: string, user: CausaAccessUser, client: AltazorClient = prisma) {
  const { actor } = await conversationFor(id, user, client);
  return client.altazorAttachment.findMany({ where: { conversationId: id, ownerId: actor.id, deletedAt: null }, select: attachmentSelect, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: ALTAZOR_LIMITS.attachments });
}
export async function createAltazorAttachment(id: string, input: AttachmentUpload, user: CausaAccessUser, client: PrismaClient = prisma, signal?: AbortSignal) {
  if (!input.bytes.length || input.bytes.length > ALTAZOR_LIMITS.attachmentBytes || !input.name || input.name.length > 240) throw httpError("Seleccione un archivo de hasta 25 MiB", 413);
  altazorRequestId.parse(input.requestId);
  const sourceSha256 = sha256(input.bytes), inputSha256 = sha256(canonicalJson({ name: input.name, sourceSha256 }));
  const claim = await altazorTransaction(client, async tx => {
    const { actor } = await conversationFor(id, user, tx, true);
    const existing = await tx.altazorAttachment.findUnique({ where: { conversationId_requestId: { conversationId: id, requestId: input.requestId } } });
    if (existing) { if (existing.ownerId !== actor.id || existing.inputSha256 !== inputSha256 || existing.deletedAt) throw httpError("La clave del adjunto ya corresponde a otro archivo", 409); return { row: existing, reused: true }; }
    const current = await tx.altazorAttachment.aggregate({ where: { conversationId: id, deletedAt: null }, _count: true, _sum: { byteSize: true } });
    if (current._count >= ALTAZOR_LIMITS.attachments || (current._sum.byteSize || 0) + input.bytes.length > ALTAZOR_LIMITS.conversationBytes) throw httpError("La conversación admite cinco adjuntos y hasta 100 MiB en total", 413);
    const row = await tx.altazorAttachment.create({ data: { id: randomUUID(), conversationId: id, ownerId: actor.id, requestId: input.requestId, inputSha256, sourceName: input.name, mimeType: "application/octet-stream", byteSize: input.bytes.length, originalData: input.bytes, sourceSha256 } });
    return { row, reused: false };
  });
  if (!claim.reused) {
    const stop = signal ? AbortSignal.any([signal, AbortSignal.timeout(ALTAZOR_LIMITS.deadlineMs)]) : AbortSignal.timeout(ALTAZOR_LIMITS.deadlineMs);
    try {
      const extracted = await extractBook(input.name, input.bytes, { signal: stop }); stop.throwIfAborted();
      await altazorTransaction(client, async tx => {
        await conversationFor(id, user, tx, true);
        await tx.altazorAttachment.updateMany({ where: { id: claim.row.id, status: "processing", deletedAt: null }, data: { status: extracted.status === "completed" ? "ready" : "partial", mimeType: extracted.mimeType, extractedText: extracted.text, textSha256: sha256(extracted.text), extractorVersion: extracted.locatorKind === "pdf-page" ? PDF_PAGE_EXTRACTOR_VERSION : "lexopen-local-formats-1", extractionJson: canonicalJson({ locatorKind: extracted.locatorKind, pageCount: extracted.pageCount, pages: extracted.pages, fragments: extracted.fragments }) } });
      });
    } catch (error) {
      await client.altazorAttachment.updateMany({ where: { id: claim.row.id, status: "processing" }, data: { status: "failed", errorCode: stop.aborted ? "attachment_cancelled" : "attachment_extraction_failed" } });
      if (Number((error as { status?: number }).status) < 500) throw error;
    }
  }
  return { attachment: await readAltazorAttachment(id, claim.row.id, user, client), reused: claim.reused };
}
export async function attachmentFor(id: string, attachmentId: string, user: CausaAccessUser, client: AltazorClient = prisma) {
  const { actor, conversation } = await conversationFor(id, user, client);
  const row = await client.altazorAttachment.findFirst({ where: { id: attachmentId, conversationId: id, ownerId: actor.id, deletedAt: null } });
  if (!row) throw httpError("Adjunto no encontrado o sin acceso actual", 404);
  if (!row.originalData || sha256(Buffer.from(row.originalData)) !== row.sourceSha256 || row.textSha256 && sha256(row.extractedText) !== row.textSha256) throw httpError("El adjunto no coincide con su versión conservada", 409);
  return { actor, conversation, row };
}
export async function readAltazorAttachment(id: string, attachmentId: string, user: CausaAccessUser, client: AltazorClient = prisma) {
  const { row } = await attachmentFor(id, attachmentId, user, client);
  return { id: row.id, sourceName: row.sourceName, mimeType: row.mimeType, byteSize: row.byteSize, sourceSha256: row.sourceSha256, textSha256: row.textSha256, status: row.status === "processing" && row.updatedAt.getTime() + ALTAZOR_LIMITS.leaseMs < Date.now() ? "failed" : row.status, errorCode: row.errorCode, createdAt: row.createdAt.toISOString(), extraction: ["ready", "partial"].includes(row.status) ? JSON.parse(row.extractionJson) : null };
}
export async function deleteAltazorAttachment(id: string, attachmentId: string, user: CausaAccessUser, client: PrismaClient = prisma) {
  return altazorTransaction(client, async tx => { const { actor } = await conversationFor(id, user, tx, true); const changed = await tx.altazorAttachment.updateMany({ where: { id: attachmentId, conversationId: id, ownerId: actor.id, deletedAt: null }, data: { status: "deleted", deletedAt: new Date(), originalData: null, extractedText: "", extractionJson: "{}" } }); if (!changed.count) throw httpError("Adjunto no encontrado", 404); return { deleted: true }; });
}
export { BOOK_FORMATS as ALTAZOR_ATTACHMENT_FORMATS };
