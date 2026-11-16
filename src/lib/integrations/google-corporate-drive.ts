import { createHash, randomBytes } from "crypto";

import { writeAuditStrict } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { canSeeConfidential, isStaff } from "@/lib/auth/rbac";
import { httpError } from "@/lib/auth/access";
import { assertCausaCapability, documentReadWhere } from "@/lib/auth/causa-access";
import { getObject } from "@/lib/storage";
import { driveFolderUrl, isPlaceholderDriveFolderId, isRealDriveFolderId, makeStubFolderId, parseGoogleDriveFolderRef, stubFolderUrl } from "@/lib/integrations/drive-folder";



import { GoogleIntegrationError, googleFetch, readGoogleError, softGoogleFailure, requireDriveSession, type GoogleConfig } from "./google-session";

function isTextMime(mime: string) {
  const m = mime.toLowerCase();
  return (
    !m ||
    m.startsWith("text/") ||
    m === "application/json" ||
    m === "application/markdown" ||
    m === "application/xml"
  );
}

type DriveFileResult = {
  id: string;
  name?: string;
  webViewLink?: string;
  updated?: boolean;
};

/** Crea o actualiza un archivo en Drive (binario u opcionalmente Google Doc). */
export async function uploadFileToDrive(opts: {
  name: string;
  content: Buffer | string;
  contentMimeType: string;
  /** Si true, Drive convierte el texto a Google Doc. */
  convertToGoogleDoc?: boolean;
  folderId?: string | null;
  existingFileId?: string | null;
  reservedFileId?: string;
  accessToken: string;
}): Promise<DriveFileResult> {
  const bytes =
    typeof opts.content === "string"
      ? Buffer.from(opts.content, "utf8")
      : opts.content;

  if (opts.existingFileId && isRealDriveFolderId(opts.existingFileId)) {
    const updateUrl = `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(
      opts.existingFileId
    )}?uploadType=media&fields=id,name,webViewLink`;
    const updateRes = await googleFetch(updateUrl, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${opts.accessToken}`,
        "Content-Type": opts.convertToGoogleDoc
          ? "text/plain"
          : opts.contentMimeType || "application/octet-stream",
      },
      body: new Uint8Array(bytes),
    });
    if (updateRes.ok) {
      const file = (await updateRes.json()) as DriveFileResult;
      return { ...file, updated: true };
    }
    if (updateRes.status !== 404) {
      const detail = await readGoogleError(updateRes);
      console.error("Google Drive update failed", updateRes.status, detail);
      throw new GoogleIntegrationError(
        "api_error",
        `Google Drive update failed: ${detail}`
      );
    }
    // 404 → crear de nuevo
  }

  const metadata: Record<string, unknown> = {
    name: opts.convertToGoogleDoc
      ? opts.name.replace(/\.md$/i, "") || opts.name
      : opts.name,
    mimeType: opts.convertToGoogleDoc
      ? "application/vnd.google-apps.document"
      : opts.contentMimeType || "application/octet-stream",
  };
  if (opts.reservedFileId) metadata.id = opts.reservedFileId;
  if (opts.folderId && isRealDriveFolderId(opts.folderId)) {
    metadata.parents = [opts.folderId];
  }

  const boundary = `lexopen_${randomBytes(8).toString("hex")}`;
  const metaPart = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
    "utf8"
  );
  const contentHeader = Buffer.from(
    `--${boundary}\r\nContent-Type: ${
      opts.convertToGoogleDoc
        ? "text/plain; charset=UTF-8"
        : opts.contentMimeType || "application/octet-stream"
    }\r\n\r\n`,
    "utf8"
  );
  const closing = Buffer.from(`\r\n--${boundary}--`, "utf8");
  const body = Buffer.concat([metaPart, contentHeader, bytes, closing]);

  const res = await googleFetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink&supportsAllDrives=true",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body: new Uint8Array(body),
      ...(opts.reservedFileId ? { signal: AbortSignal.timeout(60_000) } : {}),
    }
  );

  // The caller verifies the reserved object independently before linking it.
  if (opts.reservedFileId && res.status === 409) return { id: opts.reservedFileId, name: opts.name };
  if (!res.ok) {
    const detail = await readGoogleError(res);
    console.error("Google Drive upload failed", res.status, detail);
    throw new GoogleIntegrationError(
      "api_error",
      `Google Drive upload failed: ${detail}`
    );
  }

  return (await res.json()) as DriveFileResult;
}

/** A reservation is durable before any bytes leave LexOpen. Retries share the same Drive ID. */
async function reserveDriveOriginal(input: {
  documentoId: string; storageKey: string; folderId: string; sourceSha256: string; actorId: string; accessToken: string;
}) {
  const inputHash = createHash("sha256").update(JSON.stringify([input.documentoId, input.storageKey, input.folderId, input.sourceSha256])).digest("hex");
  const key = `drive-original:${inputHash}`;
  let receipt = await prisma.commandExecution.findUnique({ where: { key } });
  if (!receipt) {
    const response = await googleFetch("https://www.googleapis.com/drive/v3/files/generateIds?count=1&space=drive&type=files", {
      headers: { Authorization: `Bearer ${input.accessToken}` }, signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw httpError("Drive no pudo reservar un lugar para la copia", 502);
    const { ids } = await response.json() as { ids?: string[] };
    const fileId = ids?.[0];
    if (typeof fileId !== "string" || !/^[A-Za-z0-9_-]{10,180}$/.test(fileId)) throw httpError("Drive devolvió una reserva inválida", 502);
    await prisma.commandExecution.createMany({
      data: [{ key, ownerId: input.actorId, inputHash, status: "reserved", resultJson: JSON.stringify({ fileId }) }],
      skipDuplicates: true,
    });
    receipt = await prisma.commandExecution.findUniqueOrThrow({ where: { key } });
  }
  const result = JSON.parse(receipt.resultJson || "{}") as { fileId?: string };
  if (receipt.inputHash !== inputHash || !result.fileId || !/^[A-Za-z0-9_-]{10,180}$/.test(result.fileId)) {
    throw httpError("Revisa la copia anterior en Drive antes de continuar", 409);
  }
  return { receiptId: receipt.id, fileId: result.fileId };
}

async function verifiedDriveOriginal(input: { fileId: string; folderId: string; sourceSha256: string; accessToken: string }) {
  const response = await googleFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(input.fileId)}?fields=id,name,parents,trashed,sha256Checksum&supportsAllDrives=true`, {
    headers: { Authorization: `Bearer ${input.accessToken}` }, signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw httpError("Drive aún no confirma la copia. Puedes volver a consultar el mismo archivo.", 502);
  const file = await response.json() as { id: string; name: string; parents?: string[]; trashed?: boolean; sha256Checksum?: string };
  if (file.id !== input.fileId || file.trashed !== false || file.parents?.length !== 1 ||
      file.parents[0] !== input.folderId || file.sha256Checksum !== input.sourceSha256) {
    throw httpError("La copia de Drive no coincide con el original o con la carpeta elegida", 409);
  }
  return { id: file.id, name: file.name };
}

/** @deprecated Prefer uploadFileToDrive. Kept for call-site clarity. */
async function uploadMarkdownToDrive(opts: {
  name: string;
  content: string;
  folderId?: string | null;
  existingFileId?: string | null;
  accessToken: string;
}) {
  return uploadFileToDrive({
    name: opts.name,
    content: opts.content,
    contentMimeType: "text/plain",
    convertToGoogleDoc: true,
    folderId: opts.folderId,
    existingFileId: opts.existingFileId,
    accessToken: opts.accessToken,
  });
}

/** Crea un evento de día completo en Calendar, o un stub local si no hay token. */
/** Sube un documento a Drive (binario original o Markdown → Google Doc). */
export async function pushDocumentoToDrive(
  documentoId: string,
  opts?: { role?: string; scopedCopy?: { folderId: string; actorId: string } }
) {
  const doc = await prisma.documento.findUnique({
    where: { id: documentoId },
    include: { causa: true },
  });
  if (!doc) throw new Error("Documento no encontrado");
  if (
    (doc.confidencial || doc.privilegio) &&
    opts?.role &&
    !canSeeConfidential(opts.role)
  ) {
    throw new Error("Documento confidencial o privilegiado");
  }

  const folderId = doc.causa?.googleDriveFolderId || null;
  const realFolder = isRealDriveFolderId(folderId) ? folderId : null;
  const scopedCopy = opts?.scopedCopy;
  async function confirmStudyDestination() {
    if (!scopedCopy) return;
    const actor = await prisma.user.findUnique({
      where: { id: scopedCopy.actorId },
      select: { id: true, role: true, capabilityGrants: true, capabilityRevokes: true },
    });
    if (!actor || !isStaff(actor.role) || !doc?.causaId) throw httpError("Documento no encontrado", 404);
    const current = await prisma.documento.findFirst({
      where: { AND: [{ id: documentoId, causaId: doc.causaId }, documentReadWhere(actor)] },
      select: { storageKey: true, confidencial: true, privilegio: true, googleDriveId: true, causa: {
        select: { googleDriveFolderId: true, driveSyncSubscription: { select: { account: true } } },
      } },
    });
    if (!current) throw httpError("Documento no encontrado", 404);
    await assertCausaCapability(doc.causaId, actor, "causa.write");
    if (current.confidencial || current.privilegio) throw httpError("El archivo está marcado como reservado", 403);
    if (!/^[A-Za-z0-9_-]{10,180}$/.test(scopedCopy.folderId) || !realFolder || realFolder !== scopedCopy.folderId ||
      current.causa?.googleDriveFolderId !== scopedCopy.folderId ||
      (current.causa.driveSyncSubscription && current.causa.driveSyncSubscription.account !== "study")) {
      throw httpError("La carpeta del Drive del estudio cambió. Vuelve a abrir el expediente.", 409);
    }
    if (current.googleDriveId) throw httpError("Ya hay una copia registrada en Drive. Actualiza el expediente.", 409);
    if (!current.storageKey || current.storageKey !== doc.storageKey) throw httpError("El original ya no está disponible. Actualiza el expediente.", 409);
  }
  await confirmStudyDestination();

  if (folderId && isPlaceholderDriveFolderId(folderId)) {
    return {
      status: "needs_real_folder" as const,
      message:
        "La causa tiene una carpeta stub/demo. Cree o vincule una carpeta real de Google Drive antes de subir.",
    };
  }

  let config: GoogleConfig;
  try {
    config = await requireDriveSession();
  } catch (e) {
    if (
      e instanceof GoogleIntegrationError &&
      (e.code === "needs_oauth" ||
        e.code === "disabled" ||
        e.code === "sync_off" ||
        e.code === "needs_reconnect")
    ) {
      const soft = softGoogleFailure(e);
      return {
        ...soft,
        draft: {
          name: doc.nombre,
          mimeType: doc.mimeType || "application/octet-stream",
          parents: realFolder ? [realFolder] : undefined,
        },
      };
    }
    throw e;
  }

  const mime = (doc.mimeType || "").toLowerCase();
  const existingId =
    doc.googleDriveId && isRealDriveFolderId(doc.googleDriveId)
      ? doc.googleDriveId
      : null;

  // Prefer original binary from storage when not plain text.
  if (doc.storageKey && (scopedCopy || !isTextMime(mime))) {
    const stored = await getObject(doc.storageKey);
    if (stored && stored.length > 0) {
      if (scopedCopy) {
        const sourceSha256 = createHash("sha256").update(stored).digest("hex");
        const { receiptId, fileId } = await reserveDriveOriginal({
          documentoId, storageKey: doc.storageKey, folderId: scopedCopy.folderId,
          sourceSha256, actorId: scopedCopy.actorId, accessToken: config.accessToken!,
        });
        await confirmStudyDestination();
        await uploadFileToDrive({
          name: doc.nombre, content: stored, contentMimeType: mime || "application/octet-stream",
          folderId: scopedCopy.folderId, accessToken: config.accessToken!, reservedFileId: fileId,
        });
        const file = await verifiedDriveOriginal({ fileId, folderId: scopedCopy.folderId, sourceSha256, accessToken: config.accessToken! });
        await prisma.$transaction(async tx => {
          const changed = await tx.documento.updateMany({
            where: {
              id: doc.id, storageKey: doc.storageKey, updatedAt: doc.updatedAt,
              causaId: doc.causaId, googleDriveId: null, confidencial: false, privilegio: false,
              causa: { googleDriveFolderId: scopedCopy.folderId, OR: [{ driveSyncSubscription: null }, { driveSyncSubscription: { account: "study" } }] },
            },
            data: { googleDriveId: fileId, updatedAt: doc.updatedAt },
          });
          if (!changed.count) {
            const current = await tx.documento.findUnique({ where: { id: doc.id }, select: { googleDriveId: true } });
            if (current?.googleDriveId !== fileId) throw httpError("El expediente cambió durante la copia. Recarga para verificar el vínculo con Drive.", 409);
          } else {
            await writeAuditStrict({
              actorId: scopedCopy.actorId, action: "document.archive.copy-drive", entityType: "Documento", entityId: doc.id,
              after: { fileId, folderId: scopedCopy.folderId, sourceSha256 },
            }, tx);
          }
          await tx.commandExecution.update({ where: { id: receiptId }, data: { status: "completed" } });
        });
        return {
          status: "uploaded" as const, file, folderId: scopedCopy.folderId, updated: false, kind: "binary" as const,
          message: "Copia verificada en Drive. El original se conserva en LexOpen.",
        };
      }
      const file = await uploadFileToDrive({
        name: doc.nombre,
        content: stored,
        contentMimeType: mime || "application/octet-stream",
        convertToGoogleDoc: false,
        folderId: realFolder,
        existingFileId: existingId,
        accessToken: config.accessToken!,
      });
      await prisma.documento.update({
        where: { id: doc.id },
        data: { googleDriveId: file.id },
      });
      return {
        status: "uploaded" as const,
        file,
        folderId: realFolder,
        updated: Boolean(file.updated),
        kind: "binary" as const,
        message: file.updated
          ? "Archivo actualizado en Google Drive."
          : "Archivo original subido a Google Drive.",
      };
    }
  }
  if (scopedCopy) throw httpError("El original ya no está disponible. Actualiza el expediente.", 409);

  let content = (doc.contenido || "").trim();
  let uploadName = doc.nombre;
  let fromExtracted = false;

  if (doc.storageKey && isTextMime(mime)) {
    const stored = await getObject(doc.storageKey);
    if (!stored) throw new Error("Contenido no encontrado en almacenamiento");
    content = Buffer.from(stored).toString("utf8");
  } else if (!isTextMime(mime) || !content) {
    const extracted = (doc.extractedMarkdown || "").trim();
    if (extracted) {
      content = extracted;
      fromExtracted = true;
      if (!uploadName.toLowerCase().endsWith(".md")) {
        uploadName = `${uploadName.replace(/\.[^.]+$/i, "") || uploadName}.md`;
      }
    } else if (
      doc.extractionStatus === "needs_ocr" ||
      doc.extractionStatus === "pending"
    ) {
      return {
        status: "needs_ocr" as const,
        message:
          "No hay texto indexado aún. Espere OCR/extracción o reintente el procesamiento antes de subir a Drive.",
      };
    } else {
      return {
        status: "unsupported" as const,
        message:
          "No hay binario en storage ni Markdown extraído para subir a Drive.",
      };
    }
  }

  if (!content.trim()) {
    return {
      status: "unsupported" as const,
      message: "El documento no tiene contenido de texto para subir a Drive.",
    };
  }

  const file = await uploadMarkdownToDrive({
    name: uploadName,
    content,
    folderId: realFolder,
    existingFileId: existingId,
    accessToken: config.accessToken!,
  });

  await prisma.documento.update({
    where: { id: doc.id },
    data: { googleDriveId: file.id },
  });
  return {
    status: "uploaded" as const,
    file,
    folderId: realFolder,
    fromExtracted,
    updated: Boolean(file.updated),
    kind: "google_doc" as const,
    message: file.updated
      ? fromExtracted
        ? "Google Doc actualizado con el Markdown extraído."
        : "Google Doc actualizado en Drive."
      : fromExtracted
        ? "Subido a Drive el Markdown extraído como Google Doc (el binario original permanece en LexOpen)."
        : "Texto subido a Drive como Google Doc.",
  };
}

/** Vincula una causa a una carpeta de Drive existente (URL o ID). */
/** Changing a linked folder revokes the previous automatic-pull choice. */
async function updateLinkedDriveFolder(causaId: string, data: { googleDriveFolderId: string | null; googleDriveFolderUrl: string | null; googleDriveFolderName: string | null }) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Causa" WHERE id = ${causaId} FOR UPDATE`;
    const prior = await tx.causa.findUniqueOrThrow({ where: { id: causaId }, select: { googleDriveFolderId: true } });
    if (prior.googleDriveFolderId !== data.googleDriveFolderId) await tx.driveSyncSubscription.updateMany({ where: { causaId }, data: { enabled: false, status: "paused", generation: { increment: 1 }, nextRunAt: null, scanCursor: null, leaseToken: null, leaseExpiresAt: null, note: "La carpeta cambió. Active la actualización para usar la nueva selección." } });
    return tx.causa.update({ where: { id: causaId }, data });
  });
}

export async function linkCausaDriveFolder(causaId: string, folderRef: string) {
  const parsed = parseGoogleDriveFolderRef(folderRef);
  if (!parsed) {
    throw new Error(
      "Referencia de carpeta inválida. Use la URL de Drive o el ID de la carpeta."
    );
  }
  if (isPlaceholderDriveFolderId(parsed.folderId)) {
    throw new Error(
      "No se puede vincular un ID stub/demo. Use una carpeta real de Google Drive o créela desde LexOpen."
    );
  }

  const causa = await prisma.causa.findUnique({ where: { id: causaId } });
  if (!causa) throw new Error("Causa no encontrada");

  let config: GoogleConfig;
  try {
    config = await requireDriveSession();
  } catch (e) {
    if (
      e instanceof GoogleIntegrationError &&
      (e.code === "needs_oauth" ||
        e.code === "disabled" ||
        e.code === "sync_off" ||
        e.code === "needs_reconnect")
    ) {
      if (process.env.NODE_ENV === "production") {
        throw new GoogleIntegrationError(
          e.code === "needs_oauth" ? "needs_oauth" : e.code,
          e.code === "needs_oauth"
            ? "Google OAuth requerido para vincular carpetas Drive en producción."
            : e.message
        );
      }
      // Dev: allow offline link of a real-looking ID without verification.
      const folderName =
        causa.rit || causa.titulo.slice(0, 80) || "Carpeta LexOpen";
      const updated = await updateLinkedDriveFolder(causaId, {
          googleDriveFolderId: parsed.folderId,
          googleDriveFolderUrl: parsed.folderUrl,
          googleDriveFolderName: folderName,
      });
      await prisma.activity.create({
        data: {
          tipo: "drive",
          mensaje: `Carpeta Google Drive vinculada (sin verificar): ${folderName}`,
          causaId,
        },
      });
      return {
        status: "linked_offline" as const,
        message:
          "Carpeta guardada sin verificar (OAuth no conectado). Al conectar Google se podrá validar el acceso.",
        causa: updated,
        folder: {
          id: parsed.folderId,
          name: folderName,
          url: parsed.folderUrl,
        },
      };
    }
    throw e;
  }

  let folderName =
    causa.rit || causa.titulo.slice(0, 80) || "Carpeta LexOpen";
  let folderUrl = parsed.folderUrl;

  const res = await googleFetch(
    `https://www.googleapis.com/drive/v3/files/${parsed.folderId}?fields=id,name,webViewLink,mimeType`,
    { headers: { Authorization: `Bearer ${config.accessToken}` } }
  );
  if (!res.ok) {
    const detail = await readGoogleError(res);
    throw new Error(
      `No se pudo verificar la carpeta en Drive (${detail}). Con el scope drive.file prefiera «Crear carpeta en Drive» o una carpeta creada por LexOpen.`
    );
  }
  const meta = (await res.json()) as {
    name?: string;
    mimeType?: string;
    webViewLink?: string;
  };
  if (meta.mimeType !== "application/vnd.google-apps.folder") {
    throw new Error("El ID no corresponde a una carpeta de Google Drive.");
  }
  if (meta.name) folderName = meta.name;
  if (meta.webViewLink) folderUrl = meta.webViewLink;

  const updated = await updateLinkedDriveFolder(causaId, {
      googleDriveFolderId: parsed.folderId,
      googleDriveFolderUrl: folderUrl,
      googleDriveFolderName: folderName,
  });

  await prisma.activity.create({
    data: {
      tipo: "drive",
      mensaje: `Carpeta Google Drive vinculada: ${folderName}`,
      causaId,
    },
  });

  return {
    status: "linked" as const,
    causa: updated,
    folder: {
      id: parsed.folderId,
      name: folderName,
      url: folderUrl,
    },
  };
}

/** Crea una carpeta en Drive para la causa y la vincula. */
export async function createCausaDriveFolder(
  causaId: string,
  opts?: { parentFolderId?: string; name?: string }
) {
  const causa = await prisma.causa.findUnique({
    where: { id: causaId },
    include: { cliente: true },
  });
  if (!causa) throw new Error("Causa no encontrada");

  const name =
    opts?.name ||
    [causa.rit, causa.titulo].filter(Boolean).join(" — ").slice(0, 120) ||
    "Causa LexOpen";

  let config: GoogleConfig;
  try {
    config = await requireDriveSession();
  } catch (e) {
    if (
      e instanceof GoogleIntegrationError &&
      (e.code === "needs_oauth" ||
        e.code === "disabled" ||
        e.code === "sync_off" ||
        e.code === "needs_reconnect")
    ) {
      if (process.env.NODE_ENV === "production") {
        throw new GoogleIntegrationError(
          e.code === "needs_oauth" ? "needs_oauth" : e.code,
          e.code === "needs_oauth"
            ? "Google OAuth requerido para crear carpetas Drive en producción"
            : e.message
        );
      }
      if (e.code !== "needs_oauth") throw e;
      const stubId = makeStubFolderId(causa.id);
      const url = stubFolderUrl(stubId);
      const updated = await updateLinkedDriveFolder(causaId, {
          googleDriveFolderId: stubId,
          googleDriveFolderUrl: url,
          googleDriveFolderName: `${name} (stub local)`,
      });
      await prisma.activity.create({
        data: {
          tipo: "drive",
          mensaje: `Carpeta Drive (modo stub) preparada: ${name}`,
          causaId,
        },
      });
      return {
        status: "stub" as const,
        message:
          "Google no conectado: se guardó un marcador local (no es una carpeta real de Drive). Conecte OAuth y use «Crear carpeta en Drive».",
        causa: updated,
        folder: { id: stubId, name: `${name} (stub local)`, url },
      };
    }
    throw e;
  }

  const metadata: Record<string, unknown> = {
    name,
    mimeType: "application/vnd.google-apps.folder",
  };
  if (opts?.parentFolderId && isRealDriveFolderId(opts.parentFolderId)) {
    metadata.parents = [opts.parentFolderId];
  }

  const res = await googleFetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(metadata),
  });

  if (!res.ok) {
    const detail = await readGoogleError(res);
    console.error("Google Drive folder creation failed", res.status, detail);
    throw new GoogleIntegrationError(
      "api_error",
      `Google Drive folder creation failed: ${detail}`
    );
  }

  const folder = (await res.json()) as { id: string; name?: string };
  const url = driveFolderUrl(folder.id);

  const updated = await updateLinkedDriveFolder(causaId, {
      googleDriveFolderId: folder.id,
      googleDriveFolderUrl: url,
      googleDriveFolderName: folder.name || name,
  });

  await prisma.activity.create({
    data: {
      tipo: "drive",
      mensaje: `Carpeta Google Drive creada y vinculada: ${folder.name || name}`,
      causaId,
    },
  });

  return {
    status: "created" as const,
    causa: updated,
    folder: { id: folder.id, name: folder.name || name, url },
  };
}

export async function unlinkCausaDriveFolder(causaId: string) {
  const updated = await updateLinkedDriveFolder(causaId, {
      googleDriveFolderId: null,
      googleDriveFolderUrl: null,
      googleDriveFolderName: null,
  });
  await prisma.activity.create({
    data: {
      tipo: "drive",
      mensaje: "Se desvinculó la carpeta de Google Drive",
      causaId,
    },
  });
  return { status: "unlinked" as const, causa: updated };
}

/** Lista archivos de la carpeta Drive de la causa (creados/visibles con drive.file). */
export async function listCausaDriveFolder(causaId: string) {
  const causa = await prisma.causa.findUnique({
    where: { id: causaId },
    select: {
      id: true,
      googleDriveFolderId: true,
      googleDriveFolderName: true,
    },
  });
  if (!causa) throw new Error("Causa no encontrada");
  if (!isRealDriveFolderId(causa.googleDriveFolderId)) {
    return {
      status: "needs_real_folder" as const,
      message: "Vincule o cree una carpeta real de Google Drive en la causa.",
      files: [] as Array<{
        id: string;
        name: string;
        mimeType: string;
        webViewLink?: string;
        modifiedTime?: string;
      }>,
    };
  }

  const config = await requireDriveSession();
  const q = `'${causa.googleDriveFolderId}' in parents and trashed=false`;
  const params = new URLSearchParams({
    q,
    pageSize: "50",
    fields: "files(id,name,mimeType,webViewLink,modifiedTime)",
    orderBy: "modifiedTime desc",
  });
  const res = await googleFetch(
    `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
    { headers: { Authorization: `Bearer ${config.accessToken}` } }
  );
  if (!res.ok) {
    const detail = await readGoogleError(res);
    throw new GoogleIntegrationError(
      "api_error",
      `No se pudo listar la carpeta Drive: ${detail}`
    );
  }
  const data = (await res.json()) as {
    files?: Array<{
      id: string;
      name: string;
      mimeType: string;
      webViewLink?: string;
      modifiedTime?: string;
    }>;
  };
  return {
    status: "ok" as const,
    folderId: causa.googleDriveFolderId,
    folderName: causa.googleDriveFolderName,
    files: data.files || [],
  };
}

/** Sube el Markdown de una minuta a la carpeta Drive de la causa. */
export async function pushMinutaToDrive(
  minutaId: string,
  opts?: { role?: string }
) {
  const minuta = await prisma.minuta.findUnique({
    where: { id: minutaId },
    include: {
      causa: true,
      documento: true,
      autor: { select: { id: true, name: true } },
      acciones: true,
    },
  });
  if (!minuta) throw new Error("Minuta no encontrada");
  if (minuta.confidencial && opts?.role && !canSeeConfidential(opts.role)) {
    throw new Error("Minuta confidencial");
  }

  const folderId = minuta.causa.googleDriveFolderId;
  let content =
    minuta.documento?.contenido ||
    `# ${minuta.titulo}\n\n${minuta.resumenEjecutivo}`;
  if (minuta.documento?.storageKey) {
    const stored = await getObject(minuta.documento.storageKey);
    if (stored) content = Buffer.from(stored).toString("utf8");
  }
  const name = minuta.documento?.nombre || `Minuta — ${minuta.titulo}.md`;

  if (!folderId || isPlaceholderDriveFolderId(folderId)) {
    return {
      status: "needs_real_folder" as const,
      message:
        "Vincule o cree una carpeta real de Google Drive en la causa antes de subir la minuta.",
    };
  }

  let config: GoogleConfig;
  try {
    config = await requireDriveSession();
  } catch (e) {
    if (
      e instanceof GoogleIntegrationError &&
      (e.code === "needs_oauth" ||
        e.code === "disabled" ||
        e.code === "sync_off" ||
        e.code === "needs_reconnect")
    ) {
      const soft = softGoogleFailure(e);
      return {
        ...soft,
        draft: {
          name,
          parents: [folderId],
        },
      };
    }
    throw e;
  }

  const existingId =
    (minuta.googleDriveFileId && isRealDriveFolderId(minuta.googleDriveFileId)
      ? minuta.googleDriveFileId
      : null) ||
    (minuta.documento?.googleDriveId &&
    isRealDriveFolderId(minuta.documento.googleDriveId)
      ? minuta.documento.googleDriveId
      : null);

  const file = await uploadMarkdownToDrive({
    name,
    content,
    folderId,
    existingFileId: existingId,
    accessToken: config.accessToken!,
  });

  await prisma.minuta.update({
    where: { id: minuta.id },
    data: { googleDriveFileId: file.id },
  });
  if (minuta.documentoId) {
    await prisma.documento.update({
      where: { id: minuta.documentoId },
      data: { googleDriveId: file.id },
    });
  }

  return {
    status: "uploaded" as const,
    file,
    folderId,
    updated: Boolean(file.updated),
    message: file.updated
      ? "Minuta actualizada en la carpeta Drive de la causa."
      : undefined,
  };
}
