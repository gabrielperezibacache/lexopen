import { createHash } from "crypto";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { writeAuditStrict } from "@/lib/audit";
import { getObject, newStorageKey, putObject } from "@/lib/storage";
import { enqueueDocumentProcessing } from "@/lib/document-processing-queue";
import { looksLikePdf } from "@/lib/pjud/pdf-backup";
import { isRealDriveFolderId } from "@/lib/integrations/drive-folder";
import { pushDocumentoToDrive } from "@/lib/integrations/google";
import { parseMailContent, type ParsedMail } from "@/lib/mail/parse";
import type { ParsedMailAttachment } from "@/lib/mail/mime";

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
  const m = raw.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (!m) return undefined;
  const day = Number(m[1]);
  const month = Number(m[2]);
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  const d = new Date(year, month - 1, day);
  return Number.isNaN(d.getTime()) ? undefined : d;
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
  causaId: string;
  actorId: string;
  filename: string;
  mimeType: string;
  bytes: Buffer;
}) {
  const site = await prisma.site.findUnique({
    where: { causaId: opts.causaId },
    select: { id: true },
  });
  if (!site) return null;
  let folder = await prisma.folder.findFirst({
    where: { siteId: site.id, name: SITE_FOLDER_NAME, parentId: null },
    select: { id: true },
  });
  if (!folder) {
    folder = await prisma.folder.create({
      data: { name: SITE_FOLDER_NAME, siteId: site.id },
      select: { id: true },
    });
  }
  const key = newStorageKey(`sites/${site.id}/correo-pjud`, opts.filename);
  await putObject({ key, body: opts.bytes, contentType: opts.mimeType });
  const file = await prisma.siteFile.create({
    data: {
      name: opts.filename,
      mimeType: opts.mimeType,
      storageKey: key,
      sizeBytes: opts.bytes.byteLength,
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

async function loadStashedAttachments(
  rows: Array<{
    filename: string;
    mimeType: string | null;
    storageKey: string | null;
    documentoId: string | null;
  }>
): Promise<ParsedMailAttachment[]> {
  const out: ParsedMailAttachment[] = [];
  for (const row of rows) {
    if (!row.storageKey || row.documentoId) continue;
    const bytes = await getObject(row.storageKey);
    if (!bytes) continue;
    out.push({
      filename: row.filename,
      mimeType: row.mimeType || "application/octet-stream",
      content: bytes,
    });
  }
  return out;
}

export async function fileMailboxMessageToCausa(
  user: Pick<User, "id" | "role">,
  messageId: string,
  causaId: string,
  extraAttachments?: ParsedMailAttachment[]
) {
  const message = await prisma.mailboxMessage.findFirst({
    where: { id: messageId, userId: user.id },
    include: { attachments: true },
  });
  if (!message) {
    const err = new Error("Mensaje no encontrado") as Error & { status: number };
    err.status = 404;
    throw err;
  }

  const parsed = parseJson<ParsedMail>(
    message.parsedJson,
    parseMailContent(message.subject, message.bodyText)
  );
  const updates: { proximaTabla?: Date; proximaTablaNota?: string } = {};
  if (parsed.kind === "tablas" && parsed.tablaFecha) {
    const d = parseTablaDate(parsed.tablaFecha);
    if (d) {
      updates.proximaTabla = d;
      updates.proximaTablaNota =
        parsed.tablaNota || parsed.tablaSala || "Desde correo PJUD";
    }
  }
  if (Object.keys(updates).length > 0) {
    await prisma.causa.update({ where: { id: causaId }, data: updates });
  }

  const existingMov = parsed.kind === "resolucion"
    ? await prisma.causaMovimiento.findFirst({
        where: {
          causaId,
          externalId: message.externalId || message.id,
        },
        select: { id: true },
      })
    : null;

  let movimientoId = existingMov?.id;
  if (parsed.kind === "resolucion" && parsed.resolucion && !movimientoId) {
    const mov = await prisma.causaMovimiento.create({
      data: {
        causaId,
        titulo: parsed.resolucion.slice(0, 200),
        detalle: message.bodyText.slice(0, 4000),
        fuente: "import",
        tipo: "resolucion",
        referencia: message.externalId || message.id,
        externalId: message.externalId || message.id,
      },
    });
    movimientoId = mov.id;
  } else if (
    !movimientoId &&
    (extraAttachments?.length ||
      message.attachments.some((a) => a.storageKey && !a.documentoId))
  ) {
    const mov = await prisma.causaMovimiento.create({
      data: {
        causaId,
        titulo: message.subject.slice(0, 200),
        detalle: message.bodyText.slice(0, 4000),
        fuente: "import",
        tipo: parsed.kind === "tablas" ? "audiencia" : "notificacion",
        referencia: message.externalId || message.id,
        externalId: message.externalId || message.id,
      },
    });
    movimientoId = mov.id;
  }

  const pending = extraAttachments?.length
    ? extraAttachments
    : await loadStashedAttachments(message.attachments);
  for (const att of pending) {
    if (!isArchivableAttachment(att)) continue;
    const sha = attachmentSha256(att.content);
    const already = message.attachments.find((a) => a.sha256 === sha);
    if (already?.documentoId) continue;
    const doc = await ingestCausaDocumentBuffer({
      causaId,
      bytes: att.content,
      filename: att.filename,
      mimeHint: att.mimeType,
      movimientoId: movimientoId || null,
    });
    if (!doc) continue;
    const siteFileId = await copyDocumentoToSiteFolder({
      causaId,
      actorId: user.id,
      filename: att.filename,
      mimeType: doc.mimeType || att.mimeType,
      bytes: att.content,
    });
    const causa = await prisma.causa.findUnique({
      where: { id: causaId },
      select: { googleDriveFolderId: true },
    });
    if (isRealDriveFolderId(causa?.googleDriveFolderId)) {
      await pushDocumentoToDrive(doc.id, { role: user.role }).catch(() => undefined);
    }
    if (already) {
      await prisma.mailboxAttachment.update({
        where: { id: already.id },
        data: { documentoId: doc.id, siteFileId },
      });
    } else {
      await prisma.mailboxAttachment.create({
        data: {
          messageId: message.id,
          filename: att.filename,
          mimeType: att.mimeType,
          sha256: sha,
          sizeBytes: att.content.byteLength,
          documentoId: doc.id,
          siteFileId,
        },
      });
    }
  }

  const updated = await prisma.mailboxMessage.update({
    where: { id: message.id },
    data: { status: "aplicado", causaId },
  });

  await writeAuditStrict({
    actorId: user.id,
    action: "mail.apply",
    entityType: "MailboxMessage",
    entityId: message.id,
    after: { causaId, kind: message.kind },
  });

  return updated;
}
