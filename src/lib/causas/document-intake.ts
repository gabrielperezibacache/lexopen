import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { writeAuditStrict } from "@/lib/audit";
import { httpError } from "@/lib/auth/access";
import { assertCausaCapability, documentReadWhere, type CausaAccessUser } from "@/lib/auth/causa-access";
import { canSeeConfidential, canSeePrivileged, isStaff } from "@/lib/auth/rbac";
import { serializable } from "@/lib/command-execution";
import { sha256 } from "@/lib/evidence/fragments";
import { documentoListSelect } from "@/lib/sites/file-select";
import { discardCaseUploadAttempt, getObjectBounded, putObject } from "@/lib/storage";

const originalSelect = { ...documentoListSelect, storageKey: true } as const;
type OriginalDocument = Prisma.DocumentoGetPayload<{ select: typeof originalSelect }>;
type IntakeScope = { causaId: string; clienteId: string | null; confidencial: boolean; privilegio: boolean };
type OriginalIdentity = { sourceSha256: string; sizeBytes: number };
type ManualInput = IntakeScope & {
  nombre: string;
  tipo: string;
  contenido: string | null;
  mimeType: string;
  ruta: string | null;
  extractionStatus: string | null;
};

function currentScope(actor: CausaAccessUser, scope: IntakeScope): Prisma.DocumentoWhereInput {
  const { causaId, clienteId, confidencial, privilegio } = scope;
  return { AND: [documentReadWhere(actor), {
    causaId, clienteId, confidencial, privilegio,
    version: 1,
    storageKey: { not: null },
    caseAudioSource: null,
    audioPublication: null,
  }] };
}

async function originalMatches(storageKey: string | null, identity: OriginalIdentity) {
  if (!storageKey) return false;
  const bytes = await getObjectBounded(storageKey, identity.sizeBytes).catch((error: unknown) => {
    if ((error as { status?: number }).status === 413) return null;
    throw error;
  });
  return bytes?.byteLength === identity.sizeBytes && sha256(bytes) === identity.sourceSha256;
}

/** Match only live version-one ordinary intake records within the exact matter/client. */
export async function findCaseIntakeOriginal(
  tx: Prisma.TransactionClient,
  actor: CausaAccessUser,
  scope: IntakeScope,
  identity: OriginalIdentity,
): Promise<OriginalDocument | null> {
  // Restricted files can have different readers even in the same case.
  if (scope.confidencial || scope.privilegio) return null;
  const where = currentScope(actor, scope);
  const receipts = await tx.caseDocumentIntake.findMany({
    where: {
      causaId: scope.causaId,
      documentVersion: 1,
      sourceSha256: identity.sourceSha256,
      documento: { is: where },
    },
    orderBy: [{ receivedAt: "asc" }, { id: "asc" }],
    select: { storageKey: true, documento: { select: originalSelect } },
    take: 25,
  });
  const checked = new Set<string>();
  for (const receipt of receipts) {
    const doc = receipt.documento;
    if (!doc?.storageKey || doc.storageKey !== receipt.storageKey || checked.has(doc.storageKey)) continue;
    checked.add(doc.storageKey);
    if (await originalMatches(doc.storageKey, identity)) return doc;
  }

  // Existing mailbox attachments already store the original's checked digest.
  const legacyMail = await tx.mailboxAttachment.findMany({
    where: {
      sha256: identity.sourceSha256,
      sizeBytes: identity.sizeBytes,
      documentoId: { not: null },
      storageKey: { not: null },
      message: { causaId: scope.causaId, status: "aplicado" },
      caseIntake: null,
    },
    select: {
      id: true, documentoId: true, storageKey: true, filename: true,
      message: { select: { userId: true, receivedAt: true } },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 25,
  });
  if (legacyMail.length) {
    const docs = await tx.documento.findMany({
      where: { AND: [where, { id: { in: legacyMail.map(row => row.documentoId!) } }] },
      select: originalSelect,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    for (const doc of docs) {
      const origins = legacyMail.filter(row => row.documentoId === doc.id && row.storageKey === doc.storageKey);
      if (!origins.length || !await originalMatches(doc.storageKey, identity)) continue;
      await tx.caseDocumentIntake.createMany({ skipDuplicates: true, data: origins.map(origin => ({
        causaId: scope.causaId,
        documentoId: doc.id,
        documentVersion: doc.version,
        source: "mail",
        sourceKey: origin.id,
        sourceName: origin.filename,
        sourceSha256: identity.sourceSha256,
        storageKey: doc.storageKey,
        actorId: origin.message.userId,
        mailboxAttachmentId: origin.id,
        receivedAt: origin.message.receivedAt,
      })) });
      return doc;
    }
  }

  // A legacy manual file is eligible only if it has a recorded evidence digest
  // and its current original still matches those bytes.
  const legacyManual = await tx.documento.findMany({
    where: { AND: [where, {
      storageKey: { startsWith: "documentos/" },
      caseIntakes: { none: { source: "manual" } },
      evidenceResource: { versions: { some: { sourceSha256: identity.sourceSha256, sourceRevision: { startsWith: "1:" } } } },
    }] },
    select: {
      ...originalSelect,
      evidenceResource: { select: { versions: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1, select: { sourceSha256: true, sourceRevision: true, sourceName: true, sourceStorageKey: true } } } },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 10,
  });
  for (const { evidenceResource, ...doc } of legacyManual) {
    const evidence = evidenceResource?.versions[0];
    if (evidence?.sourceSha256 !== identity.sourceSha256 || !evidence.sourceRevision.startsWith("1:") ||
      evidence.sourceStorageKey !== `evidence/${encodeURIComponent(doc.id)}/${identity.sourceSha256}` ||
      !await originalMatches(doc.storageKey, identity) ||
      !await originalMatches(evidence.sourceStorageKey, identity)) continue;
    await tx.caseDocumentIntake.createMany({ skipDuplicates: true, data: {
      causaId: scope.causaId,
      documentoId: doc.id,
      documentVersion: doc.version,
      source: "manual",
      sourceKey: `legacy:${doc.id}`,
      sourceName: evidence.sourceName,
      sourceSha256: identity.sourceSha256,
      storageKey: doc.storageKey,
      actorId: doc.autorId,
      receivedAt: doc.createdAt,
    } });
    return doc;
  }
  return null;
}

/** Same manual input and uploader is the same receipt, even after an HTTP retry. */
export async function ingestManualCaseDocument(input: ManualInput, original: Buffer | null, user: CausaAccessUser) {
  const identity = original?.length ? { sourceSha256: sha256(original), sizeBytes: original.length } : null;
  const sourceKey = identity ? sha256(JSON.stringify([
    user.id, identity.sourceSha256, input.nombre, input.tipo, input.mimeType, input.ruta,
    input.clienteId, input.confidencial, input.privilegio,
  ])) : randomUUID();
  const uploadKey = `documentos/case-intake-attempt/${randomUUID()}`;
  let staged: ReturnType<typeof putObject> | undefined;

  const result = await serializable(async tx => {
    const actor = await tx.user.findUnique({
      where: { id: user.id },
      select: { id: true, role: true, capabilityGrants: true, capabilityRevokes: true },
    });
    if (!actor || !isStaff(actor.role)) throw httpError("No tiene permiso para incorporar documentos", 403);
    await assertCausaCapability(input.causaId, actor, "causa.write", tx);
    if (input.confidencial && !canSeeConfidential(actor) || input.privilegio && !canSeePrivileged(actor)) {
      throw httpError("Su rol no puede crear contenido confidencial o privilegiado", 403);
    }

    const previous = identity && await tx.caseDocumentIntake.findUnique({
      where: { causaId_source_sourceKey: { causaId: input.causaId, source: "manual", sourceKey } },
      select: { documentoId: true, storageKey: true, documentVersion: true },
    });
    if (identity && previous) {
      const doc = previous.documentoId && await tx.documento.findFirst({
        where: { AND: [currentScope(actor, input), { id: previous.documentoId }] },
        select: originalSelect,
      });
      if (!doc || doc.version !== previous.documentVersion || doc.storageKey !== previous.storageKey || !await originalMatches(doc.storageKey, identity)) {
        throw httpError("El ingreso anterior cambió. Revise el documento en su expediente", 409);
      }
      return { doc, reused: true };
    }

    const reusable = identity && await findCaseIntakeOriginal(tx, actor, input, identity);
    if (!reusable && original) {
      staged ??= putObject({ key: uploadKey, body: original, contentType: input.mimeType });
      await staged;
    }
    const doc = reusable || await tx.documento.create({
      data: { ...input, autorId: actor.id, storageKey: original ? uploadKey : null },
      select: originalSelect,
    });
    await tx.caseDocumentIntake.create({ data: {
      causaId: input.causaId,
      documentoId: doc.id,
      documentVersion: doc.version,
      source: "manual",
      sourceKey,
      sourceName: input.nombre,
      sourceSha256: identity?.sourceSha256,
      storageKey: doc.storageKey,
      actorId: actor.id,
    } });
    if (!reusable) await tx.activity.create({ data: {
      tipo: "documento", mensaje: `Documento creado: ${doc.nombre}`, causaId: input.causaId, userId: actor.id,
    } });
    await writeAuditStrict({
      actorId: actor.id,
      action: reusable ? "documento.origin.add" : "documento.create",
      entityType: "Documento",
      entityId: doc.id,
      after: { nombre: doc.nombre, storageKey: doc.storageKey, source: "manual" },
    }, tx);
    return { doc, reused: Boolean(reusable) };
  });

  // A transaction retry can find the other writer's committed original. Our
  // attempt has a unique key that can safely be removed after confirmed reuse.
  const { storageKey, ...doc } = result.doc;
  if (result.reused && staged && storageKey !== uploadKey) await discardCaseUploadAttempt(uploadKey).catch(() => undefined);
  return { doc, reused: result.reused };
}
