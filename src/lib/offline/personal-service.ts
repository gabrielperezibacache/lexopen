import type { Prisma } from "@prisma/client";
import { executeCommand, serializable } from "@/lib/command-execution";
import { currentStaffActor, type StaffActor } from "@/lib/auth/staff-actor";
import { httpError } from "@/lib/auth/access";
import { writeAuditStrict } from "@/lib/audit";
import { bookFor } from "@/lib/books/access";
import { readAcademicArtifact, saveAcademicArtifactInTransaction } from "@/lib/altazor/academic";
import type { AltazorSourceSnapshot } from "@/lib/altazor/resources";
import { hashReference, userReference } from "./references";
import type { PersonalInput } from "./personal-schemas";
type Kind = PersonalInput["kind"];
type Actor = Awaited<ReturnType<typeof currentStaffActor>>;
type Tx = Prisma.TransactionClient;

export async function readPersonalEntity(kind: Kind, id: string, actor: Actor, tx: Tx) {
  const self = await userReference(actor.id, tx);
  if (kind === "academic") {
    const row = await tx.altazorAcademicArtifact.findUnique({ where: { id }, include: { workspace: true } });
    if (!row || row.workspace.ownerId !== actor.id) throw httpError("Manuscrito no disponible", 404);
    const artifact = await readAcademicArtifact(row.workspaceId, id, actor, tx);
    if (!["proposed", "reviewed"].includes(artifact.status)) throw httpError("Prepare un manuscrito editable antes de trabajar sin conexión", 409);
    const version = hashReference({ self: self.version, id, revision: row.revision, status: row.status, bodySha256: row.bodySha256, sources: row.sourceSnapshotsJson, destination: row.destinationJson, workspace: row.workspace.revision });
    const sourceReferences = (JSON.parse(row.sourceSnapshotsJson) as AltazorSourceSnapshot[]).map(({ input, fingerprint }) => ({ identity: Object.fromEntries(Object.entries(input).filter(([key]) => key !== "quote")), fingerprint }));
    return { kind, id, version, fields: { title: row.title, body: artifact.body }, relations: { self, sourceReferences, sourceLocked: true, causeLocked: true, warning: "La sincronización del texto modificado retira su marca de revisión; revise de nuevo con conexión." } };
  }
  const { book } = await bookFor(id, actor, tx);
  const note = await tx.libraryReadingNote.findUnique({ where: { ownerId_bookId: { ownerId: actor.id, bookId: id } } });
  const fields = { title: note?.title ?? book.title.slice(0, 200), notes: note?.notes ?? "", bookmarkKind: note?.bookmarkKind ?? "", bookmarkNumber: note?.bookmarkNumber ?? "" };
  return { kind, id, version: hashReference({ self: self.version, book: [id, book.revision, book.sourceSha256, book.textSha256], note: note ? [note.id, note.revision, note.updatedAt, fields] : null }), fields,
    relations: { self, bookRevision: book.revision, sourceLocked: true, causeLocked: true, warning: note && note.bookRevision !== book.revision ? "El libro cambió desde que se guardó el marcador. Revise su ubicación antes de sincronizar." : "Notas privadas de su cuenta. No se copia el texto del libro ni se comparten con su colección." } };
}

export async function syncPersonalEntity(user: StaffActor, input: PersonalInput) {
  const receipt = await executeCommand({ key: `offline:${input.requestId}`, ownerId: user.id, input,
    authorize: async tx => { await readPersonalEntity(input.kind, input.entityId, await currentStaffActor(user, tx), tx); },
    run: async tx => {
      const actor = await currentStaffActor(user, tx), current = await readPersonalEntity(input.kind, input.entityId, actor, tx);
      if (current.version !== input.expectedVersion) throw httpError("El texto o sus fuentes cambiaron. Compare las copias antes de sincronizar.", 409);
      if (input.kind === "academic") {
        const row = await tx.altazorAcademicArtifact.findUniqueOrThrow({ where: { id: input.entityId } });
        if (input.fields.title !== row.title) throw httpError("Conserve el título del manuscrito preparado", 409);
        if (input.fields.body !== row.body) await saveAcademicArtifactInTransaction(row.workspaceId, row.id, { body: input.fields.body, expectedRevision: row.revision, reviewed: false }, actor, tx);
      } else {
        const { book } = await bookFor(input.entityId, actor, tx), number = Number(input.fields.bookmarkNumber);
        if (input.fields.bookmarkKind === "" ? input.fields.bookmarkNumber !== "" : !Number.isSafeInteger(number) || number < 1) throw httpError("Seleccione una ubicación válida o retire el marcador", 422);
        if (input.fields.bookmarkKind === "page" && (book.locatorKind !== "pdf-page" || !book.pageCount || number > book.pageCount)) throw httpError("La página no existe en esta revisión del libro", 422);
        if (input.fields.bookmarkKind === "fragment" && !await tx.libraryBookFragment.findUnique({ where: { bookId_ordinal: { bookId: book.id, ordinal: number } }, select: { id: true } })) throw httpError("El fragmento no existe en esta revisión del libro", 422);
        await tx.libraryReadingNote.upsert({ where: { ownerId_bookId: { ownerId: actor.id, bookId: book.id } }, create: { ownerId: actor.id, bookId: book.id, bookRevision: book.revision, ...input.fields }, update: { ...input.fields, bookRevision: book.revision, revision: { increment: 1 } } });
      }
      const entity = await readPersonalEntity(input.kind, input.entityId, actor, tx);
      await writeAuditStrict({ actorId: actor.id, action: `offline.${input.kind}.update`, entityType: input.kind === "academic" ? "AltazorAcademicArtifact" : "LibraryReadingNote", entityId: input.entityId, after: { version: entity.version } }, tx);
      return { kind: input.kind, entityId: input.entityId, version: entity.version };
    },
  });
  return serializable(async tx => ({ receipt, entity: await readPersonalEntity(input.kind, input.entityId, await currentStaffActor(user, tx), tx), references: [] }));
}
