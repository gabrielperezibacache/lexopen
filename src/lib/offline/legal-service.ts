import type { Prisma, Causa, Plazo } from "@prisma/client";
import { executeCommand, serializable, canonicalJson } from "@/lib/command-execution";
import { currentStaffActor, type StaffActor } from "@/lib/auth/staff-actor";
import { assertCausaAccess, assertCausaCapability, ensureResponsableMiembro, plazoAccessWhere } from "@/lib/auth/causa-access";
import { can, canSome, type Capability } from "@/lib/auth/permissions";
import { httpError } from "@/lib/auth/access";
import { writeAuditStrict } from "@/lib/audit";
import { checkConflicts } from "@/lib/conflict";
import { duplicateCausaWhere } from "@/lib/pjud/causa-origin";
import { hashReference, causeReference, userReference, referenceConflict, type Actor } from "./references";
import type { LegalInput } from "./legal-schemas";
type Tx = Prisma.TransactionClient;
type Kind = "causa" | "plazo";
const causeKeys = ["titulo", "rit", "ruc", "tribunal", "materia", "procedimiento", "estado", "etapa", "caratula", "resumen", "sala", "cuaderno", "abogadoContraparte"] as const;
const deadlineKeys = ["titulo", "descripcion", "tipoComputo", "esFatal", "tipo", "estado"] as const;
const byCanonical = (a: unknown, b: unknown) => canonicalJson(a) < canonicalJson(b) ? -1 : canonicalJson(a) > canonicalJson(b) ? 1 : 0;
const same = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);
const dateValue = (s: string | null) => s ? new Date(s.length === 10 ? s + "T00:00:00.000Z" : s) : null;
async function deadlinePermission(row: Pick<Plazo, "causaId" | "responsableId">, actor: Actor, cap: Capability, tx: Tx) {
  if (row.causaId) {
    const access = await assertCausaCapability(row.causaId, actor, cap, tx);
    if (access.causaRol === "lectura" && !can(actor, "causa.write")) throw httpError("La causa sólo permite lectura", 403);
  } else if (!can(actor, cap, { own: row.responsableId === actor.id })) throw httpError("Sin permiso para modificar este plazo", 403);
}
async function causeData(id: string, tx: Tx) {
  return tx.causa.findUniqueOrThrow({ where: { id }, include: { partes: { orderBy: { id: "asc" } }, miembros: { orderBy: { id: "asc" } } } });
}
async function deadlineData(id: string, actor: Actor, tx: Tx) {
  const row = await tx.plazo.findFirst({ where: { id, ...plazoAccessWhere(actor) }, include: {
    minutaAcciones: { orderBy: { id: "asc" }, select: { id: true, minuta: { select: { id: true, causaId: true, updatedAt: true, confidencial: true } } } },
    tasks: { orderBy: { id: "asc" }, select: { id: true, updatedAt: true } },
  } });
  if (!row) throw httpError("Plazo no encontrado", 404);
  // Some legacy minutes have a different direct cause. Every source retains its wall.
  for (const action of row.minutaAcciones) await assertCausaAccess(action.minuta.causaId, actor, { auditOverride: false }, tx);
  const sourceIds = [...new Set([row.causaId, ...row.minutaAcciones.map(a => a.minuta.causaId)].filter((id): id is string => Boolean(id)))];
  const sourceCases = await tx.causa.findMany({ where: { id: { in: sourceIds } }, orderBy: { id: "asc" }, select: { id: true, updatedAt: true, tribunal: true, materia: true, procedimiento: true } });
  return { ...row, sourceCases };
}
export async function readLegalEntity(kind: Kind, id: string, actor: Actor, tx: Tx) {
  const self = await userReference(actor.id, tx);
  if (kind === "causa") {
    await assertCausaCapability(id, actor, "causa.write", tx);
    const row = await causeData(id, tx);
    const fields = { ...Object.fromEntries(causeKeys.map(k => [k, row[k]])), fechaNotificacion: row.fechaNotificacion?.toISOString() || null,
      partes: row.partes.map(({ nombre, rut, rol, domicilio }) => ({ nombre, rut, rol, domicilio })).sort(byCanonical) };
    return { kind, id, version: hashReference(row), fields, relations: { self, caseReference: await causeReference(id, actor, tx), causeLocked: true } };
  }
  const row = await deadlineData(id, actor, tx);
  await deadlinePermission(row, actor, "plazo.edit", tx);
  const fields = { ...Object.fromEntries(deadlineKeys.map(k => [k, row[k]])), fechaLimite: row.fechaLimite.toISOString(), fechaNotificacion: row.fechaNotificacion?.toISOString() || null };
  const locked = Boolean(row.tasks.length || row.minutaAcciones.length);
  let responsible = null;
  if (row.responsableId) { try { responsible = await userReference(row.responsableId, tx); } catch (e) { if ((e as { status?: number }).status !== 403) throw e; responsible = { id: row.responsableId, label: "Responsable no disponible", version: "" }; } }
  return { kind, id, version: hashReference(row), fields, relations: { self, responsible, cause: row.causaId ? await causeReference(row.causaId, actor, tx) : null,
    causeLocked: locked, sourceLocked: locked, canAssignOthers: true,
    calculationCountry: row.calculationCountry, calculationRegime: row.calculationRegime, diasPlazo: row.diasPlazo } };
}
type Authority = { destinationCaseId: string | null; cases: string[]; responsibleId?: string | null; close: boolean };
type Receipt = { kind: Kind; entityId: string; version: string; authority: Authority; referenceVersions: { type: string; id: string; version: string }[] };
type Rejected = { rejected: true; error: string; status: number };
async function authorize(authority: Authority, actor: Actor, tx: Tx) {
  const destination = { causaId: authority.destinationCaseId, responsableId: authority.responsibleId || null };
  await deadlinePermission(destination, actor, "plazo.edit", tx);
  if (authority.close) await deadlinePermission(destination, actor, "plazo.close", tx);
  for (const id of authority.cases) await deadlinePermission({ causaId: id, responsableId: authority.responsibleId || null }, actor, authority.close ? "plazo.close" : "plazo.edit", tx);
  if (authority.responsibleId) {
    await userReference(authority.responsibleId, tx);
    const target = await tx.user.findUniqueOrThrow({ where: { id: authority.responsibleId } });
    for (const id of authority.cases) await assertCausaAccess(id, target, { auditOverride: false }, tx);
  }
}
async function resources(authority: Authority, actor: Actor, tx: Tx) {
  const result = [];
  for (const id of [...new Set(authority.cases)].sort()) result.push({ type: "cause", ...await causeReference(id, actor, tx) });
  if (authority.responsibleId) result.push({ type: "user", ...await userReference(authority.responsibleId, tx) });
  return result;
}
async function duplicate(fields: { rit?: string | null; ruc?: string | null; tribunal: string }, tx: Tx, exclude?: string) {
  const where = duplicateCausaWhere(fields);
  if (where && await tx.causa.findFirst({ where: { AND: [where, ...(exclude ? [{ id: { not: exclude } }] : [])] }, select: { id: true } }))
    throw httpError("Ya existe una causa con esa referencia y tribunal. Compare las copias; si la coincidencia es reservada, solicite revisión autorizada.", 409);
}
async function saveCause(input: Extract<LegalInput, { kind: "causa" }>, actor: Actor, tx: Tx) {
  if (input.action === "create" && !canSome(actor, "causa.create")) throw httpError("Sin permiso para crear causas", 403);
  const before = input.action === "update" ? await causeData(input.entityId!, tx) : null;
  if (!before || input.fields.rit !== before.rit || input.fields.ruc !== before.ruc || input.fields.tribunal !== before.tribunal) await duplicate(input.fields, tx, before?.id);
  const risk = await checkConflicts({ user: actor, partes: input.fields.partes, excludeCausaId: before?.id, client: tx });
  if (risk.status === "blocked") throw httpError("Conflicto de interés bloqueante. Se conserva la copia local; la autorización y su fundamento deben revisarse con conexión.", 409);
  const { partes, fechaNotificacion, ...values } = input.fields;
  const data = { ...values, fechaNotificacion: dateValue(fechaNotificacion), conflictCheckedAt: new Date(), conflictStatus: risk.status };
  let row: Causa;
  if (!before) {
    row = await tx.causa.create({ data: { ...data, abogadoId: actor.id, pjudOrigin: "manual", fechaIngreso: new Date(), partes: { create: partes }, etapaHistorial: { create: { etapa: values.etapa || "ingreso", nota: "Alta de causa" } } } });
    await ensureResponsableMiembro(row.id, actor.id, actor.id, tx);
  } else {
    row = await tx.causa.update({ where: { id: before.id, updatedAt: before.updatedAt }, data });
    if (!same(partes, before.partes.map(({ nombre, rut, rol, domicilio }) => ({ nombre, rut, rol, domicilio })).sort(byCanonical))) {
      await tx.parte.deleteMany({ where: { causaId: before.id } });
      if (partes.length) await tx.parte.createMany({ data: partes.map(p => ({ ...p, causaId: before.id })) });
    }
    if (values.etapa && values.etapa !== before.etapa) await tx.etapaHistorial.create({ data: { causaId: before.id, etapa: values.etapa, nota: "Cambio de etapa" } });
  }
  if (!before || values.estado !== before.estado || values.etapa !== before.etapa) await tx.activity.create({ data: { tipo: "estado", mensaje: before ? `Actualización: estado=${row.estado}, etapa=${row.etapa}` : `Nueva causa creada: ${row.titulo}`, causaId: row.id, userId: actor.id } });
  await writeAuditStrict({ actorId: actor.id, action: before ? "causa.update" : "causa.create", entityType: "Causa", entityId: row.id,
    before: before ? { titulo: before.titulo, estado: before.estado, etapa: before.etapa } : undefined, after: { ...data, partes } }, tx);
  return row.id;
}
async function prepareDeadline(input: Extract<LegalInput, { kind: "plazo" }>, actor: Actor, tx: Tx) {
  const before = input.action === "update" ? await deadlineData(input.entityId!, actor, tx) : null;
  const r = input.relations;
  const causeId = r?.cause ? r.cause.id : before?.causaId || null, responsibleId = r?.responsible ? r.responsible.id : before ? before.responsableId : actor.id;
  const authority: Authority = { destinationCaseId: causeId, cases: [...new Set([before?.causaId, causeId, ...(before?.minutaAcciones.map(a => a.minuta.causaId) || [])].filter((id): id is string => Boolean(id)))], responsibleId, close: input.fields.estado === "cumplido" };
  if (before) await deadlinePermission(before, actor, "plazo.edit", tx);
  if (before && (before.tasks.length || before.minutaAcciones.length)) {
    const snapshot = await readLegalEntity("plazo", before.id, actor, tx);
    if (!same({ ...input.fields, estado: before.estado }, snapshot.fields) || r?.cause || r?.responsible) throw referenceConflict("Este plazo está vinculado a tareas o minutas. Modifique sus datos desde el origen; sin conexión puede actualizar su estado.");
  }
  if (r?.cause) {
    if (before?.causaId) {
      if (r.cause.previous?.id !== before.causaId || r.cause.previous.expectedVersion !== (await causeReference(before.causaId, actor, tx)).version) throw referenceConflict("La causa de origen cambió");
    } else if (r.cause.previous) throw referenceConflict("La causa de origen no corresponde al plazo");
    if (causeId && r.cause.expectedVersion !== (await causeReference(causeId, actor, tx, true)).version) throw referenceConflict();
  }
  if (r?.responsible?.id && r.responsible.expectedVersion !== (await userReference(r.responsible.id, tx)).version) throw referenceConflict("El responsable cambió desde que se preparó");
  await deadlinePermission({ causaId: causeId, responsableId: responsibleId }, actor, "plazo.edit", tx);
  await authorize(authority, actor, tx);
  if (input.fields.estado === "cumplido" && !causeId) await deadlinePermission({ causaId: causeId, responsableId: responsibleId }, actor, "plazo.close", tx);
  const date = dateValue(input.fields.fechaLimite)!;
  const dateChanged = !before || date.getTime() !== before.fechaLimite.getTime() || input.fields.tipoComputo !== before.tipoComputo || dateValue(input.fields.fechaNotificacion)?.getTime() !== before.fechaNotificacion?.getTime();
  if (dateChanged && !input.dateReviewed) throw httpError("Revise expresamente la fecha límite antes de sincronizar. No se calcula un vencimiento sin conexión.", 422);
  return { before, authority, date, dateChanged, causeId, responsibleId };
}
export async function syncLegalEntity(user: StaffActor, input: LegalInput) {
  const result = await executeCommand<Receipt | Rejected>({ key: `offline:${input.requestId}`, ownerId: user.id, input,
    authorize: async (tx, committed) => {
      const actor = await currentStaffActor(user, tx);
      if (input.action === "update") await readLegalEntity(input.kind, input.entityId!, actor, tx);
      else if (input.kind === "causa" && !canSome(actor, "causa.create")) throw httpError("Sin permiso para crear causas", 403);
      if (committed && !("rejected" in committed)) {
        await readLegalEntity(committed.kind, committed.entityId, actor, tx);
        if (input.kind === "plazo") { await authorize(committed.authority, actor, tx); if (!committed.authority.cases.length) await deadlinePermission({ causaId: null, responsableId: committed.authority.responsibleId || null }, actor, committed.authority.close ? "plazo.close" : "plazo.edit", tx); }
      }
    },
    run: async tx => {
      const actor = await currentStaffActor(user, tx);
      if (input.action === "update" && (await readLegalEntity(input.kind, input.entityId!, actor, tx)).version !== input.expectedVersion) throw httpError("Hay cambios en otra sesión. Compare las copias antes de sincronizar.", 409);
      let id: string, authority: Authority = { destinationCaseId: null, cases: [], close: false };
      if (input.kind === "causa") id = await saveCause(input, actor, tx);
      else {
        let prepared;
        try { prepared = await prepareDeadline(input, actor, tx); }
        catch (e) { if ((e as { code?: string }).code === "offline_reference_conflict" || [403, 404].includes((e as { status?: number }).status || 0)) return { rejected: true, error: (e as Error).message, status: (e as { status?: number }).status || 409 }; throw e; }
        const { before, date, dateChanged, causeId, responsibleId } = prepared; authority = prepared.authority;
        const data = { ...input.fields, fechaLimite: date, fechaNotificacion: dateValue(input.fields.fechaNotificacion), causaId: causeId, responsableId: responsibleId,
          ...(dateChanged ? { diasPlazo: null, calculationCountry: null, calculationRegime: null, alertaEnviada: false } : {}) };
        const row = before ? await tx.plazo.update({ where: { id: before.id, updatedAt: before.updatedAt }, data }) : await tx.plazo.create({ data }); id = row.id;
        if (!before && causeId) await tx.activity.create({ data: { tipo: "plazo", mensaje: `Plazo: ${row.titulo}`, causaId: causeId, userId: actor.id } });
        await writeAuditStrict({ actorId: actor.id, action: before ? "plazo.update" : "plazo.create", entityType: "Plazo", entityId: id, before: before ? { estado: before.estado, fechaLimite: before.fechaLimite } : undefined, after: data }, tx);
      }
      const entity = await readLegalEntity(input.kind, id, actor, tx), refs = await resources(authority, actor, tx);
      return { kind: input.kind, entityId: id, version: entity.version, authority, referenceVersions: refs.map(({ type, id, version }) => ({ type, id, version })) };
    },
  });
  if ("rejected" in result) throw Object.assign(referenceConflict(result.error), { status: result.status });
  return serializable(async tx => { const actor = await currentStaffActor(user, tx); const entity = await readLegalEntity(result.kind, result.entityId, actor, tx); if (result.kind === "plazo") await authorize(result.authority, actor, tx); return { receipt: result, entity, references: await resources(result.authority, actor, tx) }; });
}
