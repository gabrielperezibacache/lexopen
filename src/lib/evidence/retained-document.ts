import type { Prisma } from "@prisma/client";
import { currentStaffActor, type StaffActor } from "@/lib/auth/staff-actor";
import { documentReadWhere } from "@/lib/auth/causa-access";
import { can } from "@/lib/auth/permissions";
import { httpError } from "@/lib/auth/access";
import { canonicalJson } from "@/lib/command-execution";
import { sha256 } from "@/lib/evidence/fragments";
import { getObjectBounded } from "@/lib/storage";
import { documentBodyForDownload } from "@/lib/security/download";

type Tx = Prisma.TransactionClient;
export async function supportDocument(
  scope: { causaId: string | null },
  support: { kind: "document"; documentoId: string; version: number },
  user: StaffActor,
  tx: Tx,
  retained = false,
) {
  const actor = await currentStaffActor(user, tx);
  const doc = await tx.documento.findFirst({
    where: { id: support.documentoId, ...documentReadWhere(actor) },
  });
  if (!doc || doc.causaId !== scope.causaId)
    throw httpError(
      "El respaldo no está disponible en esta causa",
      404,
    );
  if (!retained && doc.version !== support.version)
    throw httpError("El documento cambió; seleccione su versión actual", 409);
  const old = retained
    ? await tx.offlineDocumentRevision.findUnique({
        where: {
          documentoId_version: {
            documentoId: doc.id,
            version: support.version,
          },
        },
      })
    : null;
  if (retained && (!old || old.causaId !== scope.causaId))
    throw httpError("La versión del respaldo ya no está disponible", 404);
  const flags = old || doc;
  if (flags.confidencial && !can(actor, "doc.confidential.read"))
    throw httpError("Respaldo no disponible", 404);
  if (flags.privilegio) {
    const cause = doc.causaId
      ? await tx.causa.findUnique({
          where: { id: doc.causaId },
          select: { abogadoId: true },
        })
      : null;
    const member = doc.causaId
      ? await tx.causaMiembro.findFirst({
          where: {
            causaId: doc.causaId,
            userId: actor.id,
            desde: { lte: new Date() },
            OR: [{ hasta: null }, { hasta: { gt: new Date() } }],
          },
          select: { id: true },
        })
      : null;
    if (
      !can(actor, "doc.confidential.read") ||
      !can(actor, "doc.privileged.read", {
        own:
          doc.autorId === actor.id ||
          cause?.abogadoId === actor.id ||
          Boolean(member),
      })
    )
      throw httpError("Respaldo no disponible", 404);
  }
  return { doc, revision: old || doc };
}
export async function retainSupportDocument(
  scope: { causaId: string | null },
  support: { kind: "document"; documentoId: string; version: number },
  actor: StaffActor,
  tx: Tx,
) {
  const { doc } = await supportDocument(scope, support, actor, tx);
  if (!doc.storageKey && doc.contenido === null)
    throw httpError("El original del respaldo no está disponible", 409);
  const bytes = documentBodyForDownload(
    doc,
    doc.storageKey ? await getObjectBounded(doc.storageKey) : null,
  );
  if (!bytes)
    throw httpError("El original del respaldo no está disponible", 409);
  const retained = await tx.offlineDocumentRevision.findUnique({
    where: {
      documentoId_version: { documentoId: doc.id, version: doc.version },
    },
  });
  if (retained) {
    const retainedBytes = documentBodyForDownload(
      retained,
      retained.storageKey
        ? await getObjectBounded(retained.storageKey)
        : null,
    );
    if (!retainedBytes || sha256(retainedBytes) !== sha256(bytes))
      throw httpError(
        "La versión retenida del documento no coincide con el original",
        409,
      );
  }
  await tx.offlineDocumentRevision.upsert({
    where: {
      documentoId_version: { documentoId: doc.id, version: doc.version },
    },
    update: {},
    create: {
      documentoId: doc.id,
      version: doc.version,
      contenido: doc.contenido,
      storageKey: doc.storageKey,
      mimeType: doc.mimeType,
      nombre: doc.nombre,
      confidencial: doc.confidencial,
      privilegio: doc.privilegio,
      causaId: doc.causaId,
      snapshotJson: canonicalJson(doc),
    },
  });
  return {
    documentoId: doc.id,
    documentVersion: doc.version,
    documentSha256: sha256(bytes),
  };
}
