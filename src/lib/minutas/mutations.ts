import { Prisma } from "@prisma/client";
import { isStaff } from "@/lib/auth/rbac";
import { currentStaffActor, type StaffActor } from "@/lib/auth/staff-actor";
import { assertCausaAccess, assertCausaCapability, documentReadWhere, plazoAccessWhere } from "@/lib/auth/causa-access";
import { activeDelegadorIds } from "@/lib/auth/delegacion";
import { can } from "@/lib/auth/permissions";
import { httpError } from "@/lib/auth/access";
import { canonicalJson } from "@/lib/command-execution";
import { writeAuditStrict } from "@/lib/audit";
import { createTask, taskMutationPermissions } from "@/lib/tasks/service";
import { taskWorkspaceAccessWhere } from "@/lib/tasks/workspace";
import { applyTaskCompletionEffects } from "@/lib/tasks/completion";
import { emitNotification } from "@/lib/notify/emit";
import { STAFF_ROLES } from "@/lib/auth/roles";
import { renderMinutaMarkdown, formatLocalDate, mapPrioridadToTask } from "@/lib/minutas";
import { minuteFieldsSchema, type MinuteFields, type MinuteAction } from "./schemas";
import { referenceConflict, hashReference, type Actor } from "@/lib/offline/references";
type Tx = Prisma.TransactionClient;
const same = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);
export const memoDateValue = (s: string | null) => s ? new Date(s.length === 10 ? s + "T00:00:00.000Z" : s) : null;
export async function memoCause(id: string, actor: Actor, tx: Tx) {
  await assertCausaCapability(id, actor, "causa.write", tx);
  return tx.causa.findUniqueOrThrow({ where: { id }, select: { id: true, titulo: true, rit: true, tribunal: true, caratula: true, etapa: true, materia: true, procedimiento: true,
    acceso: true, abogadoId: true, clienteId: true, updatedAt: true, site: { select: { id: true } }, miembros: { orderBy: { id: "asc" }, select: { id: true, userId: true, rol: true, desde: true, hasta: true } } } });
}
export async function loadMinute(id: string, actor: Actor, tx: Tx) {
  const row = await tx.minuta.findUnique({ where: { id }, include: {
    acciones: { orderBy: [{ orden: "asc" }, { createdAt: "asc" }, { id: "asc" }], take: 51, include: { task: true, plazo: true } },
    autor: { select: { id: true, name: true } }, documento: { include: { minutas: { orderBy: { id: "asc" }, select: { id: true } } } },
  } });
  if (!row) throw httpError("Minuta no encontrada", 404);
  const cause = await memoCause(row.causaId, actor, tx);
  if (row.confidencial && !can(actor, "doc.confidential.read")) throw httpError("Minuta no disponible", 403);
  if (row.acciones.length > 50) throw httpError("La minuta supera las 50 acciones de la copia local. Conserve su copia y revísela con conexión.", 409);
  if (row.documento && (!await tx.documento.findFirst({ where: { id: row.documento.id, ...documentReadWhere(actor) }, select: { id: true } }) || row.documento.causaId !== row.causaId)) throw httpError("El documento de la minuta no está disponible", 403);
  return { ...row, cause };
}
export type LoadedMinute = Awaited<ReturnType<typeof loadMinute>>;
export function minuteFields(row: LoadedMinute): MinuteFields {
  return { tipo: row.tipo as MinuteFields["tipo"], titulo: row.titulo, fecha: row.fecha.toISOString(), modalidad: row.modalidad as MinuteFields["modalidad"], lugar: row.lugar,
    participantes: row.participantes, resumenEjecutivo: row.resumenEjecutivo, hechosRelevantes: row.hechosRelevantes, acuerdos: row.acuerdos, proximosPasos: row.proximosPasos,
    riesgosAlertas: row.riesgosAlertas, estadoCausaNota: row.estadoCausaNota, etapaSugerida: row.etapaSugerida, confidencial: row.confidencial,
    acciones: row.acciones.map(a => ({ id: a.id, descripcion: a.descripcion, responsable: a.responsable, fechaLimite: a.fechaLimite?.toISOString() || null,
      estado: a.estado as MinuteAction["estado"], prioridad: a.prioridad as MinuteAction["prioridad"], crearTask: Boolean(a.taskId), crearPlazo: Boolean(a.plazoId), tipoComputo: (a.tipoComputo || a.plazo?.tipoComputo || "habiles") as MinuteAction["tipoComputo"], esFatal: a.esFatal ?? a.plazo?.esFatal ?? false })) };
}
export const minuteVersion = (row: LoadedMinute) => hashReference(row);
export type MinuteAuthority = { tasks: string[]; deadlines: Array<{ id: string; close: boolean }>; confidential: boolean };
export async function authorizeMinuteEffects(authority: MinuteAuthority, actor: Actor, tx: Tx) {
  if (authority.confidential && !can(actor, "doc.confidential.read")) throw httpError("Sin permiso para la minuta confidencial", 403);
  const delegates = await activeDelegadorIds(actor.id, "task.assign", tx);
  for (const id of authority.tasks) {
    const task = await tx.task.findFirst({ where: { id, ...taskWorkspaceAccessWhere(actor) } });
    if (!task || !taskMutationPermissions(actor, task, delegates).edit) throw httpError("No puede modificar el seguimiento de la minuta", 403);
  }
  for (const item of authority.deadlines) {
    const deadline = await tx.plazo.findFirst({ where: { id: item.id, ...plazoAccessWhere(actor) } });
    if (!deadline) throw httpError("Plazo de la minuta no disponible", 404);
    for (const capability of item.close ? ["plazo.edit", "plazo.close"] as const : ["plazo.edit"] as const) {
      if (deadline.causaId) await assertCausaCapability(deadline.causaId, actor, capability, tx);
      else if (!can(actor, capability, { own: deadline.responsableId === actor.id })) throw httpError("Sin permiso para modificar este plazo", 403);
    }
  }
}
type ActionPlan = { position: number; input: MinuteAction; old?: LoadedMinute["acciones"][number]; changed: boolean; dueChanged: boolean; dateChanged: boolean; typeChanged: boolean; fatalChanged: boolean; stateChanged: boolean; descriptionChanged: boolean; priorityChanged: boolean };
export async function prepareMinute(fields: MinuteFields, causeId: string, actor: Actor, tx: Tx, before: LoadedMinute | null, opts: { reviewedActions?: string[]; allowDeclassify?: boolean; hostCalculated?: string[]; newTaskAssignees?: Map<string, string | null> } = {}) {
  minuteFieldsSchema.parse(fields);
  const cause = before?.cause || await memoCause(causeId, actor, tx);
  if (before && before.causaId !== causeId) throw referenceConflict("Conserve la causa de origen de la minuta");
  if (fields.confidencial && !can(actor, "doc.confidential.read")) throw httpError("Sin permiso para crear una minuta confidencial", 403);
  if (before?.confidencial && !fields.confidencial && !opts.allowDeclassify) throw referenceConflict("La desclasificación requiere una revisión con conexión. La copia confidencial se conserva.");
  const oldFields = before ? minuteFields(before) : null;
  if (before?.acciones.some(a => !fields.acciones.some(input => input.id === a.id))) throw referenceConflict("Las acciones registradas se conservan. Cancele las que ya no correspondan.");
  const freshIds = fields.acciones.filter(a => !before?.acciones.some(old => old.id === a.id)).map(a => a.id);
  if (freshIds.length && await tx.minutaAccion.findFirst({ where: { id: { in: freshIds } }, select: { id: true } })) throw referenceConflict("La identidad de una acción ya está registrada en otra operación");
  const authority: MinuteAuthority = { tasks: [], deadlines: [], confidential: fields.confidencial || Boolean(before?.confidencial) };
  const plans: ActionPlan[] = [];
  for (const [position, input] of fields.acciones.entries()) {
    const old = before?.acciones.find(a => a.id === input.id), oldField = oldFields?.acciones.find(a => a.id === input.id);
    if (old?.taskId && !input.crearTask || old?.plazoId && !input.crearPlazo) throw referenceConflict("Los seguimientos ya creados se conservan; puede cancelar la acción.");
    const dateChanged = !old || (memoDateValue(input.fechaLimite)?.getTime() || null) !== (old.fechaLimite?.getTime() || null);
    const typeChanged = !oldField || input.tipoComputo !== oldField.tipoComputo, fatalChanged = !oldField || input.esFatal !== oldField.esFatal;
    const dueChanged = dateChanged || typeChanged;
    if (input.crearPlazo && !input.fechaLimite) throw httpError("Un plazo necesita una fecha límite revisada", 422);
    if (input.fechaLimite && (dueChanged || input.crearPlazo && !old?.plazoId || input.crearTask && !old?.taskId) && !opts.reviewedActions?.includes(input.id) && !opts.hostCalculated?.includes(input.id)) throw httpError("Revise expresamente la fecha de cada acción antes de sincronizar", 422);
    const plan = { position, input, old, changed: !oldField || !same(input, oldField), dueChanged, dateChanged, typeChanged, fatalChanged,
      stateChanged: !old || input.estado !== old.estado, descriptionChanged: !old || input.descripcion !== old.descripcion, priorityChanged: !old || input.prioridad !== old.prioridad };
    plans.push(plan);
    if (!plan.changed) continue;
    if (input.crearTask && !old?.taskId) {
      const assigneeId = opts.newTaskAssignees?.has(input.id) ? opts.newTaskAssignees.get(input.id) : actor.id;
      if (assigneeId) {
        const target = await tx.user.findUnique({ where: { id: assigneeId } });
        if (!target || !isStaff(target.role)) throw httpError("Responsable no disponible", 403);
        if (assigneeId !== actor.id && !can(actor, "task.assign")) throw httpError("Sin permiso para asignar el seguimiento", 403);
        await assertCausaAccess(causeId, target, { auditOverride: false }, tx);
        if (fields.confidencial && !can(target, "doc.confidential.read")) throw httpError("El responsable no puede acceder a la minuta confidencial", 403);
      }
    }
    if (old?.task) {
      if (old.task.causaId && old.task.causaId !== causeId) throw referenceConflict("La tarea pertenece a otra causa; revise sus vínculos con conexión");
      if (plan.descriptionChanged || plan.priorityChanged || plan.dateChanged || plan.stateChanged) authority.tasks.push(old.task.id);
    }
    if (old?.plazo) {
      if (old.plazo.causaId !== causeId) throw referenceConflict("El plazo pertenece a otra causa; revise sus vínculos con conexión");
      if (plan.descriptionChanged || plan.dueChanged || plan.fatalChanged || plan.stateChanged) authority.deadlines.push({ id: old.plazo.id, close: plan.stateChanged && input.estado === "hecha" });
    }
    if (input.crearPlazo && !old?.plazoId) { await assertCausaCapability(causeId, actor, "plazo.edit", tx); if (input.estado === "hecha") await assertCausaCapability(causeId, actor, "plazo.close", tx); }
  }
  await authorizeMinuteEffects(authority, actor, tx);
  const autor = before?.autor || await tx.user.findUniqueOrThrow({ where: { id: actor.id }, select: { name: true } });
  const markdown = renderMinutaMarkdown({ ...fields, fecha: memoDateValue(fields.fecha)!, causa: cause, autorName: autor.name, acciones: fields.acciones });
  const documentConfidential = fields.confidencial || Boolean(before?.documento?.confidencial && !before.confidencial);
  const doc = before?.documento;
  if (doc && (doc.storageKey || doc.tipo !== "minuta" || doc.minutas.some(m => m.id !== before!.id)) && (doc.contenido !== markdown || doc.confidencial !== documentConfidential)) throw referenceConflict("El documento tiene un original o un vínculo compartido. Revise su actualización con conexión; la copia local se conserva.");
  return { cause, plans, authority, markdown, documentConfidential };
}
export type PreparedMinute = Awaited<ReturnType<typeof prepareMinute>>;
export async function writeMinute(user: StaffActor, fields: MinuteFields, tx: Tx, before: LoadedMinute | null, prepared: PreparedMinute, opts: { applyStage?: boolean; calculatedActions?: Map<string, { days: number; type: string }>; newTaskAssignees?: Map<string, string | null> } = {}) {
  const actor = await currentStaffActor(user, tx), { cause, plans, markdown, documentConfidential, authority } = prepared;
  const { acciones: _actions, fecha, ...scalars } = fields;
  let documentId = before?.documentoId;
  const name = `Minuta ${fields.tipo} — ${fields.titulo} — ${formatLocalDate(memoDateValue(fecha))}.md`;
  if (!documentId) {
    const doc = await tx.documento.create({ data: { nombre: name, tipo: "minuta", mimeType: "text/markdown", contenido: markdown, extractedMarkdown: markdown, extractionStatus: "completed", causaId: cause.id, autorId: actor.id, confidencial: documentConfidential } }); documentId = doc.id;
  } else if (before!.documento!.contenido !== markdown || before!.documento!.confidencial !== documentConfidential) {
    await tx.documento.update({ where: { id: documentId, updatedAt: before!.documento!.updatedAt }, data: { contenido: markdown, nombre: name, confidencial: documentConfidential, version: { increment: 1 }, extractedMarkdown: markdown, extractionStatus: "completed", extractionJson: null, extractionLockedAt: null, extractionLockToken: null, extractionNextAttemptAt: null } });
  }
  const minute = before ? await tx.minuta.update({ where: { id: before.id, updatedAt: before.updatedAt }, data: { ...scalars, fecha: memoDateValue(fecha)!, documentoId: documentId } })
    : await tx.minuta.create({ data: { ...scalars, fecha: memoDateValue(fecha)!, causaId: cause.id, autorId: actor.id, documentoId: documentId } });
  for (const plan of plans) {
    if (!plan.changed) { if (plan.old && plan.old.orden !== plan.position) await tx.minutaAccion.update({ where: { id: plan.old.id, updatedAt: plan.old.updatedAt }, data: { orden: plan.position } }); continue; }
    const { input, old } = plan, due = memoDateValue(input.fechaLimite);
    let taskId = old?.taskId || null, plazoId = old?.plazoId || null;
    const status = ({ pendiente: "todo", en_curso: "in_progress", hecha: "done", cancelada: "cancelled" })[input.estado];
    if (input.crearPlazo && !plazoId) {
      const calculated = opts.calculatedActions?.get(input.id);
      const deadline = await tx.plazo.create({ data: { titulo: input.descripcion.slice(0, 120), descripcion: `Derivado de minuta: ${fields.titulo}`, fechaLimite: due!, causaId: cause.id, responsableId: actor.id,
        tipoComputo: input.tipoComputo, esFatal: input.esFatal, tipo: fields.tipo === "audiencia" ? "procesal" : "interno", estado: input.estado === "hecha" ? "cumplido" : "pendiente",
        ...(calculated ? { diasPlazo: calculated.days, calculationCountry: "CL", calculationRegime: "internal_weekdays_cl_v1" } : {}) } });
      await writeAuditStrict({ actorId: actor.id, action: "plazo.create", entityType: "Plazo", entityId: deadline.id, after: { source: minute.id, actionId: input.id, fechaLimite: due } }, tx);
      plazoId = deadline.id; authority.deadlines.push({ id: plazoId, close: input.estado === "hecha" });
    } else if (old?.plazo) {
      const data: Prisma.PlazoUpdateInput = { ...(plan.typeChanged ? { tipoComputo: input.tipoComputo } : {}), ...(plan.fatalChanged ? { esFatal: input.esFatal } : {}), ...(plan.descriptionChanged ? { titulo: input.descripcion.slice(0, 120) } : {}),
        ...(plan.dateChanged ? { fechaLimite: due! } : {}), ...(plan.dueChanged ? { diasPlazo: null, calculationCountry: null, calculationRegime: null, alertaEnviada: false } : {}), ...(plan.stateChanged ? { estado: input.estado === "hecha" ? "cumplido" : "pendiente" } : {}) };
      if (Object.keys(data).length) { await tx.plazo.update({ where: { id: old.plazo.id, updatedAt: old.plazo.updatedAt }, data }); await writeAuditStrict({ actorId: actor.id, action: "plazo.update", entityType: "Plazo", entityId: old.plazo.id, before: { estado: old.plazo.estado, fechaLimite: old.plazo.fechaLimite }, after: data }, tx); }
    }
    if (input.crearTask && !taskId) {
      const task = await createTask(actor, { title: input.descripcion.slice(0, 300), description: `Handoff desde minuta «${fields.titulo}». Responsable indicado: ${input.responsable || "sin indicar"}`,
        assigneeId: opts.newTaskAssignees?.has(input.id) ? opts.newTaskAssignees.get(input.id)! : actor.id, causaId: cause.id, clienteId: cause.clienteId, siteId: cause.site?.id || null, plazoId, origen: "minuta", priority: mapPrioridadToTask(input.prioridad), dueDate: due?.toISOString() || null, status }, tx);
      taskId = task.id; if (status === "done") await tx.task.update({ where: { id: task.id }, data: { completedAt: new Date(), completedById: actor.id } }); authority.tasks.push(taskId);
    } else if (old?.task) {
      const data: Prisma.TaskUpdateInput = { ...(plan.descriptionChanged ? { title: input.descripcion.slice(0, 300) } : {}), ...(plan.priorityChanged ? { priority: mapPrioridadToTask(input.prioridad) } : {}),
        ...(plan.dateChanged ? { dueDate: due } : {}), ...(plan.stateChanged ? { status, completedAt: status === "done" ? old.task.completedAt || new Date() : null, completedBy: status === "done" ? { connect: { id: actor.id } } : { disconnect: true } } : {}) };
      if (Object.keys(data).length) {
        const task = await tx.task.update({ where: { id: old.task.id, updatedAt: old.task.updatedAt }, data });
        if (task.status === "done" && old.task.status !== "done") await applyTaskCompletionEffects(task, actor.id, tx);
        await tx.taskHistorial.create({ data: { taskId: old.task.id, campo: "minuta", actorId: actor.id, antes: JSON.stringify({ status: old.task.status }), despues: JSON.stringify({ status, actionId: input.id }) } });
        await writeAuditStrict({ actorId: actor.id, action: "task.update", entityType: "Task", entityId: old.task.id, after: { source: "minuta", actionId: input.id } }, tx);
      }
    }
    const data = { orden: plan.position, descripcion: input.descripcion, responsable: input.responsable, fechaLimite: due, estado: input.estado, prioridad: input.prioridad, tipoComputo: input.tipoComputo, esFatal: input.esFatal, taskId, plazoId };
    if (old) await tx.minutaAccion.update({ where: { id: old.id, updatedAt: old.updatedAt }, data });
    else await tx.minutaAccion.create({ data: { ...data, id: input.id, minutaId: minute.id } });
  }
  if (opts.applyStage && fields.etapaSugerida && cause.etapa !== fields.etapaSugerida) {
    await tx.causa.update({ where: { id: cause.id, updatedAt: cause.updatedAt }, data: { etapa: fields.etapaSugerida } });
    await tx.etapaHistorial.create({ data: { causaId: cause.id, etapa: fields.etapaSugerida, nota: "Etapa indicada en minuta" } });
  }
  if (!before) {
    await tx.activity.create({ data: { tipo: "minuta", mensaje: `Minuta: ${fields.titulo}`, causaId: cause.id, siteId: cause.site?.id, userId: actor.id } });
    const peers = await tx.user.findMany({ where: { id: { not: actor.id }, role: { in: [...STAFF_ROLES] } }, select: { id: true }, take: 20 });
    for (const peer of peers) await emitNotification({ tipo: "minuta.nueva", userId: peer.id, title: `Nueva minuta · ${cause.rit || cause.titulo}`, body: fields.titulo, href: `/causas/${cause.id}/minutas/${minute.id}`, entityType: "minuta", entityId: minute.id, dedupeKey: `minuta:${minute.id}:${peer.id}` }, tx);
  }
  await writeAuditStrict({ actorId: actor.id, action: before ? "minuta.update" : "minuta.create", entityType: "Minuta", entityId: minute.id,
    before: before ? minuteFields(before) : undefined, after: { ...fields, documentoId: documentId, actionCount: _actions.length } }, tx);
  return { id: minute.id, authority };
}
