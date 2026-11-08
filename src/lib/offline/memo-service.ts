import type { Prisma } from "@prisma/client";
import { executeCommand, serializable } from "@/lib/command-execution";
import { currentStaffActor, type StaffActor } from "@/lib/auth/staff-actor";
import { can } from "@/lib/auth/permissions";
import { httpError } from "@/lib/auth/access";
import { writeAuditStrict } from "@/lib/audit";
import { memoCause, loadMinute, minuteFields, minuteVersion, prepareMinute, writeMinute, authorizeMinuteEffects, type MinuteAuthority } from "@/lib/minutas/mutations";
import { causeReference, hashReference, referenceConflict, userReference, type Actor } from "./references";
import type { MemoInput } from "./memo-schemas";
type Tx = Prisma.TransactionClient;
type Kind = "nota" | "minuta";
async function loadNote(id: string, actor: Actor, tx: Tx) {
  const row = await tx.nota.findUnique({ where: { id } });
  if (!row) throw httpError("Nota no encontrada", 404);
  const cause = row.causaId ? await memoCause(row.causaId, actor, tx) : null;
  if (!cause && !can(actor, "causa.write")) throw httpError("La nota sin causa requiere permiso general de edición", 403);
  return { ...row, cause };
}
export async function readMemoEntity(kind: Kind, id: string, actor: Actor, tx: Tx) {
  const self = await userReference(actor.id, tx);
  if (kind === "nota") {
    const row = await loadNote(id, actor, tx);
    return { kind, id, version: hashReference(row), fields: { titulo: row.titulo, contenido: row.contenido, tags: row.tags },
      relations: { self, cause: row.causaId ? await causeReference(row.causaId, actor, tx) : null, causeLocked: true } };
  }
  const row = await loadMinute(id, actor, tx);
  return { kind, id, version: minuteVersion(row), fields: minuteFields(row), relations: { self, cause: await causeReference(row.causaId, actor, tx), causeLocked: true, canConfidential: can(actor, "doc.confidential.read") } };
}
type Authority = { causeId: string | null; effects?: MinuteAuthority };
type Receipt = { kind: Kind; entityId: string; version: string; authority: Authority; referenceVersions: { type: string; id: string; version: string }[] };
type Rejected = { rejected: true; error: string; status: number };
async function authorize(authority: Authority, actor: Actor, tx: Tx) {
  if (authority.causeId) await memoCause(authority.causeId, actor, tx);
  else if (!can(actor, "causa.write")) throw httpError("Sin permiso para esta nota", 403);
  if (authority.effects) await authorizeMinuteEffects(authority.effects, actor, tx);
}
async function references(input: MemoInput, actor: Actor, tx: Tx) {
  return input.relations ? [{ type: "cause", ...await causeReference(input.relations.cause.id, actor, tx) }] : [];
}
export async function syncMemoEntity(user: StaffActor, input: MemoInput) {
  const receipt = await executeCommand<Receipt | Rejected>({ key: `offline:${input.requestId}`, ownerId: user.id, input,
    authorize: async (tx, committed) => {
      const actor = await currentStaffActor(user, tx);
      if (input.action === "update") await readMemoEntity(input.kind, input.entityId!, actor, tx);
      if (committed && !("rejected" in committed)) { await readMemoEntity(committed.kind, committed.entityId, actor, tx); await authorize(committed.authority, actor, tx); }
    },
    run: async tx => {
      const actor = await currentStaffActor(user, tx);
      if (input.action === "update" && (await readMemoEntity(input.kind, input.entityId!, actor, tx)).version !== input.expectedVersion) throw httpError("Hay cambios en el registro o en sus fuentes. Compare las copias antes de sincronizar.", 409);
      const note = input.kind === "nota" && input.action === "update" ? await loadNote(input.entityId!, actor, tx) : null;
      const minute = input.kind === "minuta" && input.action === "update" ? await loadMinute(input.entityId!, actor, tx) : null;
      const causeId = note ? note.causaId : minute ? minute.causaId : input.relations!.cause.id;
      let prepared;
      try {
        if (input.relations) {
          if (input.relations.cause.id !== causeId) throw referenceConflict("Conserve la causa de origen de la copia preparada");
          const ref = await causeReference(causeId!, actor, tx, true);
          if (ref.version !== input.relations.cause.expectedVersion) throw referenceConflict();
        }
        if (causeId) await memoCause(causeId, actor, tx);
        if (input.kind === "minuta") prepared = await prepareMinute(input.fields, causeId!, actor, tx, minute, { reviewedActions: input.reviewedActions });
      } catch (e) {
        if ((e as { code?: string }).code === "offline_reference_conflict" || [403, 404].includes((e as { status?: number }).status || 0)) return { rejected: true, error: (e as Error).message, status: (e as { status?: number }).status || 409 };
        throw e;
      }
      let id: string, authority: Authority = { causeId };
      if (input.kind === "nota") {
        const row = note ? await tx.nota.update({ where: { id: note.id, updatedAt: note.updatedAt }, data: input.fields }) : await tx.nota.create({ data: { ...input.fields, causaId: causeId } }); id = row.id;
        if (!note) await tx.activity.create({ data: { tipo: "nota", mensaje: `Nota creada: ${row.titulo}`, causaId: causeId, userId: actor.id } });
        await writeAuditStrict({ actorId: actor.id, action: note ? "nota.update" : "nota.create", entityType: "Nota", entityId: id, before: note ? { titulo: note.titulo, contenido: note.contenido, tags: note.tags } : undefined, after: input.fields }, tx);
      } else {
        const result = await writeMinute(actor, input.fields, tx, minute, prepared!); id = result.id; authority = { causeId, effects: result.authority };
      }
      const entity = await readMemoEntity(input.kind, id, actor, tx), refs = await references(input, actor, tx);
      return { kind: input.kind, entityId: id, version: entity.version, authority, referenceVersions: refs.map(({ type, id, version }) => ({ type, id, version })) };
    },
  });
  if ("rejected" in receipt) throw Object.assign(referenceConflict(receipt.error), { status: receipt.status });
  return serializable(async tx => { const actor = await currentStaffActor(user, tx); const entity = await readMemoEntity(receipt.kind, receipt.entityId, actor, tx); await authorize(receipt.authority, actor, tx); return { receipt, entity, references: await references(input, actor, tx) }; });
}
