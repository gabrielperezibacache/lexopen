import { readMemoEntity, syncMemoEntity } from "./memo-service";
import { readOperation, syncOperation } from "./operations-service";
import { readLegalEntity, syncLegalEntity } from "./legal-service";
import { referenceConflict } from "./references";
import { snapshotRelations, prepareRelations, applyClientCaseLinks, authorizeRelations, relatedSnapshots, type RelationAuthority } from "./relations";
import type { Prisma } from "@prisma/client";
import { executeCommand, serializable } from "@/lib/command-execution";
import { currentStaffActor, type StaffActor } from "@/lib/auth/staff-actor";
import { httpError } from "@/lib/auth/access";
import { activeDelegadorIds } from "@/lib/auth/delegacion";
import { createClienteRecord, updateClienteRecord } from "@/lib/clientes/mutations";
import { taskWorkspaceAccessWhere } from "@/lib/tasks/workspace";
import { createTask, taskMutationPermissions, updateTasks } from "@/lib/tasks/service";
import { clienteVersion, taskVersion } from "./version";
import { offlineKind, offlineSyncSchema } from "./schemas";

type Kind = "cliente" | "task";
type Actor = Awaited<ReturnType<typeof currentStaffActor>>;
type Rejected = { kind: Kind; rejected: true; error: string; status?: number };
type Receipt = { rejected?: false; kind: Kind; entityId: string; version: string; authority?: RelationAuthority; referenceVersions?: Array<{ type: string; id: string; version: string }>; contextVersion?: string };
async function mutable(kind: Kind, id: string, actor: Actor, tx: Prisma.TransactionClient, requireEdit = true) {
  if (kind === "cliente") {
    const row = await tx.cliente.findUnique({ where: { id } });
    if (!row) throw httpError("Cliente no encontrado", 404);
    return { kind, id, version: clienteVersion(row), relations: await snapshotRelations(kind, id, actor, tx), fields: { razonSocial: row.razonSocial, rut: row.rut, email: row.email, telefono: row.telefono, tipo: row.tipo, estado: row.estado, notas: row.notas } } as const;
  }
  const row = await tx.task.findFirst({ where: { id, ...taskWorkspaceAccessWhere(actor) } });
  if (!row) throw httpError("Tarea no encontrada", 404);
  const delegators = await activeDelegadorIds(actor.id, "task.assign", tx);
  if (requireEdit && !taskMutationPermissions(actor, row, delegators).edit) throw httpError("No puede modificar esta tarea", 403);
  return { kind, id, version: taskVersion(row), relations: await snapshotRelations(kind, id, actor, tx), fields: {
    title: row.title, description: row.description, instructions: row.instructions, considerations: row.considerations,
    status: row.status, priority: row.priority, dueDate: row.dueDate?.toISOString() ?? null,
    remindAt: row.remindAt?.toISOString() ?? null, waitingOn: row.waitingOn,
  } } as const;
}
export async function readOfflineEntity(user: StaffActor, kind: string, id: string) {
  const valid = offlineKind.parse(kind);
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) throw httpError("Identidad inválida", 400);
  if (valid === "evento" || valid === "tramite") return serializable(async tx => readOperation(valid, id, await currentStaffActor(user, tx), tx));
  if (valid === "nota" || valid === "minuta") return serializable(async tx => readMemoEntity(valid, id, await currentStaffActor(user, tx), tx));
  if (valid === "causa" || valid === "plazo") return serializable(async tx => readLegalEntity(valid, id, await currentStaffActor(user, tx), tx));
  return serializable(async tx => mutable(valid, id, await currentStaffActor(user, tx), tx));
}
export async function syncOfflineEntity(user: StaffActor, raw: unknown) {
  const input = offlineSyncSchema.parse(raw);
  if (input.kind === "evento" || input.kind === "tramite") return syncOperation(user, input);
  if (input.kind === "nota" || input.kind === "minuta") return syncMemoEntity(user, input);
  if (input.kind === "causa" || input.kind === "plazo") return syncLegalEntity(user, input);
  const receipt = await executeCommand<Receipt | Rejected>({
    key: `offline:${input.requestId}`, ownerId: user.id, input,
    authorize: async (tx, committed) => {
      const actor = await currentStaffActor(user, tx);
      // A receipt never bypasses today's role, delegation or source-case permissions.
      if (committed?.rejected) {
        if (input.action === "update") await mutable(input.kind, input.entityId!, actor, tx);
        return;
      }
      if (committed) {
        await mutable(input.kind, committed.entityId, actor, tx, !committed.authority);
        if (committed.authority) await authorizeRelations(input.kind, committed.entityId, committed.authority, actor, tx);
      } else if (input.action === "update") await mutable(input.kind, input.entityId!, actor, tx);
    },
    run: async tx => {
      const actor = await currentStaffActor(user, tx);
      if (input.action === "update") {
        const current = await mutable(input.kind, input.entityId!, actor, tx);
        if (current.version !== input.expectedVersion) throw httpError("Hay cambios en otra sesión. Compare las copias antes de sincronizar.", 409);
      }
      let prepared;
      try { prepared = await prepareRelations(input, actor, tx); }
      catch (error) {
        // Consume rejected reference requests atomically. Even if a permission
        // or resource later returns to its old state, this key cannot create twice.
        if ((error as { code?: string }).code === "offline_reference_conflict" || [403, 404].includes((error as { status?: number }).status || 0)) return { kind: input.kind, rejected: true as const, error: (error as Error).message, status: (error as { status?: number }).status || 409 };
        throw error;
      }
      let id: string;
      if (input.kind === "cliente") {
        const fields = { ...input.fields, email: input.fields.email || null, rut: input.fields.rut || null, telefono: input.fields.telefono || null, notas: input.fields.notas || null };
        const row = input.action === "create"
          ? await createClienteRecord(actor, { ...fields, abogadoId: prepared.abogadoId === undefined ? actor.id : prepared.abogadoId }, tx)
          : await updateClienteRecord(actor, input.entityId!, { ...fields, ...(prepared.abogadoId !== undefined ? { abogadoId: prepared.abogadoId } : {}) }, tx, input.expectedVersion);
        id = row.id;
      } else {
        const fields = { ...input.fields, ...prepared.taskChanges };
        const row = input.action === "create"
          ? await createTask(actor, { assigneeId: actor.id, ...fields, origen: "manual" }, tx)
          : (await updateTasks(actor, [input.entityId!], fields, undefined, tx))[0];
        id = row.id;
      }
      await applyClientCaseLinks(input, id, actor, tx);
      const snapshot = await mutable(input.kind, id, actor, tx, false);
      const references = await relatedSnapshots(prepared.authority, actor, tx);
      // The receipt retains identities, versions and authorization references; contact fields and task text stay in their domain tables.
      return { kind: input.kind, entityId: id, version: snapshot.version,
        ...(prepared.authority ? { authority: prepared.authority, referenceVersions: references.map(r => ({ type: r.type, id: r.id, version: r.version })),
          ...("contextVersion" in snapshot.relations ? { contextVersion: snapshot.relations.contextVersion } : {}) } : {}) };
    },
  });
  if (receipt.rejected) throw Object.assign(referenceConflict(receipt.error), { status: receipt.status || 409 });
  return serializable(async tx => {
    const actor = await currentStaffActor(user, tx);
    const entity = await mutable(receipt.kind, receipt.entityId, actor, tx, !receipt.authority);
    if (receipt.authority) await authorizeRelations(receipt.kind, receipt.entityId, receipt.authority, actor, tx);
    const references = await relatedSnapshots(receipt.authority, actor, tx);
    return { receipt, entity, references };
  });
}
