import { randomUUID } from "node:crypto";
import { currentStaffActor, type ResolvedStaffActor, type StaffActor } from "@/lib/auth/staff-actor";
import { can } from "@/lib/auth/permissions";
import { httpError } from "@/lib/auth/access";
import { canonicalJson, executeCommand, serializable } from "@/lib/command-execution";
import { writeAuditStrict } from "@/lib/audit";
import { putObject, discardOfflineFileAttempt } from "@/lib/storage";
import { sanitizeUploadMimeType } from "@/lib/security/download";
import { normalizeIngestPath } from "@/lib/document-ingest";
import { findCaseIntakeOriginal } from "@/lib/causas/document-intake";
import { referenceConflict } from "./references";
import { fileSyncSchema, type FileInput, type FileFields, type FileKind } from "./file-schemas";
import { loadFileSource, authorizeFileWrite, sourceSnapshot, sourceBytes, targetSnapshot, decodeContent, digest, fileSignature, type FileSource, type FileTx } from "./file-sources";
type Receipt = { kind: FileKind; entityId: string; version: string; signature: string };
type Rejected = { rejected: true; error: string; status: number };
export async function retainDocument(source: Extract<FileSource, { kind: "documento" }>, tx: FileTx) {
  const r = source.row;
  await tx.offlineDocumentRevision.upsert({ where: { documentoId_version: { documentoId: r.id, version: r.version } }, update: {}, create: { documentoId: r.id, version: r.version, contenido: r.contenido, storageKey: r.storageKey, mimeType: r.mimeType, nombre: r.nombre, confidencial: r.confidencial, privilegio: r.privilegio, causaId: r.causaId, snapshotJson: canonicalJson(r) } });
}
export async function retainSiteFile(row: Extract<FileSource, { kind: "adjunto" }>["row"], tx: FileTx) {
  const old = await tx.fileVersion.findFirst({ where: { fileId: row.id, version: row.version }, orderBy: { id: "asc" } });
  const details = { storageKey: row.storageKey, mimeType: row.mimeType, sizeBytes: row.sizeBytes, snapshotJson: await siteRevisionSnapshot(row, tx), contenido: row.contenido };
  if (old) { if (!old.snapshotJson) await tx.fileVersion.update({ where: { id: old.id }, data: details }); }
  else await tx.fileVersion.create({ data: { ...details, fileId: row.id, version: row.version, note: "Original conservado antes de la revisión" } });
}
export async function siteRevisionSnapshot(row: Extract<FileSource, { kind: "adjunto" }>["row"], tx: FileTx) { return canonicalJson({ ...row, _causeId: (await tx.site.findUniqueOrThrow({ where: { id: row.siteId }, select: { causaId: true } })).causaId }); }
export async function authorizeFileFlags(fields: FileFields, actor: ResolvedStaffActor, source: FileSource | null, tx: FileTx, target?: FileInput["target"], allowDeclassify = false) {
  if (fields.confidential && !can(actor, "doc.confidential.read")) throw httpError("Sin permiso para contenido confidencial", 403);
  const causeId = source?.kind === "documento" ? source.row.causaId : source?.kind === "adjunto" ? source.context.cause?.id : target?.type === "cause" ? target.id : target ? (await tx.site.findUnique({ where: { id: target.id }, select: { causaId: true } }))?.causaId : null;
  const member = causeId && await tx.causa.findFirst({ where: { id: causeId, OR: [{ abogadoId: actor.id }, { miembros: { some: { userId: actor.id, desde: { lte: new Date() }, OR: [{ hasta: null }, { hasta: { gt: new Date() } }] } } }] }, select: { id: true } });
  if (fields.privileged && (!can(actor, "doc.confidential.read") || !can(actor, "doc.privileged.read", { own: source?.kind === "documento" ? source.row.autorId === actor.id || Boolean(member) : !source && target?.type === "cause" || Boolean(member) }))) throw httpError("Sin permiso para contenido con privilegio", 403);
  if (!allowDeclassify && source && (source.row.confidencial && !fields.confidential || source.row.privilegio && !fields.privileged)) throw referenceConflict("Desclasifique el archivo con conexión; la copia local se conserva");
  if ((!source || source.kind === "adjunto") && /(?:^|[,;\s])cliente(?:$|[,;\s])/i.test(fields.tags) && !(source?.kind === "adjunto" && /(?:^|[,;\s])cliente(?:$|[,;\s])/i.test(source.row.tags))) throw referenceConflict("Compartir un adjunto con el portal requiere revisión con conexión");
}
function normalizedFields(input: FileInput): FileFields {
  const f = { ...input.fields };
  if (input.kind === "documento") { if (f.tags) throw httpError("El documento de causa no admite etiquetas de espacio", 422); if (f.path && normalizeIngestPath(f.path + "/x")?.ruta !== f.path) throw httpError("La ruta del documento no es válida", 422); }
  else if (f.type !== "otro" || f.path) throw httpError("Conserve el tipo y carpeta propios del adjunto", 422);
  return f;
}
export async function syncOfflineFile(user: StaffActor, raw: unknown, storageWrite = putObject) {
  const input = fileSyncSchema.parse(raw), fields = normalizedFields(input), bytes = decodeContent(input.content), mimeType = sanitizeUploadMimeType(input.content.mimeType);
  let staged: Promise<unknown> | undefined;
  const uploadKey = `offline-files/attempts/${randomUUID()}`;
  const stage = async () => { staged ||= storageWrite({ key: uploadKey, body: bytes, contentType: mimeType }); await staged; return uploadKey; };
  const receipt = await executeCommand<Receipt | Rejected>({ key: `offline-file:${input.requestId}`, ownerId: user.id, input,
    authorize: async (tx, previous) => { const actor = await currentStaffActor(user, tx); if (previous && !("rejected" in previous)) await authorizeFileWrite(await loadFileSource(previous.kind, previous.entityId, actor, tx), actor, tx); },
    run: async tx => {
      const actor = await currentStaffActor(user, tx);
      let source: FileSource | null;
      try { source = input.action === "update" ? await loadFileSource(input.kind, input.entityId!, actor, tx) : null; }
      catch (e) { if ([403,404].includes((e as { status?: number }).status || 0)) return { rejected: true, error: (e as Error).message, status: (e as { status: number }).status }; throw e; }
      const snapshot = source ? await sourceSnapshot(source, actor, tx) : null;
      if (snapshot && snapshot.version !== input.expectedVersion) throw httpError("El archivo, original o contexto cambió. Conserve la copia local y compare las versiones", 409);
      try {
        if (source) await authorizeFileWrite(source, actor, tx);
        if (input.target) { const ref = await targetSnapshot(input.target.type, input.target.id, input.target.folderId, actor, tx); if (ref.version !== input.target.expectedVersion) throw referenceConflict("El destino cambió. Revíselo antes de enviar la copia conservada"); }
        await authorizeFileFlags(fields, actor, source, tx, input.target);
        if (source?.contentLocked && (snapshot!.content.sha256 !== input.content.sha256 || snapshot!.content.mimeType !== mimeType)) throw referenceConflict("El original tiene una fuente o reserva protegida. Revise su sustitución con conexión");
      } catch (e) { if ((e as { code?: string }).code === "offline_reference_conflict" || [403,404].includes((e as { status?: number }).status || 0)) return { rejected: true, error: (e as Error).message, status: (e as { status?: number }).status || 409 }; throw e; }
      let id: string;
      const changedContent = !snapshot || snapshot.content.sha256 !== input.content.sha256 || snapshot.content.mimeType !== mimeType;
      const text = input.content.mode === "text" ? input.content.text : null;
      if (input.kind === "documento") {
        if (source?.kind === "documento") {
          await retainDocument(source, tx);
          const row = await tx.documento.update({ where: { id: source.row.id, updatedAt: source.row.updatedAt, version: source.row.version }, data: { nombre: fields.name, tipo: fields.type, ruta: fields.path, confidencial: fields.confidential, privilegio: fields.privileged, version: { increment: 1 },
            ...(changedContent ? { storageKey: await stage(), contenido: text, mimeType, extractedMarkdown: null, extractionJson: null, extractionStatus: "pending", extractionAttempts: 0, extractionLockedAt: null, extractionLockToken: null, extractionNextAttemptAt: null } : {}) } }); id = row.id;
        } else {
          const causaId = input.target!.id;
          const scope = { causaId, clienteId: null, confidencial: fields.confidential, privilegio: fields.privileged };
          const sourceKey = digest(Buffer.from(JSON.stringify([actor.id, input.content.sha256, fields.name, fields.type, mimeType, fields.path, null, fields.confidential, fields.privileged])));
          const previous = await tx.caseDocumentIntake.findUnique({ where: { causaId_source_sourceKey: { causaId, source: "manual", sourceKey } } });
          let reused = previous?.documentoId ? await loadFileSource("documento", previous.documentoId, actor, tx) : null;
          if (previous && (!reused || reused.row.version !== previous.documentVersion || digest(await sourceBytes(reused)) !== input.content.sha256)) throw httpError("El ingreso anterior cambió; conserve su copia y revise el expediente", 409);
          if (!reused) { const original = await findCaseIntakeOriginal(tx, actor, scope, { sourceSha256: input.content.sha256, sizeBytes: bytes.length }); if (original) reused = await loadFileSource("documento", original.id, actor, tx); }
          const doc = reused?.row || await tx.documento.create({ data: { ...scope, nombre: fields.name, tipo: fields.type, ruta: fields.path, mimeType, contenido: text, storageKey: await stage(), autorId: actor.id, extractionStatus: "pending" } }); id = doc.id;
          if (!previous) await tx.caseDocumentIntake.create({ data: { causaId, documentoId: id, documentVersion: doc.version, source: "manual", sourceKey, sourceName: fields.name, sourceSha256: input.content.sha256, storageKey: doc.storageKey, actorId: actor.id } });
          if (!reused) await tx.activity.create({ data: { tipo: "documento", mensaje: fields.confidential || fields.privileged ? "Documento reservado incorporado" : `Documento creado: ${fields.name}`, causaId, userId: actor.id } });
        }
      } else {
        const data = { name: fields.name, tags: fields.tags, confidencial: fields.confidential, privilegio: fields.privileged, ...(changedContent ? { contenido: text, storageKey: await stage(), mimeType, sizeBytes: bytes.length } : {}) };
        if (source?.kind === "adjunto") {
          await retainSiteFile(source.row, tx);
          const row = await tx.siteFile.update({ where: { id: source.row.id, version: source.row.version, updatedAt: source.row.updatedAt }, data: { ...data, version: { increment: 1 } } }); id = row.id;
          await tx.fileVersion.create({ data: { fileId: id, version: row.version, contenido: row.contenido, storageKey: row.storageKey, mimeType: row.mimeType, sizeBytes: row.sizeBytes, snapshotJson: await siteRevisionSnapshot(row, tx), note: "Revisión sincronizada", authorId: actor.id } });
        } else {
          const row = await tx.siteFile.create({ data: { ...data, siteId: input.target!.id, folderId: input.target!.folderId } }); id = row.id;
          await tx.fileVersion.create({ data: { fileId: id, version: 1, contenido: row.contenido, storageKey: row.storageKey, mimeType: row.mimeType, sizeBytes: row.sizeBytes, snapshotJson: await siteRevisionSnapshot(row, tx), note: "Versión inicial", authorId: actor.id } });
          await tx.activity.create({ data: { tipo: "documento", mensaje: fields.confidential || fields.privileged ? "Adjunto reservado incorporado" : `Adjunto creado: ${fields.name}`, siteId: row.siteId, userId: actor.id } });
          const workflows = await tx.workflow.findMany({ where: { siteId: row.siteId, triggerType: "file_upload", active: true }, select: { id: true } });
          if (workflows.length) await tx.workflowInstance.createMany({ data: workflows.map(w => ({ workflowId: w.id, actorId: actor.id, payloadJson: JSON.stringify({ fileId: id, name: fields.confidential || fields.privileged ? "Archivo reservado" : row.name }) })) });
        }
      }
      await writeAuditStrict({ actorId: actor.id, action: `${input.kind}.${source ? "update" : "create"}`, entityType: input.kind === "documento" ? "Documento" : "SiteFile", entityId: id, after: { ...(fields.confidential || fields.privileged ? {} : { name: fields.name, sha256: input.content.sha256 }), size: bytes.length } }, tx);
      const saved = await loadFileSource(input.kind, id, actor, tx);
      let result;
      try { result = await sourceSnapshot(saved, actor, tx); }
      catch (e) { if (staged && saved.row.storageKey === uploadKey && [409,413].includes((e as { status?: number }).status || 0)) throw httpError("No se pudo verificar el original cargado. Reintente la misma petición; la copia local se conserva", 503); throw e; }
      if (staged && saved.row.storageKey === uploadKey && result.content.sha256 !== input.content.sha256) throw httpError("El almacenamiento devolvió otros bytes. Reintente; el original anterior se conserva", 503);
      return { kind: input.kind, entityId: id, version: result.version, signature: fileSignature(result.fields, result.content.sha256) };
    },
  });
  if (staged) {
    // One snapshot avoids deleting an original that moved into history meanwhile.
    const retained = await serializable(async tx => (await tx.documento.count({ where: { storageKey: uploadKey } })) + (await tx.siteFile.count({ where: { storageKey: uploadKey } })) + (await tx.offlineDocumentRevision.count({ where: { storageKey: uploadKey } })) + (await tx.fileVersion.count({ where: { storageKey: uploadKey } })) + (await tx.caseDocumentIntake.count({ where: { storageKey: uploadKey } })));
    if (!retained) await discardOfflineFileAttempt(uploadKey).catch(() => undefined);
  }
  if ("rejected" in receipt) throw Object.assign(referenceConflict(receipt.error), { status: receipt.status });
  return serializable(async tx => { const actor = await currentStaffActor(user, tx), source = await loadFileSource(receipt.kind, receipt.entityId, actor, tx); await authorizeFileWrite(source, actor, tx); return { receipt, entity: await sourceSnapshot(source, actor, tx) }; });
}
