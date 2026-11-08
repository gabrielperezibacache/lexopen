import { currentStaffActor, type StaffActor, type ResolvedStaffActor } from "@/lib/auth/staff-actor";
import { assertCausaAccess, assertEventMutation, relatedCausaWhere } from "@/lib/auth/causa-access";
import { STAFF_ROLES } from "@/lib/auth/roles";
import { httpError } from "@/lib/auth/access";
import { executeCommand, serializable } from "@/lib/command-execution";
import { writeAuditStrict } from "@/lib/audit";
import { detectEventConflicts, describeEventConflicts } from "@/lib/assistant/conflicts";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { eventoCreateSchema, eventoUpdateSchema, eventDate, validEventEnd } from "./event-input";

type Tx = Prisma.TransactionClient;
type Target = { responsableId: string; causaId: string | null };
export async function authorizeEventTarget(actor: ResolvedStaffActor, target: Target, tx: Tx) {
  await assertEventMutation(actor, target, tx);
  const recipient = await tx.user.findFirst({ where: { id: target.responsableId, role: { in: [...STAFF_ROLES] } } });
  if (!recipient) throw httpError("Responsable no disponible", 403);
  if (target.causaId) await assertCausaAccess(target.causaId, recipient, { auditOverride: false }, tx);
}
export async function loadEvent(id: string, actor: ResolvedStaffActor, tx: Tx) {
  const event = await tx.evento.findFirst({ where: { AND: [{ id }, relatedCausaWhere(actor)] } });
  if (!event) throw httpError("Evento no encontrado", 404);
  return event;
}
function checkVersion(actual: Date, expected?: string) {
  if (expected && actual.getTime() !== new Date(expected).getTime()) throw httpError("El evento cambió en otra sesión. Recargue la agenda antes de guardar.", 409);
}
async function result(user: StaffActor, id: string) {
  return serializable(async tx => {
    const actor = await currentStaffActor(user, tx), event = await loadEvent(id, actor, tx);
    const conflicts = event.estado === "cancelado" ? [] : await detectEventConflicts(event.inicio, event.fin, event.responsableId, id, actor, tx);
    return { ...event, conflictWarning: conflicts.length ? describeEventConflicts(conflicts) : null };
  });
}
export async function createEventCommand(user: StaffActor, raw: unknown, key: string) {
  const input = eventoCreateSchema.parse(raw);
  const receipt = await executeCommand<{ id: string }>({ key, ownerId: user.id, input,
    authorize: async (tx, committed) => {
      const actor = await currentStaffActor(user, tx);
      if (committed) await assertEventMutation(actor, await loadEvent(committed.id, actor, tx), tx);
      else await authorizeEventTarget(actor, { responsableId: input.responsableId || actor.id, causaId: input.causaId || null }, tx);
    },
    run: async tx => ({ id: (await writeEventRecord(await currentStaffActor(user, tx), input, null, tx)).id }),
  });
  return result(user, receipt.id);
}
export async function updateEventCommand(user: StaffActor, id: string, raw: unknown, key: string) {
  const input = eventoUpdateSchema.parse(raw);
  const receipt = await executeCommand<{ id: string }>({ key, ownerId: user.id, input: { id, input },
    authorize: async (tx, committed) => {
      const actor = await currentStaffActor(user, tx), before = await loadEvent(id, actor, tx);
      await assertEventMutation(actor, before, tx);
      if (!committed && (input.responsableId !== undefined && input.responsableId !== before.responsableId || input.causaId !== undefined && input.causaId !== before.causaId)) {
        await authorizeEventTarget(actor, { responsableId: input.responsableId || before.responsableId, causaId: input.causaId !== undefined ? input.causaId : before.causaId }, tx);
      }
    },
    run: async tx => { const actor = await currentStaffActor(user, tx); return { id: (await writeEventRecord(actor, input, await loadEvent(id, actor, tx), tx)).id }; },
  });
  return result(user, receipt.id);
}
export async function deleteEventCommand(user: StaffActor, id: string, key: string) {
  return executeCommand<{ ok: true; target: Target }>({ key, ownerId: user.id, input: { id },
    authorize: async (tx, committed) => {
      const actor = await currentStaffActor(user, tx);
      await assertEventMutation(actor, committed?.target || await loadEvent(id, actor, tx), tx);
    },
    run: async tx => {
      const actor = await currentStaffActor(user, tx), before = await loadEvent(id, actor, tx);
      await tx.evento.delete({ where: { id, updatedAt: before.updatedAt } });
      await writeAuditStrict({ actorId: user.id, action: "evento.delete", entityType: "Evento", entityId: id, before }, tx);
      return { ok: true, target: { responsableId: before.responsableId, causaId: before.causaId } };
    },
  });
}

/** Shared domain mutation; callers commit it together with their own receipt. */
export async function writeEventRecord(actor: ResolvedStaffActor, input: z.infer<typeof eventoUpdateSchema>, before: Awaited<ReturnType<typeof loadEvent>> | null, tx: Tx) {
  if (before) { await assertEventMutation(actor,before,tx); checkVersion(before.updatedAt,input.expectedUpdatedAt); }
  const target = {responsableId:input.responsableId || before?.responsableId || actor.id,causaId:input.causaId !== undefined?input.causaId:before?.causaId || null};
  if (!before || target.responsableId !== before.responsableId || target.causaId !== before.causaId) await authorizeEventTarget(actor,target,tx);
  const allDay = input.todoElDia ?? before?.todoElDia ?? false;
  const startValue = input.inicio || before?.inicio.toISOString(); if (!startValue || !input.titulo && !before) throw httpError("Indique título e inicio",422);
  const inicio = eventDate(startValue,allDay);
  const movedEnd = input.inicio && before?.fin ? new Date(inicio.getTime()+before.fin.getTime()-before.inicio.getTime()) : before?.fin;
  const fin = input.fin !== undefined ? input.fin?eventDate(input.fin,allDay):null : movedEnd;
  const normalizedEnd = fin?eventDate(fin.toISOString(),allDay):allDay?new Date(inicio.getTime()+86400_000):null;
  if (!validEventEnd(inicio,normalizedEnd)) throw httpError("El fin debe ser posterior al inicio",422);
  const changes={...input};delete changes.expectedUpdatedAt;
  const event = before?await tx.evento.update({where:{id:before.id,updatedAt:before.updatedAt},data:{...changes,inicio,fin:normalizedEnd}}):await tx.evento.create({data:{...changes,titulo:input.titulo!,inicio,fin:normalizedEnd,responsableId:target.responsableId}});
  if (!before && event.causaId) await tx.activity.create({data:{tipo:"evento",mensaje:`Evento agendado: ${event.titulo}`,causaId:event.causaId,userId:actor.id}});
  await writeAuditStrict({actorId:actor.id,action:before?"evento.update":"evento.create",entityType:"Evento",entityId:event.id,before:before||undefined,after:event},tx);
  return event;
}
