import { createHash } from "crypto";
import type { Prisma } from "@prisma/client";
import { httpError } from "@/lib/auth/access";
import type { CausaAccessUser } from "@/lib/auth/causa-access";
import { prisma } from "@/lib/db";
import { writeAuditStrict } from "@/lib/audit";
import { serializable } from "@/lib/command-execution";
import { ensureCaseMailFolder } from "@/lib/causas/document-organization";
import { findCaseIntakeOriginal } from "@/lib/causas/document-intake";
import { getObject, newStorageKey, putObject } from "@/lib/storage";
import { enqueueDocumentProcessing } from "@/lib/document-processing-queue";
import { looksLikePdf } from "@/lib/pjud/pdf-backup";
import { isRealDriveFolderId } from "@/lib/integrations/drive-folder";
import { pushDocumentoToDrive } from "@/lib/integrations/google";
import { mailCourtKey, parseMailContent, type ExactMailMatter, type ParsedMail } from "@/lib/mail/parse";
import { assertCausaMailAccess, currentMailActor } from "@/lib/mail/access";

const MAX_ATTACHMENT = 20 * 1024 * 1024;
const SITE_FOLDER_NAME = "Correo PJUD";

export function attachmentSha256(buf: Buffer) {
  return createHash("sha256").update(buf).digest("hex");
}

export function isArchivableAttachment(att: {
  mimeType?: string | null;
  content: Buffer;
}) {
  if (att.content.byteLength < 100 || att.content.byteLength > MAX_ATTACHMENT) {
    return false;
  }
  if (looksLikePdf(att.content)) return true;
  const mime = att.mimeType || "";
  return /pdf|msword|officedocument|octet-stream/i.test(mime);
}

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function parseTablaDate(raw: string): Date | undefined {
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const local = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2}|\d{4})$/);
  if (!iso && !local) return undefined;
  const day = Number(iso?.[3] || local?.[1]);
  const month = Number(iso?.[2] || local?.[2]);
  let year = Number(iso?.[1] || local?.[3]);
  if (year < 100) year += 2000;
  const d = new Date(year, month - 1, day);
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day ? d : undefined;
}

export async function findExactMailMatter(identity: ExactMailMatter, client: Pick<Prisma.TransactionClient, "causa"> = prisma) {
  // Check uniqueness before applying ACLs. An inaccessible duplicate is still ambiguous.
  const candidates = await client.causa.findMany({
    where: { rit: { equals: identity.rit, mode: "insensitive" } },
    select: { id: true, tribunal: true },
    take: 51,
  });
  if (candidates.length === 51) return null;
  const matches = candidates.filter(candidate => mailCourtKey(candidate.tribunal) === identity.courtKey);
  return matches.length === 1 ? matches[0]!.id : null;
}

export async function ingestCausaDocumentBuffer(opts: {
  causaId: string;
  bytes: Buffer;
  filename: string;
  mimeHint?: string | null;
  movimientoId?: string | null;
}) {
  const buf = opts.bytes;
  if (!isArchivableAttachment({ content: buf, mimeType: opts.mimeHint })) {
    return null;
  }
  const mime = looksLikePdf(buf)
    ? "application/pdf"
    : opts.mimeHint && !/text\/html/i.test(opts.mimeHint)
      ? opts.mimeHint
      : "application/octet-stream";
  const filename = opts.filename.replace(/[^\w.\-()+ ]+/g, "_").slice(0, 180);
  const key = newStorageKey(`correo/pjud/${opts.causaId}`, filename);
  await putObject({ key, body: buf, contentType: mime });
  const doc = await prisma.documento.create({
    data: {
      nombre: filename,
      tipo: "notificacion",
      mimeType: mime,
      storageKey: key,
      causaId: opts.causaId,
      ruta: "correo/pjud",
      extractionStatus: "pending",
    },
  });
  enqueueDocumentProcessing({ id: doc.id, name: doc.nombre, bytes: buf });
  if (opts.movimientoId) {
    await prisma.causaMovimiento.update({
      where: { id: opts.movimientoId },
      data: { documentoRef: `doc:${doc.id}` },
    });
  }
  return doc;
}

async function copyDocumentoToSiteFolder(opts: {
  tx: Prisma.TransactionClient;
  causaId: string;
  actorId: string;
  filename: string;
  mimeType: string;
  storageKey: string;
  sizeBytes: number;
}) {
  const site = await opts.tx.site.findUnique({
    where: { causaId: opts.causaId },
    select: { id: true },
  });
  if (!site) return null;
  let folder = await opts.tx.folder.findFirst({
    where: { siteId: site.id, name: SITE_FOLDER_NAME, parentId: null },
    select: { id: true },
  });
  if (!folder) {
    folder = await opts.tx.folder.create({
      data: { name: SITE_FOLDER_NAME, siteId: site.id },
      select: { id: true },
    });
  }
  const file = await opts.tx.siteFile.create({
    data: {
      name: opts.filename,
      mimeType: opts.mimeType,
      storageKey: opts.storageKey,
      sizeBytes: opts.sizeBytes,
      siteId: site.id,
      folderId: folder.id,
      metadataJson: JSON.stringify({ source: "correo-pjud" }),
      versions: {
        create: {
          version: 1,
          note: "Desde correo PJUD",
          authorId: opts.actorId,
        },
      },
    },
    select: { id: true },
  });
  return file.id;
}

export async function fileMailboxMessageToCausa(
  user: CausaAccessUser,
  messageId: string,
  causaId: string,
  options?: { identity?: ExactMailMatter }
) {
  const owned = { id: messageId, userId: user.id };
  const initial = await prisma.mailboxMessage.findFirst({ where: owned, include: { attachments: true } });
  if (!initial) throw httpError("Mensaje no encontrado", 404);
  await assertCausaMailAccess(user, causaId, { write: true });
  if (initial.status === "aplicado" && initial.causaId === causaId) return initial;

  // Verify the stashed originals before opening the transaction. File and site
  // records can reference the same immutable bytes, without duplicating blobs.
  const originals = new Map<string, { storageKey: string; bytes: Buffer; mimeType: string; sha256: string }>();
  for (const attachment of initial.attachments) {
    if (attachment.documentoId || !attachment.storageKey) continue;
    const bytes = await getObject(attachment.storageKey);
    if (!bytes || bytes.byteLength !== attachment.sizeBytes || attachmentSha256(bytes) !== attachment.sha256 ||
        !isArchivableAttachment({ content: bytes, mimeType: attachment.mimeType })) {
      throw httpError("No se pudo comprobar el archivo original del correo", 409);
    }
    const mimeType = looksLikePdf(bytes) ? "application/pdf" : attachment.mimeType || "application/octet-stream";
    originals.set(attachment.id, { storageKey: attachment.storageKey, bytes, mimeType, sha256: attachment.sha256 });
  }

  const result = await serializable(async tx => {
    const message = await tx.mailboxMessage.findFirst({ where: owned, include: { attachments: true } });
    if (!message) throw httpError("Mensaje no encontrado", 404);
    await assertCausaMailAccess(user, causaId, { write: true }, tx);
    if (message.status === "aplicado") {
      if (message.causaId !== causaId) throw httpError("Este correo ya está archivado en otro expediente", 409);
      return { message, documents: [], drive: false };
    }
    if (options?.identity && (message.status !== "nuevo" || await findExactMailMatter(options.identity, tx) !== causaId)) {
      return { message, documents: [], drive: false };
    }
    const parsed = parseJson<ParsedMail>(message.parsedJson, parseMailContent(message.subject, message.bodyText));
    // The sender address is a routing hint. Only explicit filing can change the case calendar.
    const fechaTabla = !options?.identity && parsed.kind === "tablas" && parsed.tablaFecha ? parseTablaDate(parsed.tablaFecha) : undefined;
    if (fechaTabla) {
      await tx.causa.update({
        where: { id: causaId },
        data: { proximaTabla: fechaTabla, proximaTablaNota: parsed.tablaNota || parsed.tablaSala || "Desde correo PJUD" },
      });
    }

    const pending = message.attachments.filter(attachment => attachment.storageKey && !attachment.documentoId);
    let movimientoId: string | undefined;
    if (parsed.kind !== "otro" || pending.length) {
      const externalId = message.externalId || message.id;
      await tx.causaMovimiento.createMany({ skipDuplicates: true, data: {
        causaId,
        titulo: (parsed.kind === "resolucion" ? parsed.resolucion || message.subject : message.subject).slice(0, 200),
        detalle: message.bodyText.slice(0, 4000),
        fecha: message.receivedAt,
        fuente: "import",
        tipo: parsed.kind === "resolucion" ? "resolucion" : parsed.kind === "tablas" ? "audiencia" : "notificacion",
        referencia: externalId,
        externalId,
      } });
      movimientoId = (await tx.causaMovimiento.findUniqueOrThrow({
        where: { causaId_externalId: { causaId, externalId } }, select: { id: true },
      })).id;
    }

    const actor = await currentMailActor(user, tx);
    let folderId: string | undefined;
    const documents = [];
    const documentIds = [];
    for (const attachment of pending) {
      const original = originals.get(attachment.id);
      if (!original || original.storageKey !== attachment.storageKey || original.sha256 !== attachment.sha256 || original.bytes.byteLength !== attachment.sizeBytes) {
        throw httpError("Los adjuntos cambiaron. Vuelve a intentar el archivo del correo", 409);
      }
      const reusable = await findCaseIntakeOriginal(tx, actor, {
        causaId, clienteId: null, confidencial: false, privilegio: false,
      }, {
        sourceSha256: attachment.sha256,
        sizeBytes: original.bytes.byteLength,
      });
      if (!reusable) folderId ??= await ensureCaseMailFolder(tx, causaId);
      const doc = reusable || await tx.documento.create({
        data: {
          nombre: attachment.filename,
          tipo: "notificacion",
          mimeType: original.mimeType,
          storageKey: original.storageKey,
          causaId,
          ruta: "correo/pjud",
          extractionStatus: "pending",
          archivePlacement: { create: { folderId: folderId! } },
        },
        select: { id: true, nombre: true, version: true, storageKey: true },
      });
      await tx.caseDocumentIntake.create({ data: {
        causaId,
        documentoId: doc.id,
        documentVersion: doc.version,
        source: "mail",
        sourceKey: attachment.id,
        sourceName: attachment.filename,
        sourceSha256: attachment.sha256,
        storageKey: doc.storageKey,
        actorId: actor.id,
        mailboxAttachmentId: attachment.id,
        receivedAt: message.receivedAt,
      } });
      const siteFileId = reusable ? null : await copyDocumentoToSiteFolder({
        tx, causaId, actorId: user.id, filename: attachment.filename, mimeType: original.mimeType,
        storageKey: original.storageKey, sizeBytes: original.bytes.byteLength,
      });
      await tx.mailboxAttachment.update({ where: { id: attachment.id }, data: { documentoId: doc.id, siteFileId } });
      if (movimientoId) await tx.causaMovimiento.updateMany({
        where: { id: movimientoId, documentoRef: null }, data: { documentoRef: `doc:${doc.id}` },
      });
      documentIds.push(doc.id);
      if (!reusable) documents.push({ id: doc.id, name: doc.nombre, bytes: original.bytes });
    }
    const cause = documents.length ? await tx.causa.findUnique({ where: { id: causaId }, select: { googleDriveFolderId: true } }) : null;
    const updated = await tx.mailboxMessage.update({ where: { id: message.id }, data: { status: "aplicado", causaId } });
    await writeAuditStrict({
      actorId: user.id,
      action: "mail.apply",
      entityType: "MailboxMessage",
      entityId: message.id,
      after: { causaId, kind: message.kind, automatic: Boolean(options?.identity), documentIds },
    }, tx);
    return { message: updated, documents, drive: isRealDriveFolderId(cause?.googleDriveFolderId) };
  });

  for (const document of result.documents) {
    enqueueDocumentProcessing(document);
    if (result.drive) {
      await assertCausaMailAccess(user, causaId, { write: true })
        .then(() => pushDocumentoToDrive(document.id, { role: user.role }))
        .catch(() => undefined);
    }
  }
  return result.message;
}
